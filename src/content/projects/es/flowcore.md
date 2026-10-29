---
title: 'Flowcore'
description: 'Event-driven platform core: event sourcing, CQRS, projections, saga orchestration'
fullDescription: 'Flowcore proporciona los building blocks para arquitecturas event-driven: event store (append-only), command handling, projection engine, saga orchestrator, y outbox pattern. Framework-agnostic, cloud-native.'
problem: 'Implementar event sourcing/CQRS correctamente requiere reinventar: idempotency, ordering, snapshotting, projection rebuilds, saga compensation.'
decisions:
  - 'Event store: PostgreSQL (eventstore DB) o EventStoreDB como backend swappable'
  - 'Optimistic concurrency control con expected version'
  - 'Projections: sync (transactional) y async (catch-up subscriptions)'
  - 'Sagas: state machine DSL con compensation actions automáticas'
  - 'Outbox pattern integrado para reliable publishing'
  - 'Schema evolution: JSON Schema + registry (Confluent compatible)'
stack: ['Go', 'PostgreSQL', 'NATS JetStream', 'JSON Schema', 'OpenTelemetry']
tradeoffs:
  - 'Eventual consistency por defecto: mental model shift requerido'
  - 'Schema evolution discipline estricta (breaking changes = new event type)'
  - 'Debugging: distributed tracing obligatorio'
links:
  github: 'https://github.com/ezequielranieri/flowcore'
featured: false
order: 9
lang: es
---