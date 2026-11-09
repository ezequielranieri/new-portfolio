---
title: "Go Durable Jobs: Building a PostgreSQL-Backed Job Processor in Go"
excerpt: "A Go job processor built on PostgreSQL: idempotent enqueue, concurrent claiming with SELECT ... FOR UPDATE SKIP LOCKED, exponential retries with jitter, a logical dead-letter queue, graceful shutdown, and Prometheus metrics — with explicit limits and no overclaimed guarantees."
date: "2026-11-06T00:00:00Z"
tags: ["GO", "POSTGRESQL", "CONCURRENCY", "BACKEND", "OBSERVABILITY"]
draft: false
translationKey: "go-durable-jobs"
lang: "en"
---

Any system that fires off asynchronous work — sending an email, charging a card, generating a report, notifying a webhook — eventually runs into three uncomfortable questions: what happens if the process crashes mid-job, what happens if the same job fires twice, and what happens when a job fails. `go-durable-jobs` is my answer to those three, built with the smallest set of tools that gives a defensible guarantee: PostgreSQL as the source of truth, `SELECT ... FOR UPDATE SKIP LOCKED` for concurrent claiming, a unique constraint for idempotency, exponential backoff with jitter, a logical dead-letter queue, graceful shutdown, and Prometheus metrics.

This is an MVP, not a platform. It deliberately does not claim exactly-once or end-to-end at-least-once delivery, and it does not hide the places where a crash can still leave work stuck.

---

## 1. What this is (and what it is not)

`go-durable-jobs` is a single-process Go service with a small HTTP API and a worker pool backed by PostgreSQL. The module is `github.com/ezequielranieri/go-durable-jobs` (Go 1.25.0), with three runtime dependencies: `pgx/v5`, `prometheus/client_golang`, and `google/uuid`. There is no message broker, no Redis, no external queue library.

What it **is**:

- Jobs are persisted in PostgreSQL; pending jobs survive a process restart, but jobs left in `running` after an interruption are not recovered automatically.
- An idempotent enqueue path: the same `idempotency_key` never creates two jobs.
- Controlled retries: exponential backoff with jitter and a configurable `max_attempts` (default 5), after which the job lands in an explicit dead-letter state.
- A concurrent dequeue that claims jobs through a transactional operation with `SKIP LOCKED`, preventing concurrent workers from claiming the same row.
- Graceful shutdown that attempts to finish active jobs within a bounded wait period, without guaranteeing completion.
- Basic observability: four Prometheus metrics and structured logs.

What it **is not**:

- It is not exactly-once. The handler's side effects are the handler's responsibility; a retry can repeat them.
- It is not end-to-end at-least-once. A crash while a job is `running` can leave it stuck, because there is no reaper or lease timeout in this version.
- It is not a multi-tenant or production-hardened service.
- It is not a registry of job types: the pool runs one hardcoded `echoHandler` that logs and returns `nil`.

---

## 2. The problem

The three questions, stated concretely:

1. **Crash mid-job.** Without a durable queue, the job vanishes. Nobody notices, nobody retries it.
2. **Duplicate enqueue.** A client retries a `POST` after a network timeout and charges the same card twice.
3. **Failure handling.** A transient error becomes a permanent loss without backoff; a persistent error saturates the system without a retry limit.

A trivial implementation (goroutine + immediate retry) answers none of these correctly. The interesting part of this project is not the feature list; it is the set of small decisions that make each of those three survivable.

---

## 3. Architecture and boundaries

The code follows a ports-and-adapters shape. `internal/domain` defines the `Job` and the `JobRepository` interface. `internal/application` holds the use cases (`EnqueueJob`, `ProcessJob`) and depends only on those interfaces. `internal/infrastructure` contains the PostgreSQL repository and the worker pool. `internal/handler` is thin HTTP glue.

```
internal/domain          -> Job, JobRepository interface, NextBackoff
internal/application     -> EnqueueJob, ProcessJob, JobHandler interface
internal/infrastructure  -> postgres repository, worker pool
internal/handler         -> HTTP routes, request/response mapping
internal/telemetry       -> Prometheus metrics
```

The consequence that matters: SQL never appears in `handler` or `application`, and the domain does not import `pgx`. That boundary is what makes the dequeue logic testable with a fake repository and the repository testable against real PostgreSQL.

---

## 4. Enqueuing idempotently

Idempotency is enforced by the database, not by an application-level check-then-insert. A `SELECT` followed by an `INSERT` is racy: two concurrent requests can both pass the check and both insert. Only the constraint is atomic.

Migration (`migrations/0001_create_jobs_table.up.sql`):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs(idempotency_key);
```

The repository maps the PostgreSQL unique-violation error to a domain error (`internal/infrastructure/postgres/postgres_job_repository.go`, `mapPgError`):

```go
var pgErr *pgconn.PgError
if errors.As(err, &pgErr) && pgErr.Code == "23505" &&
    pgErr.ConstraintName == "idx_jobs_idempotency_key" {
    return domain.ErrDuplicateIdempotencyKey
}
```

The use case then resolves the conflict by reading the existing job (`internal/application/enqueue_job.go`):

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

HTTP semantics follow Stripe's convention: `201 Created` on first creation, `200 OK` on replay with the same job body (`internal/handler/enqueue.go`). The client gets one success code to handle. `jobs_enqueued_total` is incremented only on a genuinely new job, so comparing it against processed counts exposes "lost" jobs at a glance.

Validation is explicit and cheap: empty `type`, empty `idempotency_key`, nil `payload`, and negative `max_attempts` return `400 Bad Request` (`enqueue_job.go`, lines 45–57). `max_attempts == 0` becomes the default 5.

---

## 5. Claiming work concurrently

The core mechanism is a transactional claim (`internal/infrastructure/postgres/postgres_job_repository.go`, `Dequeue`):

```sql
SELECT id, idempotency_key, type, payload, status, priority, attempts, max_attempts,
       available_at, started_at, completed_at, last_error, created_at, updated_at
FROM jobs
WHERE status = 'pending' AND available_at <= NOW()
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

followed by:

```sql
UPDATE jobs SET status = 'running', started_at = NOW(), updated_at = NOW()
WHERE id = $1
RETURNING started_at, updated_at
```

Both run inside the same transaction, which commits before the job is returned. Two properties matter:

- `FOR UPDATE SKIP LOCKED` means a worker that finds a locked row skips it instead of waiting. Workers never block each other on the same row; the queue stays correct under contention.
- `available_at <= NOW()` is explicit in the `WHERE`, not just in the partial index. Delayed jobs (`delay_seconds`) set `available_at = NOW() + delay` at enqueue time and are invisible until their time arrives.

The partial index `idx_jobs_status_available ON jobs(status, available_at, priority DESC) WHERE status = 'pending'` helps filter pending jobs and `available_at`, but ordering by `priority DESC, created_at ASC` may require an additional sort; the execution plan was not verified with `EXPLAIN`.

Dequeue order is `priority DESC, created_at ASC`: higher priority first, ties broken by arrival. `priority` is a first-class field on `POST /jobs` (default 0).

---

## 6. Retries, backoff, jitter, and the dead letter

Backoff lives in the domain (`internal/domain/job.go`):

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

On a handler error or panic, `ProcessJob.Execute` computes `NextBackoff(job.Attempts+1, baseDelay)` and calls `MarkFailed` with that `nextAvailableAt` (`internal/application/process_job.go`, lines 48–64). The worker reads `job.Attempts` at dequeue time, so the value reflects the state at claim time rather than a re-read that could race with another worker.

`MarkFailed` (`postgres_job_repository.go`, lines 158–176) does the state transition in one statement:

```sql
UPDATE jobs SET
    attempts = attempts + 1,
    last_error = $2,
    status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'pending' END,
    available_at = CASE WHEN attempts + 1 >= max_attempts THEN available_at ELSE $3 END,
    updated_at = NOW()
WHERE id = $1 AND status = 'running'
```

When `attempts + 1 >= max_attempts`, the job becomes `dead` and `available_at` is left untouched (it is no longer runnable). Otherwise it returns to `pending` with the backoff timestamp.

The dead letter is not a separate table or queue. It is the same `jobs` table with `status = 'dead'`, which keeps one source of truth and one migration. Requeue is a manual, explicit operation: `POST /jobs/{id}/requeue` resets `status='pending'`, `attempts=0`, `last_error=NULL`, `available_at=NOW()` and returns `409 Conflict` if the job is not `dead` (`postgres_job_repository.go`, `Requeue`; `handler/requeue.go`).

A panic in the handler is treated as a retryable failure: `ProcessJob.Execute` recovers it, records the panic in `last_error`, and applies the normal backoff or moves to `dead` when attempts are exhausted. A panicking handler never kills the worker or the pool.

---

## 7. Worker pool lifecycle

`internal/infrastructure/worker/pool.go` implements a small pool. `Start` creates a cancellable context and launches `numWorkers` goroutines. Each worker loops:

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

Two details worth noting:

- Polling with a 500 ms default interval (`POLL_INTERVAL`) does not drop pending jobs and is simpler than `LISTEN/NOTIFY`, which has no delivery guarantee for late subscribers.
- The job runs on `context.Background()`, not on the worker's cancelled context. Shutdown cancels polling, but the job in flight keeps running. That is what makes "never cut a job off mid-way" hold at the goroutine level.

---

## 8. Graceful shutdown and drain

`cmd/server/main.go` sequences shutdown in two steps:

1. `srv.Shutdown` stops accepting new HTTP requests.
2. `wp.Shutdown` cancels the polling context and waits for workers up to `GRACE_PERIOD` (default 30 s).

```go
shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.GracePeriod+5*time.Second)
// 1. HTTP first
if err := srv.Shutdown(shutdownCtx); err != nil { ... }
// 2. Workers after
switch err := wp.Shutdown(shutdownCtx); {
case err == nil:
    slog.Info("shutdown complete")
case errors.Is(err, worker.ErrGracePeriodExpired):
    // sleep 3s, then exit 2
}
```

If the grace period expires, the process sleeps 3 seconds and exits with code 2, which can still cut a long-running job. Shutdown is a bounded wait, not a guarantee that every job finishes.

---

## 9. Observability

Metrics are exposed at `GET /metrics` in Prometheus format (`internal/telemetry/metrics.go`). The registry is private, so only application metrics are exposed.

| Metric | Type | Meaning |
|---|---|---|
| `jobs_enqueued_total` | Counter | New jobs only; idempotent replays do not count |
| `jobs_processed_total{result}` | Counter | Attempts by outcome: `completed` or `failed` |
| `jobs_in_flight` | Gauge | Jobs currently being processed |
| `job_processing_duration_seconds` | Histogram | Handler + `MarkCompleted`/`MarkFailed`, buckets up to 300 s |

The `failed` label is deliberately broad: it includes both business-logic failures in the handler and later persistence failures (`MarkCompleted`/`MarkFailed` failing). A dashboard reading `jobs_processed_total` must not assume `failed` means a business bug.

`ProcessJob.Execute` updates these metrics in a deferred block keyed on the returned `err` (`process_job.go`, lines 33–43), so a panic or a `MarkCompleted` failure still counts as `failed` and decrements in-flight exactly once.

Logs use `slog` to stdout with no external logging framework.

---

## 10. What the system does not guarantee

This section is the most important one for an honest article.

- **No exactly-once.** The handler's effects are not deduplicated. A retry can charge a card twice if the handler is not idempotent.
- **No end-to-end at-least-once.** A crash while a job is `running` leaves it in `running` with no automatic requeue, because there is no reaper, lease, or timeout in this version. Jobs that are still `pending` do survive.
- **No automatic recovery of abandoned jobs.** `running` jobs are never reaped. This is a known gap, not an implicit feature.
- **No cancellation of in-flight work on shutdown.** The job runs on `context.Background()`. A slow job can outlive the grace period.
- **No delivery ordering guarantees beyond dequeue order.** `priority DESC, created_at ASC` applies at claim time.
- **No authentication or authorization** on the HTTP API.

---

## 11. Verification

Commands run during this audit:

```bash
go test ./...
go test -race ./internal/application/ ./internal/domain/ ./internal/handler/ \
  ./internal/infrastructure/worker/ ./internal/telemetry/
go build ./...
go vet ./...
TEST_DATABASE_URL="postgres://jobs:jobs@127.0.0.1:5434/jobs_test?sslmode=disable" \
  go test -tags integration -race ./internal/infrastructure/postgres/
```

Test files exist covering application (20), domain (4), handler (19), worker (5), telemetry (1), and integration (HappyPath, FindByID, Requeue). The author reports having run them successfully locally — unit tests, integration tests under `-race`, `go build`, and `go vet`. These results were not re-verified during this audit, and the repository has no CI (no `.github/` directory) to run them automatically.

Integration tests require a reachable PostgreSQL with `TEST_DATABASE_URL` → `DATABASE_URL` → default `jobs_test` on port 5433, and truncate the `jobs` table at the start of each test. Without a database they skip with `t.Skip`.

Benchmarks, run as:

```bash
TEST_DATABASE_URL="postgres://jobs:jobs@127.0.0.1:5434/jobs_test?sslmode=disable" \
  go test -tags integration -bench='BenchmarkCreate|BenchmarkDequeue|BenchmarkConcurrentDequeue' \
  -run='^$' -benchmem -benchtime=1000x -count=3 \
  ./internal/infrastructure/postgres/
```

Environment: Ryzen 3 PRO 2200G, PostgreSQL 17 native (no Docker), Linux. Numbers are indicative of this environment, not a universal ceiling.

| Benchmark | jobs/s (3 runs) | allocs/op |
|---|---|---|
| `BenchmarkCreate` | 5,552 / 6,204 / 8,244 | 38 |
| `BenchmarkDequeue` | 915 / 1,013 / 1,260 | 92 |
| `BenchmarkConcurrentDequeue` (1 worker) | 1,454 / 1,513 / 1,553 | 67 |
| `BenchmarkConcurrentDequeue` (2 workers) | 2,541 / 2,680 / 2,750 | 67 |
| `BenchmarkConcurrentDequeue` (4 workers) | 1,919 / 2,400 / 3,404 | 67 |
| `BenchmarkConcurrentDequeue` (8 workers) | 1,844 / 2,213 / 2,729 | 70 |

Note: the three values for each benchmark are the three runs, sorted in ascending order; they are not in execution order.

In this environment, the highest median throughput was observed with two workers; results with four and eight workers were variable. No claim is made about other environments.

A note on percentiles: the benchmark computes them in `reportPercentiles` (`postgres_job_repository_bench_test.go`, lines 73–81) by sorting the per-run durations and reading indices `int(len*0.50)` and `int(len*0.99)` without interpolation. With 1,000 samples that selects ranks 500 and 990, which is not a standard percentile estimator. I therefore do not present p50/p99 as percentiles in this article; throughput and allocations are the defensible numbers. The README's earlier p50/p99 figures come from a different environment (Windows, Docker) and a run that used the same rank selection.

---

## 12. Limitations and roadmap

Known gaps, stated as scope rather than apologies:

- **No reaper for abandoned `running` jobs.** Mitigation: a lease with `started_at + timeout` and automatic requeue.
- **No handler registry.** `echoHandler` always returns `nil`. Mitigation: a `map[string]JobHandler` keyed by `type`.
- **No authentication or authorization** on the HTTP API.
- **No circuit breaker.** Deliberately deferred: MVP jobs do not call external services. If a job type that does is added, the breaker belongs in that handler, not in the queue machinery.
- **No distributed tracing.** Deferred to a multi-service phase.
- **No inspection/requeue CLI.** Only `POST /jobs/{id}/requeue` exists; there is no way to list all `dead` jobs in one pass.
- **No CI.** Tests and benchmarks are run manually.
- **Documentation drift.** `DECISIONS.md` names `testcontainers` and `golang-migrate`, but `go.mod` includes neither; integration uses Docker Compose plus `scripts/setup_test_db.sh`, and the migration is applied with `psql`. The SQL migration carries `IF NOT EXISTS` specifically to make that script re-runnable, which is a local convenience, not a norm.
- **Other minor items:** `Dockerfile` builds with Go 1.22 while the module declares 1.25; `gofmt -l` reports 4 files; invalid config values are silently ignored; negative `delay_seconds` is accepted; no health endpoint; the metrics registry is private, so Go runtime metrics are not exposed.

Roadmap: lease/reaper, handler registry, auth, inspection CLI, CI, and only then Redis or a broker if enqueue throughput demands it.

---

## 13. How this complements Go Authz and Aegis

These three projects are separate pieces of the same portfolio, not an integrated system.

- **Go Authz** answers "who is this and what can they do": multi-tenant identity, refresh-token rotation with reuse detection, tenant isolation, authorization. A durable job processor is a plausible downstream consumer of its decisions — enqueuing a "send welcome email" job after an authorized signup, for example — but there is no shared code or runtime dependency between them.
- **Aegis** answers "how do we run untrusted code safely": capability-based WASM sandboxing, signed receipts, two-phase execution, mTLS. It could in principle be the executor behind a job type, but it is not wired to this processor.

The useful framing is division of concerns: durable jobs handle *when and whether* work runs; Go Authz handles *who* is allowed to request it; Aegis handles *how safely* untrusted code executes. Mentioning them together shows breadth without pretending they form one system.

---

## 14. Closing

The lesson I would keep from this project is not the feature list. It is that the defensible parts are small and specific: a unique constraint instead of a check, `SKIP LOCKED` instead of a mutex, a `dead` state instead of a deletion, a bounded drain instead of a promise. Each of those is a decision with a cost, and the honest article is the one that names the costs — including the jobs that can still get stuck.

---

*Source: `github.com/ezequielranieri/go-durable-jobs`, commit `171ed46`. Audit performed without modifying the repository.*
path: /home/ez/ai-workspace/new-portfolio/src/content/blog/en/go-durable-jobs.md