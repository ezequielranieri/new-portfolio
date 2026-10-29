---
title: 'Mettle'
description: 'Resilient distributed systems toolkit: consensus, lease management, leader election'
fullDescription: 'Mettle provides production-ready consensus primitives (Raft), lease management, leader election, and distributed locking. Designed for multi-region with failure domain awareness.'
problem: 'Building correct distributed systems is extremely hard. Existing libraries are either too low-level (etcd/raft raw) or too opinionated.'
decisions:
  - 'Custom Raft implementation optimized for cross-region latency (multi-region)'
  - 'Lease-based leadership with configurable preemption'
  - 'Watch API for reactivity without polling'
  - 'Native metrics and tracing (OpenTelemetry)'
  - 'Integrated chaos testing (failpoints)'
stack: ['Go', 'etcd-io/raft', 'OpenTelemetry', 'Prometheus']
tradeoffs:
  - 'Go only (not multi-language like etcd gRPC)'
  - 'Less battle-tested than etcd/Consul at massive scale'
  - 'Requires 3+ node quorum for real HA'
links:
  github: 'https://github.com/ezequielranieri/mettle'
featured: true
order: 3
lang: en
---