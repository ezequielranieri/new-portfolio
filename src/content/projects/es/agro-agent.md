---
title: 'Agro Agent'
description: 'Agente de IA para agricultura de precisión con edge computing y federated learning'
fullDescription: 'Agro Agent despliega modelos de ML en edge devices (tractores, drones, sensores IoT) con federated learning para privacidad de datos. Los modelos se entrenan localmente y solo los gradientes se agregan.'
problem: 'Conectividad rural intermitente, datos sensibles de cultivos/propiedad, y necesidad de inferencia en tiempo real en edge.'
decisions:
  - 'TensorFlow Lite / ONNX Runtime para inferencia en edge (ARM64, RISC-V)'
  - 'Federated Averaging (FedAvg) con differential privacy'
  - 'OTA updates firmados con cosign/sigstore'
  - 'Local-first architecture: funciona offline completo'
  - 'Capability-based permissions por sensor/actuador'
stack: ['Rust', 'TensorFlow Lite', 'MQTT', 'NATS', 'WebAssembly']
tradeoffs:
  - 'Model accuracy trade-off por quantization (INT8)'
  - 'Federated learning converge más lento que centralizado'
  - 'Gestión de flota de devices heterogéneos compleja'
links:
  github: 'https://github.com/ezequielranieri/agro-agent'
featured: true
order: 4
lang: es
---