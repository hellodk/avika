# Agent Install Redesign: Frontend-Served Dynamic Install Script

**Status**: Implemented  
**Branch**: `feature/agent-install-redesign`  
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

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AVIKA DEPLOYMENT                                  │
│                                                                             │
│  ┌──────────┐     ┌─────────────────┐     ┌──────────────┐                 │
│  │  Target   │     │  Reverse Proxy  │     │   Frontend   │                 │
│  │   Host    │     │  nginx/HAProxy  │     │   (Next.js)  │                 │
│  │           │     │                 │     │              │                 │
│  │  curl -k  │────►│ /avika/updates/ │────►│ /updates/    │                 │
│  │  fsSL ... │     │    install      │     │   install/   │                 │
│  │  |sudo    │     │  (exact match   │     │   route.ts   │                 │
│  │   bash    │     │   → frontend)   │     │              │                 │
│  │           │     │                 │     │  Generates   │  ┌───────────┐  │
│  │           │     │                 │     │  bash script │─►│  Gateway   │  │
│  │           │     │                 │     │  with baked  │  │  (:5021)   │  │
│  │           │     │                 │     │  values from │  │            │  │
│  │           │     │                 │     │  install-info│◄─│ /api/system│  │
│  │           │     │                 │     │              │  │ /install-  │  │
│  │           │     │                 │     │              │  │  info      │  │
│  └─────┬─────┘     └─────────────────┘     └──────────────┘  └───────────┘  │
│        │                    │                                                │
│        │ Generated script   │ /avika/updates/*                               │
│        │ runs deploy-       │ (strip prefix                                  │
│        │ agent.sh which     │  → gateway)                                    │
│        │ downloads:         │                                                │
│        │                    │                                                │
│        │  version.json ─────┤────────────────────────────► Gateway /updates/ │
│        │  agent binary  ────┤────────────────────────────► Gateway /updates/ │
│        │  checksums     ────┤────────────────────────────► Gateway /updates/ │
│        │  systemd unit  ────┘────────────────────────────► Gateway /updates/ │
│        │                                                                     │
│        │ After install, agent connects:                                      │
│        │                                                                     │
│        └──── gRPC ──────────────────────────────────────── Gateway (:5020)   │
│              (GATEWAY_SERVER=ncn112.com:443)               via proxy         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design

### Core Idea

The **frontend** (not the gateway) serves a dynamic bash script at `/updates/install`. The frontend knows its own external URL (from the `Host` header and `NEXT_PUBLIC_BASE_PATH`), and it queries the gateway for deployment-specific details (gRPC address, TLS status). It combines all of this into a self-contained installer.

### Why the frontend, not the gateway?

```
                   Reverse Proxy strips /avika prefix
                              │
                              ▼
  Browser/curl ──► /avika/updates/install ──► /updates/install ──► Gateway
                                                                     │
                                                              basePath lost!
                                                              Gateway sees
                                                              /updates/install
                                                              not /avika/...

  vs.

  Browser/curl ──► /avika/updates/install ──► Frontend (exact match)
                                                  │
                                              Frontend KNOWS:
                                              • Host: ncn112.com
                                              • basePath: /avika
                                              • scheme: https
                                              • No config needed!
```

The gateway sits behind a reverse proxy that rewrites paths. By the time a request reaches the gateway:

- `/avika/updates/install` has been rewritten to `/updates/install` — the basePath `/avika` is lost
- The `Host` header may or may not reflect the external hostname
- The scheme (http vs https) depends on the proxy forwarding `X-Forwarded-Proto`

The frontend knows its own URL, scheme, and basePath without any extra configuration.

---

## Install Flow — Step by Step

```
 Target Host                 Reverse Proxy              Frontend              Gateway
     │                      (nginx/HAProxy)             (Next.js)             (:5021)
     │                            │                        │                     │
 ①   │ curl -kfsSL               │                        │                     │
     │ .../avika/updates/install │                        │                     │
     │──────────────────────────►│                        │                     │
     │                            │                        │                     │
 ②   │                            │  exact match:          │                     │
     │                            │  /avika/updates/install│                     │
     │                            │  → frontend            │                     │
     │                            │───────────────────────►│                     │
     │                            │                        │                     │
 ③   │                            │                        │  GET /api/system/   │
     │                            │                        │  install-info       │
     │                            │                        │────────────────────►│
     │                            │                        │                     │
 ④   │                            │                        │◄────────────────────│
     │                            │                        │  {tls_self_signed,  │
     │                            │                        │   grpc_addr,        │
     │                            │                        │   version}          │
     │                            │                        │                     │
 ⑤   │◄───────────────────────────┼────────────────────────│                     │
     │  #!/bin/bash                                        │                     │
     │  UPDATE_SERVER=https://ncn112.com/avika/updates     │                     │
     │  GATEWAY_SERVER=ncn112.com:443                      │                     │
     │  INSECURE_CURL=true                                 │                     │
     │  ... cert auto-detect ...                           │                     │
     │  curl ... deploy-agent.sh | bash                    │                     │
     │                                                     │                     │
 ⑥   │ curl .../deploy-agent.sh  │                        │                     │
     │──────────────────────────►│  /avika/updates/*       │                     │
     │                            │  → strip prefix        │                     │
     │                            │  → gateway             │                     │
     │                            │─────────────────────────────────────────────►│
     │◄──────────────────────────────────────────────────────────────────────────│
     │  (deploy-agent.sh)                                                        │
     │                                                                           │
 ⑦   │ deploy-agent.sh runs:                                                     │
     │   curl .../version.json ──────────────────────────────────────────────────►│
     │   curl .../bin/agent-linux-amd64 ─────────────────────────────────────────►│
     │   curl .../agent-linux-amd64.sha256 ──────────────────────────────────────►│
     │   curl .../avika-agent.service ───────────────────────────────────────────►│
     │                                                                           │
 ⑧   │ Agent installed + started                                                │
     │                                                                           │
 ⑨   │ avika-agent connects via gRPC ───────────────────────────────────────────►│
     │  (GATEWAY_SERVER=ncn112.com:443)                    via proxy :443→:5020  │
     │                                                                           │
```

### Steps explained

| Step | What happens | Where |
|---|---|---|
| ① | User runs the one-liner | Target host terminal |
| ② | Proxy routes `/avika/updates/install` (exact match) to frontend | nginx/HAProxy |
| ③ | Frontend queries gateway for TLS status, gRPC addr, version | Internal K8s network |
| ④ | Gateway returns `{tls_self_signed, grpc_addr, version}` | Gateway |
| ⑤ | Frontend returns generated bash script with all values baked in | Frontend → target host |
| ⑥ | Generated script downloads `deploy-agent.sh` (proxy strips `/avika`, forwards to gateway) | Target host → proxy → gateway |
| ⑦ | `deploy-agent.sh` downloads binary, checksum, systemd unit, verifies, installs | Target host → proxy → gateway |
| ⑧ | Agent binary installed at `/usr/local/bin/avika-agent`, systemd service started | Target host |
| ⑨ | Agent connects to gateway via gRPC (through the same proxy on :443 or separate :8443) | Target host → proxy → gateway |

---

## Value Computation

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Frontend Route Handler                             │
│                    /updates/install/route.ts                          │
│                                                                      │
│  ┌─────────────────────────┐   ┌──────────────────────────────────┐  │
│  │ From incoming request:  │   │ From gateway install-info API:   │  │
│  │                         │   │                                  │  │
│  │ Host header             │   │ tls_self_signed ──► INSECURE_CURL│  │
│  │   └─► hostname          │   │ grpc_addr ────────► GATEWAY_SVR  │  │
│  │                         │   │ version ──────────► comment      │  │
│  │ X-Forwarded-Proto       │   │                                  │  │
│  │   └─► scheme (https)    │   │ (Falls back to defaults if API   │  │
│  │                         │   │  call fails — no auth cookie)    │  │
│  │ NEXT_PUBLIC_BASE_PATH   │   └──────────────────────────────────┘  │
│  │   └─► /avika            │                                         │
│  └─────────┬───────────────┘   ┌──────────────────────────────────┐  │
│            │                   │ Fallback heuristics:             │  │
│            ▼                   │                                  │  │
│  UPDATE_SERVER =               │ Loopback host?                   │  │
│    scheme://host/avika/updates │   └─► INSECURE_CURL=true         │  │
│                                │   └─► GATEWAY_SERVER=host:5020   │  │
│                                │                                  │  │
│                                │ Production host?                 │  │
│                                │   └─► GATEWAY_SERVER=host:443    │  │
│                                └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

| Value | Source | Example |
|---|---|---|
| `UPDATE_SERVER` | `X-Forwarded-Proto` + `Host` header + `NEXT_PUBLIC_BASE_PATH` + `/updates` | `https://ncn112.com/avika/updates` |
| `GATEWAY_SERVER` | Gateway's `GET /api/system/install-info` → `grpc_addr` field. Falls back to `Host:443` if not set. | `ncn112.com:443` |
| `INSECURE_CURL` | Gateway's `GET /api/system/install-info` → `tls_self_signed`. Also `true` if host is loopback. Cert auto-detection in generated script as safety net. | `true` |

---

## Cert Auto-Detection — Three Layers

```
Layer 1: Frontend (generation time)            Layer 2: Generated script         Layer 3: deploy-agent.sh
─────────────────────────────                  ──────────────────────────        ──────────────────────
                                                                                 
Gateway install-info API ──► tls_self_signed?  Script probes version.json:      deploy-agent.sh probes:
  │                                              │                                │
  ├─ Yes → INSECURE_CURL="true"                  ├─ curl -fsSL fails?             ├─ curl -fsSL fails?
  ├─ No  → check loopback                       │   ├─ curl -kfsSL succeeds?     │   ├─ curl -kfsSL ok?
  │         │                                    │   │   └─ INSECURE_CURL=true    │   │   └─ INSECURE_CURL=true
  │         ├─ Loopback → INSECURE_CURL="true"   │   └─ Both fail → exit          │   └─ Both fail → exit
  │         └─ Not loopback → "false"            ├─ curl -fsSL succeeds?          └─ Already "true" → skip
  │                                              │   └─ keep INSECURE_CURL=false
  └─ API call fails (no auth) → "false"         └─ (safety net for when Layer 1
     (Layer 2 catches this)                          couldn't detect)

WHY THREE LAYERS:
• Layer 1 handles the common case (gateway knows its own cert)
• Layer 2 catches self-signed certs when Layer 1 fails (no auth cookie from curl)
• Layer 3 catches edge cases when deploy-agent.sh is run directly (bypassing install endpoint)
```

### Why `-k` is always present and safe

- **Valid cert**: `-k` is a no-op. curl connects normally. No security impact.
- **Self-signed cert**: `-k` is required for the download to succeed.

The security concern with `-k` (MitM could inject a malicious script) applies **equally to self-signed setups regardless of `-k`** — the certificate provides no trust chain anyway. The mitigation is using a real certificate, not omitting `-k`.

---

## Proxy Routing — Decision Tree

```
                        Incoming request: /avika/updates/install
                                        │
                    ┌───────────────────┴───────────────────┐
                    │           Reverse Proxy                │
                    │        (nginx or HAProxy)              │
                    │                                        │
                    │  Is path exactly /avika/updates/install?│
                    │         │                │              │
                    │        YES              NO              │
                    │         │                │              │
                    │         ▼                ▼              │
                    │    ┌─────────┐    ┌────────────┐       │
                    │    │Frontend │    │Path starts  │       │
                    │    │(no path │    │with /avika/ │       │
                    │    │ rewrite)│    │updates/?    │       │
                    │    └─────────┘    │  │       │  │       │
                    │                  YES      NO   │       │
                    │                   │       │    │       │
                    │                   ▼       ▼    │       │
                    │            ┌─────────┐ ┌────┐  │       │
                    │            │Gateway  │ │See │  │       │
                    │            │(strip   │ │other│  │       │
                    │            │/avika/) │ │rules│  │       │
                    │            └─────────┘ └────┘  │       │
                    └────────────────────────────────┘
```

### nginx configuration

```nginx
# Exact match — highest priority in nginx
location = /avika/updates/install {
    proxy_pass http://frontend:443;              # → Next.js route handler
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Prefix match — all other /avika/updates/*
location /avika/updates/ {
    rewrite ^/avika/updates/(.*) /updates/$1 break;
    proxy_pass http://gateway:443;               # → Gateway updates handler
}
```

### HAProxy configuration

```haproxy
acl is_avika_updates  path_beg /avika/updates/
acl is_install_script path     /avika/updates/install

# Mark routes (install overrides updates)
http-request set-var(txn.route) str(install) if is_install_script
http-request set-var(txn.route) str(updates) if is_avika_updates !is_install_script

# Don't rewrite the install path (frontend needs it as-is)
http-request set-path %[path,regsub(^/avika/updates/,/updates/)] if is_avika_updates !is_install_script

# Route install to frontend, updates to gateway
use_backend frontend if { var(txn.route) -m str install }
use_backend gateway  if { var(txn.route) -m str updates }
```

---

## Proxy Compatibility Matrix

```
┌────────────────┬────────────┬────────────┬──────────────────────────────┐
│ Proxy Setup    │ HTTPS Port │ gRPC Port  │ external_grpc_addr needed?   │
├────────────────┼────────────┼────────────┼──────────────────────────────┤
│ HAProxy        │    443     │    443     │ No (default :443 works)      │
│                │            │ (same port,│                              │
│                │            │  path-based│                              │
│                │            │  routing)  │                              │
├────────────────┼────────────┼────────────┼──────────────────────────────┤
│ nginx          │    443     │   8443     │ YES: "host:8443"             │
│                │            │ (separate  │                              │
│                │            │  listener) │                              │
├────────────────┼────────────┼────────────┼──────────────────────────────┤
│ K8s Ingress    │    443     │   443      │ Maybe: "grpc.host:443"       │
│ (gRPC on       │            │ (separate  │ if using separate subdomain  │
│  subdomain)    │            │  subdomain)│                              │
├────────────────┼────────────┼────────────┼──────────────────────────────┤
│ Cloudflare     │    443     │   443      │ YES: "direct.host:443"       │
│ (gRPC bypasses │            │ (bypass    │ (CDN doesn't support gRPC)   │
│  CDN)          │            │  CDN)      │                              │
├────────────────┼────────────┼────────────┼──────────────────────────────┤
│ No proxy (dev) │   3000     │   5020     │ No (loopback auto-detects)   │
│                │ (Next.js)  │ (direct)   │                              │
└────────────────┴────────────┴────────────┴──────────────────────────────┘
```

---

## Helm Chart — Proxy Selection

```
                        values.yaml
                            │
              ┌─────────────┼──────────────┐
              │             │              │
         nginx.enabled  haproxy.enabled   Both false
          = true          = true          (external)
              │             │              │
              ▼             ▼              ▼
        ┌──────────┐  ┌──────────┐   No proxy pods
        │  nginx   │  │ HAProxy  │   deployed. User
        │ ConfigMap│  │ ConfigMap│   manages their
        │ Deploy   │  │ Deploy   │   own proxy with
        │ Service  │  │ Service  │   the documented
        │ (LB)     │  │ (LB)    │   routing rules.
        └──────────┘  └──────────┘
             │             │
             └──────┬──────┘
                    │
              TLS Secret
              (shared, auto-
               generated)
```

### Deploy commands

```bash
# Mode 1: nginx (default)
helm upgrade --install avika deploy/helm/avika -n avika

# Mode 2: HAProxy
helm upgrade --install avika deploy/helm/avika -n avika \
  --set nginx.enabled=false --set haproxy.enabled=true

# Mode 3: External proxy (BYOP — bring your own proxy)
helm upgrade --install avika deploy/helm/avika -n avika \
  --set nginx.enabled=false --set haproxy.enabled=false
```

### External proxy — required routing rules

If using an external proxy (mode 3), configure these rules:

```
RULE                          TARGET      PATH REWRITE           NOTES
────────────────────────────  ──────────  ─────────────────────  ─────────────────────
/avika/updates/install        frontend    none (keep as-is)      Exact match, priority
/avika/api/*                  gateway     strip /avika → /api/*  REST API
/avika/updates/*              gateway     strip /avika → /upd..  Binary downloads
/avika/terminal               gateway     strip /avika           WebSocket upgrade
/nginx.agent.v1.*             gateway     none                   gRPC (h2)
/grpc.health.v1.*             gateway     none                   gRPC health
/avika/*                      frontend    none (keep /avika)     UI (default)
```

Reference configs: `deploy/nginx/nginx.conf`, `deploy/haproxy/haproxy.cfg`

---

## Generated Install Script

```bash
#!/bin/bash
# Avika Agent installer — auto-generated for ncn112.com
# Gateway version: 1.110.0
# Generated: 2026-04-10T12:00:00Z
set -e

UPDATE_SERVER="https://ncn112.com/avika/updates"       # ◄── from Host + basePath
GATEWAY_SERVER="ncn112.com:443"                         # ◄── from install-info API
INSECURE_CURL="false"                                   # ◄── from install-info API

export UPDATE_SERVER GATEWAY_SERVER INSECURE_CURL

# Cert auto-detection (Layer 2 safety net)
if [ "$INSECURE_CURL" != "true" ]; then
    if ! curl -fsSL --connect-timeout 5 "$UPDATE_SERVER/version.json" -o /dev/null 2>/dev/null; then
        if curl -kfsSL --connect-timeout 5 "$UPDATE_SERVER/version.json" -o /dev/null 2>/dev/null; then
            INSECURE_CURL="true"
            export INSECURE_CURL
            echo "[WARN] Self-signed certificate detected — switching to insecure mode"
        fi
    fi
fi

CURL_OPTS="-fsSL"
[ "$INSECURE_CURL" = "true" ] && CURL_OPTS="-kfsSL"

echo "[INFO] Installing Avika Agent..."
echo "[INFO] Update server: $UPDATE_SERVER"
echo "[INFO] Gateway server: $GATEWAY_SERVER"

curl $CURL_OPTS "$UPDATE_SERVER/deploy-agent.sh" | bash
```

---

## deploy-agent.sh Hardening

```
┌─────────────────────────────────────────────────────────┐
│                   deploy-agent.sh                        │
│                                                          │
│  1. Normalize GATEWAY_SERVER                             │
│     ┌─────────────────────────────────────────────┐      │
│     │ Input            │ After normalization       │      │
│     │──────────────────│──────────────────────────│      │
│     │ https://host     │ host:443                 │      │
│     │ http://host:8443 │ host:8443                │      │
│     │ host             │ host:443                 │      │
│     │ host:5020        │ host:5020 (unchanged)    │      │
│     └─────────────────────────────────────────────┘      │
│                                                          │
│  2. Cert auto-detection (Layer 3)                        │
│     curl without -k → fails? → retry with -k → works?   │
│     → set INSECURE_CURL=true                             │
│                                                          │
│  3. TLS detection for agent config                       │
│     INSECURE_CURL=true OR port :443/:8443                │
│     → TLS="true", TLS_INSECURE="$INSECURE_CURL"         │
│                                                          │
│  4. Download + verify + install                          │
│     version.json → binary → sha256 verify → install      │
│     → systemd unit → enable + start                      │
│                                                          │
│  5. Write /etc/avika/avika-agent.conf                    │
│     GATEWAYS, TLS, TLS_INSECURE, UPDATE_SERVER, etc.     │
└─────────────────────────────────────────────────────────┘
```

---

## What the UI Shows

```
┌───────────────────────────────────────────────────────────────┐
│  ◉ Agent Management                                           │
│                                                               │
│  ▸ Install Agent                                              │
│                                                               │
│    Run this on any host to enroll it with this gateway:       │
│                                                               │
│    ┌──────────────────────────────────────────────────┐  [⎘]  │
│    │ curl -kfsSL https://ncn112.com/avika/updates/   │       │
│    │   install | sudo bash                            │       │
│    └──────────────────────────────────────────────────┘       │
│                                                               │
│    [⚡ Test Reachability]  ✓ Update server reachable — v1.110.0│
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│                                                               │
│  ▸ Cleanup                                                    │
│    Remove agents that are currently offline from inventory.    │
│    [🗑 Delete Offline Agents]                                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Eliminated Failure Modes

| Previous failure | How it's eliminated |
|---|---|
| Forgot `-k` on outer curl | Always present, always harmless |
| Forgot `INSECURE_CURL=true` | 3-layer cert auto-detection |
| Wrong `GATEWAY_SERVER` format (`https://` prefix) | Normalization strips scheme, adds default port |
| Wrong gRPC port (frontend port vs gRPC port) | Server reads from gateway config (`external_grpc_addr`) |
| Forgot `UPDATE_SERVER` | Server computes from its own URL |
| basePath `/avika` not stripped by proxy | Frontend knows its own basePath — no stripping needed |

---

## Files Changed

### Frontend

| File | Change |
|---|---|
| `frontend/next.config.ts` | Move `/updates/:path*` rewrite to `fallback` |
| `frontend/src/app/updates/install/route.ts` | **New** — dynamic install script generator |
| `frontend/src/middleware.ts` | Add `/updates/install` to public paths |
| `frontend/src/components/settings/agent-management.tsx` | Simplified to one-liner |

### Gateway

| File | Change |
|---|---|
| `cmd/gateway/config/config.go` | Add `ExternalGRPCAddr` field |
| `cmd/gateway/handlers_system.go` | Add `grpc_addr` to install-info response |

### Deploy Script

| File | Change |
|---|---|
| `scripts/deploy-agent.sh` | Cert auto-detect, GATEWAY_SERVER normalization, TLS bug fixes |

### Helm Chart

| File | Change |
|---|---|
| `deploy/helm/avika/values.yaml` | `nginx.enabled` / `haproxy.enabled` selection + docs |
| `deploy/helm/avika/templates/configmap-nginx.yaml` | Added `/updates/install` → frontend |
| `deploy/helm/avika/templates/configmap-haproxy.yaml` | **New** — HAProxy config template |
| `deploy/helm/avika/templates/deployment-haproxy.yaml` | **New** — HAProxy deployment |
| `deploy/helm/avika/templates/service-haproxy.yaml` | **New** — HAProxy service |
| `deploy/helm/avika/templates/secret-nginx-tls.yaml` | TLS secret for nginx OR haproxy |

### Standalone Configs

| File | Change |
|---|---|
| `deploy/nginx/nginx.conf` | Full rewrite with `/updates/install` route |
| `deploy/haproxy/haproxy.cfg` | Added install route + X-Forwarded-Proto |

---

## Migration Path

1. **Backward compatible**: The existing `deploy-agent.sh` + env-var approach continues to work.
2. **UI switches immediately**: The Settings page shows the new one-liner.
3. **Old commands still work**: `deploy-agent.sh` with manual env vars is not removed.
4. **Future**: Deprecate the env-var approach once all users have migrated.

---

## Open Questions

1. **Should `/updates/install` require authentication?** Currently unauthenticated (like `deploy-agent.sh`). The script doesn't contain secrets — just URLs and config.

2. **Should we cache the gateway install-info response?** Currently fetched on every request. Fast endpoint, but caching for ~60s would reduce load under high install concurrency.

3. **Binary proxy through frontend**: The agent binary (~10 MB) proxies through Next.js via the fallback rewrite. For 100+ simultaneous installs, consider redirecting to the gateway's direct URL.
