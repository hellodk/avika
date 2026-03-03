# Frontend E2E Tests (Playwright)

Source of truth lives in:
- `frontend/tests/e2e/**`

Run (local dev server):

```bash
make test-e2e
```

Run against a custom base URL:

```bash
BASE_URL="http://localhost:3000/avika" npm -C frontend run test:e2e
```

