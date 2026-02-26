
# Grafana Drill-Down Feature Plan

> Planning document for implementing Grafana's Drill Down feature in Avika dashboards

## What is Grafana Drill Down?

Drill Down (introduced in Grafana 10.3+) allows users to click on data points and navigate to more detailed views while preserving context. It's part of Grafana's "Scenes" framework.

### Types of Drill Down

1. **Data Links** - Click to navigate to another dashboard/URL with context
2. **Dashboard Links** - Navigate between related dashboards
3. **Explore Drill Down** - Deep dive into specific metrics
4. **Panel Drill Down** - Expand panel to show related sub-panels

---

## Drill-Down Architecture for Avika

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AVIKA NGINX OVERVIEW                              │
│                    (Main Dashboard)                                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│  │ Active      │  │ Total       │  │ Error       │  │ Avg         ││
│  │ Agents: 5   │  │ RPS: 12K    │  │ Rate: 0.5%  │  │ Latency: 45 ││
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘│
│         │                │                │                │        │
│         ▼                ▼                ▼                ▼        │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
          │                │                │                │
┌─────────▼────────┐ ┌─────▼─────┐ ┌────────▼───────┐ ┌──────▼───────┐
│ AGENT DETAIL     │ │ TRAFFIC   │ │ ERROR ANALYSIS │ │ LATENCY      │
│ Dashboard        │ │ Dashboard │ │ Dashboard      │ │ Dashboard    │
│                  │ │           │ │                │ │              │
│ - CPU/Memory     │ │ - By URI  │ │ - 4xx by URI   │ │ - By Agent   │
│ - Connections    │ │ - By Agent│ │ - 5xx by Agent │ │ - By URI     │
│ - Logs for agent │ │ - By Time │ │ - Stack traces │ │ - Percentiles│
└─────────┬────────┘ └───────────┘ └────────┬───────┘ └──────────────┘
          │                                 │
          │                                 │
┌─────────▼────────────────────────────────▼────────────────────────┐
│                    LOG EXPLORER / TRACE VIEW                       │
│                    (Deepest level)                                 │
│                                                                    │
│  - Full log entry with context                                     │
│  - Related spans/traces                                            │
│  - Request/response details                                        │
└────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Dashboard Hierarchy

### Level 1: Overview (Created)
- `avika-nginx-overview` - Main dashboard with high-level KPIs

### Level 2: Domain-Specific Dashboards (To Create)

| Dashboard | Purpose | Drill-Down From |
|-----------|---------|-----------------|
| `avika-agent-detail` | Single agent deep dive | Click agent name in any panel |
| `avika-traffic-analysis` | URI/endpoint analysis | Click RPS or traffic panels |
| `avika-error-analysis` | Error investigation | Click error rate or 5xx panels |
| `avika-latency-analysis` | Performance breakdown | Click latency panels |
| `avika-gateway-detail` | Gateway internals | Click gateway panels |

### Level 3: Log/Trace Explorer
- Native Grafana Explore for ad-hoc queries
- Link to specific log entries from any dashboard

---

## Implementation Plan

### Phase 1: Data Links on Overview Dashboard

Add data links to existing panels for drill-down:

```json
// Example: Add to "Active Agents" stat panel
{
  "fieldConfig": {
    "defaults": {
      "links": [
        {
          "title": "View Agent Details",
          "url": "/d/avika-agent-detail?var-agent=${__data.fields.instance_id}",
          "targetBlank": false
        }
      ]
    }
  }
}
```

#### Panels to Link:

| Panel | Drill-Down To | Variables Passed |
|-------|---------------|------------------|
| Active Agents | Agent Detail | `agent=${instance_id}` |
| Total Connections | Traffic Analysis | `time=${__from}:${__to}` |
| Error Rate | Error Analysis | `status_filter=5xx` |
| Latency Percentiles | Latency Analysis | `agent=all` |
| Top Error URIs (table) | Error Analysis | `uri=${uri}&status=${status}` |
| CPU/Memory by Agent | Agent Detail | `agent=${instance_id}` |
| Gateway panels | Gateway Detail | `gateway=${gateway_id}` |

### Phase 2: Create Agent Detail Dashboard

**File:** `avika-agent-detail.json`

**Sections:**
1. Agent Status Header (stat panels)
   - Agent ID, Uptime, Version, Last Seen
2. NGINX Metrics
   - Connections timeline (reading/writing/waiting)
   - Requests per second
   - Total requests counter
3. System Resources
   - CPU breakdown (user/system/iowait)
   - Memory usage with total/used
   - Network I/O rates
4. Recent Logs for This Agent
   - Table with status code coloring
   - Filter by status
5. Configuration
   - Current NGINX config (if available)
   - Recent config changes

**Variables:**
- `$agent` - Required, pre-selected from drill-down

### Phase 3: Create Error Analysis Dashboard

**File:** `avika-error-analysis.json`

**Sections:**
1. Error Overview
   - 4xx rate over time
   - 5xx rate over time
   - Error count by status code (pie chart)
2. Error Breakdown
   - Errors by URI (top 20)
   - Errors by Agent
   - Errors by Client IP (potential attackers)
3. Error Patterns
   - Error rate heatmap (hour of day vs day of week)
   - Error spikes timeline
4. Recent Errors
   - Table of last 100 error requests
   - With links to full log entry

**Variables:**
- `$agent` - Optional, filter by agent
- `$status_filter` - Error type (4xx, 5xx, specific code)
- `$uri_filter` - Filter by URI pattern

### Phase 4: Create Latency Analysis Dashboard

**File:** `avika-latency-analysis.json`

**Sections:**
1. Latency Overview
   - P50, P95, P99 stat panels
   - Latency distribution histogram
2. Latency by Dimension
   - By Agent (identify slow servers)
   - By URI (identify slow endpoints)
   - By Upstream (backend performance)
3. Latency Trends
   - Percentiles over time
   - Comparison with previous period
4. Slow Requests
   - Table of slowest requests
   - With upstream timing breakdown

### Phase 5: Implement Click-Through Links

Add data links to panels using Grafana's link syntax:

```json
{
  "links": [
    {
      "title": "Drill down to ${__field.name}",
      "url": "/d/avika-agent-detail?var-agent=${__value.text}&from=${__from}&to=${__to}",
      "targetBlank": false
    }
  ]
}
```

---

## Data Link Reference

### Variable Syntax in Links

| Variable | Description |
|----------|-------------|
| `${__value.text}` | The display value of the clicked cell |
| `${__value.raw}` | The raw value |
| `${__field.name}` | The field/column name |
| `${__data.fields.fieldName}` | Access any field from the same row |
| `${__from}` | Dashboard start time (epoch ms) |
| `${__to}` | Dashboard end time (epoch ms) |
| `${__interval}` | Current auto-interval |

### Link Types

```json
// Internal dashboard link
{
  "title": "View Details",
  "url": "/d/dashboard-uid?var-name=${value}",
  "targetBlank": false
}

// External link (e.g., to Avika UI)
{
  "title": "Open in Avika",
  "url": "http://localhost:3000/servers/${__data.fields.instance_id}",
  "targetBlank": true
}

// Explore link
{
  "title": "Explore in ClickHouse",
  "url": "/explore?orgId=1&left={\"datasource\":\"clickhouse\",\"queries\":[{\"rawSql\":\"SELECT * FROM nginx_analytics.access_logs WHERE instance_id='${__data.fields.instance_id}'\"}]}",
  "targetBlank": true
}
```

---

## Grafana Scenes (Advanced Drill-Down)

For more advanced drill-down, Grafana Scenes allows building interactive dashboards with:

### Scene-Based Architecture

```typescript
// Conceptual structure for Avika drill-down scene
const avikaScene = new EmbeddedScene({
  body: new SceneFlexLayout({
    children: [
      // Overview row
      new SceneFlexItem({
        body: new VizPanel({
          title: 'Active Agents',
          pluginId: 'stat',
          // Click handler for drill-down
          onClick: (data) => {
            scene.setState({
              drilldown: new AgentDetailScene({ agentId: data.value })
            });
          }
        })
      }),
      // Drill-down container
      new SceneFlexItem({
        body: '$drilldown' // Dynamic scene based on click
      })
    ]
  })
});
```

### Benefits of Scenes

1. **Preserved Context** - Parent dashboard stays visible
2. **Smooth Transitions** - No page reload
3. **Related Data** - Show correlated metrics together
4. **Back Navigation** - Easy return to overview

---

## Review Checklist

### Dashboard Design
- [ ] Each dashboard has clear purpose
- [ ] Variables are intuitive and well-labeled
- [ ] Drill-down paths are logical
- [ ] IST timezone used consistently

### Data Links
- [ ] All clickable panels have appropriate links
- [ ] Links pass correct variables
- [ ] Back navigation is possible
- [ ] Links work with time range

### User Experience
- [ ] Drill-down flow is intuitive
- [ ] Loading times are acceptable
- [ ] Mobile-friendly where needed
- [ ] Consistent styling across dashboards

### Technical
- [ ] Queries are optimized (use indexes)
- [ ] No N+1 query patterns
- [ ] Appropriate time aggregations
- [ ] Error handling for missing data

---

## Questions to Resolve

1. **Dashboard Folder Structure**
   - Option A: All in `/avika/` folder
   - Option B: `/avika/overview/`, `/avika/details/`, etc.

2. **Embedding Approach**
   - Option A: Embed via iframe in Avika UI (current plan)
   - Option B: Use Grafana Scenes for tighter integration
   - Option C: Hybrid - overview embedded, details open full Grafana

3. **Authentication**
   - How to handle auth when embedding?
   - Anonymous access vs SSO passthrough?

4. **Alert Integration**
   - Should drill-down from alerts go to Grafana or Avika UI?
   - How to link alert rules to relevant dashboards?

---

## Next Steps

1. **Review this plan** - Get feedback on dashboard hierarchy
2. **Create Level 2 dashboards** - Start with Agent Detail
3. **Add data links to Overview** - Enable drill-down navigation
4. **Test drill-down flow** - Verify UX is smooth
5. **Document for users** - Create guide for using drill-down

---

## Files Created

```
deploy/grafana/
├── dashboards/
│   ├── avika-nginx-overview.json      ✅ Created (with drill-down links)
│   ├── avika-agent-detail.json        ✅ Created
│   ├── avika-error-analysis.json      ✅ Created
│   └── avika-latency-analysis.json    ✅ Created
├── provisioning/
│   ├── dashboards.yaml                ✅ Created (Avika folder provider)
│   └── datasources.yaml               ✅ Created (ClickHouse config)
└── README.md                          ✅ Created (Installation guide)
```

## Implementation Status

| Feature | Status |
|---------|--------|
| Overview Dashboard | ✅ Complete |
| Agent Detail Dashboard | ✅ Complete |
| Error Analysis Dashboard | ✅ Complete |
| Latency Analysis Dashboard | ✅ Complete |
| Drill-Down Links | ✅ Complete |
| IST Timezone | ✅ Complete |
| Auto-refresh (30s) | ✅ Complete |
| Provisioning configs | ✅ Complete |

---

## Frontend Optimization TODO

> Added: 2026-02-16 | Reference: `docs/FRONTEND_OPTIMIZATION.md`

### Completed Optimizations ✅

| Task | Impact |
|------|--------|
| Remove unused `reactflow` dependency | -37 packages |
| Add `optimizePackageImports` to next.config | Better tree-shaking |
| Add caching headers for static assets | Faster repeat visits |
| Add `removeConsole` for production builds | Smaller bundle |
| Configure image optimization (AVIF/WebP) | Faster image loading |
| Enable React strict mode | Better debugging |

### High Priority (Pending)

- [ ] **Dynamic import recharts** - Lazy load chart components
  - Expected impact: Reduce initial bundle by ~300KB
  - Files to modify: `src/app/page.tsx`, `src/app/analytics/page.tsx`

- [ ] **Replace date-fns with lighter alternative**
  - Option A: Native `Intl` API (zero dependency)
  - Option B: `dayjs` (2KB vs date-fns 39MB)
  - Reference: `docs/FRONTEND_OPTIMIZATION.md`

### Medium Priority (Pending)

- [ ] **Lazy load heavy dashboard components**
  - SystemDashboard, TrafficDashboard, NginxCoreDashboard
  - Use `next/dynamic` with SSR disabled

- [ ] **Install and configure bundle analyzer**
  ```bash
  npm install @next/bundle-analyzer
  ANALYZE=true npm run build
  ```

- [ ] **Centralize icon imports**
  - Create `src/components/icons/index.tsx`
  - Only export icons that are actually used

### Low Priority (Future)

- [ ] **Evaluate lighter chart libraries**
  - Chart.js (~60KB) vs Recharts (~300KB)
  - uPlot (~30KB) for high performance
  - visx (modular, import what you need)

- [ ] **Add service worker for offline caching**
  - Install `next-pwa`
  - Cache static assets and API responses

- [ ] **Add Web Vitals monitoring**
  - Track LCP, FID, CLS metrics
  - Send to analytics for monitoring

### Current Metrics

| Metric | Value |
|--------|-------|
| Largest JS chunks | 376 KB (4 chunks) |
| Total .next size | 343 MB |
| node_modules | 914 MB |
| Unit tests | 150 passing ✅ |
| E2E tests | 173 passing ✅ |
