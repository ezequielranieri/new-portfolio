---
title: 'Agent Gateway'
description: 'Non-Human Identity Management platform for enterprise AI agents'
fullDescription: 'Agent Gateway manages non-human identities (service accounts, AI agents, workloads) with zero-trust, short-lived certificates, and dynamic policy-based access control.'
problem: 'Non-human identities outnumber human ones 10:1 in modern environments. Manual management of secrets, certificates, and permissions does not scale and creates operational risk.'
decisions:
  - 'SPIFFE/SPIRE for identity federation'
  - 'Short-lived X.509 certificates rotated automatically (configurable TTL)'
  - 'OPA policies for real-time authorization'
  - 'Immutable audit logging with sigstore/cosign'
  - 'Multi-tenant with Kubernetes namespace isolation'
stack: ['Go', 'SPIRE', 'OPA', 'Kubernetes', 'PostgreSQL', 'NATS']
tradeoffs:
  - 'High initial operational complexity (SPIRE setup)'
  - 'Requires mTLS across entire service mesh'
  - 'Authorization latency ~5-10ms per request'
links:
  github: 'https://github.com/ezequielranieri/agent-gateway'
featured: true
order: 2
lang: en
---