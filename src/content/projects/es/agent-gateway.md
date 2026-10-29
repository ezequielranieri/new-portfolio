---
title: 'Agent Gateway'
description: 'Plataforma de Non-Human Identity Management para agentes de IA enterprise'
fullDescription: 'Agent Gateway gestiona identidades no-humanas (service accounts, AI agents, workloads) con zero-trust, short-lived certificates, y policy-based access control dinámico.'
problem: 'Las identidades no-humanas superan a las humanas 10:1 en entornos modernos. La gestión manual de secrets, certificados y permisos no escala y crea riesgo operativo.'
decisions:
  - 'SPIFFE/SPIRE para identity federation'
  - 'Short-lived X.509 certificates rotados automáticamente (TTL configurable)'
  - 'OPA policies para authorization en tiempo real'
  - 'Audit logging inmutable con sigstore/cosign'
  - 'Multi-tenant con aislamiento de namespaces Kubernetes'
stack: ['Go', 'SPIRE', 'OPA', 'Kubernetes', 'PostgreSQL', 'NATS']
tradeoffs:
  - 'Complejidad operacional inicial alta (SPIRE setup)'
  - 'Requiere mTLS en toda la malla de servicios'
  - 'Latencia de autorización ~5-10ms por request'
links:
  github: 'https://github.com/ezequielranieri/agent-gateway'
featured: true
order: 2
lang: es
---