---
title: 'Aegis'
description: 'Secure AI Agent Framework with capability-based security and formal verification'
fullDescription: 'Aegis is a framework for building secure-by-design AI agents. Implements capability-based security, execution sandboxing, and formal verification of security policies before deployment.'
problem: 'Current AI agents operate with excessive privileges and no real isolation. A compromised agent can access the entire infrastructure.'
decisions:
  - 'Capability-based security model instead of traditional ACLs'
  - 'WASM sandbox for untrusted code execution'
  - 'Security policies expressed in Rego (OPA) with static verification'
  - 'Remote attestation for supply chain integrity'
stack: ['Rust', 'WebAssembly', 'OPA/Rego', 'gRPC', 'NATS']
tradeoffs:
  - 'Higher cold-start latency due to policy verification'
  - 'Learning curve for developers used to broad permissions'
  - 'Requires WASM-compatible runtime (wasmtime/wasmer)'
links:
  github: 'https://github.com/ezequielranieri/aegis'
featured: true
order: 1
lang: en
---