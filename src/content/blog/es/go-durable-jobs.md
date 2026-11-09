---
title: "Go Durable Jobs: construcción de un procesador de trabajos asíncronos con PostgreSQL"
excerpt: "Un procesador de jobs en Go sobre PostgreSQL: encolado idempotente, claim concurrente con SELECT ... FOR UPDATE SKIP LOCKED, reintentos exponenciales con jitter, dead letter lógico, apagado graceful y métricas Prometheus, con límites explícitos y sin garantías sobredimensionadas."
date: "2026-11-06T00:00:00Z"
tags: ["GO", "POSTGRESQL", "CONCURRENCY", "BACKEND", "OBSERVABILITY"]
draft: false
translationKey: "go-durable-jobs"
lang: "es"
---

Cualquier sistema que dispara trabajo asíncrono —enviar un email, cobrar una tarjeta, generar un reporte, notificar un webhook— termina enfrentando tres preguntas incómodas: qué pasa si el proceso cae a mitad de un job, qué pasa si el mismo job se dispara dos veces y qué pasa cuando un job falla. `go-durable-jobs` es mi respuesta a esas tres, construida con el conjunto más pequeño de herramientas que da una garantía defendible: PostgreSQL como fuente de verdad, `SELECT ... FOR UPDATE SKIP LOCKED` para reclamar trabajo concurrentemente, una restricción única para idempotencia, backoff exponencial con jitter, una dead letter queue lógica, apagado graceful y métricas Prometheus.

Es un MVP, no una plataforma. No afirma exactly-once ni at-least-once de extremo a extremo, y no oculta los lugares donde un crash todavía puede dejar trabajo atascado.

---

## 1. Qué es (y qué no es)

`go-durable-jobs` es un servicio Go de un solo proceso con una API HTTP pequeña y un pool de workers respaldado por PostgreSQL. El módulo es `github.com/ezequielranieri/go-durable-jobs` (Go 1.25.0), con tres dependencias de runtime: `pgx/v5`, `prometheus/client_golang` y `google/uuid`. No hay broker de mensajes, ni Redis, ni librería de colas externa.

Lo que **es**:

- Los jobs se persisten en PostgreSQL; los pendientes sobreviven al reinicio del proceso, pero los que quedan en `running` tras una interrupción no se recuperan automáticamente.
- Un camino de encolado idempotente: la misma `idempotency_key` nunca crea dos jobs.
- Reintentos controlados: backoff exponencial con jitter y un `max_attempts` configurable (default 5), tras lo cual el job cae en un estado explícito de dead letter.
- Un dequeue concurrente que reclama jobs mediante una operación transaccional con `SKIP LOCKED`, evitando que workers concurrentes reclamen la misma fila.
- Un apagado graceful que intenta completar los trabajos activos dentro de un período de espera limitado, sin garantizar su finalización.
- Observabilidad básica: cuatro métricas Prometheus y logs estructurados.

Lo que **no es**:

- No es exactly-once. Los efectos secundarios del handler son responsabilidad del handler; un reintento puede repetirlos.
- No es at-least-once de extremo a extremo. Un crash mientras un job está en `running` puede dejarlo atascado, porque esta versión no tiene reaper ni timeout de lease.
- No es un servicio multi-tenant ni endurecido para producción.
- No es un registro de tipos de jobs: el pool ejecuta un único `echoHandler` hardcodeado que loguea y retorna `nil`.

---

## 2. El problema

Las tres preguntas, en concreto:

1. **Crash a mitad de job.** Sin una cola durable, el job desaparece. Nadie se entera, nadie lo reintenta.
2. **Encolado duplicado.** Un cliente reintenta un `POST` tras un timeout de red y cobra la misma tarjeta dos veces.
3. **Manejo de fallas.** Un error transitorio se vuelve pérdida permanente sin backoff; un error persistente satura el sistema sin un límite de reintentos.

Una implementación trivial (goroutine + reintento inmediato) no responde correctamente ninguna de las tres. La parte interesante de este proyecto no es la lista de features, sino el conjunto de pequeñas decisiones que hace sobrevivible cada una.

---

## 3. Arquitectura y límites

El código sigue una forma ports-and-adapters. `internal/domain` define el `Job` y la interfaz `JobRepository`. `internal/application` contiene los casos de uso (`EnqueueJob`, `ProcessJob`) y depende solo de esas interfaces. `internal/infrastructure` contiene el repositorio PostgreSQL y el pool de workers. `internal/handler` es pegamento HTTP delgado.

```
internal/domain          -> Job, interfaz JobRepository, NextBackoff
internal/application     -> EnqueueJob, ProcessJob, interfaz JobHandler
internal/infrastructure  -> repositorio postgres, pool de workers
internal/handler         -> rutas HTTP, mapeo request/response
internal/telemetry       -> métricas Prometheus
```

La consecuencia que importa: el SQL nunca aparece en `handler` ni en `application`, y el dominio no importa `pgx`. Ese límite es lo que hace testeable la lógica de dequeue con un repositorio falso y el repositorio testeable contra PostgreSQL real.

---

## 4. Encolado idempotente

La idempotencia se impone en la base de datos, no con un check-then-insert a nivel aplicación. Un `SELECT` seguido de un `INSERT` es racy: dos requests concurrentes pueden pasar el check y ambos insertar. Solo la restricción es atómica.

Migración (`migrations/0001_create_jobs_table.up.sql`):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs(idempotency_key);
```

El repositorio traduce el error de violación de unicidad de PostgreSQL a un error de dominio (`internal/infrastructure/postgres/postgres_job_repository.go`, `mapPgError`):

```go
var pgErr *pgconn.PgError
if errors.As(err, &pgErr) && pgErr.Code == "23505" &&
    pgErr.ConstraintName == "idx_jobs_idempotency_key" {
    return domain.ErrDuplicateIdempotencyKey
}
```

El caso de uso resuelve el conflicto leyendo el job existente (`internal/application/enqueue_job.go`):

```go
err := uc.repo.Create(ctx, job)
if err != nil {
    if errors.Is(err, domain.ErrDuplicateIdempotencyKey) {
        existing, findErr := uc.repo.FindByIdempotencyKey(ctx, req.IdempotencyKey)
        if findErr != nil {
            return nil, fmt.Errorf("find after duplicate: %w", findErr)
        }
        return &EnqueueJobResult{Job: existing, AlreadyExisted: true}, nil
    }
    return nil, fmt.Errorf("create: %w", err)
}
uc.metrics.IncJobsEnqueued()
```

La semántica HTTP sigue la convención de Stripe: `201 Created` en la primera creación, `200 OK` en el replay con el mismo cuerpo del job (`internal/handler/enqueue.go`). El cliente maneja un solo código de éxito. `jobs_enqueued_total` se incrementa solo en un job genuinamente nuevo, así que compararlo contra los procesados expone los jobs "perdidos" de un vistazo.

La validación es explícita y barata: `type`, `idempotency_key` o `payload` vacíos, y `max_attempts` negativo, retornan `400 Bad Request` (`enqueue_job.go`, líneas 45–57). `max_attempts == 0` se convierte en el default 5.

---

## 5. Reclamar trabajo concurrentemente

El mecanismo central es un claim transaccional (`internal/infrastructure/postgres/postgres_job_repository.go`, `Dequeue`):

```sql
SELECT id, idempotency_key, type, payload, status, priority, attempts, max_attempts,
       available_at, started_at, completed_at, last_error, created_at, updated_at
FROM jobs
WHERE status = 'pending' AND available_at <= NOW()
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

seguido de:

```sql
UPDATE jobs SET status = 'running', started_at = NOW(), updated_at = NOW()
WHERE id = $1
RETURNING started_at, updated_at
```

Ambas corren dentro de la misma transacción, que hace commit antes de devolver el job. Dos propiedades importan:

- `FOR UPDATE SKIP LOCKED` hace que un worker que encuentra una fila bloqueada la saltee en lugar de esperar. Los workers nunca se bloquean entre sí sobre la misma fila; la cola se mantiene correcta bajo contención.
- `available_at <= NOW()` está explícito en el `WHERE`, no solo en el índice parcial. Los jobs demorados (`delay_seconds`) setean `available_at = NOW() + delay` al encolar y son invisibles hasta su tiempo.

El índice parcial `idx_jobs_status_available ON jobs(status, available_at, priority DESC) WHERE status = 'pending'` ayuda a filtrar jobs pendientes y `available_at`, pero el ordenamiento por `priority DESC, created_at ASC` puede requerir un sort adicional; el plan de ejecución no se verificó con `EXPLAIN`.

El orden de dequeue es `priority DESC, created_at ASC`: mayor prioridad primero, empates por llegada. `priority` es un campo de primera clase en `POST /jobs` (default 0).

---

## 6. Reintentos, backoff, jitter y dead letter

El backoff vive en el dominio (`internal/domain/job.go`):

```go
func NextBackoff(attempt int, baseDelay time.Duration) time.Duration {
    if attempt <= 0 {
        return baseDelay
    }
    exp := float64(baseDelay) * math.Pow(2, float64(attempt-1))
    jitter := rand.Float64() * exp * 0.5
    return time.Duration(exp + jitter)
}
```

Ante un error del handler o un panic, `ProcessJob.Execute` calcula `NextBackoff(job.Attempts+1, baseDelay)` y llama a `MarkFailed` con ese `nextAvailableAt` (`internal/application/process_job.go`, líneas 48–64). El worker lee `job.Attempts` al momento del dequeue, así que el valor refleja el estado al reclamar el job, no una relectura que podría competir con otro worker.

`MarkFailed` (`postgres_job_repository.go`, líneas 158–176) hace la transición de estado en una sola sentencia:

```sql
UPDATE jobs SET
    attempts = attempts + 1,
    last_error = $2,
    status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'pending' END,
    available_at = CASE WHEN attempts + 1 >= max_attempts THEN available_at ELSE $3 END,
    updated_at = NOW()
WHERE id = $1 AND status = 'running'
```

Cuando `attempts + 1 >= max_attempts`, el job pasa a `dead` y `available_at` queda sin tocar (ya no es runnable). En caso contrario vuelve a `pending` con el timestamp de backoff.

La dead letter no es una tabla ni una cola separada. Es la misma tabla `jobs` con `status = 'dead'`, lo que mantiene una sola fuente de verdad y una sola migración. El requeue es una operación manual y explícita: `POST /jobs/{id}/requeue` resetea `status='pending'`, `attempts=0`, `last_error=NULL`, `available_at=NOW()` y devuelve `409 Conflict` si el job no está en `dead` (`postgres_job_repository.go`, `Requeue`; `handler/requeue.go`).

Un panic en el handler se trata como un fallo reintentable: `ProcessJob.Execute` lo recupera, registra el panic en `last_error` y aplica el backoff normal o pasa a `dead` cuando se agotan los intentos. Un handler que entra en pánico nunca mata al worker ni al pool.

---

## 7. Ciclo de vida del pool de workers

`internal/infrastructure/worker/pool.go` implementa un pool pequeño. `Start` crea un contexto cancelable y lanza `numWorkers` goroutines. Cada worker hace un loop:

```go
func (p *Pool) runWorker(ctx context.Context, id int) {
    defer p.wg.Done()
    for {
        if ctx.Err() != nil {
            return
        }
        job, err := p.repo.Dequeue(ctx)
        if err != nil {
            if errors.Is(err, domain.ErrNoJobsAvailable) {
                select {
                case <-time.After(p.pollInterval):
                    continue
                case <-ctx.Done():
                    return
                }
            }
            slog.Error("worker: dequeue failed", "worker_id", id, "error", err)
            select {
            case <-time.After(p.pollInterval):
                continue
            case <-ctx.Done():
                return
            }
        }
        if err := p.processJob.Execute(context.Background(), job, p.handler); err != nil {
            slog.Warn("worker: job failed", "worker_id", id, "job_id", job.ID, "error", err)
        } else {
            slog.Info("worker: job completed", "worker_id", id, "job_id", job.ID)
        }
    }
}
```

Dos detalles que vale la pena notar:

- El polling con un intervalo default de 500 ms (`POLL_INTERVAL`) no descarta jobs pendientes y es más simple que `LISTEN/NOTIFY`, que no tiene garantía de entrega para suscriptores tardíos.
- El job corre sobre `context.Background()`, no sobre el contexto cancelado del worker. El apagado cancela el polling, pero el job en curso sigue corriendo. Eso es lo que hace que "nunca cortar un job a mitad" se cumpla a nivel de goroutine.

---

## 8. Apagado graceful y drain

`cmd/server/main.go` secuencia el apagado en dos pasos:

1. `srv.Shutdown` deja de aceptar nuevos requests HTTP.
2. `wp.Shutdown` cancela el contexto de polling y espera a los workers hasta `GRACE_PERIOD` (default 30 s).

```go
shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.GracePeriod+5*time.Second)
// 1. HTTP primero
if err := srv.Shutdown(shutdownCtx); err != nil { ... }
// 2. Workers después
switch err := wp.Shutdown(shutdownCtx); {
case err == nil:
    slog.Info("shutdown complete")
case errors.Is(err, worker.ErrGracePeriodExpired):
    // duerme 3s, luego exit 2
}
```

Si el grace period expira, el proceso duerme 3 segundos y sale con código 2, lo que todavía puede cortar un job largo. El apagado es una espera acotada, no una garantía de que todos los jobs terminen.

---

## 9. Observabilidad

Las métricas se exponen en `GET /metrics` en formato Prometheus (`internal/telemetry/metrics.go`). El registry es privado, así que solo se exponen métricas de la aplicación.

| Métrica | Tipo | Significado |
|---|---|---|
| `jobs_enqueued_total` | Counter | Solo jobs nuevos; los replays idempotentes no cuentan |
| `jobs_processed_total{result}` | Counter | Intentos por resultado: `completed` o `failed` |
| `jobs_in_flight` | Gauge | Jobs siendo procesados en este momento |
| `job_processing_duration_seconds` | Histogram | Handler + `MarkCompleted`/`MarkFailed`, buckets hasta 300 s |

La etiqueta `failed` es deliberadamente amplia: incluye tanto fallos de lógica de negocio en el handler como fallos de persistencia posteriores (`MarkCompleted`/`MarkFailed` fallando). Un dashboard que lea `jobs_processed_total` no debe asumir que `failed` implica un bug de negocio.

`ProcessJob.Execute` actualiza estas métricas en un bloque diferido basado en el `err` retornado (`process_job.go`, líneas 33–43), así que un panic o un fallo de `MarkCompleted` igual cuenta como `failed` y decrementa in-flight exactamente una vez.

Los logs usan `slog` hacia stdout, sin framework de logging externo.

---

## 10. Lo que el sistema no garantiza

Esta sección es la más importante para un artículo honesto.

- **No exactly-once.** Los efectos del handler no se deduplican. Un reintento puede cobrar una tarjeta dos veces si el handler no es idempotente.
- **No at-least-once de extremo a extremo.** Un crash mientras un job está en `running` lo deja en `running` sin reencolado automático, porque esta versión no tiene reaper, lease ni timeout. Los jobs que siguen en `pending` sí sobreviven.
- **No hay recuperación automática de jobs abandonados.** Los jobs `running` nunca se reaped. Es un gap conocido, no una feature implícita.
- **No hay cancelación del trabajo en curso en el apagado.** El job corre sobre `context.Background()`. Un job lento puede sobrevivir al grace period.
- **No hay garantías de orden de entrega** más allá del orden de dequeue. `priority DESC, created_at ASC` se aplica al momento del claim.
- **No hay autenticación ni autorización** en la API HTTP.

---

## 11. Verificación

Comandos ejecutados durante esta auditoría:

```bash
go test ./...
go test -race ./internal/application/ ./internal/domain/ ./internal/handler/ \
  ./internal/infrastructure/worker/ ./internal/telemetry/
go build ./...
go vet ./...
TEST_DATABASE_URL="postgres://jobs:jobs@127.0.0.1:5434/jobs_test?sslmode=disable" \
  go test -tags integration -race ./internal/infrastructure/postgres/
```

Existen archivos de prueba que cubren application (20), domain (4), handler (19), worker (5), telemetry (1) e integración (HappyPath, FindByID, Requeue). El autor informa haberlos ejecutado satisfactoriamente en un entorno local — pruebas unitarias, pruebas de integración bajo `-race`, `go build` y `go vet`. Estos resultados no fueron re-verificados durante esta auditoría, y el repositorio no tiene CI (no hay directorio `.github/`) que los ejecute automáticamente.

Los tests de integración requieren un PostgreSQL accesible con la cadena `TEST_DATABASE_URL` → `DATABASE_URL` → default `jobs_test` en el puerto 5433, y hacen `TRUNCATE` de la tabla `jobs` al inicio de cada test. Sin base de datos hacen `t.Skip`.

Benchmarks, ejecutados como:

```bash
TEST_DATABASE_URL="postgres://jobs:jobs@127.0.0.1:5434/jobs_test?sslmode=disable" \
  go test -tags integration -bench='BenchmarkCreate|BenchmarkDequeue|BenchmarkConcurrentDequeue' \
  -run='^$' -benchmem -benchtime=1000x -count=3 \
  ./internal/infrastructure/postgres/
```

Entorno: Ryzen 3 PRO 2200G, PostgreSQL 17 nativo (sin Docker), Linux. Los números son indicativos de este entorno, no un techo universal.

| Benchmark | jobs/s (3 corridas) | allocs/op |
|---|---|---|
| `BenchmarkCreate` | 5.552 / 6.204 / 8.244 | 38 |
| `BenchmarkDequeue` | 915 / 1.013 / 1.260 | 92 |
| `BenchmarkConcurrentDequeue` (1 worker) | 1.454 / 1.513 / 1.553 | 67 |
| `BenchmarkConcurrentDequeue` (2 workers) | 2.541 / 2.680 / 2.750 | 67 |
| `BenchmarkConcurrentDequeue` (4 workers) | 1.919 / 2.400 / 3.404 | 67 |
| `BenchmarkConcurrentDequeue` (8 workers) | 1.844 / 2.213 / 2.729 | 70 |

Nota: los tres valores de cada benchmark son las tres corridas, ordenados ascendentemente; no están en orden de ejecución.

En este entorno, el mayor throughput mediano se observó con dos workers; los resultados con cuatro y ocho workers fueron variables. No se generaliza a otros entornos.

Una nota sobre percentiles: el benchmark los calcula en `reportPercentiles` (`postgres_job_repository_bench_test.go`, líneas 73–81) ordenando las duraciones de cada corrida y leyendo los índices `int(len*0.50)` e `int(len*0.99)` sin interpolación. Con 1.000 muestras eso selecciona los rangos 500 y 990, que no es un estimador estándar de percentiles. Por eso este artículo no presenta p50/p99 como percentiles; throughput y allocations son los números defendibles. Las cifras p50/p99 anteriores del README provienen de un entorno distinto (Windows, Docker) y usan la misma selección por rango.

---

## 12. Limitaciones y roadmap

Gaps conocidos, presentados como alcance y no como disculpas:

- **Sin reaper para jobs `running` abandonados.** Mitigación: lease con `started_at + timeout` y reencolado automático.
- **Sin registro de handlers.** `echoHandler` siempre retorna `nil`. Mitigación: un `map[string]JobHandler` keyed por `type`.
- **Sin autenticación ni autorización** en la API HTTP.
- **Sin circuit breaker.** Diferido deliberadamente: los jobs del MVP no llaman a servicios externos. Si se agrega un tipo de job que sí lo hace, el breaker va en ese handler, no en la maquinaria de la cola.
- **Sin tracing distribuido.** Diferido a una fase multi-servicio.
- **Sin CLI de inspección/requeue.** Solo existe `POST /jobs/{id}/requeue`; no hay forma de listar todos los jobs `dead` de una pasada.
- **Sin CI.** Los tests y benchmarks se corren manualmente.
- **Deriva de documentación.** `DECISIONS.md` nombra `testcontainers` y `golang-migrate`, pero `go.mod` no incluye ninguno; la integración usa Docker Compose más `scripts/setup_test_db.sh`, y la migración se aplica con `psql`. La migración lleva `IF NOT EXISTS` específicamente para que ese script sea re-ejecutable, lo cual es una conveniencia local, no una norma.
- **Otros items menores:** el `Dockerfile` compila con Go 1.22 mientras el módulo declara 1.25; `gofmt -l` reporta 4 archivos; los valores de configuración inválidos se ignoran silenciosamente; `delay_seconds` negativo se acepta; no hay endpoint de health; el registry de métricas es privado, así que no se exponen métricas de runtime de Go.

Roadmap: lease/reaper, registro de handlers, auth, CLI de inspección, CI, y recién después Redis o un broker si el throughput de encolado lo exige.

---

## 13. Cómo se complementa con Go Authz y Aegis

Estos tres proyectos son piezas separadas del mismo portfolio, no un sistema integrado.

- **Go Authz** responde "quién es este y qué puede hacer": identidad multi-tenant, rotación de refresh tokens con detección de reutilización, aislamiento de tenant, autorización. Un procesador de jobs durable es un consumidor plausible de sus decisiones —encolar un job "enviar email de bienvenida" tras un signup autorizado, por ejemplo— pero no hay código compartido ni dependencia de runtime entre ellos.
- **Aegis** responde "cómo ejecutar código no confiable de forma segura": sandboxing WASM basado en capabilities, receipts firmados, ejecución en dos fases, mTLS. En principio podría ser el ejecutor detrás de un tipo de job, pero no está conectado a este procesador.

El framing útil es división de responsabilidades: los jobs durables manejan *cuándo y si* corre el trabajo; Go Authz maneja *quién* puede solicitarlo; Aegis maneja *qué tan seguro* es ejecutar código no confiable. Mencionarlos juntos muestra amplitud sin pretender que forman un solo sistema.

---

## 14. Cierre

La lección que me quedo de este proyecto no es la lista de features. Es que las partes defendibles son pequeñas y específicas: una restricción única en lugar de un check, `SKIP LOCKED` en lugar de un mutex, un estado `dead` en lugar de un delete, un drain acotado en lugar de una promesa. Cada una es una decisión con un costo, y el artículo honesto es el que nombra los costos —incluyendo los jobs que todavía se pueden quedar atascados.

---

*Fuente: `github.com/ezequielranieri/go-durable-jobs`, commit `171ed46`. Auditoría realizada sin modificar el repositorio.*
path: /home/ez/ai-workspace/new-portfolio/src/content/blog/es/go-durable-jobs.md