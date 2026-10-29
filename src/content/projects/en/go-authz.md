---
title: 'Go Authz'
description: 'High-performance authorization library for Go with Cedar and OPA support'
fullDescription: 'Go Authz provides a unified API for authorization in Go applications, supporting both Cedar (AWS) and OPA/Rego as policy engines. Includes intelligent caching, hot-reload of policies, and middleware for major web frameworks.'
problem: 'Go developers need to switch between policy engines without rewriting business logic. Direct integration with OPA/Cedar has excessive boilerplate.'
decisions:
  - 'Unified interface: Authorizer interface with sync/async evaluation'
  - 'Policy cache with TTL and event-based invalidation (fsnotify + webhook)'
  - 'Middleware for Chi, Gin, Echo, Stdlib'
  - 'Context propagation for subject/resource attributes'
  - 'Integrated benchmarks in CI for regression detection'
stack: ['Go', 'Cedar', 'OPA', 'Cel-Redis for distributed cache']
tradeoffs:
  - 'Abstraction adds ~50-100ns overhead per request'
  - 'Full feature parity between Cedar and OPA not guaranteed'
  - 'Cache coherency in distributed deployments requires tuning'
links:
  github: 'https://github.com/ezequielranieri/go-authz'
featured: false
order: 6
lang: en
---