# Alert Rules – Examples and Reference

Use these on **http://127.0.0.1:3000/avika/alerts** (or your deployed URL).  
Supported metrics: **cpu**, **memory**, **rps**, **error_rate**.  
Comparisons: **gt** (greater than), **lt** (less than).

---

## Suggested rules

| Name | Metric | Comparison | Threshold | Window | Description |
|------|--------|------------|-----------|--------|-------------|
| High CPU | cpu | gt | 80 | 300s | Alert when average CPU > 80% over 5 min |
| High Memory | memory | gt | 85 | 300s | Alert when average memory > 85% over 5 min |
| Traffic spike | rps | gt | 1000 | 60s | Alert when RPS > 1000 over 1 min |
| High error rate | error_rate | gt | 5 | 300s | Alert when error rate > 5% over 5 min |
| Low RPS (downtime) | rps | lt | 1 | 120s | Alert when RPS < 1 over 2 min (possible outage) |

---

## Add via UI

1. Open **Alerts** → **Alert Rules**.
2. Click **Add Rule** and fill:
   - **Rule name** (e.g. “High CPU”)
   - **Metric**: CPU Usage (%) / Memory Usage (%) / Requests Per Second / Error Rate (%)
   - **Comparison**: Greater Than / Less Than
   - **Threshold** (number)
   - **Window (seconds)** (e.g. 300)
   - **Recipients** (optional): comma-separated emails or webhook URLs
3. Click **Save Rule**. Repeat for each rule above.

---

## Add via API (e.g. from browser console while logged in)

From the same origin (e.g. on `http://127.0.0.1:3000/avika/alerts`), open DevTools → Console and run:

```javascript
const base = '/avika'; // or '' if app is at root
const rules = [
  { name: 'High CPU', metric_type: 'cpu', comparison: 'gt', threshold: 80, window_sec: 300, enabled: true, recipients: '' },
  { name: 'High Memory', metric_type: 'memory', comparison: 'gt', threshold: 85, window_sec: 300, enabled: true, recipients: '' },
  { name: 'Traffic spike', metric_type: 'rps', comparison: 'gt', threshold: 1000, window_sec: 60, enabled: true, recipients: '' },
  { name: 'High error rate', metric_type: 'error_rate', comparison: 'gt', threshold: 5, window_sec: 300, enabled: true, recipients: '' },
  { name: 'Low RPS (downtime)', metric_type: 'rps', comparison: 'lt', threshold: 1, window_sec: 120, enabled: true, recipients: '' },
];

for (const rule of rules) {
  const res = await fetch(`${base}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(rule),
  });
  console.log(rule.name, res.ok ? 'created' : res.status, await res.text());
}
```

If your app is served under `/avika`, set `const base = '/avika';` before running.

---

## JSON payload reference (POST /api/alerts)

```json
{
  "name": "High CPU",
  "metric_type": "cpu",
  "threshold": 80,
  "comparison": "gt",
  "window_sec": 300,
  "enabled": true,
  "recipients": "admin@example.com, https://hooks.slack.com/..."
}
```

- **id**: optional; server generates a UUID if omitted.
- **metric_type**: one of `cpu`, `memory`, `rps`, `error_rate`.
- **comparison**: `gt` or `lt`.
- **window_sec**: evaluation window in seconds (e.g. 60, 120, 300).
- **recipients**: optional; comma-separated emails or webhook URLs for notifications.
