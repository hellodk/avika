# Agent Labeling Strategy - TODO

**Created:** 2026-02-16
**Status:** Proposal (Not Yet Implemented)

## Overview

Implement environment-based labeling for agents to enable grouped/filtered metrics in Grafana dashboards.

**Use Case:** 5 nginx instances in dev, 8 in SIT, 10 in UAT, 15 in production - need to view metrics grouped by environment.

---

## Proposed Approach: Hybrid Labeling System

### Label Sources (Priority Order)

```
┌─────────────────────────────────────────────────────────────────┐
│                     LABEL SOURCES (Priority Order)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Explicit Labels (highest priority)                          │
│     └── AVIKA_LABELS env var or config file                     │
│                                                                  │
│  2. Kubernetes Labels (auto-discovered)                         │
│     └── From pod metadata via Downward API                      │
│                                                                  │
│  3. Cloud Provider Metadata (auto-discovered)                   │
│     └── AWS tags, GCP labels, Azure tags                        │
│                                                                  │
│  4. Hostname Parsing (fallback)                                 │
│     └── Extract env from naming convention                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema Changes (ClickHouse)

```sql
-- Option A: Flexible Map column
ALTER TABLE nginx_analytics.nginx_metrics 
ADD COLUMN IF NOT EXISTS labels Map(String, String);

ALTER TABLE nginx_analytics.system_metrics 
ADD COLUMN IF NOT EXISTS labels Map(String, String);

ALTER TABLE nginx_analytics.access_logs 
ADD COLUMN IF NOT EXISTS labels Map(String, String);

-- Option B: Dedicated columns (better query performance) - RECOMMENDED
ALTER TABLE nginx_analytics.nginx_metrics 
ADD COLUMN IF NOT EXISTS env String DEFAULT '',
ADD COLUMN IF NOT EXISTS team String DEFAULT '',
ADD COLUMN IF NOT EXISTS region String DEFAULT '',
ADD COLUMN IF NOT EXISTS tier String DEFAULT '';
```

---

## Agent Configuration

```ini
# avika-agent.conf

# Static labels (always sent with metrics)
LABELS="env=production,team=platform,region=ap-south-1,tier=frontend"

# Or individual settings (easier to override)
LABEL_ENV="production"
LABEL_TEAM="platform"
LABEL_REGION="ap-south-1"
LABEL_TIER="frontend"

# Auto-discover from K8s (if running in K8s)
LABEL_AUTO_DISCOVER="true"
```

---

## Kubernetes Deployment (Auto-Discovery)

```yaml
# Helm values.yaml
agent:
  labels:
    env: production
    team: platform
    region: ap-south-1
  
# The Deployment would use Downward API:
spec:
  containers:
    - name: avika-agent
      env:
        - name: AVIKA_LABEL_ENV
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['env']
        - name: AVIKA_LABEL_TEAM
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['team']
```

---

## Proto Changes

```protobuf
// api/proto/agent.proto

message AgentInfo {
  string instance_id = 1;
  string hostname = 2;
  string nginx_version = 3;
  string agent_version = 4;
  
  // NEW: Agent labels for grouping
  string env = 10;      // dev, sit, uat, production
  string team = 11;     // platform, frontend, api
  string region = 12;   // ap-south-1, us-east-1
  string tier = 13;     // frontend, backend, cache
  
  // Or flexible map (less performant but more flexible)
  // map<string, string> labels = 15;
}
```

---

## Grafana Dashboard Changes

### New Variables

```sql
-- Environment dropdown
SELECT DISTINCT env FROM nginx_analytics.nginx_metrics 
WHERE timestamp > now() - INTERVAL 24 HOUR 
  AND env != ''
ORDER BY env

-- Team dropdown  
SELECT DISTINCT team FROM nginx_analytics.nginx_metrics 
WHERE timestamp > now() - INTERVAL 24 HOUR 
  AND team != ''
ORDER BY team
```

### Query Filters

```sql
-- All queries would include:
WHERE timestamp BETWEEN $__fromTime AND $__toTime
  AND ($env = 'all' OR env = $env)
  AND ($team = 'all' OR team = $team)
```

### New Panels

- **RPS by Environment** - Stacked area chart
- **Active Connections by Environment** - Time series
- **Environment Health Matrix** - Table with env breakdown

---

## Implementation Phases

| Phase | Task | Effort | Status |
|-------|------|--------|--------|
| **Phase 1** | Add `env` label only (config + proto + ClickHouse) | ~2-3 hours | TODO |
| **Phase 2** | Add Grafana env filter to all dashboards | ~1-2 hours | TODO |
| **Phase 3** | Add more labels (team, region, tier) | ~1-2 hours | TODO |
| **Phase 4** | K8s auto-discovery via Downward API | ~2-3 hours | TODO |
| **Phase 5** | Gateway-side default label rules | ~2-3 hours | TODO |

---

## Example: Final Dashboard Experience

```
┌─────────────────────────────────────────────────────────────────┐
│  Environment: [All ▼]  Team: [All ▼]  Region: [All ▼]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   DEV (5)        SIT (8)       UAT (10)      PROD (15)          │
│   ████░░░░       ██████░░      ████████░░    ████████████       │
│   1.2K rps       3.5K rps      8.2K rps      45K rps            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│   [RPS by Environment - Stacked Area Chart]                     │
│                                                                  │
│   ^                                    ████ PROD                │
│   │                              ██████████                     │
│   │                        ████████████████ UAT                 │
│   │                  ██████████████████████ SIT                 │
│   │            ████████████████████████████ DEV                 │
│   └────────────────────────────────────────────>                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

1. `api/proto/agent.proto` - Add label fields
2. `internal/common/proto/agent/agent.pb.go` - Regenerate
3. `cmd/agent/config/manager.go` - Read label config
4. `cmd/agent/main.go` - Send labels with metrics
5. `cmd/gateway/clickhouse.go` - Add columns, store labels
6. `nginx-agent/avika-agent.conf` - Add label settings
7. `deploy/grafana/dashboards/*.json` - Add env variable and filters

---

## Notes

- Start with `env` label only for quick wins
- Use dedicated columns instead of Map for better ClickHouse performance
- Consider backward compatibility (default empty string for unlabeled agents)
- Labels should be immutable during agent runtime (set at startup)
