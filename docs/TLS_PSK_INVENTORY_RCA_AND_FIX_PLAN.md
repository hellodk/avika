# TLS/PSK & Inventory — RCA and Fix Plan

This document captures the analysis of `feature/tls-psk-analysis` vs `master`, why the **Inventory** page can show **no agents** after enabling TLS/PSK, and a reviewed fix plan.

## 1. Comparing branches

To diff locally (remote may differ from a stale local branch):

```bash
git fetch origin
git log master..origin/feature/tls-psk-analysis --oneline
git diff master...origin/feature/tls-psk-analysis --stat
```

If both branches point at the same commit, there is no local diff until you fetch the remote feature branch.

---

## 2. How Inventory loads agents

| Layer | Mechanism |
|--------|-----------|
| **UI** | `frontend/src/app/inventory/page.tsx` → `GET /api/servers` |
| **Next.js** | `frontend/src/app/api/servers/route.ts` → gRPC `AgentService.ListAgents` via `getAgentServiceClient()` |
| **Gateway** | `ListAgents` enumerates **in-memory `sessions`** (agents with an active control connection) |

Inventory does **not** use the gateway HTTP route `GET /api/servers` for this path; it uses **gRPC from the Next.js server to the gateway**.

Reference: `frontend/src/lib/grpc-client.ts` — client uses `GATEWAY_GRPC_ADDR` and **`grpc.credentials.createInsecure()`** by default.

---

## 3. Root cause analysis (RCA)

### 3.1 Primary: PSK gRPC interceptors apply to BFF traffic

When `PSK.Enabled` is true, the gateway registers **global** gRPC interceptors (`UnaryPSKInterceptor`, `StreamPSKInterceptor`) in `cmd/gateway/main.go`. They require PSK metadata:

- `x-avika-agent-id`
- `x-avika-hostname`
- `x-avika-signature`
- `x-avika-timestamp`

**`ListAgents` is a unary RPC** called from Next.js **without any of this metadata**. The interceptor returns **`Unauthenticated`**. The Next.js route surfaces a gRPC error (typically 500 / “Failed to fetch agents”); the UI may show an error or an empty list.

**Design mismatch:** PSK is meant for **agents**. Agents attach to the gateway via **`Commander.Connect`** (bidirectional stream). They do **not** call `ListAgents` on the gateway. `ListAgents` is used by the **UI BFF** only.

The same pattern affects **other Next.js API routes** that use `getAgentServiceClient()` (analytics, reports, traces, alerts, etc.) — any unary or stream RPC hit by those routes will fail under global PSK unless metadata is added or interceptors are scoped.

### 3.2 Secondary: gRPC TLS vs insecure Next.js client

When `cfg.Security.EnableTLS` is true, the gateway gRPC server uses TLS (`grpc.Creds(credentials.NewTLS(...))`). The Next.js gRPC client still uses **`createInsecure()`**, so the **TLS handshake fails** and `ListAgents` never succeeds.

Environment hooks include `ENABLE_TLS`, `TLS_CERT_FILE`, `TLS_KEY_FILE`, `TLS_CA_CERT_FILE`, `REQUIRE_CLIENT_CERT` (see `cmd/gateway/config/config.go`).

---

## 4. Fix plan (for implementation review)

### 4.1 PSK: narrow enforcement (recommended)

- **Goal:** Authenticate **agents** on the control plane, not every internal management RPC.
- **Approach:**
  - **Unary:** Do **not** require PSK on all `AgentService` unary methods. Options:
    - Remove unary PSK for gateway `AgentService` if agents never call those unary methods on the gateway, **or**
    - Whitelist BFF-only methods (e.g. `ListAgents` and others called only from `frontend/src/app/api/**` via `getAgentServiceClient()`).
  - **Stream:** In `StreamPSKInterceptor`, require PSK only for **`Commander/Connect`** (verify exact `FullMethod` string from generated code), **not** for UI streams such as `StreamAnalytics`.

- **Tests:** With PSK enabled: Next.js `ListAgents` succeeds; agent without valid PSK still cannot complete `Connect` (or equivalent enforced path).

### 4.2 TLS: align Next.js gRPC with gateway

- If gRPC TLS is enabled on the gateway:
  - Use **`grpc.credentials.createSsl()`** (or equivalent) in `frontend/src/lib/grpc-client.ts` with the correct CA bundle (and client cert/key if mTLS is required).
  - Configure via environment variables (e.g. CA path, optional client cert) and document for Docker/Kubernetes.

### 4.3 Optional architectural alternative

- Route **`GET /api/servers`** through **HTTP proxy** to `GATEWAY_HTTP_URL/api/servers` with session cookies (same pattern as other API routes), avoiding gRPC from Next.js for listing agents. Larger change but consistent with cookie-based auth elsewhere.

### 4.4 Operational verification

- Gateway logs: look for gRPC **`Unauthenticated`** on `/.../ListAgents` vs TLS handshake errors.
- Confirm deployment env: `PSK_*` / `ENABLE_TLS` / cert paths match the feature branch manifests.

---

## 5. Quick reference — files

| Area | File(s) |
|------|---------|
| PSK interceptors | `cmd/gateway/middleware/psk.go` |
| gRPC server + TLS + PSK wiring | `cmd/gateway/main.go` |
| Security env | `cmd/gateway/config/config.go` (`loadEnvOverrides`) |
| Inventory API | `frontend/src/app/api/servers/route.ts` |
| gRPC client | `frontend/src/lib/grpc-client.ts` |
| Inventory UI | `frontend/src/app/inventory/page.tsx` |

---

## 6. Summary

| Symptom | Likely cause |
|---------|----------------|
| No agents on Inventory after PSK | Global PSK interceptors block **`ListAgents`** (and other BFF gRPC calls) because **no PSK metadata** is sent. |
| Same after TLS | Next.js uses **insecure** gRPC while gateway expects **TLS**. |

**Direction:** Scope PSK to **agent-facing** RPCs (especially **`Commander/Connect`**); add **gRPC TLS** support in the Next.js client when gateway gRPC uses TLS; optionally move list-agents to HTTP proxy.

---

*Document version: 1.0 — for review alongside `feature/tls-psk-analysis`.*
