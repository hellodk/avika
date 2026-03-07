# Design: Monitoring Settings & Grafana Dashboard Consolidation

**Role:** Monitoring Expert / SRE / UI-UX  
**Status:** Draft for discussion  
**Last updated:** 2025-03-07

---

## 1. Scope

1. **Settings page**: Configurable endpoints for Prometheus, Backend PostgreSQL, and ClickHouse (with k8s FQDN defaults and persistent storage).
2. **Grafana dashboards**: Analysis of 19 referenced dashboard IDs (17 unique), data availability vs. our stack, redundancy, and a proposed consolidated dashboard set for operational efficiency.

---

## 2. Settings Page: Integration Endpoints

### 2.1 Current State

- **Location:** `frontend/src/app/settings/page.tsx` + `IntegrationSettings` component.
- **Fields today:** Grafana URL, ClickHouse URL (optional), Prometheus URL (optional).
- **Defaults:** Grafana default is `http://monitoring-grafana.monitoring.svc.cluster.local`. ClickHouse and Prometheus placeholders are generic (`http://clickhouse:8123`, `http://prometheus:9090`). These should be updated to the **monitoring** namespace service FQDNs (see §2.3).
- **Persistence:** 
  - **Frontend:** `user-settings.tsx` persists full settings in **localStorage** under `avika-user-settings`. Legacy `grafana_url` also written to `localStorage` on Save.
  - **Backend:** Settings page POSTs to `/api/settings` with `collection_interval`, `retention_days`, `anomaly_threshold`, `window_size`, `grafana_url`. There is **no** gateway route for `POST /api/settings` in the codebase; integration URLs are **not** stored in the backend today. Success message still shows if the POST fails (“Configuration saved locally”).

### 2.2 Requirements (from ask)

- **Configure:** Prometheus, Backend PostgreSQL, ClickHouse URL.
- **Defaults:** K8s-based service FQDNs where applicable.
- **Persistence:** User changes must persist (file and DB).

### 2.3 Proposed Changes

| Item | Proposal |
|------|----------|
| **Backend PostgreSQL** | Add a **read-only** “Backend PostgreSQL” field showing where the app’s metadata DB is (from env/Helm or gateway config). Used for ops/documentation and optional “Test” connectivity. The app **does not** connect using this value; gateway’s runtime DB connection stays in env/Helm. |
| **Default values (k8s FQDN)** | Set defaults so out-of-the-box values match typical in-cluster services: |
| | • **Prometheus:** `http://monitoring-prometheus.monitoring.svc.cluster.local:9090` (matches `kubectl get svc -n monitoring`: `monitoring-prometheus`). |
| | • **Grafana:** `http://monitoring-grafana.monitoring.svc.cluster.local` (matches `monitoring-grafana` in `monitoring` namespace). |
| | • **ClickHouse:** `http://avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local:8123` (HTTP port; native port 9000 if we ever expose that in UI). Align with `deploy/helm/avika/templates/deployment.yaml` / grafana-datasources. |
| | • **Backend PostgreSQL:** Display-only or optional DSN; default e.g. `postgres://admin:***@avika-postgresql.avika.svc.cluster.local:5432/avika?sslmode=disable` (mask password in UI). |
| **Persistence** | **Option A (recommended):** Persist integration URLs in **backend** so they survive browsers/devices and can be used by server-side features (e.g. Grafana datasource provisioning, health checks). Add `GET /api/settings` and `POST /api/settings` (or extend `GET/PUT /api/integrations/{type}`) storing keys such as `integrations.prometheus_url`, `integrations.clickhouse_url`, `integrations.postgres_url`, `integrations.grafana_url` in the existing PostgreSQL **`settings`** table. Frontend continues to persist in **localStorage** for immediate UX and fallback when backend is unavailable. |
| | **Option B:** Persist only in **file** (e.g. gateway reads a config file or env from a mounted volume). Less flexible for multi-replica and no per-user override; not recommended for “user can modify in UI”. |
| **Validation** | Optional: “Test” buttons for Prometheus/ClickHouse/PostgreSQL that call backend; backend does a minimal reachability check (e.g. GET Prometheus `/api/v1/status/config`, ClickHouse `SELECT 1`, Postgres ping). |

### 2.4 UI/UX Notes

- Keep **Grafana URL** in the same Integrations card (already present).
- Add **Backend PostgreSQL** as an optional/admin field; consider masking the password in the input and providing a “Show DSN” toggle or separate “Connection string” read-only copy.
- Show **default** values in placeholder or helper text so users know what “reset” or “typical k8s” looks like.
- **Reset Defaults** should restore Prometheus, ClickHouse, PostgreSQL, and Grafana defaults (not only Grafana).
- If backend persistence is implemented, **Save** should: (1) update localStorage, (2) POST to backend; show a single success only when both succeed (or “Saved locally; server sync failed” if POST fails).

### 2.5 Monitoring namespace service FQDNs (reference)

From `kubectl get svc -n monitoring`:

| Service | FQDN (same namespace) | Typical use |
|---------|----------------------|-------------|
| monitoring-grafana | `http://monitoring-grafana.monitoring.svc.cluster.local` (port 80) | Grafana URL default |
| monitoring-prometheus | `http://monitoring-prometheus.monitoring.svc.cluster.local:9090` | Prometheus URL default |
| prometheus-operated | Headless (None) | Used by Prometheus operator; not for user-facing URL |
| monitoring-alertmanager | `http://monitoring-alertmanager.monitoring.svc.cluster.local:9093` | Optional, for alerting |
| monitoring-kube-state-metrics | `http://monitoring-kube-state-metrics.monitoring.svc.cluster.local:8080` | Optional, for K8s metrics |
| monitoring-prometheus-node-exporter | `http://monitoring-prometheus-node-exporter.monitoring.svc.cluster.local:9100` | Optional, for node metrics |

### 2.6 Backend Keys (if using `settings` table)

Suggested keys:

- `integrations.grafana_url`
- `integrations.prometheus_url`
- `integrations.clickhouse_url`
- `integrations.postgres_url` (or `integrations.backend_postgres_url`)

Store as JSON for the whole `integrations` object or one key per URL; both are viable.

---

## 3. Grafana Dashboards: Deep Analysis

### 3.1 Dashboard ID List (from request)

Raw list:  
`14900, 12680, 2949, 6927, 13577, 9512, 2292, 11199, 8531, 9516, 10223, 5063, 12767, 12268, 18918, 12930, 9521, 9521, 14900`

**Deduplicated (17 unique):**  
14900, 12680, 2949, 6927, 13577, 9512, 2292, 11199, 8531, 9516, 10223, 5063, 12767, 12268, 18918, 12930, 9521.

**Redundancy:**  
- **14900** and **9521** each appear twice; count as one each in the analysis below.

### 3.2 Data Sources and Metrics by Dashboard (summary)

**Decision:** Ignore **NGINX Ingress Controller** dashboards (12680, 6927); they target Kubernetes ingress-nginx metrics, not our agent-collected data.

| ID    | Title / Purpose | Data source | In scope? | Data in our stack? |
|-------|-----------------|-------------|-----------|--------------------|
| 14900 | Nginx – generic (stub_status + Telegraf) | Prometheus | Yes | **Yes (ClickHouse).** Equivalent data in `nginx_metrics` + `system_metrics` + `access_logs`. |
| 12680 | NGINX Ingress Controller – Request Handling | Prometheus | **No (ignored)** | N/A – ingress controller only. |
| 2949  | Nginx VTS Stats | Prometheus | Yes (concept) | **Partially.** Connections/requests in ClickHouse; cache/bytes from VTS not fully persisted (see §7). |
| 6927  | NGINX – ingress-nginx | Prometheus | **No (ignored)** | N/A – ingress controller only. |
| 9512  | Nginx Connections Overview | Prometheus | Yes (concept) | **Yes (ClickHouse).** Same concepts in `nginx_metrics`. |
| 2292, 11199, 8531, 9516, 10223, 5063, 12767, 12268, 18918, 12930, 9521 | Various | — | Use consolidated set | Covered by our ClickHouse dashboards (Option A). |

### 3.3 Where Our Data Lives (recap)

- **ClickHouse** (gateway + agents):  
  - `nginx_analytics.nginx_metrics` – per instance: active_connections, accepted_connections, handled_connections, total_requests, reading, writing, waiting, requests_per_second.  
  - `nginx_analytics.system_metrics` – per instance: cpu_usage, memory_usage, memory_total, memory_used, network_*, cpu_user/system/iowait.  
  - `nginx_analytics.access_logs` – per request: status, request_time, upstream_* (addr, status, connect_time, header_time, response_time), request_uri, method, etc.  
  - `nginx_analytics.gateway_metrics` – per gateway: eps, active_connections, cpu_usage, memory_mb, goroutines, db_latency_ms.  
- **Prometheus:** Today the gateway exposes **Go app metrics** on `/metrics` (e.g. request counts, latency). We do **not** expose agent/NGINX metrics in Prometheus format; agents push to the gateway, which writes to ClickHouse.
- **PostgreSQL:** Metadata (agents, configs, users, settings); not used as a Grafana data source for NGINX time-series in the current design.

### 3.4 Can We Plot the Referenced Dashboards?

- **Dashboards that expect Prometheus + ingress-nginx or VTS or nginx-exporter:**  
  We **do not** have the same metric names in Prometheus. So **as-is**, those dashboards will show **no data** (or wrong data) unless:
  - We add a **Prometheus exporter** in the gateway (or elsewhere) that converts ClickHouse/agent data into the expected metric names (e.g. `nginx_ingress_controller_*` or `nginx_server_*`), or  
  - We **replace** those panels with **Grafana + ClickHouse** panels that query our tables.

- **Dashboards that need “NGINX + host (CPU/memory/network)” (e.g. 14900):**  
  We **have** the data in **ClickHouse** (`nginx_metrics` + `system_metrics` + `access_logs`). To use them we need **Grafana datasource = ClickHouse** and panels written for our schema (e.g. time series from `nginx_metrics` and `system_metrics` aggregated by `instance_id` / time).

So: **we have enough data to plot equivalent views**, but **not** in the form of the existing Prometheus-based dashboards. We need either **ClickHouse-based dashboards** or a **translation layer** (exporter) from our data to Prometheus.

### 3.5 Redundancy and scope

- **Ingress controller dashboards (12680, 6927):** **Ignored** – not applicable to our agent-based stack.
- **14900 / 9521** – duplicate IDs; treat as one. Generic NGINX + host; covered by our ClickHouse Overview and Agent/Instance dashboards.
- **2949 / 9512** – NGINX connections/requests; concepts covered by our consolidated ClickHouse dashboards.

Our **custom ClickHouse-based dashboards** will be **visually aligned** with the useful panels from these references but use **ClickHouse as the datasource** (same data agents already push to ClickHouse).

---

## 4. Proposed Fresh Dashboard Set (operational efficiency)

Goal: One coherent set of dashboards that use **our** data (ClickHouse first; Prometheus only if we add an exporter or use existing Prometheus for gateway/infra) and avoid duplication.

### 4.1 Recommended dashboards

| # | Dashboard name | Purpose | Data source | Main content |
|---|----------------|--------|-------------|--------------|
| 1 | **NGINX Manager – Overview** | Fleet health, RPS, errors, top instances | ClickHouse | From `nginx_metrics` + `access_logs`: total RPS, 4xx/5xx rate, active connections; top N instances by RPS or errors; optional gateway_metrics summary. |
| 2 | **NGINX Manager – Errors & Status** | Error analysis, status code distribution, top error paths | ClickHouse | From `access_logs`: status code time series (2xx/4xx/5xx), error rate by path/instance, top error URIs. |
| 3 | **NGINX Manager – Latency & Upstream** | Request and upstream latency | ClickHouse | From `access_logs`: request_time, upstream_response_time (percentiles over time), by path or instance; slow requests table. |
| 4 | **NGINX Manager – Agent / Instance** | Per-agent (instance) NGINX + system metrics | ClickHouse | From `nginx_metrics` + `system_metrics`: connections, RPS, reading/writing/waiting; CPU, memory, network by instance_id. |
| 5 | **NGINX Manager – Gateway** | Gateway health and performance | ClickHouse (+ optional Prometheus) | From `gateway_metrics`: EPS, active_connections, cpu_usage, memory_mb, db_latency_ms. If Prometheus scrapes gateway `/metrics`, add Go runtime panels. |
| 6 | **Infrastructure (optional)** | Cluster/infra (K8s, node, Postgres/ClickHouse if exposed) | Prometheus | Only if you already have Prometheus + node_exporter / kube-state-metrics / postgres_exporter. Not required for “NGINX Manager” operational efficiency. |

### 4.2 Implementation: Option A (confirmed)

**Option A – ClickHouse-only** is the chosen approach:

- Build dashboards 1–5 as **Grafana dashboards** using the **ClickHouse datasource** only.
- No dependency on Prometheus for NGINX Manager data.
- Align with existing `grafana-datasources` and `grafana-dashboards` Helm (ConfigMaps with `grafana_dashboard: "1"`).
- Same data that agents already push to ClickHouse is used; no Prometheus exporter required for these dashboards.

### 4.3 Out-of-scope from original list

- **Ingress controller (12680, 6927):** Ignored; not used for our agent-based dashboards.
- **Duplicate IDs (14900, 9521):** Count once; concepts covered by consolidated set.
- **VTS/nginx-exporter (2949, 9512):** Not used as-is; their **concepts** are covered by our ClickHouse-based dashboards.

### 4.4 Same dashboard data in Avika Frontend

The **same (or similar) operational data** as the five Grafana dashboards is available **in the Avika web UI** so users can work from one place:

| Grafana dashboard | Avika frontend location | Data source |
|-------------------|-------------------------|-------------|
| **Overview** | **Analytics** → Overview tab; **Dashboard** (home) KPIs | Gateway analytics API (ClickHouse-backed) |
| **Errors & Status** | **Analytics** → Errors tab; status distribution, top error endpoints | Same |
| **Latency & Upstream** | **Analytics** → Performance tab; latency trend, top endpoints | Same |
| **Agent / Instance** | **Analytics** (agent selector) + **System** + **Inventory** → server detail | Same; per-agent filter and server detail page |
| **Gateway** | **Analytics** → Gateway tab | Same (`gateway_metrics`) |
| **Geo** | **Analytics** → Geo tab and **/analytics/geo** | Gateway `/api/geo` (ClickHouse `access_logs` geo columns) |

- **Analytics** (`/analytics`) provides tabs: Overview, Gateway, Performance, System, Errors, Traffic, **Geo**, Alerts. Data is loaded from the gateway analytics API (which queries ClickHouse). **Geo Analytics** (`/analytics/geo`) shows request distribution by country and city (map, country/city tables, recent geo-located requests). Time range, agent filter, and live mode are supported.
- **Dashboard** (home) shows fleet KPIs (requests, error rate, latency) and charts from the same analytics API.
- **Monitoring** (`/monitoring`) shows Overview with RPS, connections, error rate, latency.
- **Server detail** (`/servers/[id]`) shows per-instance metrics and analytics.

So: **Grafana** is for power users and embedding in Observability; **Avika frontend** is the primary place for the same operational views. Both use the same ClickHouse-backed gateway APIs.

### 4.5 Geo analytics (Grafana and Frontend)

**Geo analytics is available in both Grafana and the Avika frontend.**

- **Frontend:** **Analytics** → **Geo** tab (or **/analytics/geo**) shows a geographic dashboard: summary cards (total requests, countries, cities, top country), a world map of request locations, tables (by country, by city), and recent geo-located requests. Data comes from the gateway **GET /api/geo** (ClickHouse `access_logs` geo columns: country, country_code, city, latitude, longitude). Time window (1h, 24h, 7d, 30d) is configurable. Legacy route **/geo** redirects to **/analytics/geo**.
- **Grafana:** A **Geo** dashboard can be added to the same set (e.g. in the Avika folder) using the ClickHouse datasource and queries over `access_logs` geo columns, so the same geo data is visible in Grafana for power users.

---

## 5. Agent → ClickHouse: Can We Get All Required Data?

**Short answer:** For the consolidated dashboards (Overview, Errors & Status, Latency & Upstream, Agent/Instance, Gateway), **yes** – with a few gaps that are either optional or fixable by persisting/collecting more.

### 5.1 What agents collect today

| Source | Collected by agent | Sent to gateway |
|--------|--------------------|------------------|
| **stub_status** | active, accepted, handled, total_requests, reading, writing, waiting | NginxMetrics (no status codes; stub_status has none) |
| **VTS** (nginx-module-vts) | Same + **HttpStatus** (2xx/3xx/4xx/5xx), **ServerZones** (InBytes, OutBytes per zone) | NginxMetrics + HttpStatus; **bytes in/out and cache not in proto** |
| **Advanced API** | Connections, total requests, version; partial | NginxMetrics (partial) |
| **System** | CPU %, memory %, memory total/used, network rx/tx bytes and rates, cpu_user/system/iowait | SystemMetrics |
| **Access logs** | Per request: status, request_time, upstream_*, body_bytes_sent, request_uri, method, etc. | LogEntry → access_logs |

### 5.2 What the gateway persists to ClickHouse

| Table | Columns persisted | Source |
|-------|-------------------|--------|
| **nginx_metrics** | timestamp, instance_id, active_connections, accepted_connections, handled_connections, total_requests, reading, writing, waiting, requests_per_second | NginxMetrics (connection/request counts only) |
| **system_metrics** | timestamp, instance_id, cpu_usage, memory_*, network_*, cpu_user/system/iowait | SystemMetrics (all) |
| **access_logs** | timestamp, instance_id, status, request_time, upstream_*, body_bytes_sent, request_uri, method, … | LogEntry (all) |
| **gateway_metrics** | timestamp, gateway_id, eps, active_connections, cpu_usage, memory_mb, goroutines, db_latency_ms | GatewayMetricPoint |

**Not persisted today:**  
- **HttpStatus** (2xx/3xx/4xx/5xx) from NginxMetrics is **not** written to `nginx_metrics`. Status distribution is derived from **access_logs** in the analytics API.  
- **Bytes in/out** (traffic volume per instance) from VTS is not in the proto/table.  
- **Cache** (hit/miss) is not in the proto or ClickHouse.  
- **Latency histogram** (NginxMetrics.latency_distribution) is not persisted; latency comes from **access_logs** (request_time, upstream_response_time).

### 5.3 Data we are NOT collecting (gaps) and how to collect

| Gap | Needed for | How to collect |
|-----|------------|----------------|
| **HTTP status counts per instance in nginx_metrics** | Redundant with access_logs; optional for “per-instance status without querying logs”. | **Option A:** Add columns to `nginx_metrics` (e.g. status_2xx, status_3xx, status_4xx, status_5xx) and persist from agent’s NginxMetrics.HttpStatus (VTS/Advanced already send this). **Option B:** Rely only on aggregating status from `access_logs` in dashboards (current approach). |
| **Cache hit/miss** | Dashboards that show cache efficiency (e.g. some VTS-style panels). | **Collect:** Extend NginxMetrics proto (or a new message) with optional `cache_hits`, `cache_misses` (or similar). In **VTS collector**, read from VTS JSON (e.g. `serverZones.*.inBytes` / cache zones if exposed). **Persist:** Add columns to `nginx_metrics` or a small `nginx_cache_metrics` table. **Stub_status** does not expose cache; only VTS (or similar) can supply this. |
| **Bytes in/out (traffic volume) per instance** | “Network I/O” or “traffic by instance” panels. | **Collect:** VTS already has InBytes/OutBytes per server zone. Extend NginxMetrics (or labels) with optional `bytes_in_total`, `bytes_out_total` and have VTS collector aggregate zone bytes. **Persist:** Add columns to `nginx_metrics` (e.g. bytes_in, bytes_out) or derive from `access_logs` (sum of body_bytes_sent = out; request body size often not in log). **Alternative:** Dashboard aggregates `sum(body_bytes_sent)` from access_logs for “bytes out” only. |
| **Per-path or per-upstream request/latency from metrics** | Some panels show “by path” or “by upstream” from metrics. | **Already covered:** We have **access_logs** with request_uri, upstream_addr, request_time, upstream_response_time. Dashboards can aggregate by path or upstream from access_logs; no new collection needed. |
| **Pre-aggregated latency histogram in ClickHouse** | Slightly faster percentile queries. | **Optional:** We have request_time per row in access_logs; ClickHouse `quantile*` is sufficient. To add: persist NginxMetrics.latency_distribution into a `latency_histogram` table or columns; agent would need to populate histogram from access log sampling or NGINX plus. |

### 5.4 Summary: can our agents get all required data to ClickHouse?

- **For the five consolidated dashboards (Option A):** **Yes.**  
  - Overview, Errors & Status, Latency & Upstream: use **access_logs** + **nginx_metrics** + **system_metrics**.  
  - Agent/Instance: use **nginx_metrics** + **system_metrics**.  
  - Gateway: use **gateway_metrics**.

- **Not collecting today (and impact):**  
  - **Cache hit/miss:** Not collected. Only needed for “cache efficiency” panels; optional. Collect via VTS (extend proto + collector + table) if required.  
  - **Bytes in/out per instance:** Not in nginx_metrics. Partially available from access_logs (bytes out). For full bytes in/out, extend agent (VTS) + nginx_metrics columns.  
  - **HttpStatus in nginx_metrics:** Collected by agent (VTS/Advanced) but not persisted. Optional; status from access_logs is sufficient for dashboards. Persist for redundancy or when access_logs are not available.

---

## 6. Decisions (resolved)

| Question | Decision |
|----------|----------|
| **Backend PostgreSQL** | **Read-only.** Show where the app’s DB is (from env/Helm or gateway config). Used for ops/documentation and “Test” connectivity only. The app does **not** connect using this value; the gateway’s runtime DB connection stays in env/Helm. If editable DSN for external tooling is needed later, it can be a separate phase. |
| **Persistence** | **Backend DB + localStorage (Option A).** Use a **dedicated** `GET /api/settings` and `POST /api/settings` for integration URLs (and any other user settings). Keeps “settings” distinct from existing `GET/PUT /api/integrations/{type}` (which can remain for other integration types, e.g. Slack/PagerDuty). |
| **Prometheus default** | **Confirmed:** Cluster uses kube-prometheus-stack (or equivalent). Default is locked to `http://monitoring-prometheus.monitoring.svc.cluster.local:9090` (see §2.5). |
| **Grafana + ClickHouse** | **Confirmed:** NGINX Manager dashboards use **ClickHouse** as datasource (Option A). No Prometheus exporter required for these dashboards. |
| **Remaining dashboard IDs** (2292, 11199, …) | **Optional follow-up.** Not required for the consolidated set. If desired later, fetch each JSON and map keep/merge/omit; the five ClickHouse dashboards already cover the needed concepts. |
| **Dashboard rollout** | **Coexist.** Ship the new set in an **“Avika”** (or “NGINX Manager”) folder as 5–6 dashboards. Do **not** remove or replace existing community dashboards; users can keep ingress/VTS dashboards if they use them. Enables gradual adoption and avoids breaking existing Grafana setups. |

---

## 7. Summary

| Area | Summary |
|------|--------|
| **Settings** | Add Backend PostgreSQL **read-only** (display app DB location). Defaults: **Grafana** `http://monitoring-grafana.monitoring.svc.cluster.local`, **Prometheus** `http://monitoring-prometheus.monitoring.svc.cluster.local:9090`, **ClickHouse** `http://avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local:8123`. Persist via **GET/POST /api/settings** (backend `settings` table) + localStorage. |
| **Service FQDNs** | Use `monitoring` namespace: `monitoring-grafana`, `monitoring-prometheus` (see §2.5). Prometheus default locked for kube-prometheus-stack. |
| **Ingress dashboards** | 12680, 6927 ignored. |
| **Dashboards** | ClickHouse-based (Option A). **Coexist:** new set in “Avika” folder; existing dashboards unchanged. |
| **Proposed set** | 5 dashboards: Overview, Errors & Status, Latency & Upstream, Agent/Instance, Gateway (+ optional Infrastructure from Prometheus). |
| **Dashboard data in frontend** | Same/similar data is in **Avika Frontend**: Analytics (Overview, Errors, Performance, System, Gateway, **Geo** tabs), Dashboard home, Monitoring, Server detail (see §4.4). |
| **Geo analytics** | Geo is available in both **Grafana** and **Avika Frontend** (Analytics → Geo, `/analytics/geo`); same ClickHouse-backed geo data (see §4.5). |
| **Agent → ClickHouse** | Required data is collected and persisted. Optional gaps: cache, bytes in/out, HttpStatus in nginx_metrics (see §5). |

Implementation can proceed: backend **GET/POST /api/settings**, frontend defaults and Backend PostgreSQL (read-only), and Grafana JSON for the five ClickHouse dashboards in an Avika folder.

---

## 8. Troubleshooting: “Failed to create ClickHouse client” in Grafana

If Grafana shows **“failed to create clickhouse client”** when using the ClickHouse datasource:

1. **Empty password** – The Grafana ClickHouse plugin can fail when a password is set to empty string. The Helm template now **omits** `secureJsonData` when `grafana.datasources.clickhouse.password` is empty. If you provisioned the datasource manually, edit it in Grafana and clear the password field (or leave it unset) if ClickHouse has no password.
2. **Reachability** – Grafana must reach ClickHouse on the HTTP port (8123). If Grafana runs in another namespace (e.g. `monitoring`) and Avika in `avika`, use the full FQDN: `avika-clickhouse.avika.svc.cluster.local`. Set `grafana.datasources.clickhouse.host` to that value (or to the pod DNS `avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local`) and upgrade the Helm release. For a manually added datasource, set **Server address** to that host and **Port** to `8123`.
3. **ConfigMap namespace** – The datasource ConfigMap is created in the **avika** namespace (where the Helm chart is installed). Kube-prometheus-stack is configured to discover and provision datasources from that namespace, so the ConfigMap should stay in avika and not be copied to the Grafana (e.g. monitoring) namespace.
4. **Timeout** – If the cluster is slow to resolve or connect, set `grafana.datasources.clickhouse.dialTimeout` to a higher value (e.g. 30) and re-apply.
