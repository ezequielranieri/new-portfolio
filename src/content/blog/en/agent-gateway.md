---
title: "Agent Gateway: the only path between your application and the model"
excerpt: "A multi-tenant control plane for LLM agents with zero bypass, database-level tenant isolation via PostgreSQL RLS FORCE, immutable audit log with hash-chaining, fail-closed delegation with generation counters, and WASM tool sandboxing."
date: "2026-10-23T00:00:00Z"
# Optional, edited by hand when the article is revised (YYYY-MM-DD).
# updatedDate: YYYY-MM-DD
tags: ["AI SECURITY", "MULTI-TENANT", "GO", "POSTGRESQL", "WASM"]
draft: false
translationKey: "agent-gateway"
---

Any system running LLM agents at scale faces three uncomfortable questions: how do you guarantee no call bypasses the gateway? How do you keep one tenant's data, budget, and behavior isolated from another's? How do you prove what happened when something fails? I built **agent-gateway** as a multi-tenant control plane that answers all three with the simplest architecture that gives the correct guarantee: zero bypass, database-level isolation, and immutable audit trail with hash-chaining.

---

## The Problem

When you put LLM agents in production, the attack surface grows in three dimensions most frameworks ignore:

1. **Invisible bypass**: a single direct `http.Post` to the model endpoint leaks data, burns budget, and evades all controls. Without a mandatory interception layer, the gateway is optional — and optional gets bypassed.
2. **Fragile isolation**: a forgotten `WHERE tenant_id = ?` in a query, a shared rate-limit bucket, or a leaked tool execution context aren't bugs — they're cross-tenant breaches. Isolation must survive application bugs, not depend on code being well-written.
3. **Non-existent audit trail**: "the model did it" is not an audit trail. You need immutable logs of every model call, tool execution, guardrail decision, and human approval — queryable, replayable, and tamper-proof.

---

## What I Built

**agent-gateway** is a multi-tenant gateway / control plane for LLM agents — the **only intermediate layer** between your application and the model. Every request traverses a mandatory middleware chain: auth → tenant resolution → delegation → rate limit → audit → guardrails → HITL → model router. Nothing reaches the model without passing through the entire chain.

The system separates two explicit planes: **control plane** (Super Admin, tenant management, global quotas) and **data plane** (users, roles, quotas, audit events, review requests, guardrail violations, delegation grants — all scoped to tenant). They never mix.

---

## Key Design Decisions (the 5 that define the system)

### 1. RLS FORCE + Composite PK (id, tenant_id) as Real Tenancy (AD-002)
**Rule**: Tenancy MUST be enforced by PostgreSQL Row Level Security FORCE, never by application alone. Tenanted tables carry `tenant_id`, RLS FORCE, and composite PK `(id, tenant_id)`. `current_setting('app.tenant_id')` returns `NULL` when unset — NULL predicate is **always false**, so missing context = **zero rows, never leak**. Per-transaction bind with `set_config(..., true)` LOCAL — prevents cross-tenant leaks in pooled connections. `FORCE` extends RLS to table owner (even raw `psql` doesn't cross tenants without superuser).

**Discarded alternatives**: schema-per-tenant (catalog explosion), database-per-tenant (expensive infra), app-only filtering (not structural), RLS without FORCE (owner bypasses), single-column PK (side-channel via FK).

**Cost**: Queries need tenant context or return zero rows; Postgres-only; each unit of work pays a transaction; FKs repeat composite pair.

### 2. Append-Only Audit Log + Hash-Chaining per Tenant (AD-007)
**Rule**: Every `private.audit_events` row carries `seq`, `prev_hash`, `chain_hash` with `UNIQUE (tenant_id, seq)`. Genesis: `seq=1`, `prev_hash`=64 hex zeros. Each row: `prev_hash` = previous row's `chain_hash`. `chain_hash` = SHA-256 over fixed field order with canonicalized payload (decode → re-marshal), `created_at` truncated to microseconds — same codepath for insert/verify, no drift. Internal `VerifyChain` detector walks and reports first broken `seq`.

**Discarded alternatives**: global chain (RLS prevents reading other tenants; serializes everything), DB trigger (hidden logic, not testable in Go), hash full SQL row (future migration invalidates chain).

**Cost**: One indexed tail read + insert per event (sync); verification O(n) — fine at portfolio volume.

### 3. Zero-Bypass Middleware Chain (AD-001, AD-006, AD-009, AD-008)
**Rule**: Chi middleware chain in fixed order: auth → tenant → delegation → ratelimit → audit → guardrails → HITL → router. No endpoint reaches the model without passing the full chain.

- **Rate limiting**: Redis token bucket across 3 dimensions (requests/tokens/tool_execs/min) per tenant/user/role; **fail-open** if Redis down (an attacker without credentials gains no access; Argon2id already makes every attempt expensive).
- **Guardrails**: Domain interface `Guardrail` + `LocalGuardrail` (regex/wordlist/PII/injection) by default; `ExternalClassifier` adapters (OpenAI Moderation, Anthropic, Llama Guard) plug outside domain; `CompositeGuardrail` configurable merge (any/all/weighted) + fail behavior (fallback_local/fail_open/fail_closed).
- **HITL**: State machine in PG (`PENDING` → `APPROVED`/`REJECTED`/`EXPIRED`), opaque token (SHA-256 stored), SSE streaming, **full re-validation** on approve (payload re-parsed, IDs resolved in tenant, then materialized).

### 4. Delegation Scope Intersection Gateway-Computed, Never Widened (AD-012, AD-013, AD-014)
**Rule**: `effective_scope = parent_scope ∩ granted_scope` computed **in the gateway** on every hop — never widens. Empty intersection → `scope_intersection_empty` block. Grant envelope persisted **in full** in `delegation_grants` (tenanted, RLS FORCE, composite PK) with lifecycle `issued → active → revoked/expired/consumed`, `root_intent`/`hitl_classification` immutable from root, shared budget pool per chain (Redis atomic Lua). Middleware **fail-closed** (`FailOpen: false`) positioned after tenant and before rate limit: validates TTL, scope intersection, depth (MaxDepth 5), fan-out (MaxFanOut 10), cycle detection, **chain revocation via generation counter** (`COUNT(*) revoked grants` per chain; grant generation < currentGen = replay reject), HITL propagation from root, atomic budget decrement. Nil deps → panic (no silent bypass). JWT transport per AD-013 designed but **not wired to production yet**.

### 5. WASM Tool Sandbox In-Process (wazero) (AD-011)
**Rule**: `ToolExecutor` interface in domain. `WasmExecutor` (wazero) for production: runtime pooling by memory buckets (256/512/1024/2048 pages), lazy compilation per-runtime, **per-execution module instantiation** (total isolation), fuel/memory/wall-time limits enforced, FS read-only mounts, network opt-in. **Fail-closed registry**: missing limits in registry = immediate reject. `MockExecutor` for tests. Bounded agent loop (max 5 iterations) with HITL gate, re-resolution hash-verified against registry, per-step cost/audit/rate-limit accounting.

**Trade-off**: wazero adds binary size and compilation complexity; gVisor/Firecracker are heavier.

---

## Architecture and Main Flow

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

**`/v1/chat/completions` Flow (10 steps):**
1. **AuthMW** — JWT HS256 (kid rotation, 15 min TTL, alg pinned)
2. **TenantMW** — `set_config('app.tenant_id', $1, true)` LOCAL; RLS FORCE auto-applies
3. **DelegationMW** (fail-closed) — grant lifecycle, scope intersection `parent ∩ granted`, depth/fan-out, cycle detection, chain revocation (generation counter), HITL propagation, budget decrement Redis Lua atomic
4. **RateLimitMW** — 3 token buckets per tenant/user/role; fail-open if Redis down
5. **AuditMW** — append hash-chained (fail-open: audit failure never fails main flow)
6. **GuardrailsMW** — CompositeGuardrail (local + external); input fail-closed, output fail-closed/sanitize
7. **HITLMW** — intercepts writes; creates `ReviewRequest` PENDING + opaque token; SSE streaming
8. **Model Router** — FallbackChain priority-based + circuit breaker half-open; pre-estimate → route → post-actual cost
9. **Tool Loop** (bounded 5) — re-resolution hash-verified, HITL gate, WASM isolated (fuel/memory/wall-time, read-only FS, no network)
10. **Response** — actual cost, latency, provider, retried flag

---

## Technical Details That Make the Difference

### Tenant Isolation at DB Level (Real Defense in Depth)
```sql
CREATE POLICY tenant_isolation ON private.audit_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
ALTER TABLE private.audit_events FORCE ROW LEVEL SECURITY;
```
- `NULL` tenant context = **zero rows, never leak** (NULL predicate always false)
- Transactional LOCAL bind prevents leaks in pooled connections
- `FORCE` shields table owner (raw `psql` doesn't cross tenants without superuser)
- Composite PK `(id, tenant_id)` closes side-channel via FK on unprotected tables

### Secure Delegation with Generation Counter
```go
// In delegation middleware: chain revocation check
currentGen, _ := repo.GetChainGeneration(ctx, tenantID, grant.ChainID)
if grant.Generation < currentGen {
    // Grant issued before a revocation → replay reject
    return ErrGrantRevokedOrConsumed
}
// Atomic budget decrement Redis Lua (fail-fast if deps nil)
remaining, _ := budgetDec.DecrementBudget(ctx, grant.ChainID, 1)
```
- Generation counter = `COUNT(*) revoked grants` per chain — O(1) conceptual, monotonically increasing, no extra table
- Revocation takes effect on **next** authorization, never mid-flight
- Shared budget pool cross-chain (one aggressive agent can exhaust sibling pools — accepted)

### WASM Tool Sandbox Fail-Closed
- Registry-driven limits: `ExecutionTimeoutMs`, `MemoryPages` **required** in registry; missing limits = immediate reject
- Per-execution instantiation: new WASM instance per call, total isolation
- Fuel/memory/wall-time enforced by wazero; configurable FS read-only mounts; network opt-in

---

## What I Learned (3 Keys) and Honest Tech Debt

1. **RLS FORCE + Composite PK is not optional** — application-level isolation ALWAYS fails eventually. The only defense that survives bugs lives in the storage engine.
2. **Fail-open in rate limiting is the correct trade-off** — documented Redis SPOF; an attacker without credentials gains no access just because rate limiting is temporarily disabled (Argon2id already makes every attempt expensive).
3. **Grant envelope persisted in full, not hash-only** — enables scope-intersection evaluation and lifecycle tracking without extra lookups; JWT transport is future hardening, not current requirement.

**Explicit Tech Debt (named from day 1):**
1. **Redis SPOF** — single instance. Exit: Sentinel/Cluster before real production.
2. **Schema-per-tenant** — RLS on shared instance suffices. Exit: evaluate only if hard isolation requirement emerges.
3. **CI Coverage Debt** — integration suites for audit, guardrail, HITL, rate limit NOT in CI yet (only delegation runs on push). Fix: separate future task.

---

## Stack

`Go 1.22+` • `chi` • `PostgreSQL 16 (RLS FORCE)` • `sqlc + pgx` • `goose (17 migrations)` • `Redis 7 + redis_rate` • `JWT HS256 (kid rotation)` • `Argon2id (PHC)` • `wazero WASM` • `OpenTelemetry + Prometheus + Grafana + Loki + Jaeger` • `testcontainers-go (real PG + Redis)` • `OpenAPI 3.1 (oapi-codegen)` • `Docker Compose` • `GitHub Actions + gitleaks + SOPS/age`

---

## Sources Used

| File | Contribution |
|---|---|
| `README.md` | Overview, architecture, tenancy model, security design, verified guarantees, roadmap |
| `DECISIONS.md` | 14 ADRs (AD-001 to AD-014) with rules, rejected alternatives, accepted costs |
| `SPEC.md` | Functional source of truth: core entities, MVP use cases, permission model |
| `STACK.md` | Technical source of truth: closed stack, security decisions, observability, testing, debt |
| `KNOWN_ISSUES.md` | Test infrastructure issues only, deliberate CI coverage debt |
| `cmd/gateway/main.go` | Composition root: complete wiring repos, services, middleware chain, DI |
| `internal/domain/delegation/grant.go` | Grant envelope, ScopeSet, Intersection logic, lifecycle |
| `internal/middleware/delegation.go` | Fail-closed middleware: 10 ordered validations, panic if deps nil |
| `internal/domain/guardrail.go` + `external.go` | Guardrail interface, CompositeConfig, ExternalClassifier |
| `internal/domain/model/provider.go` + `routing.go` + `pricing.go` | ModelProvider port, RouterConfig, FallbackChain, PricingService |
| `internal/domain/tool/executor.go` | ToolExecutor interface, ToolCall, ToolResult |
| `internal/adapter/tool/wazero/executor.go` | WasmExecutor: runtime pooling, lazy compilation, per-execution instantiation, limits |
| `internal/usecase/chat/orchestrator.go` | ChatUsecase: pre-estimate → fallback chain → bounded tool loop (5) → post-actual cost |
| `internal/adapter/postgres/audit_repository.go` | Append hash-chaining, canonicalization, row-level lock, VerifyChain |
| `internal/adapter/postgres/db.go` | WithTenantTx, set_config LOCAL, RLS enforcement point |
| `internal/adapter/redis/delegation_budget.go` | Atomic Lua script budget decrement per-chain |
| `migrations/0001–0017` | Real schema, RLS FORCE, composite PKs, seed pricing, delegation grants |