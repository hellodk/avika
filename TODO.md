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

### 2. Gateway Config Legacy Port Precedence
**Status**: Open (2026-02-16)  
**Severity**: HIGH - Causes configuration confusion  
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

### 3. AI Engine / Recommendations System
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

### 4. Graceful Kafka Connection Handling
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

### 5. Frontend Default Gateway Address
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

### 6. Database Fallback Logging
**Status**: Open (2026-02-16)  
**Severity**: MEDIUM - Debugging difficulty

**Problem**: "Trying fallback..." message doesn't explain what fallback means

**Impact**: Operators can't understand what credentials are being tried

**Fix**: Log which fallback DSN/credentials are being attempted (redact password)

---

## Low Priority

### 7. Root gateway.yaml Cleanup
**Status**: Open (2026-02-16)  
**Severity**: LOW - Maintenance

**Problem**: `gateway.yaml` in project root has outdated ports (50051/50053) and wrong database name

**Fix**: Either remove file or update to use standard ports (5020/5021) and correct DSN

---

### 8. Agent Binary Version Mismatch
**Status**: Open (2026-02-16)  
**Severity**: LOW - Cosmetic

**Problem**: Gateway binary shows `v0.0.1-dev` but VERSION file shows `0.1.45`

**Fix**: Build with proper ldflags: `-ldflags "-X main.Version=$(cat VERSION)"`

---

### 9. test_grpc.go Hardcoded Values
**Status**: Open (2026-02-16)  
**Severity**: LOW - Developer experience

**Problem**: Port and method hardcoded in test file

**Fix**: Read gateway address from env var or config file

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
- Test report: `TEST_OBSERVATIONS_2026-02-16.md`
- K8s Gateway: `10.101.68.5:5020` (gRPC), `10.101.68.5:5021` (HTTP)
