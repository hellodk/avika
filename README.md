# Avika — AI-Powered NGINX Fleet Manager

> **Version `1.109.6`** · Production-Grade NGINX Management with AI-Driven Observability

Avika is a full-stack, Kubernetes-native platform for centrally managing, monitoring, and analysing large fleets of NGINX instances. Agents run alongside each NGINX process and stream telemetry to a central Gateway over mTLS-secured gRPC. A Next.js UI and an AI Engine built on Python/Bytewax make sense of the data in real time.

---

## Table of Contents

- [Architecture](#architecture)
- [Key Features](#key-features)
- [Screenshots & Dashboards](#screenshots--dashboards)
- [Load Test Results](#load-test-results)
- [Getting Started](#getting-started)
  - [Kubernetes (Helm)](#kubernetes-helm)
  - [Docker Compose (Dev)](#docker-compose-dev)
- [Agent Deployment](#agent-deployment)
- [Security](#security)
- [Development](#development)
- [Testing](#testing)
- [Scaling](#scaling)
- [Roadmap](#roadmap)

---

## Architecture

Avika is built as a distributed, event-driven system. Four purpose-built components interact over gRPC and REST:

```
NGINX Fleet
    │  logs + metrics (tail/scrape)
    ▼
Agent (Go) ──── persistent bidirectional gRPC stream ────► Gateway (Go)
                                                                │
                                              ┌─────────────────┤
                                              │                 │
                                        ClickHouse        PostgreSQL
                                        (TSDB / OLAP)     (metadata)
                                              │
                                         AI Engine
                                      (Python/Bytewax)
                                              │
                                         Frontend
                                          (Next.js)
```

### Components

| Component | Language | Role |
|-----------|----------|------|
| **Agent** | Go | Runs on every NGINX host. Scrapes `stub_status`, tails access/error logs, manages config & certs. Self-updates via SHA-256-verified binary swap. |
| **Gateway** | Go | Central orchestrator. Manages agent sessions, batch-inserts telemetry into ClickHouse, exposes REST + gRPC for the UI. |
| **AI Engine** | Python / Bytewax | Consumes telemetry, runs anomaly detection (Z-score / IQR), builds Root Cause Analysis (RCA) dependency graphs. |
| **Frontend** | Next.js + Tailwind | Fleet dashboard, real-time log streaming, analytics charts, alert management, distributed traces, and a browser-based PTY terminal. |

### Why ClickHouse as a TSDB?

| | ClickHouse | Traditional TSDB |
|--|-----------|-----------------|
| **Ingestion** | Millions of rows/sec via async inserts | Thousands of samples/sec |
| **High cardinality** | No performance penalty on many unique labels | Degrades |
| **Complex queries** | Full SQL — window functions, P99, GROUP BY | Limited PromQL |
| **Storage** | Columnar + LZ4 compression | Specialized formats |

**Retention policies:**

| Table | Data | Retention |
|-------|------|-----------|
| `access_logs` | Status codes, latency, bytes, IP, URI | 7 days |
| `system_metrics` | CPU, Memory, Network RX/TX | 30 days |
| `nginx_metrics` | Active connections, requests/sec | 30 days |
| `gateway_metrics` | Gateway-level telemetry | 30 days |
| `spans` | Distributed trace spans | 7 days |

Deep dive → [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## Key Features

### Fleet Management
- **Inventory** — Live table of all connected agents with status, hostname, IP, NGINX version, and uptime
- **PSK Authentication** — HMAC-SHA256 pre-shared key prevents unauthorised agents from connecting
- **Agent Grouping & Drift Detection** — Compare running config against expected baseline; detect configuration drift across the fleet
- **Config Push via Templates** — Provision NGINX config snippets to one or many hosts simultaneously
- **Rollback** — Automatic config backup with one-click rollback on failure

### Real-Time Observability
- **Live Log Streaming** — Tail access and error logs from any agent directly in the browser over gRPC/SSE
- **Browser PTY Terminal** — Full xterm.js shell inside every NGINX pod via authenticated WebSocket

```
┌─────────────────────────────────────────────────────────────┐
│ ● ● ●  Terminal: nginx-558d8775ff-cwck5             [X]    │
├─────────────────────────────────────────────────────────────┤
│ root@nginx-558d8775ff-cwck5:/# nginx -v                     │
│ nginx version: nginx/1.28.2                                 │
│                                                             │
│ root@nginx-558d8775ff-cwck5:/# whoami                       │
│ root                                                        │
└─────────────────────────────────────────────────────────────┘
✅ WebSocket Connection  ✅ Auth  ✅ Shell  ✅ Command Exec
```

Verified proof: [`TERMINAL_PROOF.txt`](./TERMINAL_PROOF.txt)

### AI-Powered Diagnostics
- **Anomaly Detection** — Automatic deviation analysis on request rates and error counts
- **Root Cause Analysis (RCA)** — Correlated log/metric causality graphs
- **AI Tuner** — Recommendations surfaced directly in the dashboard

### Analytics & Monitoring
- **Grafana Dashboards** — Pre-built panels for NGINX Manager overview, latency analysis, and error analysis (see `docs/images/`)
- **GeoIP Mapping** — Visualise visitor traffic by geography
- **Distributed Traces** — OpenTelemetry spans with drill-down view
- **Export** — CSV, JSON, and PDF report generation

### Production Hardening
- **mTLS** — Mutual TLS enforced between Gateway and agents
- **HPA & PDB** — Kubernetes Horizontal Pod Autoscaler + Pod Disruption Budgets on all core components
- **Liveness & Readiness Probes** — All services
- **Graceful Shutdown** — Signal handling in all Go services
- **WAL Buffer** — Agent-side write-ahead log prevents data loss during Gateway outages
- **Audit Logging** / **WAF Policy** / **CVE Scanning** — Commercial NGINX parity features

### Theming & UX
- 6 polished themes (dark default, plus 5 alternates) via CSS variable architecture
- Loading skeletons, breadcrumb navigation, Sonner toast notifications
- Responsive grid layout across all 11+ pages

---

## Screenshots & Dashboards

### Grafana — NGINX Manager Overview

![Grafana NGINX Manager Dashboard](./docs/images/grafana-nginx-manager-dashboard.png)

Overview panel showing active connections, requests/sec, and fleet health across all agents.

### Grafana — Latency Analysis

![Grafana Latency Analysis](./docs/images/grafana-latency-analysis-dashboard.png)

P50/P95/P99 latency breakdown across the NGINX fleet with time-range selection.

### Grafana — Error Analysis

![Grafana Error Analysis](./docs/images/grafana-error-analysis-dashboard.png)

5xx / 4xx error rate analysis with per-agent drill-down and threshold overlays.

> **Note:** All three Grafana dashboards are available as JSON in [`docs/GRAFANA_DASHBOARDS.md`](./docs/GRAFANA_DASHBOARDS.md). An interactive impress.js presentation of the full system is in [`docs/presentation/index.html`](./docs/presentation/index.html).

---

## Load Test Results

All raw logs, resource metrics CSVs, and per-run reports live in [`load_test_results/`](./load_test_results/) (21 recorded runs).

### Gateway Throughput Benchmark — 100 Agents, 50 k RPS (5 min)

Tested on: **12th Gen Intel Core i7-12700H · 20 cores · 62 GB RAM · Go 1.25**

| Metric | Result |
|--------|--------|
| **Target RPS** | 50,000 |
| **Achieved Avg RPS** | **49,060** |
| **Peak RPS** | ~49,993 |
| **Duration** | 5 minutes |
| **Total Messages** | **14,718,139** |
| **Total Errors** | 2 (0 impactful) |
| **Success Rate** | **100.00%** |
| **Avg Latency** | **40.9 µs** |
| **System CPU (post-test)** | 4.8% |

<details>
<summary>📋 Click to expand — live tail sample from this run</summary>

```
[LIVE] Sent: 1,245,200  | Errors: 0 | RPS: 49,705 | Avg Latency: 8.47µs
[LIVE] Sent: 3,975,883  | Errors: 0 | RPS: 49,737 | Avg Latency: 14.53µs
[LIVE] Sent: 7,924,284  | Errors: 0 | RPS: 49,941 | Avg Latency: 22.30µs
[LIVE] Sent: 10,870,093 | Errors: 0 | RPS: 49,902 | Avg Latency: 26.71µs
[LIVE] Sent: 14,218,415 | Errors: 0 | RPS: 49,322 | Avg Latency: 41.53µs
```

Full log: [`load_test_results/lt_50k_100agents_20260312_200021/load_test.log`](./load_test_results/lt_50k_100agents_20260312_200021/load_test.log)
</details>

### Earlier Run — 100 Agents, ~50 k RPS (2 min)

| Metric | Result |
|--------|--------|
| **Avg RPS** | **49,866** |
| **Total Messages** | 5,984,089 |
| **Errors** | 0 |
| **Avg Latency** | **6.69 µs** |

### TLS-Secured Run — 25 Agents, 1,500 RPS (10 min sustained)

| Metric | Result |
|--------|--------|
| **Avg RPS** | 1,500 (exact target) |
| **Total Messages** | ~900,000+ |
| **Errors** | 0 |
| **Avg Latency** | **~12–15 µs** |
| **TLS** | ✅ Mutual TLS with CA verification |

<details>
<summary>📋 Click to expand — TLS run sample (latency improving under warm connections)</summary>

```
[LIVE] Sent:  7,499 | Errors: 0 | RPS: 1,500 | Avg Latency: 14.76µs
[LIVE] Sent: 75,100 | Errors: 0 | RPS: 1,500 | Avg Latency: 13.73µs
[LIVE] Sent:195,299 | Errors: 0 | RPS: 1,500 | Avg Latency: 12.59µs
[LIVE] Sent:315,500 | Errors: 0 | RPS: 1,500 | Avg Latency: 11.90µs
```

Full log: [`load_test_results/lt_20260405_004403/load_test.log`](./load_test_results/lt_20260405_004403/load_test.log)
</details>

### k6 API Benchmark

HTTP API benchmarks using k6 are in [`tests/performance/k6/`](./tests/performance/k6/) with recorded results in [`tests/performance/results/`](./tests/performance/results/).

Scripts available:
- `load-test.js` — Sustained ramp-up load test
- `stress-test.js` — Beyond-capacity stress test
- `spike-test.js` — Sudden traffic spike simulation
- `api-benchmark.js` — REST API endpoint benchmarking

---

## Getting Started

### Kubernetes (Helm)

```bash
# Deploy the complete Avika stack
make deploy

# Or explicitly
helm upgrade --install avika deploy/helm/avika \
  -f deploy/helm/avika/values.yaml \
  -n avika --create-namespace
```

> See **[deploy/helm/avika/README.md](deploy/helm/avika/README.md)** for why image tags are not overridden via `--set` and how to pin a version.

**Enable authentication:**

```bash
# Generate password hash
HASH=$(echo -n "your-secure-password" | sha256sum | cut -d' ' -f1)

helm upgrade --install avika deploy/helm/avika \
  --set auth.enabled=true \
  --set auth.username=admin \
  --set auth.passwordHash=$HASH \
  -n avika
```

**Custom base path** (e.g. `https://yourdomain.com/avika`):

```yaml
# values.yaml
frontend:
  basePath: "/avika"
```

### Docker Compose (Dev)

```bash
cd deploy/docker
docker-compose up -d
```

For port mappings and external component configuration → [deploy/docker/README.md](./deploy/docker/README.md)

---

## Agent Deployment

### One-liner Install (any VM/bare-metal host)

The Gateway serves agent binaries and a self-installing deploy script — no manual binary download needed:

```bash
curl -fsSL http://<GATEWAY_IP>:5021/updates/deploy-agent.sh | \
  sudo UPDATE_SERVER="http://<GATEWAY_IP>:5021/updates" \
       GATEWAY_SERVER="<GATEWAY_IP>:5020" bash
```

**Kubernetes ClusterIP example:**

```bash
curl -fsSL http://10.106.98.165:5021/updates/deploy-agent.sh | \
  sudo UPDATE_SERVER="http://10.106.98.165:5021/updates" \
       GATEWAY_SERVER="10.106.98.165:5020" bash
```

### What the installer does

1. Detects system architecture (`amd64` / `arm64`)
2. Downloads the agent binary with **SHA-256 checksum verification**
3. Installs to `/usr/local/bin/avika-agent`
4. Writes config to `/etc/avika/avika-agent.conf`
5. Creates and enables a **systemd service**
6. Starts the agent

### Agent Management

```bash
sudo systemctl status avika-agent   # Check status
sudo journalctl -u avika-agent -f   # Stream logs
sudo systemctl restart avika-agent  # Restart
```

### Agent Self-Update

The agent checks for a new version manifest on the Gateway at a configurable interval and performs an **atomic binary swap** with SHA-256 verification — no human intervention required.

Full details → [docs/AGENT_DEPLOYMENT.md](./docs/AGENT_DEPLOYMENT.md) · [docs/AGENT_UPDATES.md](./docs/AGENT_UPDATES.md)

---

## Security

Avika implements a **three-layer security model**:

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Layer 1    │   │   Layer 2    │   │   Layer 3    │
│  User Auth   │   │  Agent PSK   │   │  Transport   │
│              │   │              │   │    (TLS)     │
│  Login       │   │  HMAC-SHA256 │   │              │
│  Sessions    │   │  Timestamp   │   │  gRPC TLS    │
│  Pass Change │   │  Validation  │   │  HTTPS       │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Layer 1 — User Authentication
- **First-login flow** (Jenkins-style): if no password hash is configured, a random 32-byte password is auto-generated and printed to Gateway logs — system forces an immediate password change on first login
- JWT session tokens stored as HTTP-only secure cookies
- Configurable token expiry (default: 24 h)
- Routes protected: all except `/login`, `/health`, `/ready`, `/metrics`

### Layer 2 — Agent PSK (Pre-Shared Key)
- Agents sign each gRPC request with `HMAC-SHA256(PSK, agent_id:hostname:timestamp)`
- Gateway validates signature and rejects timestamps older than 5 minutes (replay protection)
- Two enrolment modes: **auto-enrol** (new agents accepted on first valid PSK) or **manual approval**
- PSK authentication status visible per-agent in the Inventory UI (🛡️ / ⚠️)

```bash
# Generate and deploy a PSK
PSK=$(openssl rand -hex 32)
helm upgrade avika ./deploy/helm/avika \
  --set psk.enabled=true \
  --set psk.key=$PSK
```

### Layer 3 — Transport (mTLS / TLS)
- Agent ↔ Gateway: gRPC over mutual TLS
- Browser ↔ Frontend: HTTPS via Ingress TLS termination

Full security architecture → [docs/SECURITY_ARCHITECTURE.md](./docs/SECURITY_ARCHITECTURE.md)

---

## Development

### Prerequisites

- Go 1.21+
- Node.js 20+
- Docker / Kubernetes
- `protoc` with Go gRPC plugins

### Project Layout

```
.
├── api/proto/          # Protobuf definitions (agent.proto, agent_config.proto)
├── cmd/
│   ├── agent/          # Agent binary entrypoint
│   └── gateway/        # Gateway binary entrypoint
│       └── middleware/  # Auth, PSK, rate-limiting middleware
├── internal/           # Shared internal packages
├── frontend/           # Next.js UI
│   ├── src/app/        # Page routes
│   ├── src/components/ # Reusable components
│   └── tests/e2e/      # Playwright E2E tests
├── deploy/
│   ├── helm/avika/     # Helm chart
│   ├── docker/         # Docker Compose stack
│   └── haproxy/        # HAProxy ingress config
├── tests/
│   ├── performance/k6/ # k6 load & stress scripts
│   ├── security/       # Auth & header security tests
│   └── integration/    # Gateway integration tests
├── load_test_results/  # 21 recorded benchmark runs
└── docs/               # Full documentation library
```

### Running Locally

```bash
# Gateway
go build -o gateway ./cmd/gateway && ./gateway

# Agent
go build -o agent ./cmd/agent && ./agent

# Frontend
cd frontend && npm install && npm run dev
```

### Integration Tests (Gateway)

Gateway integration tests require PostgreSQL:

```bash
make setup-test-db       # Start Postgres (admin/testpassword, avika_test)
make test-integration    # Run all integration tests
make teardown-test-db    # Cleanup

# Custom DSN
DB_DSN="postgres://user:pass@host:5432/db?sslmode=disable" make test-integration
```

---

## Testing

### Test Suite Overview

| Suite | Status | Coverage |
|-------|--------|----------|
| Frontend Unit Tests | ✅ PASS | 150 / 150 |
| E2E Auth Tests | ✅ PASS | 26 / 26 |
| Gateway Build | ✅ PASS | — |
| Agent–Gateway Communication | ✅ Working | — |
| Metrics Pipeline | ✅ Working | — |
| Analytics API | ✅ Working | — |

### E2E Coverage (Playwright)

| Page | Coverage | Spec |
|------|----------|------|
| Dashboard | ✅ High | `dashboard.spec.ts` |
| Monitoring | ✅ High | `monitoring.spec.ts` |
| Visitors / Search | ✅ High | `visitor-and-search.spec.ts` |
| Drift Detection | ✅ High | `drift.spec.ts` |
| Inventory | ⚠️ Medium | `inventory.spec.ts` |
| Reports | ⚠️ Medium | `authenticated-pages.spec.ts` |
| Alerts | ⚠️ Low | `alerts.spec.ts` |
| Analytics | ⚠️ Low | `analytics.spec.ts` |
| Provisions | ⚠️ Low | `provisions.spec.ts` |
| Settings | ⚠️ Low | `settings.spec.ts` |

Full E2E coverage report → [docs/total_e2e_coverage_report.md](./docs/total_e2e_coverage_report.md)

### Running Tests

```bash
# All tests
./tests/run-all-tests.sh

# Frontend unit tests
cd frontend && npm test

# E2E tests (Playwright)
cd frontend && npx playwright test

# k6 performance tests
k6 run tests/performance/k6/load-test.js
k6 run tests/performance/k6/stress-test.js
k6 run tests/performance/k6/spike-test.js

# Security tests
bash tests/security/auth-tests.sh
```

Historical test reports are archived under [`tests/reports/`](./tests/reports/).

---

## Scaling

### Scaling Profiles

| Profile | Agents | Target RPS | Gateway Replicas | ClickHouse RAM |
|---------|--------|-----------|-----------------|----------------|
| Default | 1–10 | 1 k | 1 | 2 Gi |
| Medium | 10–50 | 10 k | 2 | 4 Gi |
| Large | 50–100 | 50 k | 3 | 8 Gi |
| **Enterprise** | **100+** | **100 k+** | **5+** | **16 Gi+** |

```bash
# Enterprise deploy
helm install avika ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/enterprise.yaml \
  --namespace avika-prod
```

### Key Prometheus Metrics

| Metric | What it tracks |
|--------|---------------|
| `nginx_gateway_agents_total{status="online"}` | Connected agent count |
| `nginx_gateway_messages_total` | Message throughput |
| `nginx_gateway_goroutines` | Goroutine count (leak detection) |
| `nginx_gateway_memory_alloc_bytes` | Gateway heap usage |
| `ClickHouseMetrics_InsertedRows` | ClickHouse insert rate |

Full guide → [docs/SCALING_GUIDE.md](./docs/SCALING_GUIDE.md)

---

## Roadmap

| Priority | Item |
|----------|------|
| 🔴 High | Agent labelling & multi-tenancy |
| 🔴 High | Rolling agent fleet updates with version pinning |
| 🟡 Medium | Web terminal session persistence |
| 🟡 Medium | Geo-analytics map drill-downs (MaxMind) |
| 🟢 Future | Grafana deep-linking & native panel embedding |
| 🟢 Future | Full PromQL integration |

Full roadmap → [docs/ROADMAP.md](./docs/ROADMAP.md)

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, data flow, auth config |
| [SECURITY_ARCHITECTURE.md](./docs/SECURITY_ARCHITECTURE.md) | PSK, mTLS, user auth in depth |
| [SCALING_GUIDE.md](./docs/SCALING_GUIDE.md) | Capacity planning, enterprise profile |
| [AGENT_DEPLOYMENT.md](./docs/AGENT_DEPLOYMENT.md) | Agent install, config, management |
| [AGENT_UPDATES.md](./docs/AGENT_UPDATES.md) | Self-update architecture |
| [TESTING.md](./docs/TESTING.md) | Full test strategy |
| [FEATURE_STATUS.md](./docs/FEATURE_STATUS.md) | Implemented vs pending feature matrix |
| [MONITORING_GUIDE.md](./docs/MONITORING_GUIDE.md) | Prometheus alerts & Grafana setup |
| [PRODUCTION_DEPLOYMENT.md](./docs/PRODUCTION_DEPLOYMENT.md) | Production checklist |
| [QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) | Command cheat-sheet |
| [ROADMAP.md](./docs/ROADMAP.md) | Planned features & technical debt |

---

*Avika is built and maintained by the platform engineering team. Issues and contributions welcome.*
