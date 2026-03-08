# Proposal: Complete Observability and Telemetry for Avika

**Goal:** Full observability of the Avika application itself (gateway, frontend, and supporting services) using and enhancing the existing **kube-prometheus-stack**.  
**Audience:** Avika dev team (application changes) and **Monitoring team** (stack configuration).

---

## 1. Current State Summary

| Component    | Health / Ready           | Metrics (Prometheus)                    | Notes |
|-------------|---------------------------|-----------------------------------------|-------|
| **Gateway** | `/health`, `/ready` on 5021 | `/metrics` on **same HTTP server (5021)** | Custom Prometheus text format: agents, messages, DB ops, goroutines, memory, GC. Pod annotations: `prometheus.io/scrape`, `prometheus.io/port: "5022"` (chart); **actual metrics are on 5021** unless a dedicated metrics server is added. |
| **Frontend**| `/avika/api/health` on 5031 | **None**                                | Next.js; no Prometheus exporter today. |
| **PostgreSQL** | `pg_isready` (exec probe) | **None** (standard Postgres)           | Can be monitored via postgres_exporter if the monitoring stack adds it. |
| **ClickHouse** | HTTP ping :8123          | **None** (standard CH)                  | Can be monitored via clickhouse_exporter if added. |
| **OTEL Collector** | :13133                 | Optional (OTEL metrics)                 | Already in chart; can forward traces/metrics. |

**Gaps:**  
- No **HTTP request** metrics on the gateway (count, latency, status).  
- **Frontend** has no metrics endpoint for request count, errors, or client-side health.  
- **Logging:** Gateway has `LogHTTPRequest` in `internal/common/logging` but it is **not used**; no per-request log or correlation ID.  
- **kube-prometheus-stack:** Relies on pod annotations or ServiceMonitors; scrape config and Avika-specific alerts/dashboards must be explicit.

---

## 2. Avika Application Changes (Dev Team)

These are changes in the **Avika repository** (gateway, frontend, Helm chart).

### 2.1 Gateway (Go)

| Item | Action |
|------|--------|
| **HTTP request metrics** | Add Prometheus counters/histograms for: `avika_http_requests_total` (method, path, status), `avika_http_request_duration_seconds` (method, path). Use `prometheus/client_golang` (or keep current custom `/metrics` and append these). Optionally add middleware that calls existing `logging.LogHTTPRequest()` for structured logs. |
| **Metrics port** | **Option A:** Keep `/metrics` on main HTTP (5021); document that Prometheus must scrape **5021** and align Helm `prometheus.io/port` to 5021. **Option B:** Add a **dedicated metrics server** listening on 5022 (no auth, only `/metrics`) so scraping does not touch the main API port; then keep `prometheus.io/port: "5022"`. |
| **Structured request logging** | Add middleware that logs each request (method, path, status, duration, optional request_id) using `logging.LogHTTPRequest` or equivalent; ensure log format is JSON for aggregation. |
| **Health/Ready contract** | Keep `/health` (liveness) and `/ready` (readiness; include DB/ClickHouse checks). Document response schema so the monitoring team can use them for probes or custom checks. |
| **Metric names and labels** | Use a consistent prefix (e.g. `avika_gateway_*` or keep existing `nginx_gateway_*`) and document all metrics in a small **METRICS.md** in the repo so the monitoring team can build PromQL and Grafana panels. |

### 2.2 Frontend (Next.js)

| Item | Action |
|------|--------|
| **Metrics endpoint** | Add **`/api/metrics`** (or `BASE_PATH/api/metrics`) that returns **Prometheus text format**: e.g. `avika_frontend_requests_total`, `avika_frontend_errors_total`, `avika_frontend_build_info`. Implement via in-memory counters (or a lightweight Prometheus client) updated from middleware or API route wrappers. Keep the endpoint **unauthenticated** and **read-only** so Prometheus can scrape it. |
| **Health** | Keep `/api/health`; optionally extend with dependency checks (e.g. gateway reachability) for a “deep” readiness check. |
| **Probes** | Ensure liveness/readiness use the correct path (e.g. `BASE_PATH/api/health`); already present in Helm. |

### 2.3 Helm Chart (Avika)

| Item | Action |
|------|--------|
| **Gateway** | Set **`prometheus.io/port`** to the port where `/metrics` is actually served (5021 if Option A; 5022 if Option B). Ensure **`prometheus.io/path: "/metrics"`** and **`prometheus.io/scrape: "true"`** are set on the gateway pods. |
| **Frontend** | Add **pod annotations** for Prometheus scrape: `prometheus.io/scrape: "true"`, `prometheus.io/port: "5031"`, `prometheus.io/path: "/avika/api/metrics"` (or the actual path). Expose port 5031 for the frontend service if not already. |
| **ServiceMonitors (optional)** | Either rely on **pod annotations** (Prometheus pod-based discovery) or provide **optional** ServiceMonitor manifests in the chart (disabled by default) so the monitoring team can enable them when using Prometheus Operator. Document in chart README. |

### 2.4 Documentation (Avika Repo)

- **METRICS.md** (or a section in docs): List all Prometheus metrics (name, type, labels, meaning) for gateway and frontend.  
- **OBSERVABILITY.md**: Point to this proposal; summarize health/ready endpoints, metrics endpoints, and that dashboards/alerts are maintained in kube-prometheus-stack (monitoring team).

---

## 3. Metrics and Endpoints Reference (For Both Teams)

### 3.1 Gateway

| Endpoint | Port (current) | Purpose |
|----------|----------------|--------|
| `/health` | 5021 | Liveness; minimal check. |
| `/ready`  | 5021 | Readiness; should include DB/ClickHouse. |
| `/metrics` | 5021 (or 5022 if dedicated) | Prometheus metrics. |

**Existing metrics (today):**  
`nginx_gateway_info`, `nginx_gateway_agents_total{status=online|offline}`, `nginx_gateway_messages_total`, `nginx_gateway_db_operations_total`, `nginx_gateway_db_latency_avg_ms`, `nginx_gateway_goroutines`, `nginx_gateway_memory_alloc_bytes`, `nginx_gateway_memory_sys_bytes`, `nginx_gateway_gc_pause_total_ns`, plus recommendations count.

**To add (recommended):**  
- `avika_http_requests_total{method, path, status}` (counter).  
- `avika_http_request_duration_seconds{method, path}` (histogram).

### 3.2 Frontend

| Endpoint | Port | Purpose |
|----------|------|--------|
| `BASE_PATH/api/health` | 5031 | Liveness/readiness. |
| `BASE_PATH/api/metrics` | 5031 | Prometheus scrape (to be added). |

**To add:**  
- `avika_frontend_requests_total{path, method, status}` (counter).  
- `avika_frontend_build_info{version}` (gauge 1).  
- Optionally: `avika_frontend_errors_total` (counter).

### 3.3 Other Components

- **PostgreSQL / ClickHouse:** No application-level metrics from Avika; monitoring team can add standard exporters (postgres_exporter, clickhouse_exporter) if desired.  
- **OTEL Collector:** Already deployed; can be used for traces or metrics export to a backend the monitoring team operates.

---

## 4. kube-prometheus-stack: Monitoring Team Responsibilities

This section is for the **monitoring team** that operates and enhances **kube-prometheus-stack**. All items below are to be implemented in the **stack configuration** (Helm values, PrometheusOperator CRs, Grafana, Alertmanager), **not** in the Avika application repo.

### 4.1 Scraping Avika Targets

- **Pod-based discovery:**  
  - Ensure Prometheus is configured to scrape pods in the **`avika`** namespace that have annotations:  
    - `prometheus.io/scrape: "true"`  
    - `prometheus.io/port: "<port>"`  
    - `prometheus.io/path: "/metrics"` (or `/avika/api/metrics` for frontend)  
  - Use the **actual** port where `/metrics` is served: **5021** for gateway (unless Avika adds a dedicated metrics port 5022), and **5031** for frontend with path `BASE_PATH/api/metrics`.

- **ServiceMonitor (recommended):**  
  - Create **ServiceMonitor** resources in the **monitoring** (or avika) namespace that select Avika services/pods:
    - **Gateway:** selector matching the gateway Service in `avika`; scrape port 5021 (or 5022); path `/metrics`; interval e.g. 15s; no auth.
    - **Frontend:** selector matching the frontend Service in `avika`; scrape port 5031; path `/avika/api/metrics` (or the value of `BASE_PATH` + `/api/metrics`); interval e.g. 30s.
  - Ensure Prometheus Operator’s `serviceMonitorSelector` (or `serviceMonitorNamespaceSelector`) includes the namespace where these ServiceMonitors are created.

- **Relabeling (optional):**  
  - Add labels such as `app.kubernetes.io/name: avika`, `component: gateway|frontend` so metrics can be filtered and grouped in Grafana and alerts.

### 4.2 Prometheus Configuration

- **Scrape interval:** 15s for gateway, 30s for frontend is sufficient; adjust if needed for cardinality.  
- **Timeouts:** Set scrape timeout so that slow `/metrics` (e.g. gateway under load) does not cause failed scrapes.  
- **Metrics retention:** Per cluster policy; ensure retention is long enough for Avika dashboards and alert history (e.g. 15d–30d).

### 4.3 Grafana

- **Datasources:**  
  - Prometheus is provided by the stack.  
  - **ClickHouse:** Avika chart may create a Grafana datasource ConfigMap in `avika`; ensure **Grafana sidecar** (or provisioning) watches the **avika** namespace so that the ClickHouse datasource and Avika dashboards are loaded (see Avika’s `GRAFANA_DASHBOARDS.md`).

- **Dashboards:**  
  - **Avika application health:** Create (or adopt) a dashboard that uses **only** Prometheus metrics from Avika:
    - Gateway: request rate, error rate (4xx/5xx), latency (e.g. histogram_quantile), agents_online/offline, DB latency, goroutines, memory.
    - Frontend: request rate, error rate, build_info.
  - **NGINX fleet / ClickHouse:** Continue using existing Avika-provided dashboards (from ConfigMaps) that query ClickHouse for NGINX and gateway time-series; no change required in Avika repo if datasource and namespace discovery are correct.

- **Folder:** Place Avika-specific dashboards in a dedicated folder (e.g. “Avika”) for clarity.

### 4.4 Alerting (PrometheusRules)

Define **PrometheusRule** resources (or equivalent in Helm values) for Avika, for example:

- **Gateway down:** `up{job="avika-gateway"} == 0` (or equivalent job label) for 1–2 minutes.  
- **Gateway high error rate:** e.g. `rate(avika_http_requests_total{status=~"5.."}[5m]) / rate(avika_http_requests_total[5m]) > 0.05`.  
- **Gateway high latency:** e.g. `histogram_quantile(0.95, rate(avika_http_request_duration_seconds_bucket[5m])) > 2`.  
- **Frontend down:** `up{job="avika-frontend"} == 0` for 1–2 minutes.  
- **No agents online:** `nginx_gateway_agents_total{status="online"} == 0` (optional; may be valid in dev).

Severity and routing (e.g. to Alertmanager routes, Slack/PagerDuty) are owned by the monitoring team.

### 4.5 Namespace and Labels

- **Namespace:** Avika is deployed in the **`avika`** namespace. Ensure:
  - Prometheus can scrape targets in `avika` (pod or ServiceMonitor discovery).
  - Grafana sidecar/dashboard provider can watch `avika` for ConfigMaps (see Avika `GRAFANA_DASHBOARDS.md`).
- **Labels:** Use standard labels (`app.kubernetes.io/name`, `app.kubernetes.io/component`) on Avika resources so ServiceMonitors and alerts can target them consistently.

### 4.6 Optional: Tracing and Logs

- **Tracing:** If the stack includes Tempo/Jaeger and the OTEL Collector in Avika is configured to export traces, the monitoring team can configure the collector to send spans to the cluster’s trace backend and configure Grafana to use the same.  
- **Logs:** If using Loki (or similar), the monitoring team can add log ingestion for Avika pods (gateway, frontend) and optionally create log-based panels or alerts; no change to Avika application code required beyond structured logging (recommended in §2.1).

---

## 5. Implementation Order

**Phase 1 – Avika (dev team)**  
1. Align gateway metrics port in Helm with actual listener (5021 or add 5022).  
2. Add HTTP request metrics and optional request logging to the gateway.  
3. Add `/api/metrics` to the frontend and pod annotations for scrape.  
4. Document metrics and observability (METRICS.md / OBSERVABILITY.md).

**Phase 2 – Monitoring team**  
1. Configure scrape (ServiceMonitors or pod discovery) for `avika` namespace; correct ports and paths.  
2. Verify Grafana discovers Avika dashboards and ClickHouse datasource.  
3. Add Avika PrometheusRules (gateway/frontend down, error rate, latency).  
4. Add or refine “Avika Application” dashboard using Prometheus metrics.

**Phase 3 – Optional**  
- Dedicated metrics server on gateway port 5022.  
- Postgres/ClickHouse exporters for DB health.  
- OTEL-based tracing and log aggregation (Loki).

---

## 6. Summary Table

| Layer | Owner | What to do |
|-------|--------|------------|
| **Gateway metrics & logging** | Avika dev | Add HTTP request metrics (and optional LogHTTPRequest); fix/advertise metrics port. |
| **Frontend metrics** | Avika dev | Add `/api/metrics`; add scrape annotations. |
| **Helm / Chart** | Avika dev | Correct `prometheus.io/port`; optional ServiceMonitor templates; docs. |
| **Scrape config** | Monitoring | ServiceMonitors or pod discovery for `avika`; correct port/path. |
| **Grafana** | Monitoring | Namespace discovery for Avika ConfigMaps; Avika application dashboard (Prometheus). |
| **Alerts** | Monitoring | PrometheusRules for gateway/frontend availability, error rate, latency. |
| **Logs/Traces** | Monitoring | Optional Loki/tracing integration; Avika provides structured logs. |

---

*Document version: 1.0. Last updated: 2025-03.*
