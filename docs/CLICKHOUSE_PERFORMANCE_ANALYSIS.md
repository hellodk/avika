# ClickHouse Performance Analysis & Scaling Recommendations

**Date:** 2026-03-27
**Scope:** Avika ClickHouse deployment — single-node, `clickhouse-server:23.8-alpine`
**Current Resource Allocation:** 2 CPU / 4Gi memory / 10Gi storage

---

## 1. Observed Problems

| Symptom | Root Cause |
|---------|------------|
| **CrashLoopBackOff on pod restart** | ClickHouse loads hundreds of data parts from system tables (`trace_log`, `metric_log`, `asynchronous_metric_log`) on startup. With 4Gi memory and accumulated parts, this exceeds the 160s startup probe window. |
| **Port 9009 "Address already in use" warning** | Previous instance's socket lingers after probe-induced kill. Harmless but noisy. |
| **100% error rate in analytics** | All requests show as errors — likely the `countIf(status >= 400)` query counting 4xx (expected responses like 404, auth failures) as errors. |
| **Empty visitor/geo analytics** | GeoIP enrichment requires `client_ip` to be populated and the `geoLookup` to be initialized. If GeoIP database is missing, all geo columns are empty strings and queries filter them out (`country != ''`). |

---

## 2. Schema Analysis

### 2.1 Table Inventory

| Table | Engine | ORDER BY | Partition | TTL | Estimated Growth |
|-------|--------|----------|-----------|-----|-----------------|
| `access_logs` | MergeTree | `(timestamp, instance_id)` | None | 7 days | **Highest** — one row per HTTP request |
| `nginx_metrics` | MergeTree | `(timestamp, instance_id)` | None | 30 days | Moderate — one row per agent per 5s |
| `system_metrics` | MergeTree | `(timestamp, instance_id)` | None | 30 days | Moderate — one row per agent per 5s |
| `spans` | MergeTree | `(instance_id, trace_id, start_time)` | None | 7 days | High — one row per request span |
| `gateway_metrics` | MergeTree | `(timestamp, gateway_id)` | None | 30 days | Low — one row per gateway per 5s |
| `geo_requests_hourly` | SummingMergeTree | `(hour, country_code, city)` | `toYYYYMM(hour)` | 90 days | Low — pre-aggregated |

### 2.2 Critical Issues Found

**Issue 1: No partitioning on high-volume tables**

`access_logs`, `nginx_metrics`, `system_metrics`, and `spans` have **no PARTITION BY clause**. This means:
- TTL cleanup scans the entire table instead of dropping whole partitions
- Merge operations work on the entire dataset, creating massive temporary parts
- Startup part loading time grows linearly with data age
- `OPTIMIZE TABLE` is extremely expensive

**Impact:** This is the #1 cause of the slow startup. ClickHouse must scan and load part metadata for the entire table history on every restart.

**Issue 2: ORDER BY key on access_logs is suboptimal**

Current: `ORDER BY (timestamp, instance_id)`

Most queries filter by `instance_id` first, then `timestamp` range. The current key forces a full scan when filtering by `instance_id` alone, since it's the second key component.

**Issue 3: No skip indexes**

No `INDEX` clauses on any table. For `access_logs` with millions of rows, queries filtering by `status`, `request_uri`, or `client_ip` perform full scans within the primary key range.

**Issue 4: DateTime64(3) on access_logs**

Millisecond precision on access logs adds storage overhead vs DateTime. NGINX timestamps are typically second-precision. DateTime64(9) on spans is appropriate (nanosecond trace precision), but DateTime64(3) on access logs is unnecessary.

**Issue 5: System table accumulation**

ClickHouse internal tables (`system.trace_log`, `system.metric_log`, `system.asynchronous_metric_log`) accumulate parts indefinitely. From the startup logs: 71 outdated parts in `metric_log`, 119 outdated parts in `asynchronous_metric_log`. These bloat startup time significantly.

---

## 3. Batch Insert Analysis

| Stream | Buffer Size | Batch Size | Flush Interval | Concern |
|--------|-------------|------------|----------------|---------|
| access_logs | 100,000 | 10,000 | 100ms | **100ms flush creates too many small parts.** With moderate traffic, the batch rarely fills to 10K before the 100ms tick fires, resulting in many small inserts that ClickHouse must merge later. |
| spans | 200,000 | 20,000 | 100ms | Same issue — 100ms is too aggressive |
| system_metrics | 10,000 | 100 | 5s | OK for low volume |
| nginx_metrics | 10,000 | 100 | 5s | OK for low volume |
| gateway_metrics | 1,000 | 100 | 5s | OK for low volume |

**Problem:** The 100ms flush interval on access_logs and spans generates 10 inserts/second even at low traffic. Each insert creates a new data part. ClickHouse's merge tree must then merge these parts in the background, consuming CPU and creating the part accumulation that causes slow startups.

**Recommendation:** Increase flush interval to 1-5 seconds and ensure batch sizes are reached before flushing.

---

## 4. Query Performance Analysis

### 4.1 Hot Query Paths

| Query | Frequency | Pattern | Concern |
|-------|-----------|---------|---------|
| Dashboard analytics (`/api/analytics`) | Every 10s per user | Full scan of `access_logs` for time window | No partition pruning possible |
| Visitor analytics (`/api/visitor-analytics`) | Per page load | 10 sub-queries on `access_logs` | Each sub-query scans the same data independently |
| Geo analytics (`/api/geo`) | Per page load | Scan `access_logs` WHERE country != '' | Scans full table, filters mostly empty rows |
| Trace listing (`/api/traces`) | Per page load | Scan `spans` with LIMIT 50 | ORDER BY mismatch: query orders by `start_time` but table is ordered by `(instance_id, trace_id, start_time)` |

### 4.2 Expensive Patterns

1. **Repeated full-table scans:** The analytics endpoint runs 5+ sub-queries (request_rate, status_distribution, top_endpoints, summary, latency_distribution) each scanning `access_logs` independently for the same time window.

2. **No pre-aggregation for common queries:** Every dashboard load computes aggregates from raw data. The `geo_requests_hourly` materialized view is the only pre-aggregation — the pattern should be extended to traffic metrics.

3. **`quantile()` on large datasets:** P50/P95/P99 latency percentiles require reading all matching rows. On a 7-day access_logs table with millions of rows, this is expensive.

4. **`uniq(cityHash64(...))` for visitor counting:** Accurate but expensive. HyperLogLog approximation (`uniqHLL12`) would be sufficient and much faster.

---

## 5. Scaling Recommendations

### 5.1 Immediate Fixes (No schema migration needed)

#### A. Add system table TTLs via ClickHouse config

Create a ConfigMap with custom ClickHouse config to limit system table growth:

```xml
<!-- system-tables-ttl.xml -->
<clickhouse>
    <query_log>
        <database>system</database>
        <table>query_log</table>
        <ttl>event_date + INTERVAL 3 DAY</ttl>
        <flush_interval_milliseconds>7500</flush_interval_milliseconds>
    </query_log>
    <trace_log>
        <database>system</database>
        <table>trace_log</table>
        <ttl>event_date + INTERVAL 3 DAY</ttl>
    </trace_log>
    <metric_log>
        <database>system</database>
        <table>metric_log</table>
        <ttl>event_date + INTERVAL 3 DAY</ttl>
    </metric_log>
    <asynchronous_metric_log>
        <database>system</database>
        <table>asynchronous_metric_log</table>
        <ttl>event_date + INTERVAL 3 DAY</ttl>
    </asynchronous_metric_log>
    <part_log>
        <database>system</database>
        <table>part_log</table>
        <ttl>event_date + INTERVAL 3 DAY</ttl>
    </part_log>
</clickhouse>
```

Mount this as `/etc/clickhouse-server/config.d/system-tables-ttl.xml`. This alone will fix the slow startup problem by preventing part accumulation in system tables.

#### B. Tune batch flush interval

Change gateway environment variables:

```yaml
CH_FLUSH_INTERVAL_MS: "3000"    # Was 100ms, now 3s — fewer, larger batches
CH_LOG_BATCH_SIZE: "5000"       # Reduce from 10K to flush more frequently at 3s
CH_SPAN_BATCH_SIZE: "10000"     # Reduce from 20K
```

This reduces the number of parts created per minute from ~600 (at 100ms) to ~20 (at 3s).

#### C. Increase memory for part loading

```yaml
resources:
  limits:
    memory: 6Gi    # Was 4Gi
  requests:
    memory: 3Gi    # Was 2Gi
```

ClickHouse loads part metadata into memory on startup. More memory = faster part loading = faster restarts.

#### D. Run OPTIMIZE on existing tables (one-time cleanup)

Execute via `clickhouse-client`:

```sql
-- Merge parts in access_logs (heaviest table)
OPTIMIZE TABLE nginx_analytics.access_logs FINAL;
OPTIMIZE TABLE nginx_analytics.spans FINAL;
OPTIMIZE TABLE nginx_analytics.system_metrics FINAL;
OPTIMIZE TABLE nginx_analytics.nginx_metrics FINAL;

-- Clean up system tables
TRUNCATE TABLE system.trace_log;
TRUNCATE TABLE system.metric_log;
TRUNCATE TABLE system.asynchronous_metric_log;
TRUNCATE TABLE system.query_log;
TRUNCATE TABLE system.part_log;
```

### 5.2 Schema Migrations (Requires downtime or new table + data migration)

#### E. Add monthly partitioning to all tables

```sql
-- New table with partitioning (create, migrate data, swap)
CREATE TABLE nginx_analytics.access_logs_new (
    -- same columns as current --
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (instance_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY
SETTINGS index_granularity = 8192,
         ttl_only_drop_parts = 1,
         merge_with_ttl_timeout = 3600;
```

Key changes:
- `PARTITION BY toYYYYMM(timestamp)` — enables partition-level TTL drops (instant, no merge)
- `ORDER BY (instance_id, timestamp)` — matches most query patterns (filter by agent, then time)
- `ttl_only_drop_parts = 1` — TTL drops entire partitions instead of row-by-row deletion
- `merge_with_ttl_timeout = 3600` — limits how often TTL merge runs

Apply the same pattern to `nginx_metrics`, `system_metrics`, and `spans`.

**Migration path:**
```sql
-- 1. Create new table
-- 2. Insert data
INSERT INTO nginx_analytics.access_logs_new SELECT * FROM nginx_analytics.access_logs;
-- 3. Rename
RENAME TABLE nginx_analytics.access_logs TO nginx_analytics.access_logs_old,
             nginx_analytics.access_logs_new TO nginx_analytics.access_logs;
-- 4. Drop old after verification
DROP TABLE nginx_analytics.access_logs_old;
```

#### F. Add skip indexes

```sql
ALTER TABLE nginx_analytics.access_logs
    ADD INDEX idx_status (status) TYPE minmax GRANULARITY 8,
    ADD INDEX idx_uri (request_uri) TYPE bloom_filter(0.01) GRANULARITY 4,
    ADD INDEX idx_client_ip (client_ip) TYPE bloom_filter(0.01) GRANULARITY 4;
```

These allow ClickHouse to skip granules that don't match the filter, significantly speeding up queries that filter by status code, URI, or client IP.

#### G. Add materialized views for dashboard aggregates

```sql
-- 5-minute traffic rollup (for dashboard)
CREATE MATERIALIZED VIEW nginx_analytics.traffic_5min_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (instance_id, ts)
TTL ts + INTERVAL 30 DAY
AS SELECT
    toStartOfFiveMinutes(timestamp) AS ts,
    instance_id,
    count() AS requests,
    countIf(status >= 400) AS errors,
    countIf(status >= 200 AND status < 300) AS status_2xx,
    countIf(status >= 300 AND status < 400) AS status_3xx,
    countIf(status >= 400 AND status < 500) AS status_4xx,
    countIf(status >= 500) AS status_5xx,
    sum(body_bytes_sent) AS total_bytes,
    avg(request_time) AS avg_latency,
    quantile(0.95)(request_time) AS p95_latency
FROM nginx_analytics.access_logs
GROUP BY ts, instance_id;
```

Then modify dashboard queries to read from `traffic_5min_mv` instead of `access_logs`. This turns expensive full scans into cheap reads of pre-aggregated data.

### 5.3 Application-Level Optimizations

#### H. Consolidate sub-queries into single pass

Current: 5 separate `SELECT` statements per analytics request, each scanning `access_logs`.

Proposed: Single query with multiple aggregations:

```sql
SELECT
    count() AS total_requests,
    countIf(status >= 400) AS total_errors,
    avg(request_time) AS avg_latency,
    quantile(0.95)(request_time) AS p95_latency,
    sumIf(1, status >= 200 AND status < 300) AS s2xx,
    sumIf(1, status >= 300 AND status < 400) AS s3xx,
    sumIf(1, status >= 400 AND status < 500) AS s4xx,
    sumIf(1, status >= 500) AS s5xx,
    sum(body_bytes_sent) AS total_bytes,
    uniqHLL12(cityHash64(remote_addr, user_agent)) AS unique_visitors
FROM nginx_analytics.access_logs
WHERE timestamp >= ? AND instance_id = ?
```

This reduces I/O by 5x for the main analytics endpoint.

#### I. Use approximate functions for visitor counting

Replace `uniq(cityHash64(...))` with `uniqHLL12(cityHash64(...))` — 2-3x faster with <1% error margin. Acceptable for analytics dashboards.

#### J. Add query-level caching in gateway

For endpoints like `/api/analytics` that poll every 10 seconds:
- Cache results for 5 seconds in-memory
- Multiple concurrent dashboard users hit the cache instead of ClickHouse
- Invalidate on time window change

---

## 6. Scaling Beyond Single Node

### Current Capacity (Single Node)

| Metric | Estimated Limit |
|--------|----------------|
| Insert rate | ~50K rows/sec sustained |
| Query throughput | ~10 concurrent dashboard queries |
| Storage | 10Gi (7-day access_logs + 30-day metrics) |
| Agents supported | ~50-100 agents at 5s metrics interval |

### When to Scale

- **> 100 agents** or **> 10K requests/sec** → Increase to 8Gi memory, 4 CPU
- **> 500 agents** or **> 50K requests/sec** → Consider ClickHouse Keeper cluster (3 nodes)
- **> 1000 agents** → Separate metrics (system/nginx) into a second ClickHouse instance or use ReplicatedMergeTree with sharding

### Horizontal Scaling Path

1. **Phase 1 (Current):** Single node, optimize schema and queries
2. **Phase 2 (100-500 agents):** ClickHouse with ReplicatedMergeTree + ClickHouse Keeper (3 nodes for HA)
3. **Phase 3 (500+ agents):** Sharded cluster with Distributed tables, shard by `instance_id`

---

## 7. Priority Matrix

| # | Fix | Impact | Effort | Priority |
|---|-----|--------|--------|----------|
| A | System table TTLs | Fixes startup crashes | Low (ConfigMap) | **P0** |
| B | Increase flush interval | Reduces part count 30x | Low (env var) | **P0** |
| D | OPTIMIZE existing tables | Immediate part reduction | Low (one-time SQL) | **P0** |
| C | Increase memory to 6Gi | Faster startup | Low (values.yaml) | **P1** |
| E | Add partitioning | Enables efficient TTL drops | Medium (migration) | **P1** |
| H | Consolidate analytics queries | 5x fewer scans | Medium (Go code) | **P1** |
| G | Materialized views for dashboard | 100x faster dashboard | Medium (SQL + Go) | **P2** |
| F | Skip indexes | Faster filtered queries | Low (ALTER) | **P2** |
| I | Approximate visitor counting | 2-3x faster visitor queries | Low (Go code) | **P3** |
| J | Gateway-level query cache | Reduces CH load per user | Medium (Go code) | **P3** |

---

## 8. Monitoring Checklist

After applying fixes, monitor these ClickHouse metrics:

```sql
-- Part count per table (should stay under 300)
SELECT table, count() as parts FROM system.parts
WHERE database = 'nginx_analytics' AND active GROUP BY table;

-- Merge activity (should not be constantly merging)
SELECT table, count() as merges FROM system.merges
WHERE database = 'nginx_analytics' GROUP BY table;

-- Query performance (should be under 1s for dashboard)
SELECT query, query_duration_ms, read_rows, read_bytes
FROM system.query_log
WHERE query_duration_ms > 1000 AND type = 'QueryFinish'
ORDER BY event_time DESC LIMIT 20;

-- Memory usage
SELECT metric, value FROM system.metrics
WHERE metric IN ('MemoryTracking', 'MemoryResident');
```
