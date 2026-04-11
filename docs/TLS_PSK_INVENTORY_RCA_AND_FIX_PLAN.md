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

## 7. Implemented follow-ups (inventory HTTP + gRPC mTLS)

### 7.1 `GET /api/servers` via gateway HTTP (default)

- **`frontend/src/app/api/servers/route.ts`** proxies to **`GATEWAY_HTTP_URL/api/servers`** with the browser session cookie (`avika_session`, or full `Cookie` header fallback).
- Matches cookie-based auth used by other Next.js → gateway routes.
- **Rollback:** set **`SERVERS_LIST_USE_GRPC=true`** to use the previous gRPC `ListAgents` path (still respects TLS/mTLS below).
- **Agent removal:** the gateway exposes **`DELETE /api/servers/{agentId}`** (cookie auth); the Next.js BFF proxies to it when delete is on the HTTP path. **`SERVERS_DELETE_USE_GRPC`** defaults to follow **`SERVERS_LIST_USE_GRPC`** when unset (see `frontend/src/lib/servers-bff-transport.ts`). See [inventory-bff-http-grpc-asymmetry.md](./inventory-bff-http-grpc-asymmetry.md).

### 7.2 gRPC TLS and mTLS from Next.js

- **`frontend/src/lib/grpc-client.ts`**
  - **`ENABLE_TLS=true`** or **`GATEWAY_TLS=true`** — use TLS to gateway gRPC.
  - **`TLS_CA_CERT_FILE`** — optional PEM CA (recommended for private CAs).
  - **mTLS (client identity):** set **both**
    - **`TLS_CLIENT_CERT_FILE`** (or **`GRPC_TLS_CLIENT_CERT_FILE`**)
    - **`TLS_CLIENT_KEY_FILE`** (or **`GRPC_TLS_CLIENT_KEY_FILE`**)
  - If only one of cert/key is set, client creation **throws** with a clear error.

---

---

## 8. Revalidation — breaking changes & contract (`GET /api/servers`)

### 8.1 Response shape (unchanged for success)

Successful responses remain:

```json
{ "agents": [...], "system_version": "..." }
```

Agents are normalized (snake_case + `agent_id` alias) in `frontend/src/app/api/servers/route.ts`.

### 8.2 Auth semantics (intentional change vs old gRPC list)

- **Default path:** Next.js proxies to **gateway HTTP** `GET /api/servers` with the user’s **session cookie**.
- Gateway **requires authentication** for this route (not a public path). Unauthenticated browser sessions receive **401** from Next (forwarded from gateway), with body `{ "error", "agents": [], "system_version": "0.0.0" }`.
- **Previously**, listing via **gRPC from the Next server** did not attach gateway session; behavior was more permissive for that internal hop. Integrations that called **`/api/servers` without a session** may now get **401** instead of a list — use a logged-in browser or set **`SERVERS_LIST_USE_GRPC=true`** only if you accept the old gRPC path (still subject to gateway gRPC TLS/PSK config).

### 8.3 Error status codes

| Case | Status | Body |
|------|--------|------|
| Gateway auth failure | 401 / 403 | `{ error, agents: [], system_version }` |
| Bad JSON from gateway | 502 | `{ error, agents: [], system_version }` |
| Next cannot reach gateway | 502 | `{ error: "Failed to connect to gateway", ... }` |
| **`SERVERS_LIST_USE_GRPC=true`** + gRPC failure | **200** | `{ agents: [], system_version: "0.0.0" }` (legacy lenient behavior) |

UI callers that only check `res.ok` (dashboard, monitoring, global search) continue to **skip updates** on failure; inventory and system page surface errors where implemented.

### 8.4 gRPC client (`getAgentServiceClient`)

- **`ENABLE_TLS` + mismatched mTLS env** (only cert or only key): **throws** on first client construction — affects **all** routes using gRPC, not only `/api/servers`.
- Set **both** `TLS_CLIENT_CERT_FILE` and `TLS_CLIENT_KEY_FILE`, or **neither** (server TLS only with optional CA).

### 8.5 Bugfix during revalidation

- **`frontend/src/app/provisions/page.tsx`** — was calling `setAgents(data)` on the full JSON object; fixed to **`setAgents(data.agents || [])`** so the agent dropdown matches the API contract.

### 8.6 Tests

- **Vitest** `frontend/tests/unit/api/servers.test.ts` mocks `getGrpcClient` (not `getAgentServiceClient`) — **stale** relative to the real route; update or remove if you rely on it.
- **Playwright** latency tests use `request.get('/api/servers')` without asserting status; they remain valid if responses are fast (including 401).

---

*Document version: 1.2 — revalidation notes for HTTP list + mTLS.*
