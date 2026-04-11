# ClickHouse K8s Performance Optimization Plan

**Context:** Single-node ClickHouse StatefulSet in Kubernetes. Current bottleneck: `/api/analytics` at 469ms, max query 4.2s on 6.7M rows.

---

## Phase 1: Immediate (No downtime)

### 1.1 Helm Values Tuning

```yaml
# deploy/helm/avika/values.yaml — clickhouse section
clickhouse:
  resources:
    limits:
      cpu: 4          # Was 2 — analytics queries are CPU-bound
      memory: 8Gi     # Was 6Gi — more room for part loading + merges
    requests:
      cpu: 1
      memory: 4Gi

  # Increase PVC for long retention
  persistence:
    size: 50Gi        # Was 10Gi — 6.7M rows already at 229 MiB

  # Startup probe — generous for data-heavy nodes
  startupProbe:
    initialDelaySeconds: 10
    periodSeconds: 5
    failureThreshold: 60   # Up to 310s for startup
```

### 1.2 System Table TTLs (already deployed via ConfigMap)

Verify the `avika-clickhouse-config` ConfigMap is mounted:
```bash
kubectl exec avika-clickhouse-0 -n avika -- cat /etc/clickhouse-server/config.d/system-tables-ttl.xml
```

### 1.3 Gateway Buffer Tuning

```yaml
# Gateway env vars in values.yaml
CH_LOG_BUFFER_SIZE: "200000"
CH_SYS_BUFFER_SIZE: "50000"
CH_NGINX_BUFFER_SIZE: "50000"
CH_LOG_BATCH_SIZE: "10000"
CH_SYS_BATCH_SIZE: "2000"
CH_NGINX_BATCH_SIZE: "2000"
CH_FLUSH_INTERVAL_MS: "2000"
CH_SYS_FLUSH_MS: "1000"
CH_NGINX_FLUSH_MS: "1000"
CH_MAX_OPEN_CONNS: "30"
```

### 1.4 One-Time Cleanup

```bash
kubectl exec avika-clickhouse-0 -n avika -- clickhouse-client --query "
  OPTIMIZE TABLE nginx_analytics.access_logs FINAL;
  OPTIMIZE TABLE nginx_analytics.system_metrics FINAL;
  OPTIMIZE TABLE nginx_analytics.nginx_metrics FINAL;
  TRUNCATE TABLE system.trace_log;
  TRUNCATE TABLE system.query_log;
  TRUNCATE TABLE system.asynchronous_metric_log;
  TRUNCATE TABLE system.metric_log;
  TRUNCATE TABLE system.part_log;
"
```

---

## Phase 2: Schema Migration (Rolling — no data loss)

### 2.1 Partitioned access_logs

The biggest win. Current table has no partitioning — every query scans all 6.7M rows.

```sql
-- Step 1: Create new table with partitioning
CREATE TABLE nginx_analytics.access_logs_v2 (
    timestamp DateTime64(3),
    instance_id LowCardinality(String),
    remote_addr String,
    request_method LowCardinality(String),
    request_uri String,
    status UInt16,
    body_bytes_sent UInt64,
    request_time Float32,
    request_id String,
    upstream_addr String,
    upstream_status LowCardinality(String),
    upstream_connect_time Float32,
    upstream_header_time Float32,
    upstream_response_time Float32,
    user_agent String,
    referer String,
    labels Map(String, String),
    client_ip String DEFAULT '',
    country LowCardinality(String) DEFAULT '',
    country_code LowCardinality(String) DEFAULT '',
    city LowCardinality(String) DEFAULT '',
    region LowCardinality(String) DEFAULT '',
    latitude Float64 DEFAULT 0,
    longitude Float64 DEFAULT 0,
    timezone String DEFAULT '',
    isp String DEFAULT '',
    is_bot UInt8 DEFAULT 0,
    browser_family LowCardinality(String) DEFAULT '',
    browser_version String DEFAULT '',
    os_family LowCardinality(String) DEFAULT '',
    os_version String DEFAULT '',
    device_type LowCardinality(String) DEFAULT '',
    INDEX idx_status (status) TYPE minmax GRANULARITY 4,
    INDEX idx_uri (request_uri) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_client_ip (client_ip) TYPE bloom_filter(0.01) GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp))
ORDER BY (instance_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

-- Step 2: Migrate data
INSERT INTO nginx_analytics.access_logs_v2 SELECT * FROM nginx_analytics.access_logs;

-- Step 3: Atomic swap
RENAME TABLE
    nginx_analytics.access_logs TO nginx_analytics.access_logs_old,
    nginx_analytics.access_logs_v2 TO nginx_analytics.access_logs;

-- Step 4: Verify, then drop old
-- DROP TABLE nginx_analytics.access_logs_old;
```

**Expected impact:** Queries with `WHERE timestamp >= now() - INTERVAL 1 HOUR` only scan 1 partition instead of the full table. 10-50x faster for short time windows.

### 2.2 Partitioned metrics tables

Apply the same pattern to `system_metrics`, `nginx_metrics`, `gateway_metrics`.

### 2.3 Materialized View for Dashboard

Already created (`traffic_5min`). Route dashboard queries to it:

```go
// In clickhouse.go — use traffic_5min for overview queries
// instead of: SELECT ... FROM nginx_analytics.access_logs WHERE ...
// use:        SELECT ... FROM nginx_analytics.traffic_5min WHERE ...
```

---

## Phase 3: K8s-Specific Optimizations

### 3.1 Pod Anti-Affinity

Ensure ClickHouse doesn't co-locate with the gateway on the same node:

```yaml
# In values.yaml or statefulset template
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              component: gateway
          topologyKey: kubernetes.io/hostname
```

### 3.2 Storage Class

Use SSD-backed storage (not NFS/network disks):

```yaml
persistence:
  storageClass: "local-path"   # Or "gp3" on EKS, "pd-ssd" on GKE
  size: 50Gi
```

ClickHouse is I/O intensive. NFS will bottleneck on random reads during merges and queries.

### 3.3 Resource Requests (QoS)

Set requests = limits for Guaranteed QoS class to avoid eviction:

```yaml
resources:
  requests:
    cpu: 4
    memory: 8Gi
  limits:
    cpu: 4
    memory: 8Gi
```

### 3.4 Liveness Probe Tuning

Current probes are tuned. Verify no restart loops:

```bash
kubectl describe pod avika-clickhouse-0 -n avika | grep -A5 "Liveness\|Readiness\|Startup"
```

### 3.5 ClickHouse Server Config

Add a ConfigMap with server-level tuning:

```xml
<!-- server-tuning.xml -->
<clickhouse>
    <max_concurrent_queries>50</max_concurrent_queries>
    <max_server_memory_usage_to_ram_ratio>0.8</max_server_memory_usage_to_ram_ratio>
    <merge_tree>
        <max_bytes_to_merge_at_max_space_in_pool>10737418240</max_bytes_to_merge_at_max_space_in_pool>
        <number_of_free_entries_in_pool_to_execute_mutation>5</number_of_free_entries_in_pool_to_execute_mutation>
    </merge_tree>
    <background_pool_size>8</background_pool_size>
</clickhouse>
```

---

## Phase 4: Gateway Query Cache

Add a 5-second in-memory cache for hot query paths:

```go
// Key: hash(endpoint + window + agentID)
// Value: JSON response bytes
// TTL: 5 seconds
// Eviction: LRU, max 100 entries
```

This eliminates redundant ClickHouse queries when multiple dashboard tabs are open or when auto-refresh fires during an ongoing query.

---

## Monitoring Checklist

After applying optimizations, verify:

```bash
# Part count (should stay under 20 per table)
kubectl exec avika-clickhouse-0 -n avika -- clickhouse-client --query "
SELECT table, count() as parts FROM system.parts
WHERE database='nginx_analytics' AND active GROUP BY table"

# Query performance (P95 should be under 200ms)
kubectl exec avika-clickhouse-0 -n avika -- clickhouse-client --query "
SELECT quantile(0.95)(query_duration_ms) as p95_ms, max(query_duration_ms) as max_ms
FROM system.query_log WHERE type='QueryFinish' AND event_time > now() - INTERVAL 10 MINUTE
AND query LIKE '%nginx_analytics%'"

# Memory usage
kubectl exec avika-clickhouse-0 -n avika -- clickhouse-client --query "
SELECT formatReadableSize(value) FROM system.metrics WHERE metric='MemoryTracking'"

# Merge activity (should not be constantly merging)
kubectl exec avika-clickhouse-0 -n avika -- clickhouse-client --query "
SELECT count() FROM system.merges"
```

---

## Expected Impact

| Metric | Before | After Phase 1 | After Phase 2 | After Phase 4 |
|--------|--------|---------------|---------------|---------------|
| `/api/analytics` latency | 469ms | ~300ms | ~50ms | ~5ms (cached) |
| Max query time | 4,211ms | ~2,000ms | ~200ms | ~200ms |
| access_logs parts | 8 | 4-6 | 2-3/partition | 2-3/partition |
| Startup time | >160s | ~60s | ~30s | ~30s |
| Storage efficiency | 229 MiB (6.7M rows) | 229 MiB | ~150 MiB (LowCardinality) | ~150 MiB |
