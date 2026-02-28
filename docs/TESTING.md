# Avika NGINX Manager - Testing Guide

## Overview

This document describes the testing infrastructure, CI/CD pipeline, security scanning, and how to run and view test results.

## Test Infrastructure

### Test Types

| Type | Framework | Location | Command |
|------|-----------|----------|---------|
| Go Unit Tests | Go `testing` | `cmd/*/`, `internal/*/` | `make test-go` |
| Frontend Unit Tests | Vitest | `frontend/tests/unit/` | `make test-frontend` |
| E2E Tests | Playwright | `frontend/tests/e2e/` | `make test-e2e` |
| Integration Tests | Go `testing` | `cmd/gateway/*_integration_test.go` | `make test-integration` |

### Running Tests

```bash
# Run all unit tests
make test-unit

# Run Go tests only
make test-go

# Run frontend tests only
make test-frontend

# Run E2E tests
make test-e2e

# Run E2E tests with UI (interactive)
make test-e2e-ui

# Run all tests including integration
make test-all

# Run tests with coverage
make test-coverage

# Generate HTML test reports
make test-full-report
```

## Test Dashboard & Reports

### GitHub Actions Dashboard

When connected to GitHub, test results are visible in:

1. **Actions Tab**: Navigate to `https://github.com/<org>/<repo>/actions`
2. **Pull Request Checks**: Each PR shows test status
3. **Artifacts**: Test reports uploaded as artifacts after each run

### Local Test Reports

```bash
# Generate and open HTML test report
make test-full-report

# Generate PDF test report
make test-full-pdf

# Open Playwright report
make test-e2e-report
```

Reports are saved to:
- Go tests: `test-results/go/`
- Frontend tests: `frontend/coverage/`
- E2E tests: `frontend/playwright-report/`

### Coverage Reports

Coverage data is uploaded to **Codecov** on every push. View at:
- `https://codecov.io/gh/<org>/<repo>`

Local coverage:
```bash
make test-coverage
cat test-results/coverage/summary.txt
```

## Security Scanning (SAST/SCA/OWASP)

### Static Application Security Testing (SAST)

| Tool | Target | Trigger | Report |
|------|--------|---------|--------|
| **Gosec** | Go code | Every push | SARIF → GitHub Security |
| **ESLint** | TypeScript/JavaScript | Every push | Console output |
| **TypeScript** | Frontend | Every push | Type check errors |

### Software Composition Analysis (SCA)

| Tool | Target | Trigger | Report |
|------|--------|---------|--------|
| **govulncheck** | Go dependencies | Every push | Console output |
| **npm audit** | Node dependencies | Every push | Console output |
| **Snyk** (if configured) | All dependencies | Every push | Snyk Dashboard |
| **Dependency Review** | PRs only | Pull requests | PR comments |

### Container Security

| Tool | Target | Trigger | Report |
|------|--------|---------|--------|
| **Trivy** | Docker images | Main branch | SARIF → GitHub Security |

### OWASP Compliance

| Check | Tool | Status |
|-------|------|--------|
| **OWASP Dependency-Check** | dependency-check-action | ✅ Enabled |
| **Injection Prevention** | Gosec rules | ✅ Enabled |
| **Broken Auth** | Manual code review | N/A |
| **Sensitive Data Exposure** | Gitleaks | ✅ Enabled |
| **XML External Entities** | N/A (no XML parsing) | N/A |
| **Broken Access Control** | Manual code review | N/A |
| **Security Misconfiguration** | Container scanning | ✅ Enabled |
| **Cross-Site Scripting** | React escaping + ESLint | ✅ Enabled |
| **Insecure Deserialization** | Go type safety | ✅ Enabled |
| **Vulnerable Components** | All SCA tools | ✅ Enabled |
| **Insufficient Logging** | Structured logging | ✅ Implemented |

### Running Security Scans Locally

```bash
# Go vulnerability check
make security-scan

# Install and run gosec
go install github.com/securego/gosec/v2/cmd/gosec@latest
gosec ./...

# npm audit
cd frontend && npm audit

# Check for secrets in code
# Install gitleaks: https://github.com/gitleaks/gitleaks
gitleaks detect
```

## SBOM (Software Bill of Materials)

The CI pipeline generates an SBOM using Syft. Download from the GitHub Actions artifacts.

```bash
# View SBOM artifact
# Go to Actions → Latest workflow run → Artifacts → sbom
```

## Test Coverage Requirements

### Recommended Coverage Targets

| Component | Current | Target |
|-----------|---------|--------|
| Gateway | ~15% | 60% |
| Agent | ~25% | 60% |
| Frontend Pages | ~10% | 50% |
| API Routes | ~20% | 50% |
| Components | ~10% | 40% |

### Coverage by Area

```
Gateway:
  ✅ gateway_test.go - Basic HTTP handlers
  ✅ provisions_test.go - Provisioning logic
  ✅ alerts_test.go - Alert engine
  ✅ email_test.go - Email functionality
  ✅ clickhouse_test.go - ClickHouse operations
  ✅ reports_test.go - Report generation

Agent:
  ✅ agent_test.go - Core agent functionality
  ✅ mgmt_service_test.go - Management service

Frontend:
  ✅ login.test.tsx - Login page
  ✅ dashboard.test.tsx - Dashboard page
  ✅ change-password.test.tsx - Password change
  ✅ api/auth.test.ts - Auth API routes
  ✅ api/analytics.test.ts - Analytics API routes
  ✅ api/servers.test.ts - Servers API routes
```

## CI/CD Pipeline Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         CI Pipeline                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Go Lint    │  │ Frontend     │  │    Secret Scan       │   │
│  │ (golangci)   │  │   Lint       │  │    (Gitleaks)        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         │                 │                     │                │
│         ▼                 ▼                     │                │
│  ┌──────────────┐  ┌──────────────┐             │                │
│  │   Go Test    │  │ Frontend     │             │                │
│  │ + Coverage   │  │   Test       │             │                │
│  └──────────────┘  └──────────────┘             │                │
│         │                 │                     │                │
│         ▼                 ▼                     │                │
│  ┌──────────────┐  ┌──────────────┐             │                │
│  │   Go Build   │  │ Frontend     │             │                │
│  │ (multi-arch) │  │   Build      │             │                │
│  └──────────────┘  └──────────────┘             │                │
│         │                 │                     │                │
│         └────────┬────────┘                     │                │
│                  ▼                              │                │
│  ┌───────────────────────────────────────┐     │                │
│  │           Security Scans               │◄────┘                │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │                      │
│  │  │ Gosec   │ │govuln   │ │OWASP DC │  │                      │
│  │  │ (SAST)  │ │ check   │ │         │  │                      │
│  │  └─────────┘ └─────────┘ └─────────┘  │                      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │                      │
│  │  │npm audit│ │ Snyk    │ │ Trivy   │  │                      │
│  │  │ (SCA)   │ │ (SCA)   │ │Container│  │                      │
│  │  └─────────┘ └─────────┘ └─────────┘  │                      │
│  └───────────────────────────────────────┘                      │
│                  │                                               │
│                  ▼                                               │
│  ┌───────────────────────────────────────┐                      │
│  │    Integration Tests (PRs only)       │                      │
│  └───────────────────────────────────────┘                      │
│                  │                                               │
│                  ▼                                               │
│  ┌───────────────────────────────────────┐                      │
│  │      E2E Tests (PRs only)             │                      │
│  └───────────────────────────────────────┘                      │
│                  │                                               │
│                  ▼                                               │
│  ┌───────────────────────────────────────┐                      │
│  │  Docker Build & Push (main only)      │                      │
│  └───────────────────────────────────────┘                      │
│                  │                                               │
│                  ▼                                               │
│  ┌───────────────────────────────────────┐                      │
│  │       SBOM Generation                 │                      │
│  └───────────────────────────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## GitHub Security Tab

All SARIF reports are uploaded to GitHub's Security tab:

1. Navigate to repository → **Security** tab
2. View **Code scanning alerts** for:
   - Gosec findings
   - Trivy container vulnerabilities
   - OWASP dependency check results

## Troubleshooting

### Tests Failing Locally

```bash
# Ensure dependencies are installed
make install-tools

# Check Go version (requires 1.22+)
go version

# Check Node version (requires 20+)
node --version

# Reset test environment
make clean
```

### E2E Tests Timing Out

```bash
# Install Playwright browsers
cd frontend && npx playwright install chromium

# Run with headed mode for debugging
npx playwright test --headed

# Run specific test
npx playwright test auth.spec.ts
```

### Coverage Not Showing

```bash
# Ensure coverage output is generated
make test-coverage

# Check coverage files exist
ls test-results/go/coverage-*.out
ls frontend/coverage/
```

## Adding New Tests

### Go Tests

1. Create `*_test.go` file next to the source file
2. Use table-driven tests for comprehensive coverage
3. Include benchmarks for performance-critical code

```go
func TestMyFunction(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {"case1", "input1", "output1"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := MyFunction(tt.input)
            if result != tt.expected {
                t.Errorf("got %v, want %v", result, tt.expected)
            }
        })
    }
}
```

### Frontend Unit Tests

1. Create `*.test.tsx` in `frontend/tests/unit/`
2. Mirror the `src/` directory structure
3. Use React Testing Library for component tests

```typescript
import { render, screen } from '@testing-library/react';
import MyComponent from '@/components/MyComponent';

describe('MyComponent', () => {
    it('renders correctly', () => {
        render(<MyComponent />);
        expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });
});
```

### E2E Tests

1. Create `*.spec.ts` in `frontend/tests/e2e/`
2. Use Playwright's locators for reliable selection
3. Add assertions for user flows

```typescript
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
});
```

## References

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Go Testing](https://golang.org/pkg/testing/)
- [Gosec](https://github.com/securego/gosec)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Trivy](https://aquasecurity.github.io/trivy/)
