---
title: 'Flowcore'
description: 'Event-driven platform core: event sourcing, CQRS, projections, saga orchestration'
fullDescription: 'Flowcore provides building blocks for event-driven architectures: event store (append-only), command handling, projection engine, saga orchestrator, and outbox pattern. Framework-agnostic, cloud-native.'
problem: 'Implementing event sourcing/CQRS correctly requires reinventing: idempotency, ordering, snapshotting, projection rebuilds, saga compensation.'
decisions:
  - 'Event store: PostgreSQL (eventstore DB) or EventStoreDB as swappable backend'
  - 'Optimistic concurrency control with expected version'
  - 'Projections: sync (transactional) and async (catch-up subscriptions)'
  - 'Sagas: state machine DSL with automatic compensation actions'
  - 'Integrated outbox pattern for reliable publishing'
  - 'Schema evolution: JSON Schema + registry (Confluent compatible)'
stack: ['Go', 'PostgreSQL', 'NATS JetStream', 'JSON Schema', 'OpenTelemetry']
tradeoffs:
  - 'Eventual consistency by default: mental model shift required'
  - 'Strict schema evolution discipline (breaking changes = new event type)'
  - 'Debugging: distributed tracing mandatory'
links:
  github: 'https://github.com/ezequielranieri/flowcore'
featured: false
order: 9
lang: en
---