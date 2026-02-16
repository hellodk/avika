# Avika Grafana Dashboards

Comprehensive monitoring dashboards for NGINX Manager with full drill-down capabilities.

## Dashboard Suite

```
┌─────────────────────────────────────────────────────────────────┐
│                    AVIKA NGINX OVERVIEW                          │
│                    (Main Dashboard)                              │
│                                                                  │
│  📊 KPIs: Agents, Connections, RPS, CPU, P95, Error Rate        │
│  📈 Charts: Traffic, Status Codes, Latency, Resources           │
│  📜 Logs: Recent access logs with status coloring               │
│                                                                  │
│         Click any panel to drill down ↓                         │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  AGENT DETAIL   │  │ ERROR ANALYSIS  │  │LATENCY ANALYSIS │
│                 │  │                 │  │                 │
│ - Status        │  │ - Error trends  │  │ - Percentiles   │
│ - Connections   │  │ - By agent/URI  │  │ - By agent/URI  │
│ - CPU/Memory    │  │ - By client IP  │  │ - By upstream   │
│ - Network I/O   │  │ - 5xx breakdown │  │ - Histogram     │
│ - HTTP traffic  │  │ - Error logs    │  │ - Slow requests │
│ - Agent logs    │  │                 │  │ - Upstream time │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Files

| File | Dashboard | Description |
|------|-----------|-------------|
| `dashboards/avika-nginx-overview.json` | Main Overview | Fleet-wide KPIs, traffic, and logs |
| `dashboards/avika-agent-detail.json` | Agent Detail | Single agent deep dive |
| `dashboards/avika-error-analysis.json` | Error Analysis | 4xx/5xx investigation |
| `dashboards/avika-latency-analysis.json` | Latency Analysis | Performance breakdown |

## Features

### All Dashboards
- **IST Timezone** (Asia/Kolkata) for all timestamps
- **Auto-refresh** every 30 seconds
- **Time range** preserved across drill-downs
- **Variables** for agent filtering

### Drill-Down Links
- Click agent names → Agent Detail dashboard
- Click error panels → Error Analysis dashboard  
- Click latency panels → Latency Analysis dashboard
- Click table rows → Contextual navigation

### Data Source
- **ClickHouse** (grafana-clickhouse-datasource)
- Database: `nginx_analytics`
- Tables: `nginx_metrics`, `system_metrics`, `access_logs`, `gateway_metrics`

## Installation

### Option 1: Manual Import

1. Open Grafana → Dashboards → Import
2. Upload each JSON file from `dashboards/`
3. Select your ClickHouse datasource
4. Dashboards will appear in the root folder

### Option 2: Provisioning (Recommended)

1. Copy provisioning files to Grafana:
   ```bash
   # Copy datasource config
   cp provisioning/datasources.yaml /etc/grafana/provisioning/datasources/
   
   # Copy dashboard provider config
   cp provisioning/dashboards.yaml /etc/grafana/provisioning/dashboards/
   
   # Copy dashboard JSON files
   mkdir -p /var/lib/grafana/dashboards/avika
   cp dashboards/*.json /var/lib/grafana/dashboards/avika/
   ```

2. Restart Grafana:
   ```bash
   systemctl restart grafana-server
   ```

### Option 3: Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: avika-grafana-dashboards
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  avika-nginx-overview.json: |
    <contents of avika-nginx-overview.json>
  avika-agent-detail.json: |
    <contents of avika-agent-detail.json>
  avika-error-analysis.json: |
    <contents of avika-error-analysis.json>
  avika-latency-analysis.json: |
    <contents of avika-latency-analysis.json>
```

## Required Grafana Plugin

Install the ClickHouse datasource plugin:

```bash
grafana-cli plugins install grafana-clickhouse-datasource
```

Or in Helm values:
```yaml
grafana:
  plugins:
    - grafana-clickhouse-datasource
```

## Dashboard URLs

After import, dashboards are available at:

| Dashboard | URL |
|-----------|-----|
| Overview | `/d/avika-nginx-overview` |
| Agent Detail | `/d/avika-agent-detail?var-agent=<agent_id>` |
| Error Analysis | `/d/avika-error-analysis` |
| Latency Analysis | `/d/avika-latency-analysis` |

## Embedding in Avika UI

To embed dashboards in your frontend:

```tsx
// Enable embedding in Grafana
// grafana.ini:
// [security]
// allow_embedding = true
// [auth.anonymous]
// enabled = true

<iframe
  src="http://grafana:3000/d/avika-nginx-overview?orgId=1&kiosk=tv"
  width="100%"
  height="800"
  frameBorder="0"
/>
```

## Panels Overview

### Main Dashboard (avika-nginx-overview)
- **Row 1**: Active Agents, Connections, RPS, CPU%, P95 Latency, Error Rate
- **Row 2**: Connections by Agent, RPS by Agent
- **Row 3**: Connection States, Requests/min
- **Row 4**: HTTP Status Codes, Latency Percentiles
- **Row 5**: Traffic by Agent (table), Top URIs, Top Errors
- **Row 6**: CPU by Agent, Memory by Agent
- **Row 7**: Gateway EPS, Connections, DB Latency
- **Row 8**: Recent Access Logs

### Agent Detail (avika-agent-detail)
- Agent status (Online/Offline)
- Current metrics (connections, RPS, CPU, memory, error rate)
- Connection timeline and states
- CPU/Memory with thresholds
- CPU breakdown (user/system/iowait)
- Network I/O rates
- HTTP status codes for this agent
- Request latency percentiles
- Recent logs filtered to agent

### Error Analysis (avika-error-analysis)
- Total errors, 4xx count, 5xx count, error rate
- Error trends over time
- Error distribution pie chart
- Errors by agent (with drill-down)
- Errors by URI
- Top error clients (potential attackers)
- 5xx detailed breakdown
- 5xx with upstream info
- Error logs table

### Latency Analysis (avika-latency-analysis)
- P50, P90, P95, P99, Max latency stats
- Slow request percentage (>1s)
- Percentiles over time
- Latency histogram
- Latency by agent (identify slow servers)
- Latency by URI (identify slow endpoints)
- Latency by upstream (backend performance)
- Slowest requests table
- Upstream timing breakdown
- P95 by upstream over time
