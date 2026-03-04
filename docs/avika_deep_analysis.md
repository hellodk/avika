# Avika NGINX Manager — Deep Analysis Report

**Date**: 2026-03-03  
**Analyst Role**: Principal Architect / SRE / Developer / UI-UX Engineer

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Competitive Comparison](#competitive-comparison)
3. [UI/UX Observations](#uiux-observations)
4. [Hardcoded Values & Production Readiness](#hardcoded-values--production-readiness)
5. [TODO Audit](#todo-audit)
6. [Mock Server Provisions](#mock-server-provisions)
7. [Pending Tasks from Previous Agent](#pending-tasks-from-previous-agent)
8. [Git Branch Analysis](#git-branch-analysis)
9. [Prioritized Recommendations](#prioritized-recommendations)

---

## Executive Summary

Avika is a comprehensive NGINX fleet management platform comprising a **Go agent**, **Go gateway**, **Python AI engine**, and **Next.js frontend**, backed by **PostgreSQL** (config/metadata) and **ClickHouse** (analytics/timeseries). The project is at **v1.1.0** with significant feature breadth — but several critical items remain incomplete for production readiness.

> [!IMPORTANT]
> **Key blockers for production**: [UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) not wired into [layout.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx), 5 git branches not pushed, AI Engine disabled, no true mock server, mTLS absent, and several hardcoded fallback URLs in API routes.

---

## Competitive Comparison

### vs. NGINX Instance Manager (F5/NIM)

| Dimension | NIM | Avika | Gap |
|-----------|-----|-------|-----|
| NGINX Plus integration | Native (enhanced metrics, zones, upstreams) | ❌ Missing | **High** — limits enterprise adoption |
| WAF policy management | Built-in (ModSecurity, App Protect) | ❌ Missing | High |
| CVE scanning | Integrated | ❌ Missing | High |
| Config staging workflow | Draft → Review → Deploy pipeline | ❌ Missing | Medium |
| Visual config editor | GUI with drag-and-drop | ❌ Text-only config editing | Medium |
| Multi-tenancy / RBAC | Full team-based RBAC with SAML/LDAP | 🔶 Basic (`is_superadmin` flag only) | **Critical for enterprise** |
| Audit logging | Export to SIEM | ❌ Missing | Medium |
| Agent auto-update | ✅ Both have this | ✅ Implemented | ✅ Parity |
| Provisions / Config push | ✅ Both | ✅ Implemented with templates | ✅ Parity |

### vs. NGINX UI (open-source)

| Dimension | NGINX UI | Avika | Assessment |
|-----------|----------|-------|------------|
| Config file editor | Visual editor with auto-completion | Text-based push via API | Avika weaker |
| Multi-server | Single-instance focus | ✅ Fleet-wide management | **Avika stronger** |
| SSL management | Let's Encrypt integration | Certificate discovery only | NGINX UI stronger |
| Terminal access | ❌ No | ✅ WebSocket terminal | **Avika stronger** |
| AI/ML recommendations | ❌ No | ✅ AI Engine (when enabled) | **Avika stronger** |
| Theming | Basic | ✅ 6 themes (dark, light, solarized, nord, corporate, midnight) | **Avika stronger** |

### vs. GoAccess

| Dimension | GoAccess | Avika | Assessment |
|-----------|----------|-------|------------|
| Real-time log analysis | ✅ Terminal + HTML dashboard | ✅ Browser-based streaming | **Both strong** |
| Log parsing speed | Extremely fast (C-based, single binary) | Go-based, writes to ClickHouse | GoAccess faster for ad-hoc |
| Historical analytics | Limited (in-memory unless piped) | ✅ ClickHouse with 30-day retention | **Avika stronger** |
| GeoIP mapping | Built-in | ✅ Geo page exists | Parity |
| Fleet management | ❌ Single-server | ✅ Multi-server fleet | **Avika stronger** |
| Alerting | ❌ None | ✅ Alert rules with threshold detection | **Avika stronger** |
| Installation complexity | Single binary, zero deps | Helm chart with 5+ services | GoAccess simpler |

### vs. Datadog / New Relic NGINX Monitoring

| Dimension | Datadog/NR | Avika | Gap |
|-----------|-----------|-------|-----|
| APM correlation | Full distributed tracing | 🔶 Traces exist but no APM correlation | High gap |
| Notification integrations | Slack, PagerDuty, OpsGenie, etc. | ❌ Email-only (SMTP not configured) | **Critical** |
| SLO/SLI tracking | Built-in | ❌ Missing | Medium |
| Custom dashboard builder | Drag-and-drop | ❌ Fixed page layouts | Medium |
| PromQL / query language | Full query languages | ❌ No query interface | High |
| Cost | $15+/host/month | Free (self-hosted) | **Avika strongest advantage** |

---

## UI/UX Observations

### ✅ Strengths

1. **Theme system is excellent** — 6 themes (`dark`, `light`, `solarized`, `nord`, `corporate`, `midnight`) with full CSS variable architecture
2. **Navigation structure is logical** — Sidebar with clear grouping (Fleet, Analytics, Operations, Settings)
3. **Toast notifications** via Sonner — well-implemented with success/error/info variants
4. **Loading skeletons** present on most pages (not just spinners)
5. **Responsive grid layouts** in Settings and Dashboard pages
6. **Export capabilities** (CSV/JSON on Inventory, PDF on Reports)

### ⚠️ Issues

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | **Telemetry & AI Settings not state-bound** — `defaultValue="10"`, `defaultValue="0.8"` etc. are not wired to React state, so changes aren't actually saved | **High** | [settings/page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/page.tsx#L477-L540) |
| 2 | **`<select>` elements use raw HTML** instead of the project's `DropdownMenu` component — inconsistent look | Medium | Settings page (time range, refresh, timezone selects) |
| 3 | **No form validation feedback** on Integration URLs — user can save malformed URLs | Medium | Settings page integrations section |
| 4 | **Escaped quote in UI**: `\"Browser\"` renders as `\"Browser\"` instead of `"Browser"` | Low | [settings/page.tsx L460](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/page.tsx#L460) |
| 5 | **No breadcrumb navigation** — deep pages like `/servers/[id]` or `/settings/teams/[id]` lack back-navigation context | Medium | Server detail, team detail pages |
| 6 | **No empty state illustrations** — pages like Alerts show text-only empty states; modern UX favours illustrated empty states | Low | Alerts, Optimization pages |
| 7 | **login page marketing stats still hardcoded** — "10K+ Instances", "99.9% Uptime", "50M RPS" | Medium | [login/page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/login/page.tsx) |
| 8 | **No keyboard shortcuts** — no Cmd+K command palette or keyboard navigation for power users | Low | Global |
| 9 | **Toaster hardcoded to `theme="dark"`** — should respect the active theme | Medium | [layout.tsx L38](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx#L38) |
| 10 | **Settings page is monolithic** — 616-line single file; sub-pages exist (`/settings/integrations`, `/settings/llm`, `/settings/teams`) but the main page duplicates integrations UI | Medium | Settings architecture |

### 🔮 UX Improvements to Match Industry Leaders

1. **Command palette** (Cmd+K) for quick navigation — standard in Vercel, Linear, GitHub
2. **Onboarding wizard** for first-time setup — guide user through gateway URL, first agent connection, Grafana setup
3. **Dashboard customization** — let users pin/unpin KPI cards and reorder widgets
4. **Dark/light mode auto-detection** based on OS `prefers-color-scheme`
5. **Inline documentation / tooltips** on complex fields (anomaly threshold, window size)
6. **Activity timeline/feed** showing recent events across the fleet

---

## Hardcoded Values & Production Readiness

### 🔴 Critical Hardcoded Values

| Value | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| `http://localhost:5050` | 5 API routes (`projects`, `server-assignments`, `sso-config`, `oidc/login`) | **High** — wrong port (gateway uses 5021), breaks in any non-local environment | Centralize to a single `GATEWAY_URL` utility |
| `http://monitoring-grafana.monitoring.svc.cluster.local` | [user-settings.tsx L25](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#L25) | Medium — K8s-only default | Acceptable as default, documented |
| `avika-gateway:50051` | [grpc-client.ts L41](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/grpc-client.ts) (per TODO #6) | **High** — K8s service name as fallback | Default to `localhost:5020` for dev |
| `http://127.0.0.1/nginx_status` | [servers/[id]/page.tsx L52](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/servers/%5Bid%5D/page.tsx#L52) | Low — reasonable default placeholder | Acceptable |
| `server 127.0.0.1:8080` | [provisions.ts L11](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/provisions.ts#L11) | Low — template default | Acceptable |
| `admin/admin` SHA-256 default creds | [functionality-validation.todo L25](file:///home/dk/Documents/git/nginx-manager-cursor/functionality-validation.todo#L25) | **Critical** — if shipped as default | Force password change on first login |
| `collection_interval: 10` | [settings/page.tsx L191](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/page.tsx#L191) | Medium — hardcoded in POST body, not from input | Should read from form state |
| `retention_days: 30`, `anomaly_threshold: 0.8`, `window_size: 200` | [settings/page.tsx L192-194](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/page.tsx#L192-L194) | Medium — same issue as above | Should read from form state |

### 🟡 Production Readiness Gaps

| Area | Status | Detail |
|------|--------|--------|
| **mTLS** | ❌ Missing | Agent-gateway communication is unencrypted gRPC |
| **RBAC** | 🔶 Basic | Only `is_superadmin` flag; no team/project-level permissions enforced |
| **Secret management** | ❌ Manual | No Vault/CyberArk integration (plan exists in docs) |
| **Rate limiting** | ❌ Missing | No rate limiting on gateway APIs |
| **CORS** | Not verified | Gateway HTTP needs CORS headers for cross-origin frontend |
| **Health checks** | ✅ Present | `/health` and `/ready` endpoints operational |
| **Graceful shutdown** | Not verified | Need to confirm Go signal handling |
| **HPA** | ❌ Missing | No Kubernetes HorizontalPodAutoscaler configs |
| **Backup/Restore** | ❌ Missing | No automation for PostgreSQL/ClickHouse backup |
| **Version binary mismatch** | Open | Gateway shows `v0.0.1-dev` instead of `0.1.45` from VERSION file |
| **WebSocket terminal auth** | ⚠️ TODO | Terminal endpoint lacks token-based auth per inline comment |

---

## TODO Audit

### TODOs from [TODO.md](file:///home/dk/Documents/git/nginx-manager-cursor/TODO.md) (13 items)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | ClickHouse TTL Schema Fix | ✅ Fixed | `toDateTime()` conversion applied |
| 2 | ClickHouse Auth (K8s) | ✅ Working | Transient issue resolved |
| 3 | Gateway Config Legacy Port Precedence | ⚠️ **Still Open** | Legacy [port](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go#86-119)/`ws_port` take precedence |
| 4 | AI Engine / Recommendations | ⚠️ **Parked** | `replicaCount: 0`, optimization page shows nothing |
| 5 | Graceful Kafka Connection Handling | ⚠️ **Still Open** | Error logs every 15s when Kafka unavailable |
| 6 | Frontend Default Gateway Address | ⚠️ **Still Open** | Defaults to K8s service name |
| 7 | Database Fallback Logging | ⚠️ **Still Open** | "Trying fallback..." message unhelpful |
| 8 | Root gateway.yaml Cleanup | ⚠️ **Still Open** | Outdated ports 50051/50053 |
| 9 | Agent Binary Version Mismatch | ⚠️ **Still Open** | Shows `v0.0.1-dev` |
| 10 | test_grpc.go Hardcoded Values | ⚠️ **Still Open** | Port/method hardcoded |
| 10b | AlertRule UUID Validation | ✅ Fixed | Auto-generate UUID if invalid |
| 11 | Stale Frontend Unit Tests | ✅ Fixed | |
| 12 | Stale E2E Tests | ✅ Fixed | |
| 13 | Integration Test DB Credential Mismatch | ⚠️ **Still Open** | 17 tests fail without TEST_DSN |

**Summary**: **5 of 13 items fixed**, **8 still open** (3 medium priority, 1 high/parked, 4 low).

### In-Code TODOs Found

| File | Line | TODO |
|------|------|------|
| [main.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/gateway/main.go#L724) | 724 | `LatencyTrend: []*pb.LatencyPercentiles{}, // Todo` — latency trend data not implemented |
| [main.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/gateway/main.go#L1360) | 1360 | `/terminal` — WebSocket terminal needs token-based auth |
| [alerts.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/gateway/alerts.go#L118) | 118 | `// Todo: Handle Webhooks` — webhook notification dispatch not implemented |

### TODOs from [LIMITATIONS.md](file:///home/dk/Documents/git/nginx-manager-cursor/docs/LIMITATIONS.md) (40+ items)

The project has an extensive [LIMITATIONS.md](file:///home/dk/Documents/git/nginx-manager-cursor/docs/LIMITATIONS.md) with 40+ tracked gaps against commercial competitors. These are documented but **none have been addressed** yet. Key high-priority items from that list:

- **NIM-005**: Enhanced RBAC with LDAP/SAML
- **OBS-005**: Notification integrations (Slack, PagerDuty)
- **PRM-001**: PromQL query support
- **SEC-001**: mTLS for agent-gateway
- **AMP-004**: Multi-tenant support

---

## Mock Server Provisions

> [!WARNING]
> **No true mock server exists.** The project has a **load simulator** ([cmd/simulator/main.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go)), which generates synthetic gRPC traffic (heartbeats, logs, metrics) to the gateway — but this is a **load testing tool**, not a mock server for frontend development/testing.

### Current State

| Tool | Purpose | Limitation |
|------|---------|------------|
| [cmd/simulator/main.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go) | Load testing (50 virtual agents, 50K RPS target) | Not a mock — requires running gateway |
| [frontend/src/app/api/analytics/route.ts](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/api/analytics/route.ts) | Returns empty/mock data on API error | Error fallback only, not a designed mock mode |
| [frontend/src/app/provisions/test/page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/provisions/test/page.tsx) | Mock instance ID for testing | Single page only |
| [frontend/src/app/settings/llm/page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/llm/page.tsx) | "Mock" LLM provider option | UI dropdown option |

### What's Needed for Production-Ready Mock Server

1. **Standalone mock gateway** — a lightweight Go binary or Node.js server that serves realistic responses for all API endpoints
2. **Mock data fixtures** — JSON fixtures for agents, analytics, alerts, traces representing various states (healthy fleet, degraded, incident)
3. **MSW (Mock Service Worker)** integration for frontend unit/E2E tests
4. **Docker Compose `mock` profile** — `docker compose --profile mock up` to spin up frontend + mock gateway without real infra

---

## Pending Tasks from Previous Agent

### Task 1: Grafana URL Settings Refactor

**Status**: 🔶 **Partially Complete**

| Sub-task | Status | Detail |
|----------|--------|--------|
| [UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) created | ✅ Done | [user-settings.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx) — full provider with localStorage persistence |
| Settings page uses [useUserSettings](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#143-148) | ✅ Done | [settings/page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/settings/page.tsx) imports and uses the hook |
| `getGrafanaBaseUrl()` priority chain | ✅ Done | User setting → `NEXT_PUBLIC_GRAFANA_URL` → default FQDN |
| **[UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) wired into [layout.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx)** | ❌ **NOT DONE** | [layout.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx) wraps `ThemeProvider > AuthProvider > ProjectProvider` but **[UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) is missing** |
| Grafana dashboard page updated | ❌ Not verified | Need to check if `/observability` or `/analytics` uses `getGrafanaBaseUrl` |

> [!CAUTION]
> Without [UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) in [layout.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx), the [useUserSettings()](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#143-148) hook will throw `"useUserSettings must be used within UserSettingsProvider"` error on any page that calls it.

### Task 2: Agent Grouping & Drift Detection

**Status**: ✅ **Merged into master** (PR #23)

- Branch `feature/agent-grouping-drift-detection` is merged
- Commit `ede22cc`: "feat: Add agent grouping, drift detection, and maintenance management"
- Features: Agent grouping, golden agent designation, drift detection, maintenance page templates, scheduling, bypass rules

### Task 3: Merge/Push Status

**Status**: Working tree changes NOT merged. See Branch Analysis below.

### Task 4: Branch Analysis

See next section.

---

## Git Branch Analysis

### Branch Push & Merge Status

| Branch | Last Commit | Pushed to Remote | Merged to Master | Action Needed |
|--------|-------------|:----------------:|:----------------:|---------------|
| `feat/remote-config-mgmt` | 2026-03-03 | ❌ **NOT pushed** | Same as master (0 commits ahead) | Branch created but no unique work — clean up or push WIP |
| `feature/grafana-embed` | 2026-02-27 | ❌ **NOT pushed** | 2 commits ahead | **Push or merge** — contains Grafana embed work |
| `fix/geo-page-ux-improvements` | 2026-02-28 | ❌ **NOT pushed** | 0 ahead (merged) | Remote deleted (`[gone]`) — delete local branch |
| `fix/remove-hardcoded-credentials` | 2026-02-28 | ❌ **NOT pushed** | 0 ahead (merged) | Remote deleted (`[gone]`) — delete local branch |
| `ci/github-actions-workflows` | 2026-02-28 | ❌ **NOT pushed** | 1 commit ahead | **Push or merge** — contains CI workflow changes |
| [main](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go#34-85) | 2026-02-17 | ✅ Pushed | 8 commits ahead | Legacy [main](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go#34-85) branch — needs reconciliation with `master` |
| `fix/release-workflow-permissions` | 2026-02-28 | ✅ Pushed | 1 commit ahead | Pushed but **not merged** — review and merge |
| `fix/geo-map-json-access` | 2026-02-28 | ✅ Pushed | 0 ahead | Merged — can delete |

### Working Tree Status (on `feat/remote-config-mgmt`)

- **34 modified files** — includes proto changes, gateway handlers, frontend settings, tests
- **29 untracked files** — new proto files, config service, integrations handlers, test helpers
- **881 insertions, 273 deletions** vs master

> [!IMPORTANT]
> The working tree contains substantial uncommitted work including remote config management, LLM config handlers, and updated E2E test infrastructure. This should be committed and pushed before any further development.

### Recommended Cleanup Actions

1. **Commit and push** `feat/remote-config-mgmt` working tree changes
2. **Delete** stale local branches: `fix/geo-page-ux-improvements`, `fix/remove-hardcoded-credentials`, `2026-02-14-uxj4`
3. **Push or merge** `feature/grafana-embed` and `ci/github-actions-workflows`
4. **Reconcile** [main](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go#34-85) vs `master` (8 commits divergence)
5. **Review and merge** `fix/release-workflow-permissions`

---

## Prioritized Recommendations

### 🔴 P0 — Do Now (Blocks Development/Deployment)

1. **Wire [UserSettingsProvider](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#84-142) into [layout.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/layout.tsx)** — Will crash any page using [useUserSettings()](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/lib/user-settings.tsx#143-148)
2. **Commit and push working tree changes** — 34 modified + 29 untracked files at risk
3. **Fix `http://localhost:5050` fallback** in 5 API routes — wrong port, breaks in K8s
4. **Bind Telemetry/AI Engine Settings inputs to state** — currently cosmetic-only, changes aren't saved

### 🟡 P1 — Production Readiness

5. **Implement mTLS** for agent-gateway communication
6. **Add notification integrations** (Slack webhook, PagerDuty) — critical operational gap
7. **Create a standalone mock server** for frontend dev/testing without full infra
8. **Fix gateway binary version** — use proper ldflags during build
9. **Add WebSocket terminal token-based auth** — security concern
10. **Enable the AI Engine** or implement rule-based recommendations as interim

### 🟢 P2 — Quality & UX Polish

11. **Unify select components** — replace raw `<select>` with `DropdownMenu`
12. **Fix Toaster theme** — respect active theme instead of hardcoded `"dark"`
13. **Add breadcrumb navigation** to deep pages
14. **Clean up root [gateway.yaml](file:///home/dk/Documents/git/nginx-manager-cursor/gateway.yaml)** — outdated ports
15. **Implement webhook notification dispatch** (in-code TODO in [alerts.go](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/gateway/alerts.go))
16. **Remove legacy marketing stats from login page** or make them dynamic
17. **Reconcile [main](file:///home/dk/Documents/git/nginx-manager-cursor/cmd/simulator/main.go#34-85) vs `master` branches** and clean up stale branches

---

*Generated by deep analysis of the Avika/nginx-manager-cursor codebase on 2026-03-03.*
