# Avika Prometheus Metrics

This document lists all Prometheus metrics exposed by Avika components for scraping by Prometheus (e.g. kube-prometheus-stack). See [PROPOSAL_AVIKA_OBSERVABILITY_TELEMETRY.md](PROPOSAL_AVIKA_OBSERVABILITY_TELEMETRY.md) for the full observability plan.

## Scrape endpoints

| Component | Port | Path | Notes |
|-----------|------|------|--------|
| **Gateway** | 5021 | `/metrics` | Main HTTP server (health, ready, API, metrics). |
| **Frontend** | 5031 | `BASE_PATH/api/metrics` | With default basePath: `/avika/api/metrics`. |

Helm sets pod annotations so Prometheus (pod-based discovery) can scrape these. Optionally enable ServiceMonitors via `monitoring.serviceMonitor.enabled: true` (see chart values).

---

## Gateway metrics

Served on the same HTTP server as the API (port 5021).

### Legacy (custom text format)

| Name | Type | Labels | Meaning |
|------|------|--------|---------|
| `nginx_gateway_info` | gauge | `version`, `build_date`, `git_commit` | Build info; value 1. |
| `nginx_gateway_agents_total` | gauge | `status` (online \| offline) | Number of registered agents by status. |
| `nginx_gateway_messages_total` | counter | - | Total messages received from agents. |
| `nginx_gateway_db_operations_total` | counter | - | Total DB operations. |
| `nginx_gateway_db_latency_avg_ms` | gauge | - | Average DB latency in ms. |
| `nginx_gateway_goroutines` | gauge | - | Current goroutine count. |
| `nginx_gateway_memory_alloc_bytes` | gauge | - | Allocated heap memory. |
| `nginx_gateway_memory_sys_bytes` | gauge | - | Memory obtained from system. |
| `nginx_gateway_gc_pause_total_ns` | counter | - | Total GC pause time (ns). |
| `nginx_gateway_recommendations_count` | gauge | - | Number of pending recommendations. |

### HTTP request metrics (Prometheus registry)

| Name | Type | Labels | Meaning |
|------|------|--------|---------|
| `avika_http_requests_total` | counter | `method`, `path`, `status` | Total HTTP requests. |
| `avika_http_request_duration_seconds` | histogram | `method`, `path` | Request duration in seconds (use `_bucket`, `_sum`, `_count` for PromQL). |

---

## Frontend metrics

Served at `BASE_PATH/api/metrics` (e.g. `/avika/api/metrics`). In-memory counters; per-process (or per-instance in serverless).

| Name | Type | Labels | Meaning |
|------|------|--------|---------|
| `avika_frontend_requests_total` | counter | `method`, `path` | Total HTTP requests (path normalized, e.g. `/api/servers/:id`). |
| `avika_frontend_build_info` | gauge | `version` | Build info; value 1. |
| `avika_frontend_errors_total` | counter | - | Total errors (when `recordError()` is used). |

---

## Example PromQL

- Request rate (gateway): `rate(avika_http_requests_total[5m])`
- Error rate (gateway, 5xx): `rate(avika_http_requests_total{status=~"5.."}[5m]) / rate(avika_http_requests_total[5m])`
- P95 latency (gateway): `histogram_quantile(0.95, rate(avika_http_request_duration_seconds_bucket[5m]))`
- Agents online: `nginx_gateway_agents_total{status="online"}`
- Frontend request rate: `rate(avika_frontend_requests_total[5m])`

---

## ServiceMonitor (optional)

When using Prometheus Operator, you can enable ServiceMonitor resources in the chart so Prometheus discovers Avika targets without relying on pod annotations. Set in values:

```yaml
monitoring:
  serviceMonitor:
    enabled: true
    # Optional: namespace where ServiceMonitors are created (default: release namespace)
    # namespace: avika
```

This creates ServiceMonitors for the gateway (port 5021, path `/metrics`) and frontend (port 5031, path `/avika/api/metrics`). Ensure Prometheus Operator’s `serviceMonitorSelector` or `serviceMonitorNamespaceSelector` includes the namespace where these resources are created.
