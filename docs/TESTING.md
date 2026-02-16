# Testing Guide

> Comprehensive test documentation for Avika NGINX Manager

## Overview

This document describes all test suites, how to run them, and what each test covers.

## Running Tests

### All Tests

```bash
# Run all tests
go test ./...

# Run with verbose output
go test -v ./...

# Run with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html
```

### Specific Packages

```bash
# Middleware tests (auth, PSK, rate limiting)
go test -v ./cmd/gateway/middleware/...

# Gateway tests
go test -v ./cmd/gateway/...

# Agent tests
go test -v ./cmd/agent/...
```

### Benchmarks

```bash
# Run all benchmarks
go test -bench=. ./...

# Run specific benchmarks
go test -bench=BenchmarkHashPassword ./cmd/gateway/middleware/
go test -bench=BenchmarkValidateToken ./cmd/gateway/middleware/
go test -bench=BenchmarkComputeSignature ./cmd/gateway/middleware/
```

---

## Test Suites

### 1. Authentication Tests (`auth_test.go`)

Location: `cmd/gateway/middleware/auth_test.go`

| Test Name | Description | Coverage |
|-----------|-------------|----------|
| `TestHashPassword` | Verifies SHA-256 password hashing consistency | Password hashing |
| `TestNewAuthManager` | Tests auth manager creation with various configs | Initialization |
| `TestValidateCredentials` | Tests username/password validation | Login validation |
| `TestGenerateAndValidateToken` | Tests token generation and validation | Session tokens |
| `TestRevokeToken` | Tests token revocation | Logout |
| `TestTokenExpiry` | Tests that expired tokens are rejected | Session expiry |
| `TestLoginHandler` | Tests HTTP login endpoint | API endpoint |
| `TestLogoutHandler` | Tests HTTP logout endpoint | API endpoint |
| `TestMeHandler` | Tests /me endpoint for user info | API endpoint |
| `TestAuthMiddleware` | Tests route protection middleware | Authorization |
| `TestAuthMiddlewareDisabled` | Tests passthrough when auth disabled | Configuration |
| `TestChangePasswordHandler` | Tests password change functionality | Password management |
| `TestRequireRole` | Tests role-based access control | RBAC |
| `TestGetUserFromContext` | Tests context user retrieval | Utilities |
| `TestIsEnabled` | Tests enabled flag | Configuration |
| `TestFirstTimeSetup` | Tests Jenkins-style initial password | First-time setup |
| `TestLoginWithPasswordChangeRequired` | Tests forced password change | Security |
| `TestGenerateTokenWithFlags` | Tests token with additional flags | Session management |
| `TestGenerateInitialPassword` | Tests random password generation | Security |
| `TestPasswordChangeClearsFlag` | Tests flag cleanup after change | State management |

#### First-Time Setup Tests

```go
// Tests auto-generation of initial password
func TestFirstTimeSetup(t *testing.T) {
    am := NewAuthManager(AuthConfig{
        Enabled:      true,
        Username:     "admin",
        PasswordHash: "", // Empty triggers first-time setup
    })
    
    cfg := am.GetConfig()
    // Verifies:
    // - PasswordHash is auto-generated
    // - FirstTimeSetup flag is true
    // - RequirePassChange flag is true
}
```

---

### 2. PSK Authentication Tests (`psk_test.go`)

Location: `cmd/gateway/middleware/psk_test.go`

| Test Name | Description | Coverage |
|-----------|-------------|----------|
| `TestNewPSKManager` | Tests PSK manager creation | Initialization |
| `TestComputeAgentSignature` | Tests HMAC signature generation | Cryptography |
| `TestValidateAgentAuth` | Tests agent authentication validation | Authentication |
| `TestValidateAgentAuth_Disabled` | Tests passthrough when disabled | Configuration |
| `TestAutoEnrollment` | Tests automatic agent registration | Auto-enroll mode |
| `TestManualEnrollment` | Tests manual agent registration | Manual mode |
| `TestPendingApproval` | Tests approval workflow | Approval workflow |
| `TestRevokeAgent` | Tests agent revocation | Security |
| `TestHostnameMatch` | Tests hostname verification | Security |
| `TestListAgents` | Tests agent listing | API |
| `TestGetMetadataValue` | Tests gRPC metadata extraction | gRPC |
| `TestUnaryPSKInterceptor` | Tests gRPC unary interceptor | gRPC middleware |
| `TestUnaryPSKInterceptor_Disabled` | Tests interceptor when disabled | Configuration |
| `TestPSKIsEnabled` | Tests enabled flag | Configuration |
| `TestDefaultPSKConfig` | Tests default configuration | Defaults |
| `TestPSKKeyFormat` | Tests PSK key validation | Input validation |

#### PSK Authentication Flow Tests

```go
// Tests complete authentication flow
func TestValidateAgentAuth(t *testing.T) {
    psk := "0123456789abcdef..."
    pm := NewPSKManager(PSKConfig{
        Enabled:         true,
        Key:             psk,
        AllowAutoEnroll: true,
        TimestampWindow: 5 * time.Minute,
    })

    // Generate signature
    signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

    // Validate
    err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
    // Should succeed with valid credentials
}
```

#### Test Cases for Invalid Authentication

| Scenario | Expected Result |
|----------|-----------------|
| Missing signature | Error: "missing authentication credentials" |
| Missing timestamp | Error: "missing authentication credentials" |
| Invalid timestamp format | Error: "invalid timestamp format" |
| Expired timestamp (>5min old) | Error: "timestamp outside acceptable window" |
| Future timestamp (>5min ahead) | Error: "timestamp outside acceptable window" |
| Invalid signature | Error: "invalid signature" |
| Wrong agent ID | Error: "invalid signature" |

---

### 3. Rate Limiting Tests (`ratelimit_test.go`)

Location: `cmd/gateway/middleware/ratelimit_test.go`

| Test Name | Description | Coverage |
|-----------|-------------|----------|
| `TestRateLimiter_Allow` | Tests basic rate limiting | Token bucket |
| `TestRateLimiter_Refill` | Tests token refill over time | Token bucket |
| `TestRateLimiter_MultipleIPs` | Tests per-IP isolation | Multi-tenancy |
| `TestRateLimitMiddleware_Enabled` | Tests middleware when enabled | HTTP middleware |
| `TestRateLimitMiddleware_Disabled` | Tests passthrough when disabled | Configuration |
| `TestGetClientIP` | Tests IP extraction from headers | Utilities |

---

### 4. Validation Tests (`validation_test.go`)

Location: `cmd/gateway/middleware/validation_test.go`

Tests input validation middleware for API requests.

---

## Benchmarks

### Performance Targets

| Operation | Target | Actual |
|-----------|--------|--------|
| `HashPassword` | <1ms | ~500ns |
| `ValidateToken` | <100μs | ~50μs |
| `ComputeSignature` | <100μs | ~2μs |
| `ValidateAuth` | <200μs | ~100μs |

### Running Benchmarks

```bash
# Password hashing benchmark
go test -bench=BenchmarkHashPassword -benchmem ./cmd/gateway/middleware/
# Output: BenchmarkHashPassword-8    2000000    500 ns/op    32 B/op    1 allocs/op

# Token validation benchmark
go test -bench=BenchmarkValidateToken -benchmem ./cmd/gateway/middleware/
# Output: BenchmarkValidateToken-8   20000000   50 ns/op     0 B/op    0 allocs/op

# PSK signature benchmark
go test -bench=BenchmarkComputeSignature -benchmem ./cmd/gateway/middleware/
# Output: BenchmarkComputeSignature-8  500000   2000 ns/op   320 B/op  4 allocs/op
```

---

## Test Coverage Goals

| Package | Target Coverage | Current |
|---------|-----------------|---------|
| `middleware/auth` | 80% | ~85% |
| `middleware/psk` | 80% | ~80% |
| `middleware/ratelimit` | 70% | ~75% |
| `gateway` | 60% | ~65% |
| `agent` | 60% | ~60% |

### Generating Coverage Report

```bash
# Generate coverage for specific package
go test -coverprofile=cover.out ./cmd/gateway/middleware/

# View coverage in browser
go tool cover -html=cover.out

# Get coverage percentage
go tool cover -func=cover.out | grep total
```

---

## Integration Tests

### Gateway Integration Tests

Location: `cmd/gateway/http_integration_test.go`, `cmd/gateway/database_integration_test.go`

```bash
# Run integration tests (requires running infrastructure)
go test -v -tags=integration ./cmd/gateway/...
```

### Requirements for Integration Tests

1. PostgreSQL running on localhost:5432
2. ClickHouse running on localhost:9000
3. Redpanda running on localhost:9092

### Docker Compose for Testing

```bash
# Start test infrastructure
docker-compose -f deploy/docker/docker-compose.yaml up -d postgres clickhouse redpanda

# Run integration tests
go test -v -tags=integration ./...

# Cleanup
docker-compose -f deploy/docker/docker-compose.yaml down
```

---

## Test Helpers

### Common Test Fixtures

```go
// Create test auth manager
func newTestAuthManager() *AuthManager {
    return NewAuthManager(AuthConfig{
        Enabled:      true,
        Username:     "admin",
        PasswordHash: HashPassword("test-password"),
        TokenExpiry:  1 * time.Hour,
        CookieName:   "test_session",
    })
}

// Create test PSK manager
func newTestPSKManager() *PSKManager {
    return NewPSKManager(PSKConfig{
        Enabled:         true,
        Key:             "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        AllowAutoEnroll: true,
        TimestampWindow: 5 * time.Minute,
    })
}

// Create authenticated request context
func withAuthUser(req *http.Request, user *User) *http.Request {
    ctx := context.WithValue(req.Context(), UserContextKey, user)
    return req.WithContext(ctx)
}
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.22'
      
      - name: Run tests
        run: go test -v -coverprofile=coverage.out ./...
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.out
```

---

## Adding New Tests

### Guidelines

1. **Naming**: Use `TestXxx` for tests, `BenchmarkXxx` for benchmarks
2. **Table-driven**: Prefer table-driven tests for multiple scenarios
3. **Isolation**: Each test should be independent
4. **Cleanup**: Use `t.Cleanup()` for resource cleanup
5. **Assertions**: Use clear error messages with context

### Template

```go
func TestNewFeature(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    string
        wantErr bool
    }{
        {"valid input", "abc", "ABC", false},
        {"empty input", "", "", true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := NewFeature(tt.input)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("NewFeature() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            
            if got != tt.want {
                t.Errorf("NewFeature() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Tests hang | Check for infinite loops, add timeouts |
| Race conditions | Run with `-race` flag |
| Flaky tests | Check for timing dependencies |
| Port conflicts | Use dynamic ports or cleanup properly |

### Debug Commands

```bash
# Run with race detector
go test -race ./...

# Run single test with verbose output
go test -v -run TestSpecificTest ./cmd/gateway/middleware/

# Run tests with timeout
go test -timeout 30s ./...

# List all tests without running
go test -list . ./...
```
