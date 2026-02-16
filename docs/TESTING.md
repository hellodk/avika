# Avika NGINX Manager - Testing Guide

This document provides comprehensive information about testing the Avika NGINX Manager platform.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Test Reports](#test-reports)
- [CI/CD Integration](#cicd-integration)
- [Writing Tests](#writing-tests)
- [Troubleshooting](#troubleshooting)

## Overview

Avika employs a comprehensive testing strategy with the following components:

| Test Type | Technology | Coverage |
|-----------|------------|----------|
| Go Unit Tests | Go testing + race detector | Gateway, Agent, Common |
| Frontend Unit Tests | Vitest + Testing Library | Components, Utils, Hooks |
| Integration Tests | Go testing + PostgreSQL | Database operations, HTTP handlers |
| E2E Tests | Playwright | User workflows, Navigation, Accessibility |
| Security Scans | Gosec, govulncheck | Vulnerability detection |

## Test Types

### 1. Go Unit Tests

Located in `cmd/gateway/`, `cmd/agent/`, and `internal/common/`.

**What they test:**
- HTTP handler responses
- Message parsing and creation
- Business logic
- gRPC message structures
- Rate limiting and validation

**Run with:**
```bash
make test-go
```

### 2. Frontend Unit Tests

Located in `frontend/tests/unit/`.

**What they test:**
- UI components (Button, Card, etc.)
- Utility functions (cn, theme utilities)
- Provision snippet generation
- Theme system

**Run with:**
```bash
make test-frontend
```

### 3. Integration Tests

Located in `cmd/gateway/` with `//go:build integration` tag.

**What they test:**
- Database CRUD operations
- Agent lifecycle management
- Alert rule management
- HTTP endpoint integration with real database

**Prerequisites:**
- PostgreSQL running on localhost:5432
- Test database: `avika_test`

**Run with:**
```bash
make setup-test-db    # Start PostgreSQL container
make test-integration
make teardown-test-db # Stop PostgreSQL container
```

### 4. E2E Tests

Located in `frontend/tests/e2e/`.

**What they test:**
- Page navigation
- User interactions
- Theme switching
- Accessibility
- Performance
- Responsive design

**Prerequisites:**
- Frontend running on localhost:3000

**Run with:**
```bash
make test-e2e
```

## Running Tests

### Quick Start

```bash
# Install required tools
make install-tools

# Run all unit tests
make test-unit

# Run with coverage
make test-coverage

# Run all tests (unit + integration + e2e)
make test-all
```

### Individual Test Commands

```bash
# Go unit tests only
make test-go

# Frontend unit tests only
make test-frontend

# Integration tests (requires database)
make setup-test-db
make test-integration
make teardown-test-db

# E2E tests
cd frontend && npm run dev &  # Start frontend in background
make test-e2e

# E2E tests with UI
make test-e2e-ui
```

### Using npm/go directly

```bash
# Frontend tests
cd frontend
npm run test:unit           # Run unit tests
npm run test:unit:watch     # Run in watch mode
npm run test:unit:coverage  # With coverage
npm run test:e2e            # Run E2E tests
npm run test:e2e:ui         # Playwright UI mode

# Go tests
cd cmd/gateway
go test -v ./...                          # Unit tests
go test -v -race ./...                    # With race detection
go test -v -tags=integration ./...        # Integration tests
go test -v -coverprofile=coverage.out ./... # With coverage
```

## Test Reports

### Report Locations

| Report Type | Location | Format |
|------------|----------|--------|
| Go Coverage | `test-results/go/coverage-*.out` | Go coverage format |
| Go JUnit | `test-results/go/*-junit.xml` | JUnit XML |
| Frontend Coverage | `frontend/coverage/` | HTML, LCOV, JSON |
| Frontend JUnit | `test-results/frontend/junit.xml` | JUnit XML |
| E2E HTML Report | `frontend/playwright-report/` | HTML |
| E2E JUnit | `frontend/test-results/e2e-results.xml` | JUnit XML |

### Generating Reports

```bash
# Generate all reports
make test-report

# View Go coverage
go tool cover -html=test-results/go/coverage-gateway.out

# View frontend coverage
open frontend/coverage/index.html

# View E2E report
make test-e2e-report
# or
cd frontend && npx playwright show-report
```

### CI/CD Reports

In CI, reports are:
1. **Codecov** - Coverage reports uploaded automatically
2. **GitHub Artifacts** - Test results available for download
3. **GitHub Security** - SARIF reports for security scanning

## CI/CD Integration

### GitHub Actions Workflow

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Go Tests**
   - Lint with golangci-lint
   - Unit tests with race detection
   - Coverage upload to Codecov
   - JUnit report generation

2. **Frontend Tests**
   - ESLint + TypeScript checking
   - Vitest unit tests with coverage
   - JUnit report generation

3. **Integration Tests** (PRs only)
   - PostgreSQL + ClickHouse services
   - Full integration test suite

4. **E2E Tests** (PRs only)
   - Frontend build and start
   - Playwright tests with Chromium
   - HTML + JUnit reports

5. **Security**
   - Gosec security scanner
   - govulncheck vulnerability check
   - Dependency review

### Running CI Locally

```bash
# Simulate CI tests
make check  # Runs lint + unit tests

# Full CI simulation
make lint
make test-unit
make test-integration  # Requires database
make test-e2e          # Requires frontend
```

## Writing Tests

### Go Unit Tests

```go
package main_test

import (
    "testing"
)

func TestMyFunction(t *testing.T) {
    result := MyFunction()
    if result != expected {
        t.Errorf("Expected %v, got %v", expected, result)
    }
}

func BenchmarkMyFunction(b *testing.B) {
    for i := 0; i < b.N; i++ {
        MyFunction()
    }
}
```

### Go Integration Tests

```go
//go:build integration

package main

import (
    "testing"
)

func TestDatabaseOperation(t *testing.T) {
    db := setupTestDB(t)
    defer db.conn.Close()
    defer cleanupTestDB(t, db)
    
    // Test database operations
}
```

### Frontend Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
    it('should render correctly', () => {
        render(<MyComponent />);
        expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
    test('should work correctly', async ({ page }) => {
        await page.goto('/my-page');
        await expect(page.getByRole('heading')).toBeVisible();
        await page.click('button');
        await expect(page).toHaveURL('/expected-url');
    });
});
```

## Test Coverage Thresholds

### Frontend (Vitest)

Configured in `frontend/vitest.config.ts`:

```typescript
coverage: {
    thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
    },
}
```

### Go

Coverage is tracked via Codecov. Target: 60%+ for critical paths.

## Troubleshooting

### Common Issues

**1. Database Connection Failed (Integration Tests)**
```bash
# Start test database
make setup-test-db

# Verify connection
pg_isready -h localhost -p 5432
```

**2. Frontend Tests Fail with Module Errors**
```bash
cd frontend
rm -rf node_modules
npm ci
```

**3. E2E Tests Can't Find Browser**
```bash
cd frontend
npx playwright install chromium
```

**4. go-junit-report Not Found**
```bash
make install-tools
# or
go install github.com/jstemmer/go-junit-report/v2@latest
```

**5. Vitest Can't Find Tests**
Ensure tests are in `frontend/tests/unit/` and match `*.test.{ts,tsx}` pattern.

### Debug Mode

```bash
# Go tests with verbose output
go test -v -count=1 ./...

# Vitest in debug mode
cd frontend && npm run test:unit -- --reporter=verbose

# Playwright with headed browser
cd frontend && npx playwright test --headed --debug
```

## Best Practices

1. **Write tests before fixing bugs** - Create a failing test that demonstrates the bug
2. **Keep tests isolated** - Each test should be independent
3. **Use meaningful test names** - `TestUserCanLoginWithValidCredentials`
4. **Mock external dependencies** - Don't rely on external services in unit tests
5. **Test edge cases** - Empty inputs, null values, boundary conditions
6. **Keep tests fast** - Unit tests should complete in milliseconds
7. **Use table-driven tests** - For testing multiple input/output combinations

## Resources

- [Go Testing Documentation](https://golang.org/pkg/testing/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
