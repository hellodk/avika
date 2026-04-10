# Agent Install Redesign: Frontend-Served Dynamic Install Script

**Status**: Proposed  
**Author**: Architecture discussion, April 2026  
**Supersedes**: Direct `deploy-agent.sh` invocation with manual env vars

---

## Summary

Replace the multi-flag `curl | sudo bash` install command with a single zero-configuration one-liner by serving a **dynamic install script from the Next.js frontend** that bakes in all deployment-specific values at generation time.

### Before

```bash
curl -kfsSL https://ncn112.com/avika/updates/deploy-agent.sh | \
  sudo UPDATE_SERVER=https://ncn112.com/avika/updates \
       GATEWAY_SERVER=ncn112.com:443 \
       INSECURE_CURL=true \
       bash
```

**4 things the user must get right**: outer `-k` flag, `INSECURE_CURL`, `UPDATE_SERVER`, `GATEWAY_SERVER` format and port.

### After

```bash
curl -kfsSL https://ncn112.com/avika/updates/install | sudo bash
```

**0 things the user must get right**. Everything is computed server-side.

---

## Problem Statement

Users consistently hit failures when installing agents because the install command requires multiple environment variables and flags that interact with each other:

| Failure | Root cause |
|---|---|
| `SSL certificate problem: self-signed certificate` on outer curl | Missing `-k` flag |
| Same error inside `deploy-agent.sh` | Missing `INSECURE_CURL=true` |
| Gateway returns 404 for `/avika/updates/...` | Gateway doesn't know about `/avika` basePath — proxy didn't strip it |
| Agent can't connect to gateway | `GATEWAY_SERVER=https://host` instead of `host:port`, or wrong port |

Every one of these is **information the server already knows**. The user shouldn't have to supply it.

---

## Design

### Core Idea

The **frontend** (not the gateway) serves a dynamic bash script at `/updates/install`. The frontend knows its own external URL (from the `Host` header and `NEXT_PUBLIC_BASE_PATH`), and it queries the gateway for deployment-specific details (gRPC address, TLS status). It combines all of this into a self-contained installer.

### Why the frontend, not the gateway?

The gateway sits behind a reverse proxy (HAProxy, nginx, etc.) that rewrites paths. By the time a request reaches the gateway:

- `/avika/updates/install` has been rewritten to `/updates/install` — the basePath `/avika` is lost
- The `Host` header may or may not reflect the external hostname
- The scheme (http vs https) depends on the proxy forwarding `X-Forwarded-Proto`

The frontend, on the other hand:

- **Knows its own external URL** — `Host` header + `NEXT_PUBLIC_BASE_PATH` (set at build time)
- **Knows the scheme** — from `X-Forwarded-Proto` or the request URL
- **Can query the gateway internally** — for gRPC address and TLS info via `GET /api/system/install-info`
- **Requires zero new config fields** — everything is derived from existing values

### Request Flow

```
Target host                         Frontend (Next.js)               Gateway (:5021)
    |                                    |                                |
    |  curl -kfsSL .../install           |                                |
    |-----------------------------------►|                                |
    |                                    |                                |
    |                                    |  GET /api/system/install-info  |
    |                                    |-------------------------------►|
    |                                    |◄-------------------------------|
    |                                    |  { tls_self_signed: true,      |
    |                                    |    grpc_addr: "ncn112.com:443",|
    |                                    |    version: "1.109.6" }        |
    |                                    |                                |
    |◄-----------------------------------|                                |
    |  #!/bin/bash                       |                                |
    |  UPDATE_SERVER=https://ncn112.com/avika/updates                     |
    |  GATEWAY_SERVER=ncn112.com:443     |                                |
    |  INSECURE_CURL=true                |                                |
    |  ...                               |                                |
    |  curl $CURL_OPTS .../deploy-agent.sh | bash                         |
    |                                    |                                |
    |  curl .../deploy-agent.sh          |  (fallback rewrite)            |
    |-----------------------------------►|-------------------------------►|
    |◄-----------------------------------|◄-------------------------------|
    |  (deploy-agent.sh content)         |                                |
    |                                    |                                |
    |  curl .../bin/agent-linux-amd64    |  (fallback rewrite)            |
    |-----------------------------------►|-------------------------------►|
    |◄-----------------------------------|◄-------------------------------|
    |  (~10 MB binary)                   |                                |
```

### Generated Script

The frontend returns a bash script like:

```bash
#!/bin/bash
# Avika Agent installer — auto-generated for ncn112.com
# Generated: 2026-04-10T12:00:00Z
# Gateway version: 1.109.6
set -e

UPDATE_SERVER="https://ncn112.com/avika/updates"
GATEWAY_SERVER="ncn112.com:443"
INSECURE_CURL="true"

export UPDATE_SERVER GATEWAY_SERVER INSECURE_CURL

CURL_OPTS="-fsSL"
[ "$INSECURE_CURL" = "true" ] && CURL_OPTS="-kfsSL"

curl $CURL_OPTS "$UPDATE_SERVER/deploy-agent.sh" | bash
```

All values are baked in. The user's `curl -kfsSL ... | sudo bash` downloads this script, which then downloads and runs `deploy-agent.sh` with the correct environment.

Project/environment assignment is a separate concern — handled after the agent connects, via the Settings UI (Inventory → assign to project/env) or via labels in the agent config file.

---

## How Values Are Computed

| Value | Source | Example |
|---|---|---|
| `UPDATE_SERVER` | `X-Forwarded-Proto` + `Host` header + `NEXT_PUBLIC_BASE_PATH` + `/updates` | `https://ncn112.com/avika/updates` |
| `GATEWAY_SERVER` | Gateway's `GET /api/system/install-info` → `grpc_addr` field. Falls back to `Host:443` if not set. | `ncn112.com:443` |
| `INSECURE_CURL` | Gateway's `GET /api/system/install-info` → `tls_self_signed`. Also `true` if host is loopback. | `true` |

### Why `-k` is always present and safe

The outer `curl -kfsSL` always includes `-k` (skip certificate verification):

- **Valid cert**: `-k` is a no-op. curl connects normally. No security impact.
- **Self-signed cert**: `-k` is required for the download to succeed.

The security concern with `-k` (MitM could inject a malicious script) applies **equally to self-signed setups regardless of `-k`** — the certificate provides no trust chain anyway. The mitigation is using a real certificate, not omitting `-k`.

By always including `-k`, the user never has to make a decision about it. It's invisible.

### Why `INSECURE_CURL` disappears from the user command

Previously, the user had to pass `INSECURE_CURL=true` as an env var so that `deploy-agent.sh`'s internal curl calls also used `-k`. Now:

1. The frontend queries the gateway for `tls_self_signed`
2. If `true`, the generated script sets `INSECURE_CURL="true"` internally
3. `deploy-agent.sh` reads it and uses `-k` for all its downloads

The user never sees or types `INSECURE_CURL`. It's handled server-side.

---

## Proxy Compatibility

### HAProxy (gRPC multiplexed on :443)

```
external port 443 → HAProxy
  /avika/updates/* → strip prefix → gateway :5021 /updates/*
  /nginx.agent.v1.* → gateway :5020 (gRPC)
  /avika/* → frontend :3000
```

Gateway config:
```yaml
server:
  external_grpc_addr: "ncn112.com:443"   # optional, improves accuracy
```

Install info response: `{ "grpc_addr": "ncn112.com:443" }`

Frontend computes: `GATEWAY_SERVER=ncn112.com:443`

### nginx (gRPC on separate :8443)

```
port 443 → nginx
  /avika/updates/* → strip prefix → gateway :5021 /updates/*
  /avika/* → frontend :3000
port 8443 (ssl http2) → gateway :5020 (gRPC)
```

Gateway config:
```yaml
server:
  external_grpc_addr: "ncn112.com:8443"
```

Frontend computes: `GATEWAY_SERVER=ncn112.com:8443`

### No proxy (development)

```
frontend: https://127.0.0.1:3000/avika
gateway: http://localhost:5021 (HTTP), localhost:5020 (gRPC)
```

No `external_grpc_addr` configured. Frontend falls back:
- Host = `127.0.0.1:3000`
- Hostname = `127.0.0.1`
- gRPC port from gateway config = `5020`
- `GATEWAY_SERVER=127.0.0.1:5020`
- `INSECURE_CURL=true` (loopback heuristic)

### K8s Ingress (gRPC on separate subdomain)

```yaml
server:
  external_grpc_addr: "grpc.ncn112.com:443"
```

### Cloudflare / CDN (gRPC bypasses CDN)

```yaml
server:
  external_grpc_addr: "direct.ncn112.com:443"
```

### Fallback behavior when `external_grpc_addr` is not set

The frontend uses `Host` header hostname + port `443`:

```
Host: ncn112.com → GATEWAY_SERVER=ncn112.com:443
Host: 127.0.0.1:3000 → GATEWAY_SERVER=127.0.0.1:5020 (loopback override)
```

This is correct for HAProxy (the most common setup) and dev. Only nginx/K8s/CDN setups where gRPC is on a non-443 port need the config field.

---

## What Changes

### Next.js Frontend

| File | Change |
|---|---|
| `frontend/next.config.ts` | Move `/updates/:path*` rewrite from `beforeFiles` to `fallback` so the new route file takes precedence |
| `frontend/src/app/updates/install/route.ts` | **New** — dynamic install script generator (~60 lines) |
| `frontend/src/components/settings/agent-management.tsx` | Simplify install snippet from multi-line env-var command to single URL |

### Gateway Backend

| File | Change |
|---|---|
| `cmd/gateway/config/config.go` | Add optional `ExternalGRPCAddr string` to Server config |
| `cmd/gateway/handlers_system.go` | Add `grpc_addr` field to `/api/system/install-info` response |

### Deploy Script

| File | Change |
|---|---|
| `scripts/deploy-agent.sh` | Add self-signed cert auto-detection (try without `-k`, retry with `-k` on failure) and `GATEWAY_SERVER` normalization (strip `https://`, add default port) as safety nets |

---

## What the UI Shows

### Settings > General > Agent Management

The install snippet card simplifies to:

```
┌─────────────────────────────────────────────────────────────┐
│  Install Agent                                              │
│                                                             │
│  Run this on any host to enroll it with this gateway:       │
│                                                             │
│  ┌────────────────────────────────────────────────────┐ [⎘] │
│  │ curl -kfsSL https://ncn112.com/avika/updates/     │     │
│  │   install | sudo bash                              │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  [Test Reachability]  ✓ Update server reachable — v1.109.6  │
└─────────────────────────────────────────────────────────────┘
```

No project/env selectors in the install card. No warnings about self-signed certs. No helper text about adjusting `GATEWAY_SERVER`. Everything is handled automatically.

Project/environment assignment happens post-install via Settings → Inventory.

---

## Eliminated Failure Modes

| Previous failure | How it's eliminated |
|---|---|
| Forgot `-k` on outer curl | Always present, always harmless |
| Forgot `INSECURE_CURL=true` | Server detects self-signed → bakes it in |
| Wrong `GATEWAY_SERVER` format (`https://` prefix) | Server generates correct `host:port` format |
| Wrong gRPC port (frontend port vs gRPC port) | Server reads from gateway config (`external_grpc_addr` or internal `grpc_addr`) |
| Forgot `UPDATE_SERVER` | Server computes from its own URL |
| basePath `/avika` not stripped by proxy | Frontend knows its own basePath — no stripping needed |

---

## Safety Net: `deploy-agent.sh` Hardening

Even if someone runs `deploy-agent.sh` directly (bypassing the install endpoint), the script now self-heals:

### Cert auto-detection (top of script)

```bash
if [ "$INSECURE_CURL" != "true" ] && [ -n "$UPDATE_SERVER" ]; then
    if ! curl -fsSL --connect-timeout 5 "$UPDATE_SERVER/version.json" -o /dev/null 2>/dev/null; then
        if curl -kfsSL --connect-timeout 5 "$UPDATE_SERVER/version.json" -o /dev/null 2>/dev/null; then
            INSECURE_CURL="true"
            log_warn "Self-signed certificate detected — switching to insecure mode"
        fi
    fi
fi
```

### GATEWAY_SERVER normalization

```bash
# Strip scheme prefix if present
GATEWAY_SERVER=$(echo "$GATEWAY_SERVER" | sed 's|^https\?://||;s|/$||')
# Add default port if missing
if ! echo "$GATEWAY_SERVER" | grep -qE ':[0-9]+$'; then
    GATEWAY_SERVER="${GATEWAY_SERVER}:443"
fi
```

---

## Migration Path

1. **Backward compatible**: The existing `deploy-agent.sh` + env-var approach continues to work. The new `/updates/install` endpoint is additive.
2. **UI switches immediately**: The Settings page starts showing the new one-liner. Old bookmarked commands still work.
3. **Documentation update**: Agent deployment docs point to the new one-liner.
4. **Future**: Once all users have migrated, the env-var approach can be deprecated (but not removed — it's useful for automation/scripting).

---

## Open Questions

1. **Should `/updates/install` require authentication?** Currently proposed as unauthenticated (like `deploy-agent.sh`). The script doesn't contain secrets — just URLs and config. If enrollment tokens are added later, the token could be a query param.

2. **Should we cache the gateway install-info response?** The frontend calls `GET /api/system/install-info` on every `/updates/install` request. This is a fast endpoint (reads cert from memory, returns config), but caching for ~60s would reduce load under high install concurrency.

3. **Binary proxy through frontend**: The agent binary (~10 MB) is proxied through Next.js via the fallback rewrite. For high-volume deployments (100+ simultaneous installs), consider adding a redirect to the gateway's direct URL instead of proxying. This is a performance optimization, not a correctness issue.
