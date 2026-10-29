---
title: 'Go Authz'
description: 'Biblioteca de autorización de alto rendimiento para Go con Cedar y OPA support'
fullDescription: 'Go Authz proporciona una API unificada para autorización en aplicaciones Go, soportando tanto Cedar (AWS) como OPA/Rego como policy engines. Incluye caching inteligente, hot-reload de políticas, y middleware para frameworks web principales.'
problem: 'Los desarrolladores Go necesitan cambiar entre policy engines sin reescribir lógica de negocio. La integración directa con OPA/Cedar tiene boilerplate excesivo.'
decisions:
  - 'Interface unificada: Authorizer interface con evaluación sync/async'
  - 'Policy cache con TTL y invalidación por eventos (fsnotify + webhook)'
  - 'Middleware para Chi, Gin, Echo, Stdlib'
  - 'Context propagation para subject/resource attributes'
  - 'Benchmarks integrados en CI para regression detection'
stack: ['Go', 'Cedar', 'OPA', 'Cel-Redis para distributed cache']
tradeoffs:
  - 'Abstracción añade ~50-100ns overhead por request'
  - 'Feature parity completa entre Cedar y OPA no garantizada'
  - 'Cache coherency en distributed deployments requiere tuning'
links:
  github: 'https://github.com/ezequielranieri/go-authz'
featured: false
order: 6
lang: es
---