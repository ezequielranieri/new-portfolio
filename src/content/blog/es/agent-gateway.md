---
title: "Agent Gateway: el único camino entre tu aplicación y el modelo"
excerpt: "Un control plane multi-tenant para agentes LLM con cero bypass, aislamiento de tenant a nivel de base de datos mediante PostgreSQL RLS FORCE, log de auditoría inmutable con hash-chaining, delegación fail-closed con contadores de generación, y sandbox WASM para herramientas."
date: "2026-10-23T00:00:00Z"
# Opcional, se edita a mano cuando el artículo se revisa (YYYY-MM-DD).
tags: ["AI SECURITY", "MULTI-TENANT", "GO", "POSTGRESQL", "WASM"]
draft: false
translationKey: "agent-gateway"
lang: "es"
---

Cualquier sistema que ejecute agentes LLM a escala se enfrenta a tres preguntas incómodas: ¿cómo garantizas que ninguna llamada saltee el gateway? ¿Cómo mantienes los datos, presupuesto y comportamiento de un tenant aislados del de otro? ¿Cómo demuestras qué pasó cuando algo falla? Construí **agent-gateway** como un control plane multi-tenant que responde a esas tres con la arquitectura más simple que da la garantía correcta: cero bypass, aislamiento a nivel de base de datos, y auditoría inmutable con hash-chaining.

---

## El problema

Cuando pones agentes LLM en producción, la superficie de ataque crece en tres dimensiones que la mayoría de frameworks ignoran:

1. **Bypass invisible**: un solo `http.Post` directo al endpoint del modelo filtra datos, quema presupuesto y evade todos los controles. Sin una capa de intercepción obligatoria, el gateway es opcional — y lo opcional se saltea.
2. **Aislamiento frágil**: un `WHERE tenant_id = ?` olvidado en una query, un bucket de rate limit compartido, o un contexto de ejecución de tool filtrado no son bugs — son brechas cross-tenant. El aislamiento debe sobrevivir a bugs de aplicación, no depender de que el código esté bien escrito.
3. **Auditoría inexistente**: "el modelo lo hizo" no es un audit trail. Necesitas logs inmutables de cada llamada al modelo, ejecución de tool, decisión de guardrail y aprobación humana — consultables, rejugables, y a prueba de manipulación.

---

## Qué construí

**agent-gateway** es un gateway / control plane multi-tenant para agentes LLM — la **única capa intermedia** entre tu aplicación y el modelo. Cada petición atraviesa una cadena de middleware obligatoria: auth → tenant resolution → delegación → rate limit → audit → guardrails → HITL → model router. Nada llega al modelo sin pasar por toda la cadena.

El sistema separa dos planos explícitos: **plano de control** (Super Admin, gestión de tenants, cuotas globales) y **plano de datos** (users, roles, quotas, audit events, review requests, guardrail violations, delegation grants — todo scopeado a tenant). No se mezclan.

---

## Decisiones de diseño clave (las 5 que definen el sistema)

### 1. RLS FORCE + PK compuesta (id, tenant_id) como tenencia real (AD-002)
**Regla**: La tenencia DEBE ser forzada por PostgreSQL Row Level Security FORCE, nunca solo por la aplicación. Tablas tenanted llevan `tenant_id`, RLS FORCE, y PK compuesta `(id, tenant_id)`. `current_setting('app.tenant_id')` retorna `NULL` cuando unset — predicado NULL **siempre false**, así que contexto faltante = **cero filas, nunca leak**. Bind por transacción con `set_config(..., true)` LOCAL — evita leaks cross-tenant en conexiones pooled. `FORCE` extiende RLS al table owner (incluso `psql` raw no cruza tenants sin superuser).

**Alternativas descartadas**: schema-per-tenant (explota catálogo), database-per-tenant (infra cara), filtrado solo en app (no estructural), RLS sin FORCE (owner bypassea), PK single-column (side-channel via FK).

**Coste**: Queries necesitan tenant context o retornan cero filas; Postgres-only; cada unidad de trabajo paga transacción; FKs repiten par compuesto.

### 2. Audit Log Append-Only + Hash-Chaining por tenant (AD-007)
**Regla**: Cada fila `private.audit_events` lleva `seq`, `prev_hash`, `chain_hash` con `UNIQUE (tenant_id, seq)`. Génesis: `seq=1`, `prev_hash`=64 ceros hex. Cada fila: `prev_hash` = `chain_hash` anterior. `chain_hash` = SHA-256 sobre orden fijo de campos con payload canonicalized (decode → re-marshal), `created_at` truncado a microsegundos — mismo codepath insert/verify, sin drift. `VerifyChain` detector interno recorre y reporta primer `seq` roto.

**Alternativas descartadas**: cadena global (RLS impide leer otros tenants; serializa todo), trigger DB (lógica escondida, no testeable en Go), hashear fila SQL completa (migración futura invalida cadena).

**Coste**: Un indexed tail read + insert por evento (sync); verificación O(n) — bien a volumen portfolio.

### 3. Zero-Bypass Middleware Chain (AD-001, AD-006, AD-009, AD-008)
**Regla**: Chi middleware chain orden fijo: auth → tenant → delegation → ratelimit → audit → guardrails → HITL → router. Ningún endpoint alcanza el modelo sin pasar la cadena completa.

- **Rate limiting**: Redis token bucket 3 dimensiones (requests/tokens/tool_execs/min) por tenant/user/role; **fail-open** si Redis down (un attacker sin credenciales no gana acceso; Argon2id ya hace cada intento costoso).
- **Guardrails**: Domain interface `Guardrail` + `LocalGuardrail` (regex/wordlist/PII/injection) por defecto; `ExternalClassifier` adapters (OpenAI Moderation, Anthropic, Llama Guard) enchufan fuera del dominio; `CompositeGuardrail` merge configurable (any/all/weighted) + fail behavior (fallback_local/fail_open/fail_closed).
- **HITL**: State machine en PG (`PENDING` → `APPROVED`/`REJECTED`/`EXPIRED`), token opaco (SHA-256 stored), SSE streaming, **re-validación completa** al aprobar (payload re-parseado, IDs resueltos en tenant, luego materializar).

### 4. Delegation Scope Intersection Gateway-Computed, Never Widened (AD-012, AD-013, AD-014)
**Regla**: `effective_scope = parent_scope ∩ granted_scope` computado **en el gateway** en cada hop — nunca ensancha. Si intersección vacía → bloqueo `scope_intersection_empty`. Grant envelope persistido **en completo** en `delegation_grants` (tenanted, RLS FORCE, PK compuesta) con lifecycle `issued → active → revoked/expired/consumed`, `root_intent`/`hitl_classification` inmutables desde raíz, budget pool compartido por cadena (Redis atomic Lua). Middleware **fail-closed** (`FailOpen: false`) posicionado tras tenant y antes de rate limit: valida TTL, scope intersection, depth (MaxDepth 5), fan-out (MaxFanOut 10), cycle detection, **chain revocation via generation counter** (`COUNT(*) revoked grants` per chain; grant generation < currentGen = replay reject), HITL propagation from root, budget decrement atómico. Deps nil → panic (no silent bypass). JWT transport per AD-013 diseñado pero **no cableado a producción aún**.

### 5. Tool Sandbox WASM In-Process (wazero) (AD-011)
**Regla**: `ToolExecutor` interface en dominio. `WasmExecutor` (wazero) para producción: runtime pooling por memory buckets (256/512/1024/2048 pages), lazy compilation per-runtime, **per-execution module instantiation** (aislamiento total), fuel/memory/wall-time limits enforced, FS read-only mounts, network opt-in. **Fail-closed registry**: sin límites en registry = reject inmediato. `MockExecutor` para tests. Bounded agent loop (máx 5 iteraciones) con HITL gate, re-resolution hash-verified contra registry, per-step cost/audit/rate-limit accounting.

**Trade-off**: wazero añade binary size y complejidad compilación; gVisor/Firecracker son más pesados.

---

## Arquitectura y flujo principal

```
HTTP (chi) → auth → tenant → delegation → ratelimit → audit → guardrails → HITL → router
             │                                                     │
        ports.AuthService                                    ports.Guardrail
             │                                                     │
Use Cases: gateway, ratelimit, audit, hitl, guardrail, chat (DIP: interfaces only)
             │                                                     │
Adapters: postgres (RLS, sqlc), redis (token bucket, Lua budget), jwt (HS256 kid),
          otel, guardrail (local + external), hitl (SSE + PG), provider (OpenAI/Anthropic/Ollama),
          pricing (versioned tables), tool (wazero WASM)
             │
Domain: pure entities + sentinel errors, ZERO external deps (stdlib only)
```

**Flujo `/v1/chat/completions` (10 pasos):**
1. **AuthMW** — JWT HS256 (kid rotation, 15 min TTL, alg pinned)
2. **TenantMW** — `set_config('app.tenant_id', $1, true)` LOCAL; RLS FORCE auto-aplica
3. **DelegationMW** (fail-closed) — grant lifecycle, scope intersection `parent ∩ granted`, depth/fan-out, cycle detection, chain revocation (generation counter), HITL propagation, budget decrement Redis Lua atómico
4. **RateLimitMW** — 3 buckets token bucket por tenant/user/role; fail-open si Redis down
5. **AuditMW** — append hash-chained (fail-open: audit failure nunca falla main flow)
6. **GuardrailsMW** — CompositeGuardrail (local + external); input fail-closed, output fail-closed/sanitize
7. **HITLMW** — intercepta writes; crea `ReviewRequest` PENDING + token opaco; SSE streaming
8. **Model Router** — FallbackChain priority-based + circuit breaker half-open; pre-estimate → route → post-actual cost
9. **Tool Loop** (bounded 5) — re-resolution hash-verified, HITL gate, WASM aislado (fuel/memory/wall-time, read-only FS, no network)
10. **Response** — cost actual, latency, provider, retried flag

---

## Detalles técnicos que marcan la diferencia

### Aislamiento tenant a nivel DB (defense in depth real)
```sql
CREATE POLICY tenant_isolation ON private.audit_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
ALTER TABLE private.audit_events FORCE ROW LEVEL SECURITY;
```
- `NULL` tenant context = **cero filas, nunca leak** (predicado NULL siempre false)
- Bind transaccional LOCAL evita leaks en conexiones pooled
- `FORCE` blinda al table owner (raw `psql` no cruza tenants sin superuser)
- PK compuesta `(id, tenant_id)` cierra side-channel via FK en tablas sin proteger

### Delegación segura con generation counter
```go
// En middleware delegation: chain revocation check
currentGen, _ := repo.GetChainGeneration(ctx, tenantID, grant.ChainID)
if grant.Generation < currentGen {
    // Grant emitido antes de una revocación → replay reject
    return ErrGrantRevokedOrConsumed
}
// Budget decrement atómico Redis Lua (fail-fast si deps nil)
remaining, _ := budgetDec.DecrementBudget(ctx, grant.ChainID, 1)
```
- Generation counter = `COUNT(*) revoked grants` per chain — O(1) conceptual, monotónicamente creciente, sin tabla extra
- Revocación toma efecto en **próxima** autorización, nunca mid-flight
- Budget pool compartido cross-chain (un agente agresivo puede agotar pool siblings — aceptado)

### WASM Tool Sandbox fail-closed
- Registry-driven limits: `ExecutionTimeoutMs`, `MemoryPages` **obligatorios** en registry; sin límites = reject inmediato
- Per-execution instantiation: nueva instancia WASM por llamada, aislamiento total
- Fuel/memory/wall-time enforced por wazero; FS read-only mounts configurables; network opt-in

---

## Qué aprendí (3 claves) y deuda técnica honesta

1. **RLS FORCE + PK compuesta no es opcional** — el aislamiento a nivel aplicación SIEMPRE falla eventualmente. La única defensa que sobrevive a bugs está en el motor de almacenamiento.
2. **Fail-open en rate limiting es el trade-off correcto** — Redis SPOF documentado; un attacker sin credenciales no gana acceso solo porque rate limiting esté temporalmente desactivado (Argon2id ya hace cada intento costoso).
3. **Grant envelope persistido en completo, no hash-only** — permite scope-intersection evaluation y lifecycle tracking sin lookups extra; JWT transport es hardening futuro, no requisito actual.

**Deuda técnica explícita (nombrada desde día 1):**
1. **Redis SPOF** — instancia única. Exit: Sentinel/Cluster antes de producción real.
2. **Schema-per-tenant** — RLS en instancia compartida basta. Exit: evaluar solo si requisito real de aislamiento fuerte.
3. **CI Coverage Debt** — integration suites audit, guardrail, HITL, rate limit NO en CI todavía (solo delegación corre en push). Fix: tarea futura separada.

---

## Stack

`Go 1.22+` • `chi` • `PostgreSQL 16 (RLS FORCE)` • `sqlc + pgx` • `goose (17 migraciones)` • `Redis 7 + redis_rate` • `JWT HS256 (kid rotation)` • `Argon2id (PHC)` • `wazero WASM` • `OpenTelemetry + Prometheus + Grafana + Loki + Jaeger` • `testcontainers-go (PG + Redis reales)` • `OpenAPI 3.1 (oapi-codegen)` • `Docker Compose` • `GitHub Actions + gitleaks + SOPS/age`

---

## Fuentes usadas

| Archivo | Qué aporta |
|---|---|
| `README.md` | Visión general, arquitectura, tenancy model, security design, verified guarantees, roadmap |
| `DECISIONS.md` | 14 ADRs (AD-001 a AD-014) con reglas, alternativas rechazadas, costes aceptados |
| `SPEC.md` | Fuente de verdad funcional: entidades core, casos de uso MVP, modelo de permisos |
| `STACK.md` | Fuente de verdad técnica: stack cerrado, decisiones seguridad, observabilidad, testing, deuda |
| `KNOWN_ISSUES.md` | Test infrastructure issues only, CI coverage debt deliberado |
| `cmd/gateway/main.go` | Composition root: wiring completo repos, services, middleware chain, DI |
| `internal/domain/delegation/grant.go` | Grant envelope, ScopeSet, Intersection logic, lifecycle |
| `internal/middleware/delegation.go` | Middleware fail-closed: 10 validaciones ordenadas, panic si deps nil |
| `internal/domain/guardrail.go` + `external.go` | Guardrail interface, CompositeConfig, ExternalClassifier |
| `internal/domain/model/provider.go` + `routing.go` + `pricing.go` | ModelProvider port, RouterConfig, FallbackChain, PricingService |
| `internal/domain/tool/executor.go` | ToolExecutor interface, ToolCall, ToolResult |
| `internal/adapter/tool/wazero/executor.go` | WasmExecutor: runtime pooling, lazy compilation, per-execution instantiation, limits |
| `internal/usecase/chat/orchestrator.go` | ChatUsecase: pre-estimate → fallback chain → bounded tool loop (5) → post-actual cost |
| `internal/adapter/postgres/audit_repository.go` | Append hash-chaining, canonicalization, row-level lock, VerifyChain |
| `internal/adapter/postgres/db.go` | WithTenantTx, set_config LOCAL, RLS enforcement point |
| `internal/adapter/redis/delegation_budget.go` | Atomic Lua script budget decrement per-chain |
| `migrations/0001–0017` | Schema real, RLS FORCE, PK compuestas, seed pricing, delegation grants |