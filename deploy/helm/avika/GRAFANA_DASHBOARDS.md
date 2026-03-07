# Grafana dashboards (Avika namespace)

The chart creates **ConfigMaps in the avika namespace** for Grafana:

- **Datasource:** one ConfigMap with label `grafana_datasource: "1"` (ClickHouse).
- **Dashboards:** one ConfigMap per dashboard with label `grafana_dashboard: "1"` (folder: Avika). Dashboards include: Avika NGINX Manager, Error Analysis, Latency Analysis, Agent Detail, Gateway, and **Geo Analytics** (request distribution by country/city from `access_logs` geo columns).

Grafana itself is **not** deployed by this chart; it is usually run by **kube-prometheus-stack** in another namespace (e.g. `monitoring`). For dashboards to show data, the following must be true.

---

## 1. Grafana must discover ConfigMaps in the avika namespace

The Grafana sidecar (from kube-prometheus-stack) must be configured to watch the **avika** namespace for ConfigMaps with `grafana_datasource: "1"` and `grafana_dashboard: "1"`.

**If you see no Avika dashboards or no ClickHouse datasource:**

- Ensure the stack is configured to scan the avika namespace. For example, with Helm:
  - `grafana.sidecar.dashboards.searchNamespace` (or equivalent) must include `avika`, or
  - Use a multi-namespace list so that the sidecar looks in both `monitoring` and `avika`.

This is a **kube-prometheus-stack** (or Grafana Helm) setting. We do not modify it from this chart. If your stack only watches its own namespace, add `avika` to the list and upgrade the stack.

---

## 2. Grafana must have the ClickHouse datasource plugin

The datasource type is `grafana-clickhouse-datasource`. Grafana must have this plugin installed (e.g. via the Grafana image or the stack’s `grafana.plugins`). If the plugin is missing, install it in the Grafana (stack) deployment—outside the avika namespace.

---

## 3. ClickHouse password must match

ClickHouse in Avika uses the password from the `<release>-db-secrets` Secret (key `clickhouse-password`). The Grafana datasource must use the **same** password or ClickHouse returns `Authentication failed: password is incorrect`.

**Automatic:** The chart looks up that Secret at template time and injects the password into the Grafana datasource ConfigMap. So you can run:

```bash
helm upgrade -n avika avika deploy/helm/avika -f deploy/helm/avika/values.yaml --install
```

with no `--set`; the ConfigMap will use the password from the existing Secret. The secret (e.g. `avika-db-secrets`) must exist when Helm runs (e.g. after a previous install or after ExternalSecrets has created it). On a very first install, if the secret is not yet present, run the upgrade again once the secret exists, or set the password in values.

**Override:** Set `grafana.datasources.clickhouse.password` in values (or via `--set`) to use a different password. If the secret has no password (empty), leave this empty.

## 4. ClickHouse must be reachable from Grafana

The datasource is provisioned with:

- **Host (default):** `avika-clickhouse-0.avika-clickhouse.<release-namespace>.svc.cluster.local` (StatefulSet pod DNS).
- **Port:** 8123 (HTTP).
- **Database:** `nginx_analytics`.

From the namespace where Grafana runs (e.g. `monitoring`), this FQDN must resolve and port 8123 must be reachable. Override the host if needed:

```yaml
grafana:
  datasources:
    clickhouse:
      host: "avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local"  # override
      port: 8123
      dialTimeout: 30  # increase if connection is slow
```

If Grafana shows **“Failed to create ClickHouse client”**, see `docs/DESIGN_MONITORING_SETTINGS_AND_DASHBOARDS.md` §8 (empty password, reachability, timeout).

---

## 5. Time range: DateTime64(3) and Grafana variables

ClickHouse tables use **DateTime64(3)** for `timestamp`. The Grafana ClickHouse plugin substitutes `$__fromTime` and `$__toTime` in a way that expects **no division by 1000** in the query. The dashboard JSON uses:

```sql
timestamp >= toDateTime64($__fromTime, 3) AND timestamp <= toDateTime64($__toTime, 3)
```

Do not use `$__fromTime/1000` or `$__toTime/1000`—the plugin can substitute values that cause `Illegal types DateTime and UInt16 of function divide`. Do not change to `BETWEEN $__fromTime AND $__toTime` or panels may show no data.

---

## 6. Check that ClickHouse has data

If the datasource connects but panels are empty:

- Confirm the gateway is running and agents are sending metrics/logs (so that `nginx_analytics.*` tables are populated).
- In Grafana, open the ClickHouse datasource and run a test query, e.g.:
  - `SELECT count(*) FROM nginx_analytics.nginx_metrics WHERE timestamp > now() - INTERVAL 1 HOUR`
  - `SELECT count(*) FROM nginx_analytics.access_logs WHERE timestamp > now() - INTERVAL 1 HOUR`
- Set the dashboard time range to “Last 1 hour” (or a range where you know there is traffic).

---

## 7. Verifying the ClickHouse datasource (read-only)

You can confirm the datasource is provisioned without modifying the monitoring namespace:

1. **ConfigMap in avika** – Check that the datasource ConfigMap exists and has the expected label:
   ```bash
   kubectl get configmap -n avika -l grafana_datasource=1
   kubectl get configmap -n avika -l grafana_datasource=1 -o yaml
   ```
   The `data` should contain a key like `clickhouse-datasource.yaml` with `apiVersion: 1`, `datasources:`, and `jsonData` with `host`, `port`, `protocol: http`, `secure: false`, `defaultDatabase: nginx_analytics`.

2. **In Grafana UI** (browser) – Go to **Connections → Data sources**. Find the **ClickHouse** datasource (UID `DS_CLICKHOUSE`). Open it and click **Save & test**. If it fails, the error message (e.g. connection refused, timeout, auth) indicates whether the issue is reachability, credentials, or plugin config.

3. **Grafana API** (from a pod that can reach Grafana) – Health check:
   ```bash
   curl -s -u admin:<password> 'http://<grafana-svc>.<namespace>.svc.cluster.local:3000/api/datasources/uid/DS_CLICKHOUSE/health'
   ```
   This does not change anything; it only queries the datasource health.

## 8. Temporary Grafana in avika (for testing dashboards)

To run a Grafana instance in the avika namespace (same ClickHouse, same dashboards) for testing:

```bash
helm upgrade -n avika avika deploy/helm/avika -f deploy/helm/avika/values.yaml --set grafana.temporary.enabled=true --install
kubectl port-forward -n avika svc/avika-grafana-temporary 3000:3000
```

Open http://localhost:3000 — user `admin`, pass from `grafana.temporary.adminPass` (e.g. `--set grafana.temporary.adminPass=yourpass` when enabling). The ClickHouse datasource is provisioned from the same secret; dashboards are loaded from the Avika folder. Disable when done: `--set grafana.temporary.enabled=false`.

## 9. Redeploy after changes (Helm only)

All changes must be applied via **Helm** (no `kubectl patch`). After changing `grafana.datasources.*` or dashboard JSON in the chart:

```bash
helm upgrade <release> ./deploy/helm/avika -n avika -f your-values.yaml
```

The sidecar will pick up updated ConfigMaps; you may need to refresh the datasource or reload the dashboard in Grafana.
