---
title: "Aegis: ejecución WASM segura con receipts firmados y capability-based sandboxing"
excerpt: "Un runtime Rust que aplica un modelo de seguridad fail-closed a la ejecución WASM: capability-based host functions en lugar de WASI, receipts firmados y hash-chained (Ed25519 + BLAKE3), ejecución en dos fases (prepare/commit/abort) y límites duros de recursos, todo expuesto vía gRPC con mTLS mutuo."
date: "2026-10-24T00:00:00Z"
tags: ["AI SECURITY", "WEBASSEMBLY", "RUST", "SANDBOXING", "GRPC"]
draft: false
lang: "es"
translationKey: "aegis"
---

Ejecutar WebAssembly no confiable solo es seguro cuando cada acceso a recursos está gateado y cada side effect es comprobable. Construí **aegis** como un runtime Rust que aplica un modelo de seguridad fail-closed a la ejecución WASM: capability-based host functions en lugar de WASI, receipts firmados y hash-chained (Ed25519 + BLAKE3) que prueban qué ejecutó, con qué resultado y a qué costo, ejecución en dos fases (prepare/commit/abort) para que intención y resultado sean ambos comprobables, y límites duros de recursos (memoria 1 MiB, fuel metering, epoch interruption) — todo expuesto vía gRPC con mTLS mutuo.

---

## El problema

Cuando corres WASM no confiable en producción, la superficie de ataque tiene tres dimensiones que la mayoría de runtimes ignoran:

1. **WASI es demasiado permisivo**: el modelo fd-based de WASI da acceso amplio al sistema (fd_read, fd_write, path_open) que no se puede scopear fácilmente a una sola capability como `filesystem.read` con un `allowed_root`. Sin capability-based security, un módulo malicioso o buggy puede escapar del sandbox.
2. **No hay prueba criptográfica de ejecución**: "el módulo lo hizo" no es un audit trail. Necesitas receipts firmados que prueben qué capability se invocó, con qué parámetros, qué resultado produjo y cuánto CPU consumió — verificables offline sin acceso al runtime.
3. **Side effects irreversibles sin auditoría atómica**: una escritura atómica (temp + rename) que falla después del rename pero antes de emitir el receipt deja el host filesystem modificado sin evidencia en la cadena. El mismo problema aparece en network calls observados remotamente. Necesitas un modelo que reconozca esta asimetría y la documente honesta.

---

## Qué construí

**aegis** es un runtime Rust para **ejecución segura de WebAssembly** con capability-based security, receipts de ejecución firmados y hash-chained, y un servidor gRPC con mTLS mutuo. Dos binarios:

| Binario | Propósito |
|---|---|
| `aegis-runtime` | Servidor gRPC (mTLS, receipts, sandbox) |
| `aegis-verify` | Verificador offline de cadena de receipts |

El runtime es declarativo: un TOML configura server, TLS identity, signing key, policy defaults y execution knobs (`max_concurrent`, `fuel_budget`). Access control es **deny by default** — un guest solo obtiene las capabilities explícitamente grantadas en su request config.

**Capacidades implementadas** (4 nombres, 3 ejecutables):
- `filesystem.read` — lectura dentro de `allowed_root`, max bytes, traversal rejection
- `filesystem.write` — escritura atómica (temp + rename) dentro de `allowed_root`, max bytes, symlink `..` rejection
- `network.http` — HTTPS fetch contra host allowlist, method allowlist, token bucket per-execution, 1 MiB response cap
- `two_phase_receipts` — marker que habilita RPCs de dos fases (Prepare/Commit/Abort), no ejecutable

---

## Decisiones de diseño clave (las 5 que definen el sistema)

### 1. Fail-Closed Sandbox: trap_on_grow_failure + Epoch Interruption (AD-001, AD-002, AD-003)
**Regla**: Todo resource exhaustion = Wasmtime `Trap`, nunca graceful error. `StoreLimitsBuilder::trap_on_grow_failure(true)` (non-spec pero fail-closed). Engine con `epoch_interruption(true)` + timer thread dedicado que llama `engine.increment_epoch()` cada intervalo configurable (default 100ms). Timer thread usa `mpsc::channel` para relay del `Thread` handle correcto (AD-003: `std::thread::current()` dentro del spawn devuelve el thread spawneado, no el caller).
**Alternativas descartadas**: fuel metering en Phase 0 (overhead per-instruction sin fortalecer security boundary; epoch es suficiente para isolation proof); `AtomicBool` simple para thread handle (deadlock en Drop).
**Coste**: Epoch-only es impreciso para tight loops sin calls (Wasm solo checkea epoch en call/loop boundaries). Mitigación: Phase 1 host functions proveen epoch check points naturales. Fuel metering añadido en Phase 8 para reporting, no como security limit.

### 2. Capability-Based Host Functions vs WASI (AD-010)
**Regla**: Host functions custom (`aegis_fs_read`, `aegis_fs_write`, `aegis_http_fetch`) vía `Linker::func_wrap` en lugar de WASI. Cada capability registra su closure capturando `allowed_root` y `max_bytes` en link time.
**Por qué**: Fine-grained capability control (WASI da broad access que no se scopea a single capability); security boundary clarity (cada host function nombrada explícitamente y validada contra capability config); path validation integration (traversal checks, canonicalize + starts_with root check, symlink resolution embedidos en el closure); receipt emission en cada validation point (path OOB, traversal, size exceed, success); future extensibility (`network.http`, `crypto.sign` sin WASI version constraints).
**Tradeoffs**: No estandarizado — guest modules deben importar namespace `aegis`; WASI modules fallan en linking (S-4); más implementation effort per capability.

### 3. Signed Hash-Chained Receipts con Two-Phase Execution (AD-005, AD-009, AD-016)
**Regla**: Cada execution produce receipt Ed25519-firmado (BLAKE3-hashed y chained) que prueba qué ejecutó, con qué resultado, a qué costo. Genesis: `prev_hash = [0u8; 32]`. Cada receipt: `prev_hash` = `blake3(prev_hash || canonical_bytes)`. Canonical bytes = serde_json struct field order (fixed, no HashMap). `verify_chain` valida: signatures, hash chain integrity, two-phase state machine (legacy/prepare/commit/abort), timestamps ±5s.
**Two-phase**: `ExecutePrepare` → sandbox creado + signed `prepare` receipt (`phase="prepare"`, `result="pending"`, `pending_hash = blake3(prev_hash || prepare_canonical_without_pending_hash)`) → `prepare_hash` returned. `ExecuteCommit` → WASM ejecuta en prepared sandbox → result/fuel capturados → `commit` receipt signed con `phase="commit"`, `pending_hash` copiado de prepare. `ExecuteAbort` → `abort` receipt con `error="aborted"`.
**Gap crítico (AD-005, AD-016)**: Si `rename()` succeeds en `aegis_fs_write` pero `emit()` falla después, el archivo YA está escrito en host filesystem y no se puede "un-write". Igual en `ExecuteCommit`: WASM ejecuta (side effects reales) pero commit signing falla. Mitigación: `prepare` receipt existe en cadena (prueba intención), se emite `abort` con `error="commit_signing_failed"`, chain verifier acepta prepare→abort como terminal válida. **Compensación externa requerida**: audit log + operator alert (misma clase que AD-005).

### 4. Network HTTP Capability: Host-Authoritative FetchRecord (AD-014)
**Regla**: `aegis_http_fetch` host function con `ureq` (blocking I/O, rustls ring-only). Validación orden: endpoint allowlist (S-601) → method allowlist (S-602) → rate bucket (S-606) → fetch (S-603/S-604) → size cap 1 MiB (S-605). **Host-authoritative**: `FetchRecord { url, body_blake3, body_len }` guardado en `SandboxState` SOLO en éxito; guest NUNCA reporta qué fetched. Execute handler lee esto para execute-level receipt (path = fetched URL, result = BLAKE3(body), size = body len).
**Decisiones D1-D6**: HTTP client = ureq (blocking, pure Rust, ring); policy carrier = `Option<NetworkHttpParams>` en SandboxState (zero-cost para non-network); rate limit = per-execution TokenBucket refill-on-demand (fresh Sandbox por Execute resetea bucket); trap→gRPC = `msg.starts_with("network ")` FIRST guard en cascade (structural safety vs guest-controlled URLs con `..`/`size`); REQ-610 URL = host stores FetchRecord; AD timing = decision recorded same work unit as code.
**Hardening**: `max_redirects(0)` (redirects podrían escapar allowlist); `http_status_as_error(false)` (4xx/5xx bodies delivered); output-buffer-too-small emite trap receipt ANTES de fallar (cierra AD-005-class audit gap).

### 5. Fuel Metering Determinista en Receipts (AD-015)
**Regla**: Engine SIEMPRE `consume_fuel(true)` en creación. Store setea budget explícito via `store.set_fuel(budget)` — nunca rely en default 0. Default 10M fuel calibrado: 909,090× headroom over max E2E execute (11 fuel); ~770K iteraciones aritméticas antes de exhaustion; trap determinista en ~7–14ms (bien antes de epoch 100ms). Exhaustion clasificado via dedicated D4 arm (`"fuel budget exceeded"`) colocado después de network guard y antes de fs cascade. `fuel_consumed` en Execute receipts solo (skip-if-zero, last field, byte-identical at 0).
**Por qué**: Deterministic per-execution CPU accounting en receipts; operators/verifiers ven exact fuel consumption; S-802 exhaustion classification estable; configs sin knob mantienen comportamiento actual.

---

## Arquitectura y flujo principal

```
┌──────────────┐     mTLS gRPC      ┌────────────────────────────────┐
│  agent-gateway │ ───────────────▶ │  aegis-runtime (Rust)            │
│  or any client │                  │  ┌────────────────────────────┐  │
└──────────────┘                    │  │ Execute / Prepare / Commit │  │
                                     │  │ Verify / GetReceiptChain   │  │
                                     │  └────────────┬───────────────┘  │
                                     │               ▼                  │
                                     │  ┌────────────────────────────┐  │
                                     │  │ ReceiptEmitter (Ed25519 +   │  │
                                     │  │ BLAKE3, hash-chained)       │  │
                                     │  └────────────┬───────────────┘  │
                                     │               ▼                  │
                                     │  ┌────────────────────────────┐  │
                                     │  │ Wasmtime sandbox            │  │
                                     │  │  · capability host fns      │  │
                                     │  │  · resource limits          │  │
                                     │  │  · epoch + fuel metering    │  │
                                     │  └────────────────────────────┘  │
                                     └────────────────────────────────┘
```

**Estructura real**:
```
config/       runtime.toml.example (annotated)
openspec/     specs, archived change proposals (openspec-style)
proto/        aegis/v1 protobuf (Execute, Prepare/Commit/Abort, Verify, Health)
src/
  bin/        aegis-runtime.rs, aegis-verify.rs
  sandbox/    Wasmtime sandbox, host functions, epoch interrupter
  receipts/   ExecutionReceipt, ReceiptChain, ReceiptEmitter (two-phase)
  capabilities/  Capability enum (FilesystemRead/Write, NetworkHttp, TwoPhaseReceipts)
  policy/     PolicyConfig (TOML → CapabilityConfig)
  grpc/       handlers (Execute, Prepare, Commit, Abort, Verify, Health), server, mTLS
  config/     RuntimeConfig, TlsConfig, ExecutionConfig
  observability/  OpenTelemetry tracing
tests/        integration: sandbox, config, fuel, network_http, two_phase, grpc_boundary
```

**Flujo `Execute` (legacy, deprecated)**:
1. gRPC request → `ExecuteRequest { capability_name, config, wasm_module }`
2. Handler crea `Sandbox::new_with_limits(config)` → `instantiate_with_capabilities(wasm_bytes, capabilities)`
3. Invoca exported `execute()` function → captura result via guest memory `(ptr, len)`
4. `ReceiptEmitter.emit_legacy()` para backward compatibility + two-phase chain internamente
5. Returns `ExecuteResponse { success, result, receipt, error_message }`

**Flujo Two-Phase (nuevo, recomendado)**:
1. `ExecutePrepare` → `ReceiptEmitter.prepare()` crea sandbox + signs `prepare` receipt → returns `prepare_hash`
2. Handler obtiene `SandboxHandle` via `get_pending_sandbox()` → ejecuta WASM en prepared sandbox
3. `ExecuteCommit` → `ReceiptEmitter.commit(handle, result, path, size, fuel_consumed)` → signs `commit` receipt
4. O `ExecuteAbort` → `ReceiptEmitter.abort(handle, error)` → signs `abort` receipt
5. `VerifyChain` / `GetReceiptChain` para auditoría offline

---

## Detalles técnicos que marcan la diferencia

### Fail-Closed Filesystem Write (asimetría read vs write)
```rust
// aegis_fs_write: CRITICAL SEQUENCE
// 1. Validate path, size, guest memory
// 2. Write data to temp file (.aegis_tmp in allowed_root)
// 3. std::fs::rename(temp, target)  ← FILE NOW VISIBLE ON HOST
// 4. Emit success receipt via ReceiptEmitter

// SI step 4 FALLA después de step 3 SUCCESS:
// - File IS written on host filesystem (visible to other processes)
// - Cannot retract — no portable atomic "un-write" after rename
// - Log explicit "FAIL-CLOSED VIOLATION" audit record
// - Return Trap at API level (maintain fail-closed contract)
// - Receipt chain has VERIFIABLE GAP: real write occurred, no signed receipt added
```
**Idempotent retry is safe**: same path + same data → overwrite con contenido idéntico. Filesystem state convergent; solo receipt chain tiene gap.

### Symlink Traversal Defense-in-Depth (AD-006)
```rust
// En aegis_fs_write symlink branch:
// 1. read_link target
// 2. EXPLICIT CHECK: if target.components().any(|c| c == "..") → TRAP
// 3. Defense-in-depth: canonical_path.components().any(|c| c == "..") → TRAP
// 4. NUL byte stripping: .trim_end_matches('\0') en TODOS guest memory paths
```
Guest paths incluyen NUL terminator; `std::str::from_utf8` lo preserva → filesystem ops fallarían con error inesperado en lugar de security check.

### mTLS Mutual Authentication (AD-012)
```rust
// AegisClientCertVerifier: custom verifier que checkea AMBOS CN y SAN
// contra expected_identity (configurable, no hardcoded)
// Plain TLS RECHAZADO: permitiría cualquier client con CA-signed cert válido
// Fail-closed cuando TLS enabled: client_auth_mandatory() = true
// Sin server.tls config → server warns pero starts (known gap: no enforcement)
```

### Receipt Chain Verification (Two-Phase State Machine)
```rust
// verify_chain state machine:
Legacy (phase=""): normal chain, pending_hash must be zero
Prepare: verify pending_hash = blake3(prev_hash || prepare_canonical_without_pending_hash)
         set expected_pending_hash
Commit/Abort: require expected_pending_hash
              verify prev_hash == expected AND pending_hash == expected
              clear expected_pending_hash (terminal)
// Idempotent duplicate commit/abort con identical canonical bytes = accepted
```

---

## Qué aprendí (3 claves) y deuda técnica honesta

1. **Fail-closed no es gratis, pero es el único modelo que sobrevive a bugs** — `trap_on_grow_failure(true)`, epoch interruption, capability host functions, receipt emission en CADA validation point (antes de read, después de rename, antes de network I/O). Si una validación falla, el receipt se emite ANTES del trap. No hay "intentos fallidos silenciosos".

2. **Two-phase receipts resuelven la asimetría de side effects irreversibles, pero introducen nuevo gap** — el `prepare` receipt prueba intención ANTES de ejecutar. Si commit signing falla después de side effects reales, la cadena muestra `prepare → abort(commit_signing_failed)`. Es honesto sobre lo que no se puede garantizar. La compensación externa (audit log + alert) es obligatoria, no opcional.

3. **Wasmtime global epoch counter rompe test isolation** — `Sandbox::new_with_config(config, enable_epoch: bool)` es API pública SOLO para tests. Production usa `new_with_limits` que SIEMPRE habilita epoch. Documentado en AD-004 para prevenir futuras "simplificaciones" que reintroduzcan el deadlock.

**Deuda técnica explícita (documentada desde día 1)**:
1. **gRPC boundary failure tests (AD-007)** — 4 escenarios (S-701, S-702, S-704, S-721) probados a nivel unitario pero NO en boundary gRPC. Hardening PR `hardening/grpc-boundary-tests` es **mandatory next task** — bloquea Phase 6+.
2. **Phase 5 closure retroactively invalidated (AD-008)** — Execute RPC handler never loaded/executed WASM module (stub hardcoded). Verify PASS fue falso. Phase 5 reabierto hasta real execution + re-verify.
3. **S-416-W-after-rename receipt gap (AD-005)** — write succeeds, emit fails → host side effect sin receipt. Mitigado por audit log, no cerrado. Fix futuro: two-phase receipt emission o external KMS con atomicity.
4. **Fuel metering deferred desde Phase 0 (AD-002)** — implementado en Phase 8. Epoch-only sigue siendo wall-clock security boundary.
5. **mTLS enforcement en production (AD-012)** — sin `server.tls` config, server warns pero starts. Known gap: no enforcement que mTLS sea requerido en production.

---

## Stack

`Rust 1.98+` • `edition 2021` • `wasmtime 24.0` • `tokio 1.0` • `tonic 0.12 (mTLS)` • `rustls 0.23 (ring-only)` • `ring 0.17 (Ed25519)` • `blake3 1.0` • `ureq 3 (rustls, blocking)` • `x509-parser 0.16` • `tracing + opentelemetry` • `clap 4` • `wat 1.0 (tests)` • `rcgen 0.13 (test certs)` • `tempfile 3` • `serde + serde_json + serde_bytes`

---

## Fuentes usadas

| Archivo | Qué aporta |
|---|---|
| `README.md` | Visión general, arquitectura, quickstart, config, repository layout |
| `DECISIONS.md` | 16 ADRs (AD-001 a AD-016) con contexto, decisión, alternativas, consecuencias, trazabilidad |
| `Cargo.toml` | Dependencias exactas, features (test-utils), binarios, ring-only TLS config |
| `proto/aegis/v1/aegis.proto` | gRPC service definition: Execute, Prepare/Commit/Abort, VerifyChain, Health |
| `src/lib.rs` | Public API surface, modules, protobuf include |
| `src/sandbox/mod.rs` | SandboxConfig, EpochInterrupter (mpsc channel), SandboxState, CapabilityConfig, host functions (aegis_fs_read, aegis_fs_write, aegis_http_fetch), fuel metering, instantiate_with_capabilities |
| `src/receipts/mod.rs` | ExecutionReceipt (canonical bytes, signature, phase, pending_hash, fuel_consumed), ReceiptChain (verify_chain state machine), ReceiptEmitter (prepare/commit/abort, TTL sweep, test-utils hooks) |
| `src/capabilities/mod.rs` | Capability enum, params structs, From trait para CapabilityConfig |
| `src/policy/mod.rs` | PolicyConfig (TOML load, validation, try_into_capabilities) |
| `src/grpc/handlers/mod.rs` | Execute (legacy + two-phase), Prepare, Commit, Abort, VerifyChain, GetReceiptChain, trap cascade con network-first guard (D4) |
| `src/grpc/tls.rs` | AegisClientCertVerifier (CN/SAN validation), build_tls_config |
| `src/grpc/server.rs` | TLS acceptor (tokio_rustls), reflection, health service |
| `src/config/runtime.rs` | RuntimeConfig, TlsConfig, ExecutionConfig, SandboxConfig parsing |
| `tests/sandbox.rs` | Memory/table/instance limits, epoch, fuel, symlink traversal, NUL byte, S-416-W-after-rename |
| `tests/network_http.rs` | S-601..S-606, REQ-601..610, endpoint/method/rate/size/timeout violations |
| `tests/two_phase.rs` | Prepare/Commit/Abort flow, commit_signing_failed forced test, TTL expiry |
| `tests/grpc_boundary.rs` | mTLS cert generation, gRPC error mapping, VerifyChain tampered receipt |
| `tests/fuel.rs` | S-801, S-802, E-803/804/805, fuel_consumed verification |
| `config/runtime.toml.example` | Full annotated configuration example |
