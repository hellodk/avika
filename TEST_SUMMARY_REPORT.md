# TEST_SUMMARY_REPORT

Generated at (UTC): `2026-03-03T11:35:44Z`

## Executive summary

- **Deployment under test**: Helm release `avika-test` in namespace `avika-test`
- **Overall result**: **PASS** (unit + integration + E2E + security baselines + k6 performance baselines)
- **Notable fixes made during execution**:
  - **Integration tests**: fixed `TestAlertRuleCRUD` to use UUID IDs (matches DB schema), and fixed `Makefile` to fail correctly on `go test | tee` pipelines.
  - **E2E (Playwright)**: stabilized BASE_PATH handling and Firefox reliability; Firefox E2E now passes.

## System under test (versions / runtime inventory)

- **Repo version**: `VERSION=1.1.0`
- **Git**: branch `feat/remote-config-mgmt`, commit `c8cb74d`
- **Helm**: `avika-test` chart `avika-0.1.93` (app version `0.1.93`)
- **Kubernetes namespace**: `avika-test`
- **Running workloads (images)**:
  - **Gateway**: `ghcr.io/hellodk/avika-gateway:latest` (`Deployment/avika-test-gateway`)
  - **Frontend**: `ghcr.io/hellodk/avika-frontend:latest` (`Deployment/avika-test-frontend`)

## Access paths used for testing

- **Gateway (port-forward)**: `http://localhost:5021`
- **Frontend (port-forward)**: `http://localhost:3000` with **BASE_PATH** `/avika` (UI at `http://localhost:3000/avika`)

## Test execution summary

### Unit tests (Go + Frontend)

- **Command**: `make test-unit`
- **Result**: **PASS**
- **Primary artifacts**:
  - `tests/reports/unit/test-unit-20260303T112419Z.log`
  - `test-results/go/*-output.txt`
  - `test-results/frontend/junit.xml`

### Integration tests (Gateway + Postgres)

- **Command**:
  - `make setup-test-db`
  - `make test-integration`
  - `make teardown-test-db`
- **Result**: **PASS**
- **Primary artifacts**:
  - `tests/reports/integration/test-integration-20260303T113403Z.log`
  - `test-results/integration/output.txt`
  - `test-results/integration/coverage.out`

### Browser E2E tests (Playwright)

- **Command (Firefox)**:
  - `cd frontend && CI=1 BASE_URL=http://localhost:3000 BASE_PATH=/avika npx playwright test --project=firefox --retries=0 --workers=1`
- **Result**: **PASS** (`141 passed`)
- **Primary artifacts**:
  - `tests/reports/e2e/playwright-firefox-20260303T112511Z.log`
  - `frontend/test-results/` (screenshots/videos on failures; terminal test also saves screenshots during run)

### Security baseline tests (HTTP headers, auth, injection probes)

- **Command**: `bash tests/security/run-all.sh`
- **Result**: **PASS** (baseline expectations met; see notes below)
- **Artifacts** (timestamped):
  - `tests/reports/security/header-tests-20260303T111235Z.log`
  - `tests/reports/security/auth-tests-20260303T111235Z.log`
  - `tests/reports/security/injection-tests-20260303T111235Z.log`

**Security notes / observations**
- **Gateway security headers**: `X-Content-Type-Options: nosniff` observed on `GET /` (404 response). Other hardening headers (CSP, X-Frame-Options, HSTS) are **environment-dependent** and were not asserted as mandatory by the baseline script.
- **`/api/auth/me`**: returned `401` even with a valid session cookie in this test setup. This may be expected depending on which component owns that route (gateway vs frontend) and how auth is wired in your deployment.

### Performance/load tests (k6 via Docker)

Executed against **Gateway** `GET /health` (and `/ready` for the benchmark).

- **Artifacts**:
  - `tests/reports/performance/k6-api-benchmark-20260303T111420Z.log`
  - `tests/reports/performance/k6-load-test-20260303T111420Z.log`
  - `tests/reports/performance/k6-spike-test-20260303T111420Z.log`
  - `tests/reports/performance/k6-stress-test-20260303T111420Z.log`

**Headline results (from logs)**
- **Benchmark (10 VUs, 30s)**: `p95 ~ 4.49ms`, `http_req_failed 0%`
- **Load (ramp to 100 VUs)**: `p95 ~ 1.82ms`, `http_req_failed 0%`
- **Spike (to 300 VUs)**: `p95 ~ 3.12ms`, `http_req_failed 0%`
- **Stress (to 400 VUs)**: `p95 ~ 2.58ms`, `http_req_failed 0%`

## Folder structure for test cases & reports

- **Test plan**: `docs/TEST_PLAN.md`
- **Test suite root**: `tests/`
  - **Master runner**: `tests/run-all-tests.sh`
  - **Security tests**: `tests/security/` (runner: `tests/security/run-all.sh`)
  - **Performance tests**: `tests/performance/k6/`
  - **Collected run artifacts**: `tests/reports/` (subfolders: `unit/`, `integration/`, `e2e/`, `security/`, `performance/`)

## Change log (test stabilization / correctness)

- **`cmd/gateway/database_integration_test.go`**:
  - Updated alert rule integration test to use UUID IDs (schema uses `UUID PRIMARY KEY`).
  - Updated cleanup query to delete test alert rules by `name` prefix (not by UUID `id`).
- **`Makefile`**:
  - Ensured `go test | tee` pipelines propagate failures using `bash -o pipefail -c ...`.
- **`frontend/tests/e2e/*`**:
  - Improved BASE_PATH stability and reduced flakiness (including Firefox pass).

