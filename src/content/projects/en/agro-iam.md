---
title: 'Agro IAM'
description: 'Identity & Access Management for multi-tenant AgTech platforms with ABAC'
fullDescription: 'Agro IAM implements Attribute-Based Access Control (ABAC) for complex agricultural organizations: fields, plots, machinery, contractors, seasonal workers. Policies based on geospatial, temporal, and role attributes.'
problem: 'Traditional RBAC does not scale in AgTech: an operator may need access to "soybean plots in north zone during planting" - dynamic attributes, not static roles.'
decisions:
  - 'Cedar Policy (AWS) for expressive policy language'
  - 'Geospatial entities (GeoJSON) as resource attributes'
  - 'Time-based conditions with cron expressions'
  - 'Hierarchical delegation: owner → admin → operator → seasonal'
  - 'Immutable audit trail for compliance (SAGyP, GDPR)'
stack: ['Go', 'Cedar', 'PostgreSQL + PostGIS', 'gRPC', 'OpenTelemetry']
tradeoffs:
  - 'Cedar learning curve vs Rego/OPA'
  - 'Geospatial policy evaluation adds latency'
  - 'Requires high data quality in resource attributes'
links:
  github: 'https://github.com/ezequielranieri/agro-iam'
featured: false
order: 5
lang: en
---