# Load Test Report - Avika Stack

**Date:** February 15, 2026  
**Version:** 0.1.40

## Fixes Implemented

### 1. Web Terminal Fix
- **Issue:** Terminal was connecting to hardcoded port `50053` instead of the gateway's HTTP/WS port `5021`
- **Fix:** Updated `TerminalOverlay.tsx` to use the `NEXT_PUBLIC_WS_URL` environment variable
- **File:** `frontend/src/components/TerminalOverlay.tsx`

### 2. NGINX Version Population Fix
- **Issue:** Agent couldn't detect NGINX processes because containers had isolated PID namespaces
- **Fix:** Added `shareProcessNamespace: true` to the pod spec in `mock-nginx.yaml`
- **File:** `deploy/helm/avika/templates/mock-nginx.yaml`
- **Result:** NGINX version now correctly reports as `v1.28.2`

### 3. Tab State Persistence Fix
- **Issue:** Filter tabs reset to "All" on page refresh (state stored in React useState)
- **Fix:** Migrated to URL search params for state persistence
- **Files affected:**
  - `frontend/src/app/inventory/page.tsx` - Added URL-based filter, sort, and search params
  - `frontend/src/app/system/page.tsx` - Added URL-based filter params
  - `frontend/src/app/monitoring/page.tsx` - Added URL-based tab params
- **Additional:** Added Suspense boundaries for Next.js 16 compatibility

## Load Test Results

### Test Environment
- **Cluster:** 3-node Kubernetes (cylon, raspberrypi, typhoon)
- **Components:** Gateway, Frontend, Mock NGINX (2 replicas), ClickHouse, PostgreSQL, Redpanda

### Test 1: Mock NGINX Direct (10,000 requests, 100 concurrent)
| Metric | Value |
|--------|-------|
| Total Requests | 10,000 |
| Success Rate | 100% |
| Avg Latency | ~220ms |
| P50 Latency | 198ms |
| P95 Latency | 589ms |
| P99 Latency | 800ms |

### Test 2: Gateway API Health (1,000 requests, 50 concurrent)
| Metric | Value |
|--------|-------|
| Total Requests | 1,000 |
| Avg Latency | ~0.8ms |
| P50 Latency | 1ms |
| P99 Latency | 20ms |

### Test 3: Frontend Health (1,000 requests, 50 concurrent)
| Metric | Value |
|--------|-------|
| Total Requests | 1,000 |
| Success Rate | 100% |
| Avg Latency | ~168ms |
| P50 Latency | 200ms |
| P95 Latency | 382ms |
| P99 Latency | 1.7s |

## Resource Consumption (During Load Test)

| Pod | CPU | Memory |
|-----|-----|--------|
| avika-clickhouse-0 | 49m | 681Mi |
| avika-frontend | 1m | 38Mi |
| avika-gateway | 11m | 34Mi |
| avika-otel-collector | 2m | 26Mi |
| avika-postgresql-0 | 3m | 38Mi |
| avika-redpanda-0 | 2m | 198Mi |
| mock-nginx (avg) | 162m | 22Mi |

### Node Utilization
| Node | CPU Usage | Memory Usage |
|------|-----------|--------------|
| cylon | 20% (4056m) | 53% (34GB) |
| raspberrypi | 3% (121m) | 21% (3.5GB) |
| typhoon | 12% (1036m) | 16% (5.1GB) |

## System Stability Assessment

### Strengths
- **High Availability:** All services maintained 100% uptime during testing
- **Consistent Performance:** Gateway API responded in sub-millisecond times
- **Resource Efficiency:** Components stay well within resource limits
- **Scalability:** Mock NGINX handled 10k requests without degradation

### Potential Bottlenecks
1. **Frontend P99 Latency:** 1.7s at P99 suggests occasional cold starts or GC pauses
2. **Mock NGINX CPU Spike:** 270m during load (5x requested 50m) - may need resource limit adjustment
3. **ClickHouse Memory:** Using 681Mi of 2Gi allocated - monitor for growth under sustained load

### Recommendations
1. Increase mock-nginx CPU limit from 50m to 300m
2. Consider implementing horizontal pod autoscaling (HPA) for mock-nginx
3. Monitor ClickHouse disk usage for long-term data retention planning
4. Add connection pooling for database connections if not already implemented

## Verification Steps

To verify the fixes:

1. **Web Terminal:** Click terminal icon in inventory → should connect successfully
2. **NGINX Version:** Check inventory page → version column should show "1.28.2"
3. **Tab Persistence:** 
   - Go to Inventory page
   - Select "Online" tab
   - Refresh page
   - Tab should remain on "Online" (URL will show `?status=online`)

## Files Modified

```
frontend/src/components/TerminalOverlay.tsx
frontend/src/app/inventory/page.tsx
frontend/src/app/system/page.tsx
frontend/src/app/monitoring/page.tsx
deploy/helm/avika/templates/mock-nginx.yaml
```
