# NGINX Monitoring Guide

This guide covers the enhanced monitoring capabilities of the NGINX Manager dashboard, including real-time metrics, traffic analysis, and system health monitoring.

## Table of Contents

- [Overview](#overview)
- [Monitoring Dashboard](#monitoring-dashboard)
- [Available Metrics](#available-metrics)
- [Charts and Visualizations](#charts-and-visualizations)
- [Configuration Provisions](#configuration-provisions)
- [Agent Selection](#agent-selection)

---

## Overview

The NGINX Manager provides comprehensive monitoring through multiple views:

- **Overview Tab**: High-level KPIs and request/error rates
- **Connections Tab**: Connection state tracking and history
- **Traffic Tab**: HTTP status codes and endpoint analysis
- **System Tab**: CPU, memory, and network metrics
- **Configure Tab**: Apply NGINX configurations and view recent requests

---

## Monitoring Dashboard

### Accessing the Dashboard

Navigate to **Monitoring** in the sidebar to access the real-time monitoring dashboard.

### Dashboard Features

| Feature | Description |
|---------|-------------|
| Real-time Refresh | Auto-updates every 5 seconds |
| Agent Filtering | Select specific agents or view all |
| Tab Navigation | Switch between different metric views |
| Configuration Provisions | Apply NGINX configurations from templates |

---

## Available Metrics

### Primary KPIs

| Metric | Description | Source |
|--------|-------------|--------|
| Requests/sec | Current request rate per second | Calculated from total requests delta |
| Active Connections | Number of currently active connections | stub_status / VTS |
| Error Rate | Percentage of 4xx and 5xx responses | Aggregated from logs |
| Avg Latency | Average response time in milliseconds | Log analysis (p50) |

### Connection Metrics

| Metric | Description |
|--------|-------------|
| Total Accepted | Total connections accepted by NGINX |
| Total Handled | Total connections successfully handled |
| Dropped | Connections dropped (accepted - handled) |
| Reading | Connections reading request header |
| Writing | Connections writing response |
| Waiting | Keep-alive connections waiting for requests |

### HTTP Status Metrics

| Metric | Description |
|--------|-------------|
| 2xx Success | Successful responses (200-299) |
| 3xx Redirects | Redirect responses (300-399) |
| 4xx Client Errors | Client error responses (400-499) |
| 5xx Server Errors | Server error responses (500-599) |

### System Metrics

| Metric | Description |
|--------|-------------|
| CPU Usage | System CPU utilization percentage |
| Memory Usage | System memory utilization percentage |
| Network In | Incoming network traffic rate (KB/s) |
| Network Out | Outgoing network traffic rate (KB/s) |

---

## Charts and Visualizations

### Request Rate Chart (Overview)

Shows request volume over time with separate lines for:
- Total requests (blue)
- Errors (red)

**Time Window**: Last 1 hour

### Connection Distribution (Overview)

Pie chart showing breakdown of current connections:
- Active (blue)
- Reading (green)
- Writing (amber)
- Waiting (purple)

### Connection States Over Time (Connections)

Line chart tracking connection states:
- Active connections
- Reading state
- Writing state  
- Waiting state

**Time Window**: Last 1 hour with 1-second granularity

### HTTP Status Charts (Traffic)

Two charts displaying:
1. **2xx Success Rate**: Successful responses over time
2. **4xx/5xx Error Rate**: Error responses over time

### System Resource Charts (System)

Area charts displaying:
1. **CPU Usage**: CPU utilization over time
2. **Memory Usage**: Memory utilization over time

---

## Configuration Provisions

The monitoring page includes a configuration panel for applying NGINX configurations to agents.

### Available Templates

| Template | Description | Parameters |
|----------|-------------|------------|
| HTTP Rate Limiting | Limit requests per minute | `requests_per_minute`, `burst_size` |
| Active Health Checks | Configure upstream health checks | `upstream_name`, `interval` |
| Custom 404 Page | Set custom error page path | `page_path` |
| Enable Gzip | Enable response compression | `min_length`, `types` |
| Force HTTPS | Redirect HTTP to HTTPS | None |
| Proxy Caching | Enable upstream caching | `cache_zone`, `cache_valid` |

### Applying Configurations

1. Navigate to **Configure** tab in Monitoring
2. Select a configuration template
3. Fill in the required parameters
4. Select target agent (or use default)
5. Click **Apply Configuration**

### Configuration Flow

```
┌─────────────────┐
│   UI Template   │
│   Selection     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Gateway API   │
│   /api/provisions │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent gRPC    │
│  ApplyAugment  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ NGINX Config   │
│ Update & Reload │
└─────────────────┘
```

---

## Agent Selection

### Single Agent Monitoring

Select a specific agent from the dropdown to view metrics only for that instance:

1. Click the **Agent Selector** dropdown
2. Choose the desired agent by hostname
3. All metrics will update to show that agent's data

### All Agents View

Select "All Agents" to view aggregated metrics across all connected agents:

- Metrics are summed/averaged as appropriate
- Useful for fleet-wide monitoring
- Shows combined request rates and connection counts

---

## Data Sources

### stub_status Module

Basic NGINX metrics from the stub_status module:

```nginx
location /nginx_status {
    stub_status on;
    allow 127.0.0.1;
    deny all;
}
```

Output format:
```
Active connections: 291 
server accepts handled requests
 16630948 16630948 31070465 
Reading: 6 Writing: 179 Waiting: 106
```

### VTS Module (nginx-module-vts)

Enhanced metrics from the VTS module (if installed):

```nginx
location /status {
    vhost_traffic_status_display;
    vhost_traffic_status_display_format json;
}
```

Provides additional metrics:
- Per-server-zone statistics
- HTTP status code breakdowns
- Request/response byte counts

### System Metrics

Collected from the host system:
- `/proc/stat` for CPU
- `/proc/meminfo` for memory
- `/proc/net/dev` for network

---

## OpenTelemetry & Prometheus Compatibility

The Avika agent and gateway support integration with standard observability platforms.

### Architecture Overview

```
Agent ─────(OTLP gRPC)─────→ OTel Collector → Loki/Elasticsearch/etc.
Agent ─────(gRPC protobuf)──→ Gateway ──(/metrics)──→ Prometheus
```

### Compatibility Matrix

| Data Type | OTel Compatible | Prometheus Compatible |
|-----------|-----------------|----------------------|
| **Logs**  | Yes (direct OTLP export) | Via OTel Collector |
| **Metrics** | Via Gateway | Yes, via Gateway `/metrics` |

### Logs → OpenTelemetry (Direct Support)

The agent has a **built-in OTLP exporter** that sends logs directly to any OpenTelemetry collector via gRPC:

- **Default endpoint**: `localhost:4317` (standard OTLP gRPC port)
- **Protocol**: OTLP gRPC (OpenTelemetry Protocol)
- **Semantic conventions**: Properly tagged with `service.name`, `host.name`, and HTTP attributes

Logs are exported with the following attributes:
- `service.name`: `nginx-agent`
- `service.instance.id`: Agent ID
- `host.name`: Hostname
- `log.type`: `access` or `error`
- `http.status_code`: HTTP status code
- `http.request_method`: Request method
- `http.target`: Request URI
- `http.client_ip`: Client IP address

**Example OTel Collector configuration**:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [loki]
```

### Metrics → Prometheus (Via Gateway)

The agent sends metrics to the Avika Gateway via gRPC, and the **Gateway exposes a `/metrics` endpoint** for Prometheus scraping.

**Available metrics on Gateway `/metrics` endpoint**:

| Metric | Type | Description |
|--------|------|-------------|
| `nginx_gateway_info` | gauge | Gateway version information |
| `nginx_gateway_agents_total` | gauge | Number of agents by status (online/offline) |
| `nginx_gateway_messages_total` | counter | Total messages received from agents |
| `nginx_gateway_db_operations_total` | counter | Total database operations |
| `nginx_gateway_db_latency_avg_ms` | gauge | Average database latency in milliseconds |
| `nginx_gateway_goroutines` | gauge | Number of goroutines |
| `nginx_gateway_memory_alloc_bytes` | gauge | Allocated memory in bytes |
| `nginx_gateway_memory_sys_bytes` | gauge | Total memory from system |
| `nginx_gateway_gc_pause_total_ns` | counter | Total GC pause time |

**Prometheus scrape configuration**:

```yaml
scrape_configs:
  - job_name: 'avika-gateway'
    static_configs:
      - targets: ['avika-gateway.labs.svc.cluster.local:5022']
    scrape_interval: 15s
```

For Kubernetes deployments:

```yaml
scrape_configs:
  - job_name: 'avika-gateway'
    kubernetes_sd_configs:
      - role: service
        namespaces:
          names: ['labs', 'avika']
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        regex: avika-gateway
        action: keep
```

### Multi-Gateway Setup

When using multiple gateways (HA mode), configure Prometheus to scrape all instances:

```yaml
scrape_configs:
  - job_name: 'avika-gateway'
    static_configs:
      - targets:
        - 'avika-gateway.labs.svc.cluster.local:5022'
        - 'avika-gateway.avika.svc.cluster.local:50051'
        - '192.168.1.10:5022'
```

---

## Refresh Intervals

| Component | Refresh Interval |
|-----------|-----------------|
| Metrics Collection | 1 second |
| Dashboard UI | 5 seconds |
| Connection History | 1 second |
| System Metrics | 1 second |
| Recent Requests | 5 seconds |

---

## Best Practices

### Monitoring Setup

1. **Enable stub_status** on all NGINX instances
2. **Consider VTS module** for enhanced metrics
3. **Configure JSON log format** for better analytics
4. **Set appropriate buffer sizes** for high-traffic sites

### Alert Thresholds

Recommended alert thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 1% | > 5% |
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Connection Count | > 1000 | > 5000 |
| Response Time (p95) | > 200ms | > 500ms |

### Performance Optimization

1. **Monitor connection states** - High "waiting" count indicates keep-alive is working
2. **Track error rates** - Sudden spikes may indicate issues
3. **Watch request rate trends** - Plan capacity based on patterns
4. **Monitor system resources** - Ensure headroom for traffic spikes

---

## Agent Resource Profiling

This section documents the agent's resource usage under various conditions, established through systematic profiling.

### Profiling Summary

| Metric | Baseline | Under Load | Peak | Assessment |
|--------|----------|------------|------|------------|
| **Memory (MB)** | ~1.4 | ~2-3 | ~4.5 | ✅ Excellent |
| **CPU Usage** | <1% | 1-2% | 5% | ✅ Excellent |
| **Goroutines** | 23 | 23-24 | 24 | ✅ Stable |
| **Heap Objects** | ~5,000 | ~8,000 | ~11,000 | ✅ Normal |
| **GC Pause (avg)** | - | 0.037ms | - | ✅ Excellent |

### CPU Profiling Results

CPU profiling analysis shows the agent is highly efficient:

**CPU Time Distribution (5.1s sample, 460ms total CPU = 9% utilization):**

| Function | CPU Time | Percentage | Description |
|----------|----------|------------|-------------|
| Syscalls (I/O) | 240ms | 52% | Reading /proc, log files |
| Discovery scan | 350ms | 76% (cumulative) | NGINX process detection |
| GC work | 60ms | 13% | Garbage collection |
| Runtime | 50ms | 11% | Go scheduler |

**Key Observations:**
- **I/O Bound**: 52% of CPU time is in syscalls (reading files)
- **Low Compute**: Actual computation is minimal
- **Efficient GC**: Only 13% overhead for garbage collection
- **No Hot Loops**: No CPU-intensive algorithms detected

**Top CPU Consumers:**
```
52.17%  syscall.Syscall6          - File I/O operations
26.09%  gopsutil.ReadLine         - Reading /proc files
13.04%  runtime.gcDrain           - Garbage collection
 4.35%  bufio.Reader.ReadSlice    - Log parsing
```

### Memory Footprint

The agent maintains a very low memory footprint:

- **Idle State:** ~1.5 MB allocated memory
- **Active Collection:** ~2-4 MB allocated memory
- **System Memory (total):** ~20 MB (includes Go runtime overhead)
- **Memory Efficiency:** ✅ **EXCELLENT** - Peak memory under 50MB

### Goroutine Stability

The agent demonstrates stable goroutine management:

- **Base Goroutines:** 23 (health server, metrics collector, log collector, gRPC streams)
- **Under Load:** 23-24 goroutines
- **Goroutine Leak Detection:** ✅ **NO LEAK** - Count remains stable over time

### Garbage Collection Performance

- **GC Frequency:** High frequency, low pause times
- **Average GC Pause:** ~0.037ms (37 microseconds)
- **GC CPU Overhead:** ~0.08% (negligible)
- **Assessment:** GC is well-tuned for the workload

### Production Deployment Recommendations

Based on profiling results, resource limits should be configured for both VM and container deployments.

---

## Resource Limits - VM Deployments (systemd)

For VM-based deployments using systemd, resource limits are enforced via cgroups.

### systemd Service Configuration

The agent's systemd service (`/etc/systemd/system/avika-agent.service`) includes:

```ini
[Service]
# CPU Limits
CPUQuota=20%              # Max 20% of one CPU core
CPUWeight=50              # Lower priority than NGINX

# Memory Limits  
MemoryMax=64M             # Hard limit: 64MB
MemoryHigh=32M            # Soft limit: 32MB (triggers pressure)
MemorySwapMax=0           # Disable swap

# Process/Thread Limits
LimitNPROC=64             # Max 64 threads
TasksMax=64               # Max 64 tasks
LimitNOFILE=1024          # Max 1024 file descriptors

# I/O Priority
IOWeight=50               # Lower I/O priority than NGINX

# OOM Handling
OOMScoreAdjust=500        # Prefer killing agent over NGINX
```

### Manual cgroup Configuration (without systemd)

For systems not using systemd, create cgroup limits manually:

```bash
# Create cgroup for agent
sudo cgcreate -g cpu,memory,pids:/avika-agent

# Set CPU limit (20% = 20000 of 100000)
echo 20000 | sudo tee /sys/fs/cgroup/cpu/avika-agent/cpu.cfs_quota_us
echo 100000 | sudo tee /sys/fs/cgroup/cpu/avika-agent/cpu.cfs_period_us

# Set memory limit (64MB)
echo 67108864 | sudo tee /sys/fs/cgroup/memory/avika-agent/memory.limit_in_bytes
echo 33554432 | sudo tee /sys/fs/cgroup/memory/avika-agent/memory.soft_limit_in_bytes

# Set process limit
echo 64 | sudo tee /sys/fs/cgroup/pids/avika-agent/pids.max

# Run agent in cgroup
sudo cgexec -g cpu,memory,pids:/avika-agent /usr/local/bin/avika-agent
```

### ulimit Configuration

Add to `/etc/security/limits.d/avika-agent.conf`:

```
avika    soft    nofile    1024
avika    hard    nofile    1024
avika    soft    nproc     64
avika    hard    nproc     64
avika    soft    memlock   65536
avika    hard    memlock   65536
```

---

## Resource Limits - Container Deployments

### Kubernetes Resource Configuration

```yaml
# Conservative (recommended for most deployments)
resources:
  requests:
    memory: "32Mi"
    cpu: "50m"
  limits:
    memory: "64Mi"
    cpu: "200m"

# Minimal (for resource-constrained environments)
resources:
  requests:
    memory: "16Mi"
    cpu: "25m"
  limits:
    memory: "32Mi"
    cpu: "100m"

# High-throughput (for very active NGINX instances)
resources:
  requests:
    memory: "64Mi"
    cpu: "100m"
  limits:
    memory: "128Mi"
    cpu: "500m"
```

### Complete Kubernetes Deployment with Limits

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: avika-agent
spec:
  template:
    spec:
      containers:
        - name: agent
          image: hellodk/nginx-agent:v2
          resources:
            requests:
              memory: "32Mi"
              cpu: "50m"
            limits:
              memory: "64Mi"
              cpu: "200m"
          env:
            # Go runtime tuning
            - name: GOGC
              value: "50"           # Aggressive GC
            - name: GOMEMLIMIT
              value: "56MiB"        # Below container limit
            - name: GOMAXPROCS
              value: "2"            # Limit parallelism
```

### Docker Run Command

```bash
docker run -d \
  --name avika-agent \
  --memory=64m \
  --memory-swap=64m \
  --memory-reservation=32m \
  --cpus=0.2 \
  --cpu-shares=512 \
  --pids-limit=64 \
  --ulimit nofile=1024:1024 \
  -e GOGC=50 \
  -e GOMEMLIMIT=56MiB \
  -e GOMAXPROCS=2 \
  hellodk/nginx-agent:v2
```

### Docker Compose Configuration

```yaml
version: '3.8'
services:
  avika-agent:
    image: hellodk/nginx-agent:v2
    deploy:
      resources:
        limits:
          cpus: '0.20'
          memory: 64M
        reservations:
          cpus: '0.05'
          memory: 32M
    environment:
      - GOGC=50
      - GOMEMLIMIT=56MiB
      - GOMAXPROCS=2
    ulimits:
      nofile:
        soft: 1024
        hard: 1024
      nproc:
        soft: 64
        hard: 64
```

### Helm Values Override

```bash
helm install avika ./deploy/helm/avika \
  --set agent.resources.limits.memory=64Mi \
  --set agent.resources.limits.cpu=200m \
  --set agent.resources.requests.memory=32Mi \
  --set agent.resources.requests.cpu=50m
```

---

## Go Runtime Tuning

The agent benefits from Go runtime environment variables:

| Variable | Value | Purpose |
|----------|-------|---------|
| `GOGC` | 50 | Trigger GC at 50% heap growth (default: 100) |
| `GOMEMLIMIT` | 56MiB | Soft memory limit for Go runtime |
| `GOMAXPROCS` | 2 | Limit concurrent OS threads |

These are set automatically in container deployments. For VM deployments, add to the systemd service:

```ini
[Service]
Environment="GOGC=50"
Environment="GOMEMLIMIT=56MiB"
Environment="GOMAXPROCS=2"
```

---

## Resource Limit Summary

| Deployment | CPU Limit | Memory Limit | Threads | Files |
|------------|-----------|--------------|---------|-------|
| **VM (systemd)** | 20% | 64MB | 64 | 1024 |
| **Kubernetes** | 200m | 64Mi | N/A | N/A |
| **Docker** | 0.2 CPU | 64MB | 64 | 1024 |

### Why These Limits?

Based on profiling:
- **CPU 200m (20%)**: Actual usage <5%, provides 4x headroom
- **Memory 64Mi**: Actual peak ~10MB, provides 6x headroom
- **Threads 64**: Actual goroutines ~24, provides 2.5x headroom
- **Files 1024**: Actual usage ~50, provides 20x headroom

### Profiling Endpoints

The agent exposes profiling endpoints on the health port (default: 5026):

| Endpoint | Description |
|----------|-------------|
| `/stats` | Runtime statistics (memory, goroutines, GC) |
| `/debug/pprof/` | pprof index page |
| `/debug/pprof/heap` | Heap memory profile |
| `/debug/pprof/goroutine` | Goroutine stack traces |
| `/debug/pprof/profile?seconds=N` | CPU profile (N seconds) |
| `/debug/pprof/allocs` | Allocation profile |
| `/debug/pprof/block` | Block profile |
| `/debug/pprof/mutex` | Mutex contention profile |

### Collecting Profiles

**Runtime stats (JSON):**
```bash
curl http://localhost:5026/stats | jq .
```

**Heap profile:**
```bash
curl http://localhost:5026/debug/pprof/heap > heap.pprof
go tool pprof -http=:8080 heap.pprof
```

**CPU profile (30 seconds):**
```bash
curl "http://localhost:5026/debug/pprof/profile?seconds=30" > cpu.pprof
go tool pprof -http=:8080 cpu.pprof
```

**Goroutine dump:**
```bash
curl http://localhost:5026/debug/pprof/goroutine?debug=2
```

### Running the Profiling Script

A comprehensive profiling script is available:

```bash
# Full profiling (30s duration per phase)
./scripts/profile_agent.sh

# Quick profiling (15s duration)
./scripts/profile_agent.sh --duration 15

# Custom output directory
./scripts/profile_agent.sh --output /tmp/profiles

# Skip rebuild
./scripts/profile_agent.sh --skip-build
```

The script generates:
- Markdown report with summary and recommendations
- pprof profiles (heap, goroutine, CPU, allocs)
- Raw JSON stats snapshots

### Stress Test Results

Under sustained load (metrics collection every 1 second, log tailing, gRPC streaming):

| Condition | Memory | Goroutines | CPU |
|-----------|--------|------------|-----|
| Idle | 1.4 MB | 23 | <1% |
| Normal operation | 2-3 MB | 23-24 | 1-2% |
| Gateway disconnected (buffering) | 3-5 MB | 23 | 1-2% |
| High log volume | 4-8 MB | 24-26 | 2-5% |

### Memory Leak Detection

The profiling confirms **no memory leaks** detected:

- Goroutine count remains stable (23-24) over extended periods
- Memory growth is bounded and reclaimed by GC
- Heap object count correlates with active work, not time

### Performance Characteristics

| Operation | Typical Latency | Memory Impact |
|-----------|----------------|---------------|
| Metrics collection | <10ms | ~100KB/collection |
| Log parsing (per line) | <1ms | ~1KB/line |
| gRPC stream send | <5ms | ~2KB/message |
| Health check response | <1ms | negligible |

---

## Troubleshooting

### No Metrics Displayed

1. Verify agent is connected (check Inventory page)
2. Confirm stub_status URL is correct
3. Check agent logs for collection errors
4. Verify NGINX is running on the host

### Stale Data

1. Check agent heartbeat (should be < 5 seconds old)
2. Verify network connectivity to gateway
3. Review gateway logs for ingestion errors

### Missing System Metrics

1. Ensure agent has read access to `/proc`
2. Check if running in container (may need privileged mode)
3. Verify system collector is enabled in agent
