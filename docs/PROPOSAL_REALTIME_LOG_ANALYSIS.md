# Proposal: Real-Time Log Analysis for Nginx & Nginx Server Groups

## 1. Current State

- **Agents** tail access + error logs, parse to `LogEntry` (JSON or combined), and stream to the gateway over gRPC. On-demand **GetLogs** (tail + follow) streams live lines to the UI.
- **Gateway** receives every `LogEntry`, inserts into **ClickHouse** (`access_logs`), and maintains a small **in-memory** aggregate (total requests, errors, status codes, per-endpoint stats).
- **Frontend** has:
  - **Single server**: Live log stream (SSE) with tail/follow and log type (access/error) on the server detail page.
  - **Group**: Merged live stream from all agents in a group (Radar-style) via `/api/groups/:id/logs/stream`.
- **Analytics** (Monitoring, Visitor, Geo, Error analysis) are **batch**: they query ClickHouse (and sometimes in-memory fallback) over time windows (e.g. last 5m, 1h, 24h). There is no sub-second dashboard that updates as logs arrive.

So today we have **real-time log streaming** (tail/follow, merged by group) but not **real-time log analysis** (continuous aggregation, anomaly detection, or live dashboards driven by the stream).

---

## 2. What “Real-Time Log Analysis” Can Mean

| Capability | Description | Latency |
|------------|-------------|--------|
| **Live tail + follow** | Stream raw lines (single server or merged by group) | Already in place |
| **Near-real-time aggregates** | Counts, rates, error rate, top URLs by stream (e.g. last 1m sliding) | Seconds |
| **Real-time dashboards** | UI that updates as new data arrives (e.g. request rate, status breakdown, top endpoints) | 1–5 s |
| **Stream-based alerts** | Threshold or pattern triggers on the log stream (e.g. error rate spike, 5xx burst) | Seconds |
| **Real-time error clustering** | Group similar errors (e.g. by status + URI pattern) as they arrive | Seconds |

The proposal below focuses on **aggregates and dashboards** (single Nginx + group) and **stream-based alerts**, reusing the existing pipeline (agent → gateway → ClickHouse + in-memory).

---

## 3. Single Nginx Server

### 3.1 Already There

- Live log stream (SSE) with tail/follow and log type.
- Per-entry insert into ClickHouse and in-memory counters (total requests, errors, status codes, per-endpoint stats).

### 3.2 Proposed Additions

1. **Expose in-memory real-time stats via API**  
   The gateway already maintains `analytics.TotalRequests`, `TotalErrors`, `StatusCodes`, `EndpointStats` per agent (or globally; code path to be clarified). Expose a small JSON endpoint, e.g.:
   - `GET /api/servers/:id/realtime-stats?window=60`  
   Returns for that agent (or instance): request count, error count, error rate %, status breakdown, top N endpoints by count/bytes over the last `window` seconds (using a sliding window in memory, or by scoping the existing in-memory stats to a time window if we add timestamps).

2. **Sliding-window aggregation**  
   If the current in-memory stats are “all time” or not time-scoped, add a **ring buffer or time-bucketed counters** per agent (e.g. last 60s in 1s or 5s buckets) so “last 1m” and “last 5m” are well-defined. This keeps everything in process (no ClickHouse for this path) and latency minimal.

3. **Real-time error highlights**  
   For the single-server log view, optionally add a small “live summary” strip: counts of 4xx/5xx in the current tail window (e.g. last 100 lines or last 60s), and maybe a link to the existing error analysis for that server (which can remain ClickHouse-based for deeper history).

---

## 4. Group of Nginx Servers

### 4.1 Already There

- Merged live log stream for a group: `handleGroupLogsStream` fans out `LogRequest` to all agents in the group and merges `LogEntry` into one SSE stream (with `agent_id` on each event so the UI can show which server produced the line).

### 4.2 Proposed Additions

1. **Group-level real-time aggregates**  
   - When the gateway fans out log subscriptions for a group, it already sees every `LogEntry` from every agent. In parallel to pushing to SSE, feed the same stream into a **group-level real-time aggregator** (per group ID).
   - Aggregator maintains sliding-window counters (e.g. last 1m / 5m): total requests, errors, status breakdown, top URIs, top agents by request count, bandwidth. No ClickHouse needed for this path; pure in-memory.

2. **API for group real-time stats**  
   - `GET /api/groups/:id/realtime-stats?window=60`  
   Returns: request count, error count, error rate %, status code distribution, top endpoints (across the group), top agents by traffic, optional bandwidth estimate. All derived from the stream with a configurable `window`.

3. **UI: “Live” tab or panel for the group**  
   - Next to (or above) the merged log stream, show a small dashboard that polls the new endpoint every 2–3 s (or uses SSE if we add a dedicated “stats stream” later): request rate, error rate, status pie, top 5 URIs, top 5 agents. This gives “real-time log analysis” in the sense of live metrics derived from the same log stream the user is tailing.

4. **Consistency with single-server**  
   - Same semantics as single server where possible: `window` query param, same JSON shape for “realtime-stats” so the frontend can reuse components (e.g. same sparkline or summary cards for “this server” vs “this group”).

---

## 5. Stream-Based Alerts (Optional)

- **Where**: In the gateway, for every `LogEntry` (or every N entries) we already run ClickHouse insert and in-memory analytics. Add an optional **alert evaluator** that runs on the same stream (or on the same in-memory counters).
- **What**: Simple rules, e.g.:
  - Error rate (4xx/5xx) in the last M seconds &gt; X%.
  - Request rate &gt; R req/s.
  - Count of 5xx in the last M seconds &gt; K.
- **Scope**: Per agent, per group, or both. Evaluation can be per-agent or per-group using the same sliding-window state we use for real-time stats.
- **Action**: Emit an event (e.g. internal event bus or webhook) or set a “alert state” that the UI and/or existing alerting system can consume. No need to persist in ClickHouse for the trigger; persistence can be for “alert history” only.

---

## 6. Technical Options

| Approach | Pros | Cons |
|----------|------|------|
| **A. In-memory only (sliding windows)** | Lowest latency, no extra storage, works offline from ClickHouse | Not durable; restart loses state; no long-term real-time history |
| **B. ClickHouse with short windows** | Durable; reuse existing schema and dashboards | Higher latency (insert + query every few seconds); more load on ClickHouse |
| **C. Hybrid** | Real-time from memory (1m/5m); longer windows from ClickHouse | Slightly more code; need to define boundary (e.g. “last 1m” = memory, “last 1h” = ClickHouse) |

**Recommendation:** **Hybrid (C)**. Use in-memory sliding windows for “last 1m” and “last 5m” real-time stats (single server and group). Use ClickHouse for everything else (existing Monitoring/Analytics, error analysis, visitor/geo). This matches the existing design (stream → gateway → ClickHouse + in-memory) and adds minimal new infrastructure.

---

## 7. Data Flow (Proposed)

```
[ Nginx Agents ] → gRPC stream → [ Gateway ]
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              [ SSE log stream ]  [ In-memory ]   [ ClickHouse ]
                    │                 │                 │
                    │                 │  sliding 1m/5m  │
                    │                 ▼                 │
                    │          [ Realtime Stats API ]   │
                    │                 │                 │
                    ▼                 ▼                 ▼
              [ Logs UI ]     [ Live dashboard ]  [ Batch analytics ]
```

- **Single server**: Realtime stats keyed by `instance_id` (or agent id).
- **Group**: Realtime stats keyed by `group_id`; gateway subscribes to all agents in the group and aggregates their stream (same as today for merged logs, plus aggregation).

---

## 8. Phased Implementation

- **Phase 1 – Single server**
  - Add sliding-window (e.g. 60s / 300s) per agent in the gateway.
  - Expose `GET /api/servers/:id/realtime-stats?window=60`.
  - Optional: small “live stats” strip on the server log page (using this API).

- **Phase 2 – Group**
  - Add group-level aggregator fed from the same fan-out that drives the merged log stream.
  - Expose `GET /api/groups/:id/realtime-stats?window=60`.
  - Add a “Live” panel or tab on the group log view that polls (or SSE) and shows request rate, error rate, top URIs, top agents.

- **Phase 3 – Alerts (optional)**
  - Add rule engine on the same in-memory counters (or stream) and emit alert events / set alert state for UI and/or webhooks.

---

## 9. Summary

| Scope | Current | Proposed |
|-------|---------|----------|
| **Single Nginx** | Live tail/follow; batch analytics from ClickHouse | In-memory sliding-window stats API; optional live summary on log page |
| **Group of Nginx** | Merged live log stream | Group-level sliding-window stats API; “Live” dashboard panel next to merged stream |
| **Alerts** | — | Optional stream-based rules (error rate, request rate, 5xx count) with events / webhooks |

This keeps real-time log analysis **consistent** for single server and group, reuses the **existing log pipeline** (no new log transport), and uses a **hybrid** model (in-memory for last 1m/5m, ClickHouse for the rest) for low latency and minimal new dependencies.
