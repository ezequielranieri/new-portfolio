---
title: "Go Authz: Building Authentication and Authorization for Multi-Tenant Systems"
excerpt: "An internal Go service for tenant-scoped identity: opaque rotating refresh tokens with reuse detection, ES256 key rotation, Argon2id, and authorization resolved in two database queries for an existing, active user — including the cross-tenant bugs the review process caught."
date: "2026-11-06T00:00:00Z"
tags: ["SECURITY", "AUTHENTICATION", "GO", "POSTGRESQL", "MULTI-TENANT"]
draft: false
translationKey: "go-authz"
lang: "en"
---

Any system with more than one internal service eventually needs a shared answer to three uncomfortable questions: how long does a stolen session stay useful, how does one tenant's data stay isolated from another's, and where do other services ask "is this allowed?" I built **Go Authz** as an internal authentication and authorization service for multi-tenant systems — not as a full OIDC provider, not as a library, and not as a platform that pretends to solve problems the codebase does not actually solve.

The scope was set deliberately: refresh-token rotation with reuse detection and family revocation, tenant isolation enforced by more than a `WHERE tenant_id = ?`, and one place to ask whether a user can perform an action. Everything else — service accounts, metrics, tracing, high availability — is either named as future work or left out on purpose.

---

## The Problem

When services grow past a single application, authentication and authorization tend to drift:

1. **Stolen sessions stay useful too long.** A leaked refresh token becomes a permanent backdoor unless rotation and reuse detection make theft self-defeating.
2. **Tenant isolation depends on discipline.** A forgotten `WHERE tenant_id = ?` in one query is a cross-tenant data leak. Relying on every developer remembering it does not scale past the first mistake.
3. **Authorization logic duplicates.** Each service reimplements roles and permissions differently, and the implementations drift until nobody can answer "who can do what" with confidence.

Go Authz answers those three with the simplest tools that provide the right guarantee, without building infrastructure the problem does not ask for yet.

---

## What I Built (and What I Deliberately Did Not)

The service separates two planes conceptually, not physically:

- **Control plane:** `SuperAdmin`, a structurally separate entity with no `tenant_id`, responsible for provisioning tenants.
- **Data plane:** `Tenant`, `User`, `Role`, `Permission`, all scoped to a tenant.

A `SuperAdmin` is not a `User` with elevated privileges. The type itself has no `tenant_id` field, so the separation is structural in the domain model rather than a runtime check that can be forgotten.

**Implemented:**
- Opaque refresh tokens with rotation and reuse detection.
- JWT access tokens signed with ES256, with multiple verification keys and rotation by `kid`.
- Argon2id password hashing.
- Tenant-scoped RBAC with a global permission catalog.
- A single `/authorize` endpoint.
- Redis-based rate limiting.
- `/health` and `/ready` probes.

**Deliberately not implemented:**
- Full OIDC/OAuth2 provider flows, client registration, consent, or discovery.
- Service accounts / machine-to-machine authentication.
- Prometheus metrics or OpenTelemetry tracing.
- Redis high availability.
- Effective PostgreSQL Row Level Security policies.

That last point matters and is easy to misstate, so it gets its own section.

---

## Architecture and Main Flow

The HTTP layer is a chi router with middleware mounted per route group. Recovery and request logging are global; everything else is explicit.

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

The domain layer has zero external dependencies. Use cases depend on ports (`UserRepository`, `RoleAssignmentRepository`, `TokenIssuer`, etc.), and adapters implement them. This keeps authorization logic testable with fakes instead of a live database.

---

## Key Design Decisions

### 1. Opaque Refresh Tokens with Rotation and Reuse Detection

Access tokens are short-lived JWTs. Refresh tokens are opaque, high-entropy random values hashed with SHA-256 before storage. They are organized into families:

- Every refresh rotates the token: the old one is revoked, a new one is issued with the **same** `family_id`.
- If a **revoked** token is presented again, the entire family is revoked. That is the breach signal.
- A revoked token replayed by an attacker must surface as a breach, not as a benign expiry, so the revoked check runs **before** the expiry check.

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

The trade-off is deliberate: a legitimate client that loses its token cannot recover it, and a stolen token that gets used after the legitimate client rotated kills the whole session chain. That is the intended behavior, not a side effect.

### 2. Rotation Order: Persist First, Revoke Last

The first version of the rotation logic issued the new access token, revoked the old refresh token, then persisted the new refresh token. If persistence failed after the old token was already revoked, a transient database error would have made a legitimate client's retry look like reuse and killed the whole family.

The corrected order is:

1. Generate and persist the new refresh token.
2. Issue the new access token (in-memory signing, least likely to fail).
3. Revoke the old token last.

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

If persistence fails, the old token is still valid and the client can retry safely. The accepted trade-off is a brief window where both tokens are technically valid. The current ordering protects legitimate retries after a persistence failure, but the available evidence does not prove that it eliminates concurrent races or the use of a token that was stolen before rotation.

### 3. ES256 and Manual Key Rotation

Access tokens use ECDSA P-256 (ES256) instead of RS256: smaller signatures and equivalent security margins. This text does not claim a measured verification-speed advantage, because no benchmark in the repository supports it. Multiple keys can verify simultaneously, identified by `kid`. Exactly one key signs new tokens; retired keys only need their public key.

```go
token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
token.Header["kid"] = i.store.SigningKID()
```

Key management is file-based and manual: `{kid}_public.pem` for every key, plus `{kid}_private.pem` only for the active signing key. A misconfiguration (active `kid` not found) fails at startup, not on the first login. This is simple and auditable, but it is not a key management service and does not automate rotation.

### 4. Argon2id for Passwords, SHA-256 for Refresh Tokens

These solve different problems. Argon2id is memory-hard because it defends low-entropy secrets (human passwords) against offline brute force. A refresh token is already a 256-bit random value, so a slow KDF adds cost without security benefit. SHA-256 is the right tool for hashing high-entropy tokens before storage.

```go
const defaultMemory uint32 = 65536 // 64 MiB, OWASP recommendation
```

Hashes use the PHC string format, so cost parameters can be raised in the future without invalidating existing hashes.

### 5. Tenant Isolation: Middleware, Queries, and a Trigger — Not RLS Policies

Tenant isolation is handled by separate mechanisms with distinct responsibilities:

1. **Middleware:** validates that the tenant in the URL matches the tenant in the caller's access token. Without that binding, an admin of Tenant A could operate on Tenant B's data.
2. **Queries:** filter records by `tenant_id` in the repository layer.
3. **Trigger:** prevents assigning a role to a user of a different tenant. It is a targeted constraint on role assignment, not a general database isolation barrier.

```sql
CREATE TRIGGER trg_user_roles_same_tenant
    BEFORE INSERT OR UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION check_user_role_same_tenant();
```

The trigger raises a dedicated SQLSTATE (`AUTH1`), not the generic `P0001`, so a future trigger cannot be silently mistranslated as a cross-tenant violation.

**What is not true:** PostgreSQL Row Level Security is enabled on several tables, but there are **no policies**, **no `FORCE ROW LEVEL SECURITY`**, and **no `set_config('app.tenant_id')` binding** in the application. The connection uses a role that owns the tables and can bypass RLS. RLS is therefore a latent mechanism, not an effective isolation boundary today. The isolation that actually works is the combination of filtered queries, middleware binding, and the trigger.

### 6. RBAC with a Global Permission Catalog

Permissions are `resource:action` pairs (for example, `invoices:read`) and form a single global catalog shared across tenants. What varies per tenant is which roles hold which permissions, not the permissions themselves. Creating a permission is idempotent (get-or-create); assigning one to a role requires it to already exist, so a typo cannot pollute a shared catalog.

`/authorize` resolves access in two database queries for an existing, active user — one to load the user, one to load the deduplicated permission set — regardless of how many roles the user has. Other paths (unknown user, suspended user, malformed input) may resolve with fewer or zero queries.

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

An unknown or suspended user returns `false` with no error. Authorization is not embedded in the JWT; `/authorize` is the source of truth.

### 7. Rate Limiting: Atomic Redis, Fail-Open by Default

Login, super-admin login, and refresh are protected by a fixed-window counter implemented as an atomic Lua script:

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

The TTL is set only on the first increment, pinning the window to the first request. When Redis is unreachable, the limiter can fail open (`FailOpen: true` by default): availability over protection. Argon2id increases the cost of password-guessing attempts, but it does not replace rate limiting; fail-open therefore removes that protection layer temporarily while Redis is unavailable.

Redis is a single instance. That is a documented single point of failure for both rate limiting and any future caching, not a hidden one.

---

## Bugs the Review Process Caught

These are not marketing points. They are cases where working code with passing happy-path tests still contained real defects, found by asking for the reasoning behind each design choice.

### 1. Refresh Rotation Ordering

The first version issued the new access token, revoked the old refresh token, then persisted the new refresh token. A transient database error between revoke and persist would have made a legitimate client's retry look like reuse and killed the whole family. Fixed by persisting first and revoking last. Verified by a test that simulates persistence failure and asserts the old token remains valid.

### 2. Cross-Tenant Privilege Escalation — Two Instances

- **Bug A:** `AssignPermissionToRole` never verified that the role belonged to the tenant of the admin making the call. Unlike role-to-user assignment, there was no database-level protection. Fixed by requiring the tenant in the route and checking `role.TenantID()` before proceeding; a mismatch returns the same "not found" as a nonexistent role, leaking nothing.
- **Bug B:** `RequireTenantAdmin` checked whether the caller held an admin role somewhere, but never whether the tenant in the URL matched the tenant in the token. Since every user belongs to exactly one tenant, an admin of Tenant A passed the check for Tenant B. This affected six endpoints at once. Fixed once at the middleware level, so future endpoints inherit the protection.

Regression tests assert that cross-tenant calls are rejected before any business logic for the foreign tenant executes, verified via a spy on the use case rather than only the HTTP status code.

### 3. Generic Postgres Error Code Collision

The trigger initially raised the default `P0001`. Any future trigger anywhere in the schema would have collided with that match and been silently mistranslated. Fixed by assigning the dedicated `AUTH1` code before any other trigger existed to collide with it.

---

## How the Behavior Is Verified

- **Unit tests with fakes:** use cases are tested with in-memory repositories, including reuse detection, ordering failures, and suspended users.
- **Integration tests against real Postgres and Redis:** repositories, migrations, the trigger, and rate limiter atomicity. The rate limiter test fires 50 concurrent goroutines at a limit of 3 and asserts exactly 3 succeed.
- **Query-count verification:** a tracer asserts that `/authorize` resolves in exactly two SQL statements, guarding against N+1 regressions.
- **Contract tests:** OpenAPI contract validation.
- **CI:** golangci-lint, `go vet`, build, tests, and gitleaks secret scanning on pull requests and pushes to `main`.

Integration tests require Docker (testcontainers). That is an environment requirement, not a gap in coverage.

---

## Limitations and Honest Debt

- **No metrics or tracing.** There is no `/metrics` endpoint and no tracer instrumentation. What exists is structured logging via `slog` on every request, plus `/health` and `/ready` checking live database and Redis connectivity.
- **No service accounts.** Every caller authenticates as either a `User` or a `SuperAdmin`. A service needing to authenticate as "a service" would require a client-credentials flow that does not exist.
- **Redis is a single point of failure.** Acceptable at the current stage; Sentinel or Cluster is the next step before a production-critical path.
- **RLS is enabled but not effective.** No policies, no `FORCE ROW LEVEL SECURITY`, no tenant context binding. It is a latent mechanism, not a guarantee.
- **No latency histograms.** `/authorize` and the rate limiter are the two paths that would benefit most, and neither has one yet.
- **Cross-tenant tests are instance-based, not categorical.** The two bugs were found by reviewing every endpoint behind `RequireTenantAdmin` after finding the first one, not by a systematic test strategy designed to catch that class up front.

---

## What I Learned

1. **Fail-safe ordering is the difference between a transient error and a security incident.** Revoke-last is not an optimization; it prevents a database blip from becoming a false breach detection.
2. **Defense in depth only counts if each layer is real.** Middleware binding and a trigger do real work. RLS enabled without policies does not, and claiming it would would be dishonest.
3. **The most valuable tests assert exact behavior, not approximate success.** Exact query counts and exact concurrency outcomes catch regressions that "it passed" never would.

Go Authz is a portfolio project that solves a real problem with a defensible architecture. It is not a production system as-is, and it does not pretend to be one. The honest account of what is built, what is tested, and what is missing is the point of the project.  

---

## Sources Used

| File | Contribution |
|---|---|
| `README.md` | Overview, architecture, decisions, debt |
| `DECISIONS.md` | Scope, decisions, bugs, not implemented |
| `internal/adapter/token/token.go` | ES256, key store, kid rotation |
| `internal/adapter/hash/hash.go` | Argon2id, OWASP parameters |
| `internal/adapter/opaquetoken/opaquetoken.go` | Opaque refresh tokens, SHA-256 |
| `internal/usecase/auth/refresh.go` | Rotation, reuse detection, fail-safe order |
| `internal/adapter/http/middleware/tenant_admin.go` | Tenant URL ↔ token binding |
| `internal/adapter/redis/rate_limiter.go` | Atomic rate limiter, fail-open |
| `internal/usecase/rbac/authorize.go` | Authorization, two queries |
| `migrations/000008_user_roles.up.sql` | Cross-tenant trigger |
| `migrations/000010_user_roles_auth1.up.sql` | Dedicated AUTH1 SQLSTATE |
| `.github/workflows/ci.yml` | CI, lint, test, gitleaks |
| `test/integration/*.go` | Real integration, tracer, concurrency |
| `openapi.yaml` | HTTP contract |
