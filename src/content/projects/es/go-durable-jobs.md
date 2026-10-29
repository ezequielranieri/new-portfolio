---
title: 'Go Durable Jobs'
description: 'Job queue duradera con exactly-once semantics, retries exponenciales, y cron scheduling'
fullDescription: 'Go Durable Jobs es una job queue built on PostgreSQL con exactly-once delivery, exponential backoff con jitter, cron scheduling, dead letter handling, y observability nativa. Diseñada para reliability sobre throughput.'
problem: 'Las job queues existentes (Redis-based) pierden jobs en crashes, no garantizan exactly-once, o requieren infraestructura adicional compleja (Kafka).'
decisions:
  - 'PostgreSQL como backend único (SKIP LOCKED para polling eficiente)'
  - 'Advisory locks para leader election de scheduler'
  - 'Exactly-once via idempotency keys + transactional outbox pattern'
  - 'Retries: exponential backoff (base 2s, max 1h) + jitter ±25%'
  - 'Cron syntax estándar con timezone support (IANA)'
  - 'OpenTelemetry metrics + structured logging (slog)'
stack: ['Go', 'PostgreSQL', 'OpenTelemetry', 'slog']
tradeoffs:
  - 'Throughput menor que Redis/Kafka (~10k jobs/s vs 100k+)'
  - 'Requiere PostgreSQL 14+ para features usadas'
  - 'No multi-region active-active nativo (single writer)'
links:
  github: 'https://github.com/ezequielranieri/go-durable-jobs'
featured: false
order: 7
lang: es
---