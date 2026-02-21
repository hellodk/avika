# Avika NGINX Manager - Makefile
# Comprehensive test execution and build targets

.PHONY: all test test-unit test-integration test-e2e test-coverage test-report \
        lint lint-go lint-frontend build clean help install-tools \
        check-version docker-all docker-gateway docker-frontend docker-push docker-push-gateway docker-push-frontend \
        docker-test setup-test-db teardown-test-db test-regression test-regression-local

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Default target
all: lint test build

#------------------------------------------------------------------------------
# Help
#------------------------------------------------------------------------------
help:
	@echo "$(GREEN)Avika NGINX Manager - Test & Build Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Testing:$(NC)"
	@echo "  make test              - Run all tests (unit + integration if DB available)"
	@echo "  make test-unit         - Run unit tests only (Go + Frontend)"
	@echo "  make test-go           - Run Go unit tests"
	@echo "  make test-frontend     - Run frontend unit tests"
	@echo "  make test-integration  - Run integration tests (requires PostgreSQL)"
	@echo "  make test-e2e          - Run E2E tests (requires frontend running)"
	@echo "  make test-coverage     - Run tests with coverage reports"
	@echo "  make test-report       - Generate HTML test reports"
	@echo ""
	@echo "$(YELLOW)Linting:$(NC)"
	@echo "  make lint              - Run all linters"
	@echo "  make lint-go           - Run Go linters"
	@echo "  make lint-frontend     - Run frontend linters"
	@echo ""
	@echo "$(YELLOW)Building:$(NC)"
	@echo "  make build             - Build all components"
	@echo "  make build-gateway     - Build gateway binary"
	@echo "  make build-agent       - Build agent binary"
	@echo "  make build-frontend    - Build frontend"
	@echo ""
	@echo "$(YELLOW)Docker:$(NC)"
	@echo "  make docker-all        - Build all Docker images"
	@echo "  make docker-gateway    - Build gateway Docker image"
	@echo "  make docker-frontend   - Build frontend Docker image"
	@echo "  make docker-push       - Build and push all images"
	@echo "  make docker-test       - Run tests in Docker containers"
	@echo "  make setup-test-db     - Start test PostgreSQL container"
	@echo "  make teardown-test-db  - Stop test PostgreSQL container"
	@echo ""
	@echo "$(YELLOW)Regression Tests:$(NC)"
	@echo "  make test-regression   - Run all regression tests (requires K8s)"
	@echo "  make test-regression-local - Run local tests only (no K8s)"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make install-tools     - Install required development tools"
	@echo "  make clean             - Clean build artifacts and test results"

#------------------------------------------------------------------------------
# Tool Installation
#------------------------------------------------------------------------------
install-tools:
	@echo "$(GREEN)Installing development tools...$(NC)"
	go install github.com/jstemmer/go-junit-report/v2@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install golang.org/x/vuln/cmd/govulncheck@latest
	cd frontend && npm ci
	cd frontend && npx playwright install chromium
	@echo "$(GREEN)Tools installed successfully$(NC)"

#------------------------------------------------------------------------------
# Unit Tests
#------------------------------------------------------------------------------
test-unit: test-go test-frontend
	@echo "$(GREEN)All unit tests completed$(NC)"

test-go:
	@echo "$(GREEN)Running Go unit tests...$(NC)"
	@mkdir -p test-results/go
	cd cmd/gateway && go test -v -race -coverprofile=../../test-results/go/coverage-gateway.out ./... 2>&1 | tee ../../test-results/go/gateway-output.txt
	cd cmd/agent && go test -v -race -coverprofile=../../test-results/go/coverage-agent.out ./... 2>&1 | tee ../../test-results/go/agent-output.txt
	cd internal/common && go test -v -race -coverprofile=../../test-results/go/coverage-common.out ./... 2>&1 | tee ../../test-results/go/common-output.txt
	@echo "$(GREEN)Go unit tests completed$(NC)"

test-go-report: test-go
	@echo "$(GREEN)Generating Go test reports...$(NC)"
	@which go-junit-report > /dev/null || (echo "$(RED)go-junit-report not installed. Run 'make install-tools'$(NC)" && exit 1)
	cat test-results/go/gateway-output.txt | go-junit-report > test-results/go/gateway-junit.xml
	cat test-results/go/agent-output.txt | go-junit-report > test-results/go/agent-junit.xml
	cat test-results/go/common-output.txt | go-junit-report > test-results/go/common-junit.xml
	@echo "$(GREEN)JUnit reports generated in test-results/go/$(NC)"

test-frontend:
	@echo "$(GREEN)Running frontend unit tests...$(NC)"
	cd frontend && npm run test:unit -- --reporter=default --reporter=junit --outputFile=../test-results/frontend/junit.xml --coverage
	@echo "$(GREEN)Frontend unit tests completed$(NC)"

#------------------------------------------------------------------------------
# Integration Tests
#------------------------------------------------------------------------------
test-integration: check-db
	@echo "$(GREEN)Running integration tests...$(NC)"
	@mkdir -p test-results/integration
	cd cmd/gateway && DB_DSN="postgres://admin:testpassword@localhost:5432/avika_test?sslmode=disable" \
		go test -v -race -tags=integration -coverprofile=../../test-results/integration/coverage.out ./... 2>&1 | \
		tee ../../test-results/integration/output.txt
	@echo "$(GREEN)Integration tests completed$(NC)"

check-db:
	@echo "$(YELLOW)Checking database connection...$(NC)"
	@pg_isready -h localhost -p 5432 > /dev/null 2>&1 || \
		(echo "$(RED)PostgreSQL not available. Run 'make setup-test-db' first$(NC)" && exit 1)
	@echo "$(GREEN)Database is ready$(NC)"

setup-test-db:
	@echo "$(GREEN)Starting test PostgreSQL container...$(NC)"
	docker run -d --name avika-test-db \
		-e POSTGRES_USER=admin \
		-e POSTGRES_PASSWORD=testpassword \
		-e POSTGRES_DB=avika_test \
		-p 5432:5432 \
		postgres:16-alpine
	@echo "$(YELLOW)Waiting for database to be ready...$(NC)"
	@sleep 5
	@echo "$(GREEN)Test database is ready$(NC)"

teardown-test-db:
	@echo "$(GREEN)Stopping test PostgreSQL container...$(NC)"
	docker stop avika-test-db || true
	docker rm avika-test-db || true
	@echo "$(GREEN)Test database stopped$(NC)"

#------------------------------------------------------------------------------
# E2E Tests
#------------------------------------------------------------------------------
test-e2e:
	@echo "$(GREEN)Running E2E tests...$(NC)"
	@mkdir -p test-results/e2e
	cd frontend && npx playwright test --reporter=html,junit
	@echo "$(GREEN)E2E tests completed. Report at frontend/playwright-report/$(NC)"

test-e2e-ui:
	@echo "$(GREEN)Opening Playwright UI...$(NC)"
	cd frontend && npx playwright test --ui

test-e2e-report:
	@echo "$(GREEN)Opening E2E test report...$(NC)"
	cd frontend && npx playwright show-report

#------------------------------------------------------------------------------
# All Tests
#------------------------------------------------------------------------------
test: test-unit
	@echo "$(GREEN)All tests completed$(NC)"

test-all: test-unit test-integration test-e2e
	@echo "$(GREEN)All tests (unit + integration + e2e) completed$(NC)"

#------------------------------------------------------------------------------
# Coverage
#------------------------------------------------------------------------------
test-coverage: test-go test-frontend
	@echo "$(GREEN)Generating coverage report...$(NC)"
	@mkdir -p test-results/coverage
	@echo "=== Go Coverage ===" > test-results/coverage/summary.txt
	cd cmd/gateway && go tool cover -func=../../test-results/go/coverage-gateway.out >> ../../test-results/coverage/summary.txt 2>/dev/null || true
	cd cmd/agent && go tool cover -func=../../test-results/go/coverage-agent.out >> ../../test-results/coverage/summary.txt 2>/dev/null || true
	@echo "" >> test-results/coverage/summary.txt
	@echo "=== Frontend Coverage ===" >> test-results/coverage/summary.txt
	@cat frontend/coverage/coverage-summary.json >> test-results/coverage/summary.txt 2>/dev/null || echo "No frontend coverage data" >> test-results/coverage/summary.txt
	@echo "$(GREEN)Coverage summary at test-results/coverage/summary.txt$(NC)"
	@cat test-results/coverage/summary.txt

test-report: test-go-report
	@echo "$(GREEN)All test reports generated$(NC)"
	@echo "  - Go JUnit: test-results/go/*.xml"
	@echo "  - Go Coverage: test-results/go/coverage-*.out"
	@echo "  - Frontend: test-results/frontend/"
	@echo "  - E2E: frontend/playwright-report/"

#------------------------------------------------------------------------------
# Linting
#------------------------------------------------------------------------------
lint: lint-go lint-frontend
	@echo "$(GREEN)All linting completed$(NC)"

lint-go:
	@echo "$(GREEN)Running Go linters...$(NC)"
	golangci-lint run --timeout=5m ./...
	@echo "$(GREEN)Go linting completed$(NC)"

lint-frontend:
	@echo "$(GREEN)Running frontend linters...$(NC)"
	cd frontend && npm run lint
	cd frontend && npx tsc --noEmit
	@echo "$(GREEN)Frontend linting completed$(NC)"

security-scan:
	@echo "$(GREEN)Running security scans...$(NC)"
	govulncheck ./...
	@echo "$(GREEN)Security scan completed$(NC)"

#------------------------------------------------------------------------------
# Building
#------------------------------------------------------------------------------
build: build-gateway build-agent build-frontend
	@echo "$(GREEN)All builds completed$(NC)"

build-gateway:
	@echo "$(GREEN)Building gateway...$(NC)"
	cd cmd/gateway && go build -ldflags="-s -w" -o ../../bin/gateway .
	@echo "$(GREEN)Gateway built at bin/gateway$(NC)"

build-agent:
	@echo "$(GREEN)Building agent...$(NC)"
	cd cmd/agent && go build -ldflags="-s -w" -o ../../bin/agent .
	@echo "$(GREEN)Agent built at bin/agent$(NC)"

build-frontend:
	@echo "$(GREEN)Building frontend...$(NC)"
	cd frontend && npm run build
	@echo "$(GREEN)Frontend built$(NC)"

#------------------------------------------------------------------------------
# Docker Builds
#------------------------------------------------------------------------------
# Read version from VERSION file - REQUIRED, no fallback
DOCKER_REPO := hellodk

# Check VERSION file exists and read it
check-version:
	@if [ ! -f VERSION ]; then \
		echo ""; \
		echo "$(RED)========================================$(NC)"; \
		echo "$(RED)ERROR: VERSION file not found!$(NC)"; \
		echo "$(RED)========================================$(NC)"; \
		echo ""; \
		echo "Please create a VERSION file in the project root:"; \
		echo "  echo '1.0.0' > VERSION"; \
		echo ""; \
		exit 1; \
	fi

# Read VERSION only after confirming it exists
VERSION = $(shell cat VERSION)

docker-all: check-version docker-gateway docker-frontend
	@echo "$(GREEN)All Docker images built$(NC)"

docker-gateway: check-version
	@echo "$(GREEN)Building gateway Docker image v$(VERSION)...$(NC)"
	docker build -t $(DOCKER_REPO)/avika-gateway:$(VERSION) \
		--build-arg VERSION=$(VERSION) \
		-f cmd/gateway/Dockerfile .
	@echo "$(GREEN)Gateway image built: $(DOCKER_REPO)/avika-gateway:$(VERSION)$(NC)"

docker-frontend: check-version
	@echo "$(GREEN)Building frontend Docker image v$(VERSION)...$(NC)"
	@# Copy VERSION file to frontend for build context
	cp VERSION frontend/VERSION
	docker build -t $(DOCKER_REPO)/avika-frontend:$(VERSION) \
		--build-arg VERSION=$(VERSION) \
		-f frontend/Dockerfile frontend/
	@rm -f frontend/VERSION
	@echo "$(GREEN)Frontend image built: $(DOCKER_REPO)/avika-frontend:$(VERSION)$(NC)"

docker-push: check-version docker-all
	@echo "$(GREEN)Pushing Docker images v$(VERSION)...$(NC)"
	docker push $(DOCKER_REPO)/avika-gateway:$(VERSION)
	docker push $(DOCKER_REPO)/avika-frontend:$(VERSION)
	@echo "$(GREEN)Images pushed to $(DOCKER_REPO)$(NC)"

docker-push-gateway: check-version
	@echo "$(GREEN)Pushing gateway image v$(VERSION)...$(NC)"
	docker push $(DOCKER_REPO)/avika-gateway:$(VERSION)

docker-push-frontend: check-version
	@echo "$(GREEN)Pushing frontend image v$(VERSION)...$(NC)"
	docker push $(DOCKER_REPO)/avika-frontend:$(VERSION)

#------------------------------------------------------------------------------
# Docker Tests
#------------------------------------------------------------------------------
docker-test:
	@echo "$(GREEN)Running tests in Docker...$(NC)"
	docker compose -f deploy/docker/docker-compose.test.yaml up --build --abort-on-container-exit
	docker compose -f deploy/docker/docker-compose.test.yaml down
	@echo "$(GREEN)Docker tests completed$(NC)"

#------------------------------------------------------------------------------
# Cleanup
#------------------------------------------------------------------------------
clean:
	@echo "$(GREEN)Cleaning build artifacts and test results...$(NC)"
	rm -rf bin/
	rm -rf test-results/
	rm -rf frontend/coverage/
	rm -rf frontend/playwright-report/
	rm -rf frontend/test-results/
	rm -rf frontend/.next/
	rm -f cmd/gateway/coverage-*.out
	rm -f cmd/agent/coverage-*.out
	rm -f internal/common/coverage-*.out
	@echo "$(GREEN)Cleanup completed$(NC)"

#------------------------------------------------------------------------------
# Quick Check (for pre-commit)
#------------------------------------------------------------------------------
check: lint test-unit
	@echo "$(GREEN)Pre-commit check passed$(NC)"

#------------------------------------------------------------------------------
# Regression Tests
#------------------------------------------------------------------------------
test-regression:
	@echo "$(GREEN)Running regression tests...$(NC)"
	./scripts/regression_tests.sh
	@echo "$(GREEN)Regression tests completed$(NC)"

test-regression-local:
	@echo "$(GREEN)Running local regression tests (no K8s required)...$(NC)"
	@./scripts/regression_tests.sh 2>&1 | grep -E '^\[(PASS|FAIL|SKIP|INFO)\]|^━|^Test|^Expected|^Timestamp' || true
	@echo "$(GREEN)Local regression tests completed$(NC)"

#------------------------------------------------------------------------------
# Comprehensive Test Runner with Reports
#------------------------------------------------------------------------------
test-full:
	@echo "$(GREEN)Running comprehensive test suite...$(NC)"
	./scripts/run_all_tests.sh

test-full-report:
	@echo "$(GREEN)Running tests with HTML report...$(NC)"
	./scripts/run_all_tests.sh --open-report

test-full-pdf:
	@echo "$(GREEN)Running tests with PDF report...$(NC)"
	./scripts/run_all_tests.sh --pdf --open-report

test-quick:
	@echo "$(GREEN)Running quick tests (skip integration/e2e)...$(NC)"
	./scripts/run_all_tests.sh --skip-integration --skip-e2e

generate-report:
	@echo "$(GREEN)Generating test report from existing results...$(NC)"
	python3 scripts/generate_test_report.py --open

generate-report-pdf:
	@echo "$(GREEN)Generating PDF test report...$(NC)"
	python3 scripts/generate_test_report.py --pdf --open
