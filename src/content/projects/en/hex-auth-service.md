---
title: 'Hex Auth Service'
description: 'Hexagonal (ports & adapters) authentication/authorization service, multi-tenant'
fullDescription: 'Hex Auth Service implements Clean/Hexagonal Architecture for auth: pure domain (entities, value objects, domain services), ports (interfaces), and adapters (HTTP, gRPC, DB, OAuth2/OIDC providers). Multi-tenant by design.'
problem: 'Most auth services couple domain logic with framework/web/DB. Changing OIDC provider or DB requires rewriting business logic.'
decisions:
  - 'Domain layer: 0 external dependencies, stdlib only'
  - 'Ports: UserRepository, SessionStore, TokenService, EmailSender, OAuthProvider'
  - 'Adapters: PostgreSQL (sqlc), Redis, HTTP (Chi), gRPC, Google/GitHub/GitLab OIDC'
  - 'Multi-tenant: tenant_id on all entities, row-level security in PG'
  - 'Testing: domain tests without mocks, adapter tests with testcontainers'
stack: ['Go', 'Chi', 'sqlc', 'PostgreSQL', 'Redis', 'OIDC']
tradeoffs:
  - 'More initial boilerplate vs opinionated frameworks (Auth0, Keycloak)'
  - 'Requires architectural discipline from team'
  - 'Operational complexity: self-hosted vs managed'
links:
  github: 'https://github.com/ezequielranieri/hex-auth-service'
featured: false
order: 8
lang: en
---