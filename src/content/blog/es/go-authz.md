---
title: "Go Authz: diseño de autenticación y autorización para sistemas multi-tenant"
excerpt: "Un servicio Go interno para identidad multi-tenant: refresh tokens opacos rotativos con detección de reutilización, rotación de claves ES256, Argon2id y autorización resuelta en dos consultas a la base de datos — incluyendo los bugs cross-tenant que el proceso de revisión detectó."
date: "2026-11-06T00:00:00Z"
tags: ["SECURITY", "AUTHENTICATION", "GO", "POSTGRESQL", "MULTI-TENANT"]
draft: false
translationKey: "go-authz"
lang: "es"
---

Cualquier sistema con más de un servicio interno termina necesitando una respuesta compartida a tres preguntas incómodas: cuánto tiempo sigue siendo útil una sesión robada, cómo se mantiene aislado el dato de un tenant del de otro, y dónde preguntan los demás servicios "¿está permitido esto?". Construí **Go Authz** como un servicio interno de autenticación y autorización para sistemas multi-tenant — no como un proveedor OIDC completo, no como una librería, y no como una plataforma que pretenda resolver problemas que el código no resuelve en realidad.

El alcance se fijó a propósito: rotación de refresh tokens con detección de reutilización y revocación de familias, aislamiento de tenant forzado por más que un `WHERE tenant_id = ?`, y un único lugar para preguntar si un usuario puede realizar una acción. Todo lo demás — service accounts, métricas, tracing, alta disponibilidad — se nombra como trabajo futuro o se deja fuera deliberadamente.

---

## El problema

Cuando los servicios crecen más allá de una sola aplicación, la autenticación y la autorización tienden a dispersarse:

1. **Las sesiones robadas siguen siendo útiles demasiado tiempo.** Un refresh token filtrado se convierte en una puerta trasera permanente a menos que la rotación y la detección de reutilización hagan que el robo se vuelva en contra del atacante.
2. **El aislamiento de tenant depende de la disciplina.** Un `WHERE tenant_id = ?` olvidado en una consulta es una fuga cross-tenant. Confiar en que cada desarrollador lo recuerde no escala más allá del primer error.
3. **La lógica de autorización se duplica.** Cada servicio reimplementa roles y permisos de forma distinta, y las implementaciones divergen hasta que nadie puede responder con confianza "quién puede hacer qué".

Go Authz responde a esas tres con las herramientas más simples que dan la garantía correcta, sin construir infraestructura que el problema no pide todavía.

---

## Qué construí (y qué no construí deliberadamente)

El servicio separa dos planos de forma conceptual, no física:

- **Plano de control:** `SuperAdmin`, una entidad estructuralmente separada sin `tenant_id`, responsable de provisionar tenants.
- **Plano de datos:** `Tenant`, `User`, `Role`, `Permission`, todo con scope de tenant.

Un `SuperAdmin` no es un `User` con privilegios elevados. El tipo no tiene campo `tenant_id`, así que la separación es estructural en el modelo de dominio y no un check en runtime que se puede olvidar.

**Implementado:**
- Refresh tokens opacos con rotación y detección de reutilización.
- JWT de acceso firmados con ES256, con múltiples claves de verificación y rotación por `kid`.
- Hash de contraseñas con Argon2id.
- RBAC con scope de tenant y catálogo global de permisos.
- Un único endpoint `/authorize`.
- Rate limiting basado en Redis.
- Probes `/health` y `/ready`.

**Deliberadamente no implementado:**
- Flujos completos de proveedor OIDC/OAuth2, registro de clientes, consentimiento o discovery.
- Service accounts / autenticación machine-to-machine.
- Métricas Prometheus u OpenTelemetry tracing.
- Alta disponibilidad de Redis.
- Políticas efectivas de Row Level Security en PostgreSQL.

Este último punto importa y es fácil de enunciar mal, así que tiene su propia sección.

---

## Arquitectura y flujo principal

La capa HTTP es un router chi con middleware montado por grupo de rutas. Recovery y request logging son globales; todo lo demás es explícito.

```text
HTTP (chi)
  ├── /health, /ready
  ├── /tenants/{tenantID}/login        (rate limited)
  ├── /super-admin/login               (rate limited)
  ├── /refresh                         (rate limited)
  ├── /logout
  ├── /sessions, /sessions/revoke-all  (user token)
  ├── /tenants                         (super admin)
  ├── /tenants/{tenantID}/users        (tenant admin)
  ├── /tenants/{tenantID}/roles...     (tenant admin)
  ├── /permissions                     (super admin)
  └── /authorize                       (user token)
```

La capa de dominio no tiene dependencias externas. Los casos de uso dependen de puertos (`UserRepository`, `RoleAssignmentRepository`, `TokenIssuer`, etc.) y los adaptadores los implementan. Esto mantiene la lógica de autorización testeable con fakes en lugar de una base de datos viva.

---

## Decisiones de diseño clave

### 1. Refresh tokens opacos con rotación y detección de reutilización

Los access tokens son JWTs de vida corta. Los refresh tokens son valores aleatorios de alta entropía hasheados con SHA-256 antes de persistirse. Se organizan en familias:

- Cada refresh rota el token: el viejo se revoca, se emite uno nuevo con el **mismo** `family_id`.
- Si se presenta de nuevo un token **revocado**, se revoca toda la familia. Esa es la señal de breach.
- Un token revocado rejugado por un atacante debe aparecer como breach, no como expiración benigna, así que el check de revocado corre **antes** del check de expiración.

```go
if current.Revoked() {
    if _, err := uc.refreshTokens.RevokeAllByFamily(ctx, current.FamilyID()); err != nil {
        return nil, err
    }
    return nil, ErrRefreshReuseDetected
}

if current.IsExpired(now) {
    return nil, ErrInvalidRefreshToken
}
```

El trade-off es deliberado: un cliente legítimo que pierde su token no puede recuperarlo, y un token robado que se usa después de que el cliente legítimo rotó mata toda la cadena de sesión. Ese es el comportamiento esperado, no un efecto secundario.

### 2. Orden de rotación: persistir primero, revocar último

La primera versión de la lógica de rotación emitía el nuevo access token, revocaba el refresh token viejo y luego persistía el nuevo refresh token. Si la persistencia fallaba después de que el token viejo ya estaba revocado, un error transitorio de base de datos hacía que el retry de un cliente legítimo pareciera reutilización y matara toda la familia.

El orden corregido es:

1. Generar y persistir el nuevo refresh token.
2. Emitir el nuevo access token (signing en memoria, lo menos propenso a fallar).
3. Revocar el token viejo al final.

```go
if err := uc.refreshTokens.Create(ctx, newToken); err != nil {
    return nil, err
}

accessToken, err := uc.issuer.IssueAccessToken(ctx, ...)
if err != nil {
    return nil, err
}

if err := uc.refreshTokens.Revoke(ctx, current.ID()); err != nil {
    return nil, err
}
```

Si la persistencia falla, el token viejo sigue válido y el cliente puede reintentar con seguridad. El trade-off aceptado es una ventana breve en la que ambos tokens son técnicamente válidos. El orden actual protege los reintentos legítimos tras un fallo de persistencia, pero la evidencia disponible no demuestra que elimine carreras concurrentes ni el uso de un token robado antes de la rotación.

### 3. ES256 y rotación manual de claves

Los access tokens usan ECDSA P-256 (ES256) en lugar de RS256: firmas más pequeñas y márgenes de seguridad equivalentes. Este texto no afirma una ventaja medida de velocidad de verificación, porque ningún benchmark del repositorio la respalda. Múltiples claves pueden verificar simultáneamente, identificadas por `kid`. Exactamente una clave firma tokens nuevos; las retiradas solo necesitan su clave pública.

```go
token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
token.Header["kid"] = i.store.SigningKID()
```

La gestión de claves es basada en archivos y manual: `{kid}_public.pem` para cada clave, más `{kid}_private.pem` solo para la clave activa de firma. Una misconfiguración (active `kid` no encontrado) falla al arrancar, no en el primer login. Es simple y auditable, pero no es un servicio de gestión de claves y no automatiza la rotación.

### 4. Argon2id para contraseñas, SHA-256 para refresh tokens

Resuelven problemas distintos. Argon2id es memory-hard porque defiende secretos de baja entropía (contraseñas humanas) contra fuerza bruta offline. Un refresh token ya es un valor aleatorio de 256 bits, así que un KDF lento añade costo sin beneficio de seguridad. SHA-256 es la herramienta correcta para hashear tokens de alta entropía antes de persistirlos.

```go
const defaultMemory uint32 = 65536 // 64 MiB, recomendación OWASP
```

Los hashes usan formato PHC, así que los parámetros de costo se pueden subir en el futuro sin invalidar hashes existentes.

### 5. Aislamiento de tenant: middleware, consultas y trigger — no políticas RLS

El aislamiento de tenant se gestiona mediante mecanismos con responsabilidades distintas:

1. **Middleware:** valida que el tenant en la URL coincida con el tenant del access token del caller. Sin ese binding, un admin del Tenant A podría operar sobre datos del Tenant B.
2. **Consultas:** filtran registros por `tenant_id` en la capa de repositorio.
3. **Trigger:** impide asignar un rol a un usuario de otro tenant. Es una restricción específica de asignación de roles, no una barrera general de aislamiento de base de datos.

```sql
CREATE TRIGGER trg_user_roles_same_tenant
    BEFORE INSERT OR UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION check_user_role_same_tenant();
```

El trigger lanza un SQLSTATE dedicado (`AUTH1`), no el genérico `P0001`, para que un trigger futuro no se traduzca por error como una violación cross-tenant.

**Lo que no es cierto:** Row Level Security está habilitado en varias tablas, pero **no hay políticas**, **no hay `FORCE ROW LEVEL SECURITY`** y **no hay binding `set_config('app.tenant_id')`** en la aplicación. La conexión usa un rol que es owner de las tablas y puede omitir RLS. RLS es, por tanto, un mecanismo latente, no una barrera efectiva de aislamiento hoy. El aislamiento que realmente funciona es la combinación de consultas filtradas, binding en middleware y el trigger.

### 6. RBAC con catálogo global de permisos

Los permisos son pares `resource:action` (por ejemplo, `invoices:read`) y forman un único catálogo global compartido entre tenants. Lo que varía por tenant es qué roles tienen qué permisos, no los permisos mismos. Crear un permiso es idempotente (get-or-create); asignarlo a un rol requiere que ya exista, así que un typo no puede contaminar un catálogo compartido.

`/authorize` resuelve el acceso en dos consultas a la base de datos sin importar cuántos roles tenga el usuario: una para cargar el usuario, otra para cargar el conjunto deduplicado de permisos.

```go
func (uc *AuthorizeUseCase) Authorize(ctx context.Context, userID uuid.UUID, resource, action string) (bool, error) {
    target, err := domain.NewPermission(resource, action)
    // ...
    user, err := uc.users.GetByID(ctx, userID)
    // ...
    permissions, err := uc.assignments.ListPermissionsByUser(ctx, userID)
    // ...
}
```

Un usuario desconocido o suspendido retorna `false` sin error. La autorización no está embebida en el JWT; `/authorize` es la fuente de verdad.

### 7. Rate limiting: Redis atómico, fail-open por defecto

Login, super-admin login y refresh están protegidos por un contador de ventana fija implementado como script Lua atómico:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
    return 0
end
return 1
```

El TTL se establece solo en el primer incremento, fijando la ventana al primer request. Cuando Redis no está disponible, el limiter puede fallar abierto (`FailOpen: true` por defecto): disponibilidad sobre protección. Argon2id aumenta el costo de los intentos de adivinación de contraseñas, pero no reemplaza el rate limiting; por eso fail-open elimina temporalmente esa capa de protección mientras Redis no está disponible.

Redis es una instancia única. Ese es un single point of failure documentado tanto para rate limiting como para cualquier cache futuro, no algo oculto.

---

## Bugs que el proceso de revisión detectó

Estos no son puntos de marketing. Son casos en los que código que funcionaba con tests de happy path pasando aun así contenía defectos reales, encontrados al pedir el razonamiento detrás de cada decisión de diseño.

### 1. Orden de rotación

La primera versión emitía el nuevo access token, revocaba el refresh token viejo y luego persistía el nuevo refresh token. Un error transitorio de base de datos entre revoke y persist hacía que el retry de un cliente legítimo pareciera reutilización y matara toda la familia. Se corrigió persistiendo primero y revocando al final. Verificado por un test que simula fallo de persistencia y afirma que el token viejo sigue válido.

### 2. Escalada de privilegios cross-tenant — dos instancias

- **Bug A:** `AssignPermissionToRole` nunca verificaba que el rol perteneciera al tenant del admin que hacía la llamada. A diferencia de la asignación rol-usuario, no había protección a nivel de base de datos. Se corrigió exigiendo el tenant en la ruta y verificando `role.TenantID()` antes de proceder; un mismatch retorna el mismo "not found" que un rol inexistente, sin filtrar información.
- **Bug B:** `RequireTenantAdmin` verificaba si el caller tenía un rol admin en algún lugar, pero nunca si el tenant en la URL coincidía con el tenant del token. Como cada usuario pertenece a exactamente un tenant, un admin del Tenant A pasaba el check para el Tenant B. Esto afectaba seis endpoints a la vez. Se corrigió una sola vez a nivel de middleware, así que los endpoints futuros heredan la protección.

Los tests de regresión afirman que las llamadas cross-tenant se rechazan antes de que se ejecute lógica de negocio para el tenant ajeno, verificado mediante un spy sobre el caso de uso y no solo el código HTTP.

### 3. Colisión de código de error genérico de Postgres

El trigger inicialmente lanzaba el `P0001` por defecto. Cualquier trigger futuro en cualquier parte del schema habría colisionado con ese match y se habría traducido por error. Se corrigió asignando el código dedicado `AUTH1` antes de que existiera cualquier otro trigger con el que colisionar.

---

## Cómo se verifica el comportamiento

- **Tests unitarios con fakes:** los casos de uso se prueban con repositorios en memoria, incluyendo detección de reutilización, fallos de orden y usuarios suspendidos.
- **Tests de integración contra Postgres y Redis reales:** repositorios, migraciones, el trigger y la atomicidad del rate limiter. El test del rate limiter dispara 50 goroutines concurrentes contra un límite de 3 y afirma que exactamente 3 tienen éxito.
- **Verificación de número de consultas:** un tracer afirma que `/authorize` se resuelve en exactamente dos sentencias SQL, protegiendo contra regresiones N+1.
- **Tests de contrato:** validación del contrato OpenAPI.
- **CI:** golangci-lint, `go vet`, build, tests y escaneo de secretos con gitleaks en pull requests y pushes a `main`.

Los tests de integración requieren Docker (testcontainers). Es un requisito de entorno, no una brecha de cobertura.

---

## Limitaciones y deuda honesta

- **Sin métricas ni tracing.** No hay endpoint `/metrics` ni instrumentación de tracer. Lo que existe es logging estructurado con `slog` en cada request, más `/health` y `/ready` verificando conectividad viva a base de datos y Redis.
- **Sin service accounts.** Todo caller se autentica como `User` o `SuperAdmin`. Un servicio que necesite autenticarse como "un servicio" requeriría un flujo client-credentials que no existe.
- **Redis es un single point of failure.** Aceptable en la etapa actual; Sentinel o Cluster es el siguiente paso antes de un path crítico en producción.
- **RLS está habilitado pero no es efectivo.** Sin políticas, sin `FORCE ROW LEVEL SECURITY`, sin binding de contexto de tenant. Es un mecanismo latente, no una garantía.
- **Sin histogramas de latencia.** `/authorize` y el rate limiter son los dos paths que más se beneficiarían, y ninguno tiene uno todavía.
- **Los tests cross-tenant son por instancia, no categóricos.** Los dos bugs se encontraron revisando cada endpoint detrás de `RequireTenantAdmin` después de encontrar el primero, no mediante una estrategia de tests diseñada para capturar esa clase de bug desde el principio.

---

## Lo que aprendí

1. **El orden fail-safe es la diferencia entre un error transitorio y un incidente de seguridad.** Revocar al final no es una optimización; evita que un blip de base de datos se convierta en una detección falsa de breach.
2. **La defensa en profundidad solo cuenta si cada capa es real.** El binding en middleware y el trigger hacen trabajo real. RLS habilitado sin políticas no hace, y afirmar lo contrario sería deshonesto.
3. **Los tests más valiosos afirman comportamiento exacto, no éxito aproximado.** Conteos exactos de consultas y resultados exactos de concurrencia atrapan regresiones que "pasó" nunca atraparía.

Go Authz es un proyecto de portfolio que resuelve un problema real con una arquitectura defendible. No es un sistema de producción tal cual, y no pretende serlo. El relato honesto de lo que está construido, lo que está probado y lo que falta es el punto del proyecto.

---

## Fuentes

| Archivo | Aporte |
|---|---|
| `README.md` | Visión, arquitectura, decisiones, deuda |
| `DECISIONS.md` | Alcance, decisiones, bugs, no implementado |
| `internal/adapter/token/token.go` | ES256, key store, rotación por kid |
| `internal/adapter/hash/hash.go` | Argon2id, parámetros OWASP |
| `internal/adapter/opaquetoken/opaquetoken.go` | Refresh tokens opacos, SHA-256 |
| `internal/usecase/auth/refresh.go` | Rotación, reuse detection, orden fail-safe |
| `internal/adapter/http/middleware/tenant_admin.go` | Binding tenant URL ↔ token |
| `internal/adapter/redis/rate_limiter.go` | Rate limiter atómico, fail-open |
| `internal/usecase/rbac/authorize.go` | Autorización, dos consultas |
| `migrations/000008_user_roles.up.sql` | Trigger cross-tenant |
| `migrations/000010_user_roles_auth1.up.sql` | SQLSTATE dedicado AUTH1 |
| `.github/workflows/ci.yml` | CI, lint, test, gitleaks |
| `test/integration/*.go` | Integración real, tracer, concurrencia |
| `openapi.yaml` | Contrato HTTP |
