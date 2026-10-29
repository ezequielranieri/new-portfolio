---
title: 'Aegis'
description: 'Secure AI Agent Framework con capability-based security y verificación formal'
fullDescription: 'Aegis es un framework para construir agentes de IA seguros por diseño. Implementa capability-based security, sandboxing de ejecuciones, y verificación formal de políticas de seguridad antes del deployment.'
problem: 'Los agentes de IA actuales operan con privilegios excesivos y sin aislamiento real. Un agente comprometido puede acceder a toda la infraestructura.'
decisions:
  - 'Capability-based security model en lugar de ACLs tradicionales'
  - 'WASM sandbox para ejecución de código no confiable'
  - 'Políticas de seguridad expresadas en Rego (OPA) con verificación estática'
  - 'Attestation remota para supply chain integrity'
stack: ['Rust', 'WebAssembly', 'OPA/Rego', 'gRPC', 'NATS']
tradeoffs:
  - 'Mayor latencia de cold-start por verificación de políticas'
  - 'Curva de aprendizaje para desarrolladores acostumbrados a permisos amplios'
  - 'Requiere runtime WASM compatible (wasmtime/wasmer)'
links:
  github: 'https://github.com/ezequielranieri/aegis'
featured: true
order: 1
lang: es
---