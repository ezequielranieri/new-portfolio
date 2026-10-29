---
title: 'Mettle'
description: 'Toolkit para sistemas distribuidos resilientes: consensus, lease management, leader election'
fullDescription: 'Mettle proporciona primitivas de consenso (Raft), lease management, leader election, y distributed locking listas para producción. Diseñado para multi-region con failure domain awareness.'
problem: 'Construir sistemas distribuidos correctos es extremadamente difícil. Las librerías existentes o son demasiado bajas (etcd/raft raw) o demasiado opinionadas.'
decisions:
  - 'Raft implementation propia optimizada para latencia cruzada (multi-region)'
  - 'Lease-based leadership con preemption configurable'
  - 'Watch API para reactivity sin polling'
  - 'Metrics y tracing nativos (OpenTelemetry)'
  - 'Chaos testing integrado (failpoints)'
stack: ['Go', 'etcd-io/raft', 'OpenTelemetry', 'Prometheus']
tradeoffs:
  - 'Solo Go (no multi-language como etcd gRPC)'
  - 'Menos battle-tested que etcd/Consul en producción masiva'
  - 'Requiere quorum de 3+ nodos para HA real'
links:
  github: 'https://github.com/ezequielranieri/mettle'
featured: true
order: 3
lang: es
---