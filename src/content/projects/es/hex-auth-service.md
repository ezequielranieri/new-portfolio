---
title: 'Hex Auth Service'
description: 'Servicio de autenticación/autorización hexagonal (ports & adapters) multi-tenant'
fullDescription: 'Hex Auth Service implementa Clean/Hexagonal Architecture para auth: domain puro (entities, value objects, domain services), ports (interfaces), y adapters (HTTP, gRPC, DB, OAuth2/OIDC providers). Multi-tenant desde el diseño.'
problem: 'La mayoría de auth services acoplan domain logic con framework/web/DB. Cambiar provider OIDC o DB requiere reescribir business logic.'
decisions:
  - 'Domain layer: 0 dependencias externas, solo stdlib'
  - 'Ports: UserRepository, SessionStore, TokenService, EmailSender, OAuthProvider'
  - 'Adapters: PostgreSQL (sqlc), Redis, HTTP (Chi), gRPC, Google/GitHub/GitLab OIDC'
  - 'Multi-tenant: tenant_id en todas las entities, row-level security en PG'
  - 'Testing: domain tests sin mocks, adapter tests con testcontainers'
stack: ['Go', 'Chi', 'sqlc', 'PostgreSQL', 'Redis', 'OIDC']
tradeoffs:
  - 'Más boilerplate inicial vs frameworks opinionados (Auth0, Keycloak)'
  - 'Requiere disciplina arquitectónica del equipo'
  - 'Operational complexity: self-hosted vs managed'
links:
  github: 'https://github.com/ezequielranieri/hex-auth-service'
featured: false
order: 8
lang: es
---