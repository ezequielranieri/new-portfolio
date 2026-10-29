---
title: 'Go Durable Jobs'
description: 'Durable job queue with exactly-once semantics, exponential retries, and cron scheduling'
fullDescription: 'Go Durable Jobs is a job queue built on PostgreSQL with exactly-once delivery, exponential backoff with jitter, cron scheduling, dead letter handling, and native observability. Designed for reliability over throughput.'
problem: 'Existing job queues (Redis-based) lose jobs on crashes, do not guarantee exactly-once, or require complex additional infrastructure (Kafka).'
decisions:
  - 'PostgreSQL as single backend (SKIP LOCKED for efficient polling)'
  - 'Advisory locks for scheduler leader election'
  - 'Exactly-once via idempotency keys + transactional outbox pattern'
  - 'Retries: exponential backoff (base 2s, max 1h) + jitter ±25%'
  - 'Standard cron syntax with timezone support (IANA)'
  - 'OpenTelemetry metrics + structured logging (slog)'
stack: ['Go', 'PostgreSQL', 'OpenTelemetry', 'slog']
tradeoffs:
  - 'Lower throughput than Redis/Kafka (~10k jobs/s vs 100k+)'
  - 'Requires PostgreSQL 14+ for features used'
  - 'No native multi-region active-active (single writer)'
links:
  github: 'https://github.com/ezequielranieri/go-durable-jobs'
featured: false
order: 7
lang: en
---