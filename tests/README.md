# Tests (Top-Level Index)

This folder is the **single entry point** for Avika testing. It provides a structured mechanism to discover, run, and report tests across the repo.

## Existing Test Locations (Source of Truth)

- **Go**: `cmd/**/**_test.go`, `internal/common/**/**_test.go`
- **Frontend Unit**: `frontend/tests/unit/**` (Vitest)
- **Frontend E2E**: `frontend/tests/e2e/**` (Playwright)

## Folder Structure

```
tests/
├── README.md
├── unit/
│   ├── go/            # pointers to Go unit tests
│   └── frontend/      # pointers to frontend unit tests
├── integration/
│   ├── api/
│   └── database/
├── e2e/               # pointers to Playwright e2e
├── performance/
│   ├── k6/            # k6 scripts (container-friendly)
│   └── results/
├── security/
│   ├── injection/
│   ├── auth/
│   └── headers/
└── reports/
    ├── unit/
    ├── integration/
    ├── e2e/
    ├── performance/
    ├── security/
    └── summary/
```

## How to Run (Recommended)

Run everything (unit → integration → e2e → security → performance → report):

```bash
bash tests/run-all-tests.sh
```

## Environment Notes

### E2E (Playwright)

`frontend/playwright.config.ts` uses:
- `BASE_URL` env var, or defaults to `http://localhost:3000`

If you want E2E against Kubernetes, port-forward the frontend service and set `BASE_URL`:

```bash
kubectl -n avika-test port-forward svc/avika-test-frontend 3000:5031
BASE_URL=http://localhost:3000/avika npm -C frontend run test:e2e
```

### Performance (k6)

Performance tests are written for k6 and can be run via a container:

```bash
docker run --rm -i grafana/k6 run - < tests/performance/k6/load-test.js
```

