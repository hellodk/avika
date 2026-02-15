# Avika NGINX Manager - Scaling Guide

This guide covers scaling the Avika platform for high-throughput deployments, up to 100,000+ requests per second from 100+ NGINX agents.

## Table of Contents

- [Scaling Overview](#scaling-overview)
- [Load Calculations](#load-calculations)
- [Component Scaling](#component-scaling)
- [Enterprise Profile](#enterprise-profile)
- [Performance Tuning](#performance-tuning)
- [Monitoring at Scale](#monitoring-at-scale)

---

## Scaling Overview

### Scaling Profiles

| Profile | Agents | RPS | Gateway Replicas | ClickHouse Memory | Use Case |
|---------|--------|-----|------------------|-------------------|----------|
| **default** | 1-10 | 1k | 1 | 2Gi | Development/Testing |
| **medium** | 10-50 | 10k | 2 | 4Gi | Small production |
| **large** | 50-100 | 50k | 3 | 8Gi | Medium production |
| **enterprise** | 100+ | 100k+ | 5+ | 16Gi+ | Large production |

### Architecture at Scale

```
                                    ┌─────────────────────┐
                                    │   Load Balancer     │
                                    │  (K8s Service/HPA)  │
                                    └──────────┬──────────┘
                                               │
        ┌──────────────────────────────────────┼──────────────────────────────────────┐
        │                                      │                                      │
        ▼                                      ▼                                      ▼
┌───────────────┐                    ┌───────────────┐                      ┌───────────────┐
│   Gateway 1   │                    │   Gateway 2   │         ...         │   Gateway N   │
│  (gRPC/HTTP)  │                    │  (gRPC/HTTP)  │                      │  (gRPC/HTTP)  │
└───────┬───────┘                    └───────┬───────┘                      └───────┬───────┘
        │                                    │                                      │
        └────────────────────────────────────┼──────────────────────────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
            │   ClickHouse  │        │   PostgreSQL  │        │    Redpanda   │
            │  (Analytics)  │        │   (Metadata)  │        │   (Queuing)   │
            └───────────────┘        └───────────────┘        └───────────────┘
```

---

## Load Calculations

### For 100,000 RPS from 100 Agents

**Data Flow:**
- 100 agents × 1,000 RPS each = 100,000 total RPS
- Each request = 1 log entry (~500 bytes)
- Metrics: 100 agents × 1/sec = 100 msg/sec
- Heartbeats: 100 agents × 1/sec = 100 msg/sec

**10-Minute Window:**
- Log entries: 100,000 × 600 = **60 million**
- Raw data: 60M × 500 bytes = **~30 GB**
- Compressed (LZ4): ~6-10 GB

**Gateway Load:**
- gRPC streams: 100 concurrent
- Messages/sec: ~100,200 (logs batched)
- Memory per stream: ~1-2 MB
- Total gateway memory: ~200-400 MB per replica

**ClickHouse Load:**
- Insert rate: 100,000 rows/sec
- Required batch size: 50,000+ for efficiency
- Buffer memory: ~500 MB for channels
- Write throughput: ~50 MB/sec

---

## Component Scaling

### Gateway Scaling

**Horizontal Scaling (recommended):**

```yaml
gateway:
  replicaCount: 5                    # 5 replicas for 100 agents (~20 each)
  
  resources:
    limits:
      cpu: 2                         # 2 CPU cores per replica
      memory: 2Gi                    # 2GB for buffers
    requests:
      cpu: 500m
      memory: 512Mi
  
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 60
```

**Key Settings:**

| Setting | Default | Enterprise | Purpose |
|---------|---------|------------|---------|
| `replicaCount` | 1 | 5+ | Horizontal scale |
| `resources.limits.cpu` | 500m | 2 | CPU per pod |
| `resources.limits.memory` | 512Mi | 2Gi | Memory per pod |
| `autoscaling.enabled` | false | true | Auto-scale |
| `GOMAXPROCS` | auto | 4 | Go parallelism |

### ClickHouse Scaling

**Configuration for 100k RPS:**

```yaml
clickhouse:
  resources:
    limits:
      cpu: 8
      memory: 16Gi
    requests:
      cpu: 4
      memory: 8Gi
  
  config:
    # Buffer sizes (increased for high throughput)
    logBufferSize: 500000            # 500k log buffer
    spanBufferSize: 1000000          # 1M span buffer
    
    # Batch flush settings
    logBatchSize: 50000              # Flush every 50k logs
    spanBatchSize: 100000            # Flush every 100k spans
    flushIntervalMs: 50              # 50ms max flush interval
```

**ClickHouse Server Tuning:**

```xml
<clickhouse>
  <!-- Memory -->
  <max_server_memory_usage_to_ram_ratio>0.8</max_server_memory_usage_to_ram_ratio>
  <max_memory_usage>12000000000</max_memory_usage>
  
  <!-- Connections -->
  <max_connections>1000</max_connections>
  <max_concurrent_queries>200</max_concurrent_queries>
  
  <!-- Background Processing -->
  <background_pool_size>16</background_pool_size>
  <background_schedule_pool_size>16</background_schedule_pool_size>
  
  <!-- Async Inserts (critical for high throughput) -->
  <async_insert>1</async_insert>
  <async_insert_threads>8</async_insert_threads>
  <async_insert_max_data_size>10000000</async_insert_max_data_size>
  <async_insert_busy_timeout_ms>50</async_insert_busy_timeout_ms>
</clickhouse>
```

### PostgreSQL Scaling

PostgreSQL handles metadata (agent registrations, configs), not the hot path:

```yaml
postgresql:
  primary:
    resources:
      limits:
        cpu: 2
        memory: 2Gi
    
    extendedConfiguration: |
      max_connections = 500
      shared_buffers = 512MB
      work_mem = 16MB
      effective_cache_size = 1GB
```

### Redpanda Scaling

For message queuing in async pipelines:

```yaml
redpanda:
  replicaCount: 3                    # 3-node cluster for HA
  
  resources:
    limits:
      cpu: 4
      memory: 8Gi
  
  config:
    numPartitions: 12                # Partitions for parallelism
    replicationFactor: 2
    producerBatchSize: 1048576       # 1MB batches
```

---

## Enterprise Profile

### Deploying the Enterprise Profile

```bash
# Deploy with enterprise scaling
helm install avika ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/enterprise.yaml \
  --set postgresql.auth.password=<secure-password> \
  --set clickhouse.password=<secure-password> \
  --namespace avika-prod
```

### Enterprise Resource Summary

| Component | CPU | Memory | Replicas | Storage |
|-----------|-----|--------|----------|---------|
| Gateway | 2 × 5 = 10 | 2Gi × 5 = 10Gi | 5 | - |
| ClickHouse | 8 | 16Gi | 1 | 100Gi |
| PostgreSQL | 2 | 2Gi | 1 | 20Gi |
| Redpanda | 4 × 3 = 12 | 8Gi × 3 = 24Gi | 3 | 50Gi |
| OTel Collector | 2 × 2 = 4 | 2Gi × 2 = 4Gi | 2 | - |
| **Total** | **~36 cores** | **~56 Gi** | - | **~170 Gi** |

---

## Performance Tuning

### Gateway Environment Variables

| Variable | Default | Enterprise | Description |
|----------|---------|------------|-------------|
| `GOGC` | 100 | 100 | GC trigger percentage |
| `GOMEMLIMIT` | - | 1800MiB | Soft memory limit |
| `GOMAXPROCS` | auto | 4 | CPU parallelism |

### ClickHouse Environment Variables

| Variable | Default | Enterprise | Description |
|----------|---------|------------|-------------|
| `CH_LOG_BUFFER_SIZE` | 100000 | 500000 | Log channel buffer |
| `CH_SPAN_BUFFER_SIZE` | 200000 | 1000000 | Span channel buffer |
| `CH_LOG_BATCH_SIZE` | 10000 | 50000 | Log flush batch size |
| `CH_SPAN_BATCH_SIZE` | 20000 | 100000 | Span flush batch size |
| `CH_FLUSH_INTERVAL_MS` | 100 | 50 | Max flush interval |
| `CH_MAX_OPEN_CONNS` | 20 | 50 | Connection pool size |

### Agent Tuning for High Log Volume

When NGINX handles 1000+ RPS per instance:

```yaml
agent:
  resources:
    limits:
      cpu: 500m              # More CPU for log parsing
      memory: 128Mi          # More memory for buffers
  
  env:
    GOGC: "100"              # Standard GC
    GOMEMLIMIT: "100MiB"
```

---

## Monitoring at Scale

### Key Metrics to Watch

**Gateway Metrics:**
- `nginx_gateway_agents_total{status="online"}` - Connected agents
- `nginx_gateway_messages_total` - Message throughput
- `nginx_gateway_goroutines` - Goroutine count (leak detection)
- `nginx_gateway_memory_alloc_bytes` - Memory usage

**ClickHouse Metrics:**
- `ClickHouseAsyncMetrics_ReplicasMaxQueueSize`
- `ClickHouseMetrics_TCPConnection`
- `ClickHouseMetrics_Query`
- `ClickHouseMetrics_InsertedRows`

### Prometheus Alerts

```yaml
groups:
  - name: avika-high-throughput
    rules:
      - alert: GatewayHighMemory
        expr: nginx_gateway_memory_alloc_bytes > 1.5e9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Gateway memory above 1.5GB
      
      - alert: ClickHouseInsertLag
        expr: rate(ClickHouseMetrics_InsertedRows[1m]) < 50000
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: ClickHouse insert rate below 50k/sec
      
      - alert: AgentConnectionDrop
        expr: nginx_gateway_agents_total{status="online"} < 90
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: Less than 90 agents connected
```

### Grafana Dashboard Queries

**Gateway Throughput:**
```promql
rate(nginx_gateway_messages_total[1m])
```

**ClickHouse Insert Rate:**
```promql
rate(ClickHouseMetrics_InsertedRows[1m])
```

**Agent Connection Count:**
```promql
nginx_gateway_agents_total{status="online"}
```

---

## Troubleshooting at Scale

### Common Issues

**1. Gateway OOM Kills**
- Symptom: Gateway pods restarting
- Cause: Buffer overflow from slow ClickHouse
- Fix: Increase memory limit, scale horizontally

**2. ClickHouse Write Delays**
- Symptom: High latency, buffer growth
- Cause: Disk I/O bottleneck
- Fix: Use NVMe storage, increase batch size

**3. Agent Disconnections**
- Symptom: Agents reconnecting frequently
- Cause: Gateway overload
- Fix: Add more gateway replicas

### Debug Commands

```bash
# Check gateway buffer status
kubectl exec -it deploy/avika-gateway -- curl localhost:5022/metrics | grep buffer

# Check ClickHouse async insert queue
kubectl exec -it sts/avika-clickhouse -- clickhouse-client \
  --query "SELECT * FROM system.async_inserts"

# Monitor gateway goroutines
kubectl exec -it deploy/avika-gateway -- curl localhost:5022/debug/pprof/goroutine?debug=1
```

---

## Capacity Planning

### Sizing Formula

**Gateway Replicas:**
```
replicas = ceil(agents / 20) + 1 (for headroom)
```

**Gateway Memory per Replica:**
```
memory_mb = 256 + (agents_per_replica * 2) + (buffer_size_mb * 2)
```

**ClickHouse Memory:**
```
memory_gb = 2 + (log_rps / 10000) * 0.5
```

**ClickHouse Storage:**
```
storage_gb = (log_rps * retention_seconds * avg_log_size_bytes * compression_ratio) / 1e9
# Example: (100000 * 86400 * 500 * 0.15) / 1e9 = 648 GB/day
```

---

## Quick Reference

### Deploy Commands

```bash
# Default (development)
helm install avika ./deploy/helm/avika

# Enterprise (100k RPS)
helm install avika ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/enterprise.yaml

# Scale gateway manually
kubectl scale deployment avika-gateway --replicas=5

# Enable HPA
kubectl patch deployment avika-gateway -p '{"spec":{"replicas":null}}'
kubectl apply -f gateway-hpa.yaml
```

### Environment Variable Quick Reference

```bash
# Gateway
export GOGC=100
export GOMEMLIMIT=1800MiB
export GOMAXPROCS=4

# ClickHouse buffers
export CH_LOG_BUFFER_SIZE=500000
export CH_SPAN_BUFFER_SIZE=1000000
export CH_LOG_BATCH_SIZE=50000
export CH_FLUSH_INTERVAL_MS=50
```
