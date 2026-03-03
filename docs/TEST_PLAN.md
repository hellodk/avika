# AVIKA Test Plan (Comprehensive)

## Scope

This document defines a **comprehensive test suite** for the Avika (NGINX Manager) platform across:
- **Frontend (Next.js)**: UI, API proxy routes, dashboards
- **Gateway (Go)**: REST/gRPC, auth, RBAC, reports, provisioning, alerts
- **Agent (Go)**: agent management service, telemetry ingestion
- **Data stores**: PostgreSQL (core) and ClickHouse (analytics)
- **Kubernetes/Helm**: deployment correctness and runtime behavior

## Environments

- **Local (developer)**: unit + integration tests; E2E via local `npm run dev`
- **Kubernetes**: functional/system tests against deployed services (e.g. `avika-test`)

## Test Execution Matrix (High Level)

| Category | Tooling | Where | Output |
|---------|---------|-------|--------|
| Unit (Go) | `go test` | local CI runner | `test-results/go/*` |
| Unit (Frontend) | Vitest | local CI runner | `test-results/frontend/*` |
| Integration (Go + DB) | `go test -tags=integration` | local w/ Docker DB | `test-results/integration/*` |
| E2E (Browser) | Playwright | local CI runner | `frontend/playwright-report/` |
| Security (baseline) | curl scripts | local or K8s | `tests/reports/security/*` |
| Performance (baseline) | k6 (containerized) | local or K8s | `tests/reports/performance/*` |

## Pass/Fail Criteria

- **Unit/Integration/E2E**: exit code 0 and **no failing tests**
- **Security baseline**: no unauthenticated access to protected endpoints; no obvious injection success; security headers present where expected
- **Performance baseline**: p95 latency and error rate within configured thresholds for the target profile

## Test Catalog (Comprehensive)

Below is a structured catalog of test types. This is the **“what to test”** inventory; implementation lives under `tests/` plus existing project tests.

### A. Browser & UI Tests

| Test Type | Description |
|----------|-------------|
| Browser_E2E_Tests | Automated browser testing (Playwright/Cypress) |
| UI_Functionality_Tests | Click flows, form submissions, navigation |
| Visual_Regression_Tests | Screenshot comparisons |
| User_Flow_Tests | Login → Dashboard → Analytics → Logout |
| Cross_Browser_Tests | Chrome, Firefox, Safari/Edge compatibility |
| Mobile_Responsiveness_Tests | Viewports (mobile/tablet/desktop) |
| Accessibility_Tests | WCAG/aria, keyboard navigation |
| Theme_Tests | Dark/light mode, contrast, theming regressions |
| Localization_Tests | Locale formatting, translations (if enabled) |

### B. API & Integration Tests

| Test Type | Description |
|----------|-------------|
| REST_API_Functional_Tests | CRUD and behavior on REST endpoints |
| API_Contract_Tests | Schema/shape compatibility, breaking change detection |
| API_AuthN_Tests | Login/session/JWT/cookies, expiry, refresh logic |
| API_AuthZ_Tests | RBAC checks, least privilege enforcement |
| API_Pagination_Filter_Tests | paging, sorting, query parameters |
| API_Rate_Limit_Tests | throttling and abuse control |
| API_Idempotency_Tests | retry safety, duplicate requests |
| Webhook_Integration_Tests | outbound events delivery (if enabled) |
| gRPC_Functional_Tests | request/response correctness and errors |
| WS_Functional_Tests | websocket upgrade, messages, subscription behavior |

### C. Analytics & Time/Timezone Tests

| Test Type | Description |
|----------|-------------|
| Analytics_TimeWindow_Tests | relative windows (1h/24h/7d/30d) correctness |
| Analytics_AbsoluteRange_Tests | from/to timestamps, inclusivity, bucket sizing |
| Analytics_Timezone_Tests | UTC vs Browser TZ, DST edges |
| Analytics_Labeling_Tests | chart label formatting across ranges |
| Analytics_DataIntegrity_Tests | aggregation matches raw log reality |
| Analytics_EmptyData_Tests | no-data windows, missing agents, partial data |

### D. Performance & Reliability Tests

| Test Type | Description |
|----------|-------------|
| Load_Testing | sustained load at target throughput |
| Stress_Testing | ramp until saturation/failure |
| Spike_Testing | sudden traffic surges |
| Soak_Endurance_Testing | long duration stability |
| Scalability_Testing | behavior with replicas, HPA, resource limits |
| Latency_Benchmarking | p50/p95/p99 by endpoint |
| Throughput_Testing | RPS capacity and bottlenecks |
| Resource_Profiling | CPU/memory/goroutines, heap growth |
| Backpressure_Tests | queue/backlog behavior under overload |

### E. Data & Database Tests

| Test Type | Description |
|----------|-------------|
| Schema_Migration_Tests | migrate up/down, version correctness |
| Data_Integrity_Tests | constraints, uniqueness, FK relationships |
| Backup_Restore_Tests | restore correctness and recovery time |
| ConnectionPool_Tests | max conns, timeouts, retries |
| Query_Performance_Tests | ClickHouse aggregations, indices, partitions |
| Retention_TTL_Tests | retention rules, table TTLs (if configured) |
| Concurrency_Tests | races, deadlocks, transaction conflicts |

### F. Security Tests (Baseline)

| Test Type | Description |
|----------|-------------|
| SQL_Injection_Tests | `' OR 1=1--`, union/select probes |
| XSS_Tests | reflected/stored payload probes |
| CSRF_Tests | state-changing actions require protection |
| Auth_Bypass_Tests | session fixation, token tampering |
| BruteForce_Protection_Tests | throttling on repeated login failures |
| Sensitive_Data_Exposure_Tests | secrets/PII not in logs or responses |
| CORS_Policy_Tests | allowed origins and headers |
| Security_Header_Tests | CSP, HSTS, XFO, XCTO, etc. |
| Dependency_Vuln_Tests | govulncheck, npm audit (policy-based) |

### G. Deployment & Operational Tests

| Test Type | Description |
|----------|-------------|
| Helm_Template_Tests | render with profiles, no hardcoding, safe defaults |
| Rollout_Rollback_Tests | upgrade strategies, rollback safety |
| Probe_Tests | liveness/readiness correctness |
| Config_Secret_Injection_Tests | env, secretRef correctness |
| NodeScheduling_Tests | arch affinity, selectors, tolerations |
| Service_Discovery_Tests | DNS, service naming, ports |
| Observability_Tests | metrics endpoint, log format, tracing (if enabled) |
| Alerting_Tests | rules trigger correctly (if enabled) |

## Mapping to Repository Tests

- **Go tests**: `cmd/**/**_test.go`, `internal/common/**/**_test.go`
- **Frontend unit tests**: `frontend/tests/unit/**`
- **Frontend E2E**: `frontend/tests/e2e/**`
- **Additional suite scripts (this plan)**: `tests/**`

## Reporting Outputs

Expected outputs after a full run:
- `test-results/` (unit/integration/coverage artifacts)
- `frontend/playwright-report/` (E2E HTML report)
- `tests/reports/security/` (security run logs)
- `tests/reports/performance/` (k6 run logs/summary)
- `TEST_SUMMARY_REPORT.md` (final consolidated report)

