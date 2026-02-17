# Avika - Pending Tasks

## Critical Priority

### 1. ClickHouse TTL Schema Fix
**Status**: Open (2026-02-16)  
**Severity**: CRITICAL - Affects data retention  
**Found by**: Automated testing

**Problem**: TTL expressions fail because schema uses DateTime64 but TTL expects DateTime
```
ClickHouse migration query failed [ALTER TABLE nginx_analytics.access_logs MODIFY TTL timestamp + INTERVAL 7 DAY]: 
code: 450, message: TTL expression result column should have DateTime or Date type, but has DateTime64(3)
```

**Affected Tables**:
- `access_logs` (TTL 7 days)
- `spans` (TTL 7 days)
- `system_metrics` (TTL 30 days)
- `nginx_metrics` (TTL 30 days)
- `gateway_metrics` (TTL 30 days)

**Impact**: Data retention policies not applied, potential unbounded storage growth

**Fix Location**: `deploy/docker/clickhouse-schema.sql`

**Options**:
1. Change DateTime64 columns to DateTime
2. Update TTL expressions to cast DateTime64 to DateTime: `TTL toDateTime(timestamp) + INTERVAL 7 DAY`

---

### 2. ClickHouse Authentication Failure (K8s)
**Status**: Open (2026-02-17)  
**Severity**: CRITICAL - Logs not being persisted  
**Found by**: Principal Tester - gateway pod logs

**Problem**: Gateway cannot flush logs to ClickHouse due to authentication failure
```
FlushLogs: PrepareBatch failed: code: 516, message: default: 
Authentication failed: password is incorrect, or there is no user with such name.
```

**Impact**: 
- Agent logs are NOT being persisted to ClickHouse
- Analytics/metrics data loss
- Log-based features (search, analytics) won't work

**Location**: K8s deployment - gateway-to-clickhouse connection

**Fix Options**:
1. Update ClickHouse password in K8s secret/configmap
2. Create proper user in ClickHouse deployment
3. Verify `clickhouse_dsn` in gateway configuration

---

### 3. Gateway Config Legacy Port Precedence
**Status**: Open (2026-02-16)  
**Severity**: MEDIUM - Causes configuration confusion  
**Found by**: Automated testing

**Problem**: Legacy `port`/`ws_port` fields take precedence over new `grpc_port`/`http_port` even when legacy fields are set by defaults

**File**: `cmd/gateway/config/config.go:121-128`
```go
func (c *Config) GetHTTPAddress() string {
    // Support legacy WSPort field
    if c.Server.WSPort != "" && strings.HasPrefix(c.Server.WSPort, ":") {
        return c.Server.WSPort  // THIS TAKES PRECEDENCE
    }
    return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.HTTPPort)
}
```

**Impact**: 
- YAML with only new-style ports still uses old defaults
- Confusing behavior for operators
- Root `gateway.yaml` had outdated 50051/50053 ports

**Fix Options**:
1. Remove legacy port support entirely
2. Only use legacy ports if explicitly set (not from defaults)
3. Add deprecation warning when legacy ports used

---

## High Priority

### 4. AI Engine / Recommendations System
**Status**: Parked (2026-02-15)  
**Context**: The AI Engine is currently disabled (`replicaCount: 0`) which means the `/optimization` page shows no recommendations.

**Architecture**:
```
Agent → Gateway → Redpanda (Kafka) → AI Engine (anomaly detection) → Redpanda → Gateway → Frontend
```

**Options to implement**:
1. **Enable AI Engine** - Set `aiEngine.replicaCount: 1` in `deploy/helm/avika/values.yaml`
   - Pros: Real ML anomaly detection (River HalfSpaceTrees), adaptive learning
   - Cons: Requires Kafka pipeline, more resources
   
2. **Rule-Based Recommendations in Gateway** - Add threshold-based rules directly in Gateway
   - Pros: Simpler, no Kafka dependency
   - Cons: No adaptive learning, manual thresholds

3. **Hybrid** - Basic rules in Gateway + optional AI Engine later

**Files involved**:
- `ai-engine/main.py` - AI anomaly detection engine
- `ai-engine/log_aggregator.py` - Log aggregation pipeline
- `cmd/gateway/main.go` - `startRecommendationConsumer()` function (line ~908)
- `deploy/helm/avika/values.yaml` - `aiEngine.replicaCount` setting

**To resume**: Ask the AI assistant to "implement recommendations for the optimization page" and share this file.

---

## Medium Priority

### 5. Graceful Kafka Connection Handling
**Status**: Open (2026-02-16)  
**Severity**: MEDIUM - Log noise when Kafka unavailable

**Problem**: Recommendation consumer logs errors every 15s when Kafka/Redpanda not available
```
Error reading recommendation: fetching message: failed to dial: failed to open connection to localhost:29092
```

**Impact**: Log noise, potential resource waste on retry loops

**File**: `cmd/gateway/main.go` - `startRecommendationConsumer()`

**Fix Options**:
1. Don't start consumer when AI Engine disabled
2. Add exponential backoff with max retries
3. Add config flag to disable recommendation consumer

---

### 6. Frontend Default Gateway Address
**Status**: Open (2026-02-16)  
**Severity**: MEDIUM - Breaks local development

**Problem**: Frontend defaults to `avika-gateway:50051` which is K8s service name

**File**: `frontend/src/lib/grpc-client.ts:41`
```typescript
const GATEWAY_GRPC_ADDR = process.env.GATEWAY_GRPC_ADDR || ... || 'avika-gateway:50051';
```

**Impact**: Frontend can't connect to gateway without `.env.local` in local dev

**Fix Options**:
1. Default to `localhost:5020` for development
2. Add `.env.local.example` file with documentation
3. Better error message when connection fails

---

### 7. Database Fallback Logging
**Status**: Open (2026-02-16)  
**Severity**: MEDIUM - Debugging difficulty

**Problem**: "Trying fallback..." message doesn't explain what fallback means

**Impact**: Operators can't understand what credentials are being tried

**Fix**: Log which fallback DSN/credentials are being attempted (redact password)

---

## Low Priority

### 8. Root gateway.yaml Cleanup
**Status**: Open (2026-02-16)  
**Severity**: LOW - Maintenance

**Problem**: `gateway.yaml` in project root has outdated ports (50051/50053) and wrong database name

**Fix**: Either remove file or update to use standard ports (5020/5021) and correct DSN

---

### 9. Agent Binary Version Mismatch
**Status**: Open (2026-02-16)  
**Severity**: LOW - Cosmetic

**Problem**: Gateway binary shows `v0.0.1-dev` but VERSION file shows `0.1.45`

**Fix**: Build with proper ldflags: `-ldflags "-X main.Version=$(cat VERSION)"`

---

### 10. test_grpc.go Hardcoded Values
**Status**: Open (2026-02-16)  
**Severity**: LOW - Developer experience

**Problem**: Port and method hardcoded in test file

**Fix**: Read gateway address from env var or config file

---

### 11. Stale Frontend Unit Tests
**Status**: ✅ FIXED (2026-02-17)  
**Severity**: LOW - CI noise  
**Found by**: Principal Tester

**Problem**: 5 tests in `login.test.tsx` expected old UI elements

**Fix Applied**: Updated test expectations in `frontend/tests/unit/app/login.test.tsx`:
- "Welcome to Avika" → "Sign In"
- placeholder="admin" → placeholder="Enter your username"
- Shield icon selector → Security badge text check
- CSS class check → Inline style attribute check
- "signing in" → "Authenticating..."

---

### 12. Stale E2E Tests
**Status**: ✅ FIXED (2026-02-17)  
**Severity**: LOW - CI noise  
**Found by**: Principal Tester

**Problem**: 2 tests in `auth.spec.ts` expected old UI elements

**Fix Applied**: Updated test expectations in `frontend/tests/e2e/auth.spec.ts`:
- getByText('Welcome to Avika') → getByRole('heading', { name: 'Sign In' })
- placeholder="admin" → placeholder="Enter your username"

---

### 13. Integration Test DB Credential Mismatch
**Status**: Open (2026-02-17)  
**Severity**: LOW - Local development only  
**Found by**: Principal Tester

**Problem**: 17 integration tests fail with `pq: password authentication failed for user "admin"`

**Root Cause**: Tests expect `TEST_DSN` environment variable but also have hardcoded fallback

**Impact**: Cannot run full integration test suite locally without setup

**Fix Options**:
1. Document required `TEST_DSN` in README
2. Add `make setup-test-db` to automatically configure credentials
3. Use Docker test container with known credentials

---

## Completed Tasks (2026-02-17)

- [x] Full test suite execution (191 Go unit tests PASS)
- [x] Frontend unit tests: 150/150 PASS (fixed 5 stale tests in `login.test.tsx`)
- [x] E2E auth tests: 26/26 PASS (fixed 2 stale tests in `auth.spec.ts`)
- [x] Integration tests (24/41 passed, 17 DB credential issue)
- [x] Gateway API validation (health, ready, metrics, auth)
- [x] Agent functionality verified (heartbeats, metrics, logs flowing)
- [x] Test report generated: `TEST_REPORT_2026-02-17.md`
- [x] Critical issue found: ClickHouse auth failure in K8s

---

## Completed Tasks (2026-02-16)

- [x] Comprehensive use case testing performed
- [x] Test observations documented in `TEST_OBSERVATIONS_2026-02-16.md`
- [x] Frontend configured for K8s gateway (`frontend/.env.local`)
- [x] Verified 7 agents connected via K8s gateway
- [x] Verified gRPC APIs: ListAgents, GetAgent, GetAnalytics
- [x] Verified REST APIs: /health, /ready, /metrics
- [x] Verified agent config retrieval and certificate discovery

---

## Completed Tasks (2026-02-15)

- [x] Moved `build.sh` to `scripts/build-stack.sh`
- [x] Built and deployed all components (v0.1.40)
  - avika-agent
  - gateway
  - avika-frontend
- [x] Agent ID now uses hostname only (not hostname+IP)
- [x] Renamed test agents to `mock-nginx`
- [x] Unified gateway config to single `GATEWAYS` parameter
- [x] Renamed `-server` CLI flag to `-gateway`
- [x] Fixed agent logging for containers (`LOG_FILE=""`)

---

## Notes

- Log Aggregator is also disabled - it was for Kafka-based log pipeline but Gateway writes directly to ClickHouse now
- Current version: **0.1.45**
- Latest test report: `TEST_REPORT_2026-02-17.md`
- Previous test report: `TEST_OBSERVATIONS_2026-02-16.md`
- K8s Gateway: `10.101.68.5:5020` (gRPC), `10.101.68.5:5021` (HTTP)

## Test Results Summary (2026-02-17)

| Test Category | Passed | Failed | Notes |
|---------------|--------|--------|-------|
| Go Unit Tests | 191 | 0 | All pass |
| Frontend Unit | 150 | 0 | ✅ Fixed stale tests |
| Integration | 24 | 17 | DB credentials |
| E2E (Auth) | 26 | 0 | ✅ Fixed stale tests |
| Gateway APIs | 5 | 0 | All pass |
| Agent | Working | - | Heartbeats OK |
