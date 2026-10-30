---
title: "Aegis: secure WASM execution with signed receipts and capability-based sandboxing"
excerpt: "A Rust runtime that applies a fail-closed security model to WASM execution: capability-based host functions instead of WASI, signed and hash-chained receipts (Ed25519 + BLAKE3), two-phase execution (prepare/commit/abort), and hard resource limits, all exposed over gRPC with mutual TLS."
date: "2026-10-24T00:00:00Z"
tags: ["AI SECURITY", "WEBASSEMBLY", "RUST", "SANDBOXING", "GRPC"]
draft: false
translationKey: "aegis"
---

Running untrusted WebAssembly is only safe when every resource access is gated and every side effect is provable. I built **aegis** as a Rust runtime that applies a fail-closed security model to WASM execution: capability-based host functions instead of WASI, signed and hash-chained receipts (Ed25519 + BLAKE3) that prove what executed, with what result and at what cost, two-phase execution (prepare/commit/abort) so intent and result are both provable, and hard resource limits (1 MiB memory, fuel metering, epoch interruption) — all exposed over gRPC with mutual TLS.

---

## The Problem

When you run untrusted WASM in production, the attack surface has three dimensions that most runtimes ignore:

1. **WASI is too permissive**: WASI's fd-based model grants broad system access (fd_read, fd_write, path_open) that cannot easily be scoped to a single capability such as `filesystem.read` with an `allowed_root`. Without capability-based security, a malicious or buggy module can escape the sandbox.
2. **No cryptographic proof of execution**: "the module did it" is not an audit trail. You need signed receipts that prove which capability was invoked, with which parameters, what result it produced, and how much CPU it consumed — verifiable offline without access to the runtime.
3. **Irreversible side effects without atomic auditing**: an atomic write (temp + rename) that fails after the rename but before emitting the receipt leaves the host filesystem modified with no evidence in the chain. The same problem appears in network calls observed remotely. You need a model that acknowledges this asymmetry and documents it honestly.

---

## What I Built

**aegis** is a Rust runtime for **secure WebAssembly execution** with capability-based security, signed and hash-chained execution receipts, and a gRPC server with mutual TLS. Two binaries:

| Binary | Purpose |
|---|---|
| `aegis-runtime` | gRPC server (mTLS, receipts, sandbox) |
| `aegis-verify` | Offline verifier for the receipt chain |

The runtime is declarative: a TOML file configures the server, TLS identity, signing key, policy defaults, and execution knobs (`max_concurrent`, `fuel_budget`). Access control is **deny by default** — a guest only gets the capabilities explicitly granted in its request config.

**Implemented capabilities** (4 names, 3 executable):
- `filesystem.read` — reads inside `allowed_root`, max bytes, traversal rejection
- `filesystem.write` — atomic write (temp + rename) inside `allowed_root`, max bytes, symlink `..` rejection
- `network.http` — HTTPS fetch against a host allowlist, method allowlist, per-execution token bucket, 1 MiB response cap
- `two_phase_receipts` — marker that enables two-phase RPCs (Prepare/Commit/Abort), not executable

---

## Key Design Decisions (the 5 that define the system)

### 1. Fail-Closed Sandbox: trap_on_grow_failure + Epoch Interruption (AD-001, AD-002, AD-003)
**Rule**: Every resource exhaustion = Wasmtime `Trap`, never a graceful error. `StoreLimitsBuilder::trap_on_grow_failure(true)` (non-spec but fail-closed). Engine with `epoch_interruption(true)` + a dedicated timer thread that calls `engine.increment_epoch()` at a configurable interval (default 100ms). The timer thread uses `mpsc::channel` to relay the correct `Thread` handle (AD-003: `std::thread::current()` inside the spawn returns the spawned thread, not the caller).
**Discarded alternatives**: fuel metering in Phase 0 (per-instruction overhead without strengthening the security boundary; epoch is enough for the isolation proof); a plain `AtomicBool` for the thread handle (deadlock on Drop).
**Cost**: Epoch-only is imprecise for tight loops without calls (WASM only checks epoch at call/loop boundaries). Mitigation: Phase 1 host functions provide natural epoch check points. Fuel metering was added in Phase 8 for reporting, not as a security limit.

### 2. Capability-Based Host Functions vs WASI (AD-010)
**Rule**: Custom host functions (`aegis_fs_read`, `aegis_fs_write`, `aegis_http_fetch`) via `Linker::func_wrap` instead of WASI. Each capability registers its closure capturing `allowed_root` and `max_bytes` at link time.
**Why**: Fine-grained capability control (WASI grants broad access that cannot be scoped to a single capability); security boundary clarity (each host function is named explicitly and validated against the capability config); path validation integration (traversal checks, canonicalize + starts_with root check, symlink resolution embedded in the closure); receipt emission at every validation point (path OOB, traversal, size exceed, success); future extensibility (`network.http`, `crypto.sign` without WASI version constraints).
**Trade-offs**: Not standardized — guest modules must import the `aegis` namespace; WASI modules fail at link time (S-4); more implementation effort per capability.

### 3. Signed Hash-Chained Receipts with Two-Phase Execution (AD-005, AD-009, AD-016)
**Rule**: Every execution produces an Ed25519-signed receipt (BLAKE3-hashed and chained) that proves what it executed, with what result, at what cost. Genesis: `prev_hash = [0u8; 32]`. Each receipt: `prev_hash` = `blake3(prev_hash || canonical_bytes)`. Canonical bytes = serde_json struct field order (fixed, no HashMap). `verify_chain` validates: signatures, hash chain integrity, two-phase state machine (legacy/prepare/commit/abort), timestamps ±5s.
**Two-phase**: `ExecutePrepare` → sandbox created + signed `prepare` receipt (`phase="prepare"`, `result="pending"`, `pending_hash = blake3(prev_hash || prepare_canonical_without_pending_hash)`) → `prepare_hash` returned. `ExecuteCommit` → WASM executes in the prepared sandbox → result/fuel captured → `commit` receipt signed with `phase="commit"`, `pending_hash` copied from prepare. `ExecuteAbort` → `abort` receipt with `error="aborted"`.
**Critical gap (AD-005, AD-016)**: If `rename()` succeeds in `aegis_fs_write` but `emit()` fails afterwards, the file IS already written to the host filesystem and cannot be "un-written". Same in `ExecuteCommit`: WASM executes (real side effects) but commit signing fails. Mitigation: the `prepare` receipt exists in the chain (proof of intent), an `abort` is emitted with `error="commit_signing_failed"`, and the chain verifier accepts prepare→abort as a valid terminal. **External compensation required**: audit log + operator alert (same class as AD-005).

### 4. Network HTTP Capability: Host-Authoritative FetchRecord (AD-014)
**Rule**: `aegis_http_fetch` host function built on `ureq` (blocking I/O, rustls ring-only). Validation order: endpoint allowlist (S-601) → method allowlist (S-602) → rate bucket (S-606) → fetch (S-603/S-604) → size cap 1 MiB (S-605). **Host-authoritative**: `FetchRecord { url, body_blake3, body_len }` is stored in `SandboxState` ONLY on success; the guest NEVER reports what it fetched. The Execute handler reads this for the execute-level receipt (path = fetched URL, result = BLAKE3(body), size = body len).
**Decisions D1-D6**: HTTP client = ureq (blocking, pure Rust, ring); policy carrier = `Option<NetworkHttpParams>` in SandboxState (zero-cost for non-network); rate limit = per-execution TokenBucket refill-on-demand (a fresh Sandbox per Execute resets the bucket); trap→gRPC = `msg.starts_with("network ")` FIRST guard in the cascade (structural safety vs guest-controlled URLs with `..`/`size`); REQ-610 URL = host stores FetchRecord; AD timing = decision recorded in the same work unit as the code.
**Hardening**: `max_redirects(0)` (redirects could escape the allowlist); `http_status_as_error(false)` (4xx/5xx bodies delivered); output-buffer-too-small emits a trap receipt BEFORE failing (closes the AD-005-class audit gap).

### 5. Deterministic Fuel Metering in Receipts (AD-015)
**Rule**: Engine ALWAYS `consume_fuel(true)` at creation. The store sets an explicit budget via `store.set_fuel(budget)` — never rely on the default 0. Default 10M fuel calibrated: 909,090× headroom over the max E2E execute (11 fuel); ~770K arithmetic iterations before exhaustion; deterministic trap in ~7–14ms (well before the 100ms epoch). Exhaustion is classified via a dedicated D4 arm (`"fuel budget exceeded"`) placed after the network guard and before the fs cascade. `fuel_consumed` in Execute receipts only (skip-if-zero, last field, byte-identical at 0).
**Why**: Deterministic per-execution CPU accounting in receipts; operators/verifiers see exact fuel consumption; S-802 exhaustion classification is stable; configs without the knob keep current behavior.

---

## Architecture and Main Flow

```
┌─────────────────┐    mTLS gRPC     ┌──────────────────────────────────┐
│  agent-gateway  │ ───────────────▶ │  aegis-runtime (Rust)            │
│  or any client  │                  │  ┌────────────────────────────┐  │
└─────────────────┘                  │  │ Execute / Prepare / Commit │  │
                                     │  │ Verify / GetReceiptChain   │  │
                                     │  └─────────────┬──────────────┘  │
                                     │                ▼                 │
                                     │  ┌────────────────────────────┐  │
                                     │  │ ReceiptEmitter (Ed25519 +  │  │
                                     │  │ BLAKE3, hash-chained)      │  │
                                     │  └─────────────┬──────────────┘  │
                                     │                ▼                 │
                                     │  ┌────────────────────────────┐  │
                                     │  │ Wasmtime sandbox           │  │
                                     │  │  · capability host fns     │  │
                                     │  │  · resource limits         │  │
                                     │  │  · epoch + fuel metering   │  │
                                     │  └────────────────────────────┘  │
                                     └──────────────────────────────────┘
```

**Actual structure**:
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

**`Execute` flow (legacy, deprecated)**:
1. gRPC request → `ExecuteRequest { capability_name, config, wasm_module }`
2. Handler creates `Sandbox::new_with_limits(config)` → `instantiate_with_capabilities(wasm_bytes, capabilities)`
3. Invokes the exported `execute()` function → captures the result via guest memory `(ptr, len)`
4. `ReceiptEmitter.emit_legacy()` for backward compatibility + two-phase chain internally
5. Returns `ExecuteResponse { success, result, receipt, error_message }`

**Two-phase flow (new, recommended)**:
1. `ExecutePrepare` → `ReceiptEmitter.prepare()` creates the sandbox + signs the `prepare` receipt → returns `prepare_hash`
2. Handler obtains `SandboxHandle` via `get_pending_sandbox()` → runs WASM in the prepared sandbox
3. `ExecuteCommit` → `ReceiptEmitter.commit(handle, result, path, size, fuel_consumed)` → signs the `commit` receipt
4. Or `ExecuteAbort` → `ReceiptEmitter.abort(handle, error)` → signs the `abort` receipt
5. `VerifyChain` / `GetReceiptChain` for offline auditing

---

## Technical Details That Make the Difference

### Fail-Closed Filesystem Write (read vs write asymmetry)
```rust
// aegis_fs_write: CRITICAL SEQUENCE
// 1. Validate path, size, guest memory
// 2. Write data to a temp file (.aegis_tmp in allowed_root)
// 3. std::fs::rename(temp, target)  ← FILE NOW VISIBLE ON HOST
// 4. Emit success receipt via ReceiptEmitter

// IF step 4 FAILS after step 3 SUCCEEDED:
// - File IS written on the host filesystem (visible to other processes)
// - Cannot retract — no portable atomic "un-write" after rename
// - Log explicit "FAIL-CLOSED VIOLATION" audit record
// - Return Trap at API level (maintain fail-closed contract)
// - Receipt chain has a VERIFIABLE GAP: real write occurred, no signed receipt added
```
**Idempotent retry is safe**: same path + same data → overwrite with identical content. Filesystem state converges; only the receipt chain has a gap.

### Symlink Traversal Defense-in-Depth (AD-006)
```rust
// In the aegis_fs_write symlink branch:
// 1. read_link target
// 2. EXPLICIT CHECK: if target.components().any(|c| c == "..") → TRAP
// 3. Defense-in-depth: canonical_path.components().any(|c| c == "..") → TRAP
// 4. NUL byte stripping: .trim_end_matches('\0') on ALL guest memory paths
```
Guest paths include a NUL terminator; `std::str::from_utf8` preserves it → filesystem ops would fail with an unexpected error instead of a security check.

### mTLS Mutual Authentication (AD-012)
```rust
// AegisClientCertVerifier: custom verifier that checks BOTH CN and SAN
// against expected_identity (configurable, not hardcoded)
// Plain TLS REJECTED: would allow any client with a valid CA-signed cert
// Fail-closed when TLS enabled: client_auth_mandatory() = true
// Without server.tls config → server warns but starts (known gap: no enforcement)
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
// Idempotent duplicate commit/abort with identical canonical bytes = accepted
```

---

## What I Learned (3 Keys) and Honest Tech Debt

1. **Fail-closed is not free, but it is the only model that survives bugs** — `trap_on_grow_failure(true)`, epoch interruption, capability host functions, receipt emission at EVERY validation point (before read, after rename, before network I/O). If a validation fails, the receipt is emitted BEFORE the trap. There are no "silent failed attempts".

2. **Two-phase receipts solve the irreversible-side-effect asymmetry, but they introduce a new gap** — the `prepare` receipt proves intent BEFORE executing. If commit signing fails after real side effects, the chain shows `prepare → abort(commit_signing_failed)`. It is honest about what cannot be guaranteed. External compensation (audit log + alert) is mandatory, not optional.

3. **Wasmtime's global epoch counter breaks test isolation** — `Sandbox::new_with_config(config, enable_epoch: bool)` is a public API ONLY for tests. Production uses `new_with_limits`, which ALWAYS enables epoch. Documented in AD-004 to prevent future "simplifications" that reintroduce the deadlock.

**Explicit tech debt (documented from day 1)**:
1. **gRPC boundary failure tests (AD-007)** — 4 scenarios (S-701, S-702, S-704, S-721) tested at unit level but NOT at the gRPC boundary. The hardening PR `hardening/grpc-boundary-tests` is the **mandatory next task** — it blocks Phase 6+.
2. **Phase 5 closure retroactively invalidated (AD-008)** — the Execute RPC handler never loaded/executed the WASM module (hardcoded stub). The verify PASS was false. Phase 5 reopened until real execution + re-verify.
3. **S-416-W-after-rename receipt gap (AD-005)** — write succeeds, emit fails → host side effect without a receipt. Mitigated by audit log, not closed. Future fix: two-phase receipt emission or an external KMS with atomicity.
4. **Fuel metering deferred from Phase 0 (AD-002)** — implemented in Phase 8. Epoch-only remains the wall-clock security boundary.
5. **mTLS enforcement in production (AD-012)** — without `server.tls` config, the server warns but starts. Known gap: no enforcement that mTLS is required in production.

---

## Stack

`Rust 1.98+` • `edition 2021` • `wasmtime 24.0` • `tokio 1.0` • `tonic 0.12 (mTLS)` • `rustls 0.23 (ring-only)` • `ring 0.17 (Ed25519)` • `blake3 1.0` • `ureq 3 (rustls, blocking)` • `x509-parser 0.16` • `tracing + opentelemetry` • `clap 4` • `wat 1.0 (tests)` • `rcgen 0.13 (test certs)` • `tempfile 3` • `serde + serde_json + serde_bytes`

---

## Sources Used

| File | Contribution |
|---|---|
| `README.md` | Overview, architecture, quickstart, config, repository layout |
| `DECISIONS.md` | 16 ADRs (AD-001 to AD-016) with context, decision, alternatives, consequences, traceability |
| `Cargo.toml` | Exact dependencies, features (test-utils), binaries, ring-only TLS config |
| `proto/aegis/v1/aegis.proto` | gRPC service definition: Execute, Prepare/Commit/Abort, VerifyChain, Health |
| `src/lib.rs` | Public API surface, modules, protobuf include |
| `src/sandbox/mod.rs` | SandboxConfig, EpochInterrupter (mpsc channel), SandboxState, CapabilityConfig, host functions (aegis_fs_read, aegis_fs_write, aegis_http_fetch), fuel metering, instantiate_with_capabilities |
| `src/receipts/mod.rs` | ExecutionReceipt (canonical bytes, signature, phase, pending_hash, fuel_consumed), ReceiptChain (verify_chain state machine), ReceiptEmitter (prepare/commit/abort, TTL sweep, test-utils hooks) |
| `src/capabilities/mod.rs` | Capability enum, params structs, From trait for CapabilityConfig |
| `src/policy/mod.rs` | PolicyConfig (TOML load, validation, try_into_capabilities) |
| `src/grpc/handlers/mod.rs` | Execute (legacy + two-phase), Prepare, Commit, Abort, VerifyChain, GetReceiptChain, trap cascade with network-first guard (D4) |
| `src/grpc/tls.rs` | AegisClientCertVerifier (CN/SAN validation), build_tls_config |
| `src/grpc/server.rs` | TLS acceptor (tokio_rustls), reflection, health service |
| `src/config/runtime.rs` | RuntimeConfig, TlsConfig, ExecutionConfig, SandboxConfig parsing |
| `tests/sandbox.rs` | Memory/table/instance limits, epoch, fuel, symlink traversal, NUL byte, S-416-W-after-rename |
| `tests/network_http.rs` | S-601..S-606, REQ-601..610, endpoint/method/rate/size/timeout violations |
| `tests/two_phase.rs` | Prepare/Commit/Abort flow, commit_signing_failed forced test, TTL expiry |
| `tests/grpc_boundary.rs` | mTLS cert generation, gRPC error mapping, VerifyChain tampered receipt |
| `tests/fuel.rs` | S-801, S-802, E-803/804/805, fuel_consumed verification |
| `config/runtime.toml.example` | Full annotated configuration example |
