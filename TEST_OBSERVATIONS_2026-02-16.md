# Test Observations Report - 2026-02-16

**Project**: Avika NGINX Manager  
**Version**: 0.1.45 (Gateway: 0.1.44 in K8s)  
**Tester**: Principal Engineer (AI Assistant)  
**Date**: February 16, 2026  

---

## Executive Summary

Comprehensive testing of the Avika NGINX Manager was performed against the K8s cluster deployment. The system is **largely functional** with several issues identified that need attention.

### Quick Stats
- **Unit Tests**: 128/128 Frontend PASSED, 50+ Go tests PASSED
- **Integration Tests**: Gateway/Agent connectivity verified
- **K8s Deployment**: 7 agents connected successfully
- **Critical Issues**: 2
- **Medium Issues**: 4
- **Low Issues**: 3

---

## Test Environment

- **OS**: Linux 6.14.0-37-generic
- **Go Version**: 1.25.4
- **Node Version**: 22.13.1
- **NPM Version**: 10.9.2
- **K8s Gateway**: 10.101.68.5:5020 (gRPC), 10.101.68.5:5021 (HTTP)
- **Infrastructure**: PostgreSQL 16, ClickHouse 24.1, Redpanda v23.3.3

---

## Test Categories & Results

### 1. Unit Tests - Go

#### 1.1 Gateway Tests (`cmd/gateway/`)
| Test Suite | Tests | Status | Notes |
|------------|-------|--------|-------|
| gateway_test.go | 22 | ✅ PASS | All health/ready/CORS/timeout tests pass |
| provisions_test.go | 4 | ✅ PASS | Rate limiting, health checks, error pages |
| middleware/ratelimit_test.go | 6 | ✅ PASS | Rate limiter, middleware, IP extraction |
| middleware/validation_test.go | 11+ | ✅ PASS | Validators, sanitizers, query params |

**Sample Output**:
```
=== RUN   TestHealthEndpoint
--- PASS: TestHealthEndpoint (0.00s)
=== RUN   TestCORSHeaders
--- PASS: TestCORSHeaders (0.00s)
=== RUN   TestRateLimitSimulation
--- PASS: TestRateLimitSimulation (0.00s)
PASS ok github.com/avika-ai/avika/cmd/gateway 1.136s
```

#### 1.2 Agent Tests (`cmd/agent/agent_test.go`)
| Test | Status | Notes |
|------|--------|-------|
| TestAddressProtocolStripping | ✅ PASS | http/https prefix removal works |
| TestAgentIDGeneration | ✅ PASS | hostname-IP format correct |
| TestVersionInfo | ✅ PASS | Version constants populated |
| TestPortConstants | ✅ PASS | Ports in 5020-5050 range |
| TestParseGatewayAddresses | ✅ PASS | Single/multiple/prefix/whitespace |
| TestConfigValidation | ✅ PASS | Port range validation |

#### 1.3 Common Module Tests (`internal/common/vault/`)
| Test | Status | Notes |
|------|--------|-------|
| TestNewClient | ✅ PASS | Client instantiation |
| TestGetSecret | ✅ PASS | Secret retrieval |
| TestGetPostgresDSN | ✅ PASS | DSN generation |
| TestGetClickHouseConfig | ✅ PASS | ClickHouse config |
| TestGetRedpandaConfig | ✅ PASS | Redpanda config |

---

### 2. Unit Tests - Frontend

| Test Suite | Tests | Status | Notes |
|------------|-------|--------|-------|
| themes.test.ts | 53 | ✅ PASS | Theme configuration |
| provisions.test.ts | 19 | ✅ PASS | Provision templates |
| utils.test.ts | 9 | ✅ PASS | Utility functions |
| card.test.tsx | 23 | ✅ PASS | Card component |
| button.test.tsx | 24 | ✅ PASS | Button component |
| **TOTAL** | **128** | ✅ PASS | 1.00s execution |

---

### 3. Gateway API

#### 3.1 REST Endpoints
| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| `/health` | GET | ✅ PASS | `{"status":"healthy","version":"0.1.44"}` |
| `/ready` | GET | ✅ PASS | `{"status":"ready"}` |
| `/metrics` | GET | ✅ PASS | Prometheus format metrics |
| `/terminal` | WS | ⚠️ UNTESTED | Requires agent management port |
| `/export-report` | GET | ⚠️ UNTESTED | PDF generation |

#### 3.2 gRPC Services
| Service/Method | Status | Notes |
|----------------|--------|-------|
| AgentService/ListAgents | ✅ PASS | Returns 7 agents from K8s |
| AgentService/GetAnalytics | ✅ PASS | Returns gateway metrics |
| AgentService/GetAgent | ✅ PASS | Returns single agent details |
| Commander/Connect | ✅ PASS | Agents streaming heartbeats |

**ListAgents Response** (7 agents):
- mock-nginx-7679d49585-txfw5 (v0.1.44)
- mock-nginx-7679d49585-x7mj4 (v0.1.44)
- mock-nginx-d857cb8d9-5pgcc (v0.1.42)
- mock-nginx-d857cb8d9-zhws2 (v0.1.42)
- nginx-77654bd66d-w85bz (v0.1.45)
- nginx-77654bd66d-fpjpb (v0.1.45)
- nginx-77654bd66d-z5cll (v0.1.45)

---

### 4. Agent Functionality

| Feature | Status | Notes |
|---------|--------|-------|
| Heartbeat transmission | ✅ PASS | 1s interval, includes NGINX instances |
| Multi-gateway support | ✅ PASS | Comma-separated addresses |
| K8s pod detection | ✅ PASS | `is_pod: true` in responses |
| Agent version reporting | ✅ PASS | Shows build date, git commit |
| NGINX version detection | ✅ PASS | Reports v1.28.2 |

---

### 5. Frontend UI

| Page | Status | Notes |
|------|--------|-------|
| Dashboard (/) | ✅ PASS | Renders, shows agent count |
| Inventory (/inventory) | ⚠️ UNTESTED | Manual browser test needed |
| Monitoring (/monitoring) | ⚠️ UNTESTED | Manual browser test needed |
| Alerts (/alerts) | ⚠️ UNTESTED | Empty rules array |
| Analytics (/analytics) | ✅ PASS | Shows "Systems Healthy" |
| Optimization (/optimization) | ⚠️ EXPECTED EMPTY | AI Engine disabled |
| Reports (/reports) | ⚠️ UNTESTED | PDF generation |

---

### 6. Database Operations

#### 6.1 PostgreSQL
| Operation | Status | Notes |
|-----------|--------|-------|
| Connection | ✅ PASS | Uses DSN from config |
| Agent persistence | ✅ PASS | 7 agents stored |
| Alert rules | ✅ PASS | Empty initially |
| Fallback auth | ⚠️ ISSUE | See Issue #5 |

#### 6.2 ClickHouse
| Operation | Status | Notes |
|-----------|--------|-------|
| Connection | ✅ PASS | Connects on port 9000 |
| TTL migrations | ❌ FAIL | See Issue #1 |
| Log insertion | ⚠️ UNTESTED | No traffic data |
| Analytics queries | ✅ PASS | Returns empty (no data) |

---

## Issues Found

### ❌ Critical Issues

#### Issue #1: ClickHouse TTL Migration Failures
**Severity**: CRITICAL (affects data retention)  
**Component**: Gateway → ClickHouse  
**Error**:
```
ClickHouse migration query failed [ALTER TABLE nginx_analytics.access_logs MODIFY TTL timestamp + INTERVAL 7 DAY]: 
code: 450, message: TTL expression result column should have DateTime or Date type, but has DateTime64(3)
```
**Affected Tables**: access_logs, spans, system_metrics, nginx_metrics, gateway_metrics  
**Root Cause**: Schema uses DateTime64 columns but TTL expressions expect DateTime  
**Impact**: Data retention policies not applied, potential storage growth  
**Fix Location**: `deploy/docker/clickhouse-schema.sql`

---

#### Issue #2: Gateway Config Legacy Port Precedence
**Severity**: HIGH (affects deployments)  
**Component**: Gateway config loading  
**Problem**: Legacy `port`/`ws_port` fields take precedence over new `grpc_port`/`http_port`  
**Code Location**: `cmd/gateway/config/config.go:121-128`
```go
func (c *Config) GetHTTPAddress() string {
    // Support legacy WSPort field
    if c.Server.WSPort != "" && strings.HasPrefix(c.Server.WSPort, ":") {
        return c.Server.WSPort  // THIS TAKES PRECEDENCE
    }
    return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.HTTPPort)
}
```
**Impact**: Confusing config behavior, old YAML files use wrong ports  
**Recommendation**: Remove legacy port support or fix precedence logic

---

### ⚠️ Medium Priority Issues

#### Issue #3: Kafka Connection Errors (Non-Critical)
**Severity**: MEDIUM (doesn't break core functionality)  
**Component**: Gateway → Kafka/Redpanda  
**Error**:
```
Error reading recommendation: fetching message: failed to dial: failed to open connection to localhost:29092: dial tcp 127.0.0.1:29092: connect: connection refused
```
**Root Cause**: Redpanda not running (AI Engine disabled)  
**Impact**: Log spam, recommendation consumer fails  
**Recommendation**: Add graceful handling when Kafka unavailable, or disable consumer when AI Engine is off

---

#### Issue #4: Frontend Default Gateway Address
**Severity**: MEDIUM (affects local development)  
**Component**: Frontend gRPC client  
**File**: `frontend/src/lib/grpc-client.ts:41`
```typescript
const GATEWAY_GRPC_ADDR = process.env.GATEWAY_GRPC_ADDR || ... || 'avika-gateway:50051';
```
**Problem**: Default `avika-gateway:50051` is K8s service name, fails for local dev  
**Impact**: Frontend can't connect to gateway without .env.local  
**Recommendation**: Default to `localhost:5020` or document required env vars

---

#### Issue #5: Database Password Fallback Silent
**Severity**: MEDIUM  
**Component**: Gateway database connection  
**Observation**: Logs show "Trying fallback..." but doesn't clarify what fallback means  
**Impact**: Debugging difficulty  
**Recommendation**: Log which fallback credentials are being tried

---

#### Issue #6: test_grpc.go Uses Hardcoded Port
**Severity**: LOW  
**File**: `test_grpc.go`  
**Problem**: Port was hardcoded to 50051, now changed to 5020  
**Impact**: Test script needed manual fixes  
**Recommendation**: Read port from env or config

---

### 📝 Low Priority Issues

#### Issue #7: gateway.yaml in Root Directory
**Severity**: LOW  
**Problem**: `gateway.yaml` in project root has outdated config (50051/50053 ports)  
**Impact**: Confusion, accidental use of wrong config  
**Recommendation**: Remove or update to use standard ports (5020/5021)

---

#### Issue #8: Agent Binary Version Mismatch
**Severity**: LOW (cosmetic)  
**Observation**: Gateway binary shows `v0.0.1-dev` but VERSION file shows `0.1.45`  
**Impact**: Version tracking unclear  
**Fix**: Build with proper `-ldflags "-X main.Version=..."`

---

#### Issue #9: Redpanda Port Conflict
**Severity**: LOW (local dev only)  
**Problem**: Port 8081 conflicts with kubectl port-forward  
**Impact**: Can't start Redpanda with full docker-compose  
**Workaround**: Change Redpanda admin port or stop kubectl

---

## Observations (Not Issues)

### 1. Analytics Empty Data
- All analytics endpoints return empty arrays (no traffic through NGINX instances)
- Gateway metrics ARE populated (EPS, memory, goroutines)
- This is expected behavior with no actual traffic

### 2. Agent Version Mix
- Three different agent versions in cluster: 0.1.42, 0.1.44, 0.1.45
- Not an issue, just observation for tracking

### 3. AI Engine Disabled
- `/optimization` page shows no recommendations
- Expected: `aiEngine.replicaCount: 0` in values.yaml
- TODO.md documents this as "parked"

### 4. NGINX Instance Count
- Agents report 5 or 9 NGINX instances each
- Total across cluster: ~47 NGINX instances monitored

---

## Test Commands Reference

```bash
# Unit tests
make test-go          # Gateway + Agent + Common
make test-frontend    # Frontend Vitest

# Start infrastructure
cd deploy/docker && docker compose up -d postgres clickhouse

# Test gateway health
curl http://10.101.68.5:5021/health
curl http://10.101.68.5:5021/ready

# Test gRPC
go run test_grpc.go

# Start frontend (local)
cd frontend && npm run dev

# Test frontend API
curl http://localhost:3000/api/servers
curl http://localhost:3000/api/analytics?window=1h
```

---

## Recommendations

### Immediate (Before Next Release)
1. **Fix ClickHouse TTL schema** - Change DateTime64 to DateTime or fix TTL expressions
2. **Document .env.local requirements** for local development

### Short-term
3. Gracefully handle missing Kafka connection
4. Remove or deprecate legacy port configuration
5. Update gateway.yaml in root or remove it

### Long-term
6. Enable AI Engine for recommendation testing
7. Add E2E tests for full workflow
8. Add integration tests for ClickHouse operations

---

## Files Changed During Testing

| File | Change | Reason |
|------|--------|--------|
| `gateway.yaml` | Updated ports, DSN | Testing with correct config |
| `test_grpc.go` | Changed port to 5020, method to ListAgents | Testing K8s gateway |
| `frontend/.env.local` | Created with K8s gateway IP | Local development |

---

## Conclusion

The Avika NGINX Manager is **functional and production-ready for core use cases**:
- ✅ Agent registration and heartbeats
- ✅ Multi-agent fleet management
- ✅ K8s deployment
- ✅ Gateway health monitoring
- ✅ Frontend dashboard

**Requires attention**:
- ❌ ClickHouse TTL schema fix (critical for data retention)
- ⚠️ Configuration management cleanup
- ⚠️ Better error handling for optional components (Kafka)

**Not tested** (need manual browser testing or traffic generation):
- Web terminal (requires running NGINX with agent management port)
- PDF report generation
- Log streaming
- Configuration updates/rollback
- Certificate management

---

*Report generated: 2026-02-16 06:20 UTC*
