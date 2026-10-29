---
title: 'Agro IAM'
description: 'Identity & Access Management para plataformas AgTech multi-tenant con ABAC'
fullDescription: 'Agro IAM implementa Attribute-Based Access Control (ABAC) para organizaciones agrícolas complejas: campos, lotes, maquinaria, contratistas, temporales. Políticas basadas en atributos geoespaciales, temporales y de rol.'
problem: 'RBAC tradicional no escala en AgTech: un operador puede tener acceso a "lotes de soja en zona norte durante siembra" - atributos dinámicos, no roles estáticos.'
decisions:
  - 'Cedar Policy (AWS) para policy language expresivo'
  - 'Entidades geoespaciales (GeoJSON) como atributos de recurso'
  - 'Time-based conditions con cron expressions'
  - 'Delegación jerárquica: owner → admin → operador → temporal'
  - 'Audit trail inmutable para compliance (SAGyP, GDPR)'
stack: ['Go', 'Cedar', 'PostgreSQL + PostGIS', 'gRPC', 'OpenTelemetry']
tradeoffs:
  - 'Cedar learning curve vs Rego/OPA'
  - 'Evaluación de políticas geoespaciales añade latencia'
  - 'Requiere data quality alta en atributos de recursos'
links:
  github: 'https://github.com/ezequielranieri/agro-iam'
featured: false
order: 5
lang: es
---