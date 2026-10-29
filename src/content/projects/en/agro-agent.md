---
title: 'Agro Agent'
description: 'AI agent for precision agriculture with edge computing and federated learning'
fullDescription: 'Agro Agent deploys ML models on edge devices (tractors, drones, IoT sensors) with federated learning for data privacy. Models train locally and only gradients are aggregated.'
problem: 'Intermittent rural connectivity, sensitive crop/property data, and need for real-time inference on edge.'
decisions:
  - 'TensorFlow Lite / ONNX Runtime for edge inference (ARM64, RISC-V)'
  - 'Federated Averaging (FedAvg) with differential privacy'
  - 'Signed OTA updates with cosign/sigstore'
  - 'Local-first architecture: works fully offline'
  - 'Capability-based permissions per sensor/actuator'
stack: ['Rust', 'TensorFlow Lite', 'MQTT', 'NATS', 'WebAssembly']
tradeoffs:
  - 'Model accuracy trade-off from quantization (INT8)'
  - 'Federated learning converges slower than centralized'
  - 'Heterogeneous device fleet management complexity'
links:
  github: 'https://github.com/ezequielranieri/agro-agent'
featured: true
order: 4
lang: en
---