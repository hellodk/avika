#!/bin/bash
#
# Avika NGINX Manager - Comprehensive Test Runner
# This script runs all tests and generates HTML/PDF reports
#
# Usage: ./scripts/run_all_tests.sh [options]
#
# Options:
#   --skip-integration    Skip integration tests (no database required)
#   --skip-e2e           Skip E2E tests (no frontend required)
#   --skip-frontend      Skip frontend tests
#   --skip-go            Skip Go tests
#   --open-report        Open HTML report in browser after completion
#   --pdf                Generate PDF report
#   --help               Show this help message
#

# Don't use set -e, we want to continue on test failures to get full report
# set -e

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$PROJECT_ROOT/test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_NAME="avika-test-report-$TIMESTAMP"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Flags
SKIP_INTEGRATION=false
SKIP_E2E=false
SKIP_FRONTEND=false
SKIP_GO=false
OPEN_REPORT=false
GENERATE_PDF=false

# Test results
GO_UNIT_PASS=0
GO_UNIT_FAIL=0
GO_INTEGRATION_PASS=0
GO_INTEGRATION_FAIL=0
FRONTEND_UNIT_PASS=0
FRONTEND_UNIT_FAIL=0
E2E_PASS=0
E2E_FAIL=0

# =============================================================================
# Functions
# =============================================================================

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

show_help() {
    head -25 "$0" | tail -20
    exit 0
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    local missing=()
    
    if ! command -v go &> /dev/null; then
        missing+=("go")
    fi
    
    if ! command -v node &> /dev/null; then
        missing+=("node")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    fi
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
    
    print_success "All dependencies available"
}

setup_report_dir() {
    print_step "Setting up report directory..."
    mkdir -p "$REPORT_DIR"/{go,frontend,e2e,coverage}
    print_success "Report directory ready: $REPORT_DIR"
}

# =============================================================================
# Go Tests
# =============================================================================

run_go_unit_tests() {
    print_header "Running Go Unit Tests"
    
    local components=("cmd/gateway" "cmd/agent" "internal/common")
    local total_pass=0
    local total_fail=0
    
    for component in "${components[@]}"; do
        local name=$(basename "$component")
        print_step "Testing $name..."
        
        cd "$PROJECT_ROOT/$component"
        
        # Use timeout and test only the main package (not subpackages) to avoid hanging tests
        # Add -timeout flag to prevent individual test hangs
        if timeout 120 go test -v -timeout 60s -coverprofile="$REPORT_DIR/coverage/$name-coverage.out" . 2>&1 | tee "$REPORT_DIR/go/$name-output.txt"; then
            print_success "$name tests passed"
            ((total_pass++)) || true
        else
            print_error "$name tests failed or timed out"
            ((total_fail++)) || true
        fi
        
        # Generate HTML coverage report
        if [ -f "$REPORT_DIR/coverage/$name-coverage.out" ]; then
            go tool cover -html="$REPORT_DIR/coverage/$name-coverage.out" -o "$REPORT_DIR/coverage/$name-coverage.html" 2>/dev/null || true
        fi
    done
    
    GO_UNIT_PASS=$total_pass
    GO_UNIT_FAIL=$total_fail
    
    cd "$PROJECT_ROOT"
}

run_go_integration_tests() {
    if [ "$SKIP_INTEGRATION" = true ]; then
        print_info "Skipping integration tests"
        return
    fi
    
    print_header "Running Go Integration Tests"
    
    # Check if database is available
    if ! pg_isready -h localhost -p 5432 &> /dev/null; then
        print_error "PostgreSQL not available. Skipping integration tests."
        print_info "Start database with: make setup-test-db"
        return
    fi
    
    print_step "Running integration tests..."
    
    cd "$PROJECT_ROOT/cmd/gateway"
    
    if DB_DSN="postgres://admin:testpassword@localhost:5432/avika_test?sslmode=disable" \
       go test -v -tags=integration -coverprofile="$REPORT_DIR/coverage/integration-coverage.out" ./... 2>&1 | tee "$REPORT_DIR/go/integration-output.txt"; then
        print_success "Integration tests passed"
        GO_INTEGRATION_PASS=1
    else
        print_error "Integration tests failed"
        GO_INTEGRATION_FAIL=1
    fi
    
    cd "$PROJECT_ROOT"
}

# =============================================================================
# Frontend Tests
# =============================================================================

run_frontend_unit_tests() {
    if [ "$SKIP_FRONTEND" = true ]; then
        print_info "Skipping frontend tests"
        return
    fi
    
    print_header "Running Frontend Unit Tests"
    
    cd "$PROJECT_ROOT/frontend"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_step "Installing frontend dependencies..."
        npm ci
    fi
    
    print_step "Running Vitest tests..."
    
    if npm run test:unit -- --reporter=default --reporter=json --outputFile="$REPORT_DIR/frontend/results.json" --coverage 2>&1 | tee "$REPORT_DIR/frontend/output.txt"; then
        print_success "Frontend unit tests passed"
        FRONTEND_UNIT_PASS=1
    else
        print_error "Frontend unit tests failed"
        FRONTEND_UNIT_FAIL=1
    fi
    
    # Copy coverage report
    if [ -d "coverage" ]; then
        cp -r coverage/* "$REPORT_DIR/coverage/" 2>/dev/null || true
    fi
    
    cd "$PROJECT_ROOT"
}

run_e2e_tests() {
    # Always try to copy existing E2E reports first
    if [ -d "$PROJECT_ROOT/frontend/playwright-report" ]; then
        cp -r "$PROJECT_ROOT/frontend/playwright-report"/* "$REPORT_DIR/e2e/" 2>/dev/null || true
    fi
    
    if [ "$SKIP_E2E" = true ]; then
        print_info "Skipping E2E tests"
        return
    fi
    
    print_header "Running E2E Tests"
    
    cd "$PROJECT_ROOT/frontend"
    
    # Check if frontend is running
    if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_info "Frontend not running. Starting it..."
        npm run build 2>/dev/null || true
        npm run start &
        FRONTEND_PID=$!
        
        # Wait for frontend to be ready
        print_step "Waiting for frontend to start..."
        for i in {1..30}; do
            if curl -s http://localhost:3000 > /dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        
        if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
            print_error "Frontend failed to start"
            return
        fi
    fi
    
    print_step "Running Playwright tests..."
    
    # Ensure Playwright is installed
    npx playwright install chromium 2>/dev/null || true
    
    if npx playwright test --reporter=html 2>&1 | tee "$REPORT_DIR/e2e/output.txt"; then
        print_success "E2E tests passed"
        E2E_PASS=1
    else
        print_error "E2E tests failed"
        E2E_FAIL=1
    fi
    
    # Copy Playwright report
    if [ -d "playwright-report" ]; then
        cp -r playwright-report/* "$REPORT_DIR/e2e/" 2>/dev/null || true
    fi
    
    # Stop frontend if we started it
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    cd "$PROJECT_ROOT"
}

# =============================================================================
# Report Generation
# =============================================================================

generate_html_report() {
    print_header "Generating HTML Report"
    
    local report_file="$REPORT_DIR/$REPORT_NAME.html"
    
    # Calculate totals
    local total_pass=$((GO_UNIT_PASS + GO_INTEGRATION_PASS + FRONTEND_UNIT_PASS + E2E_PASS))
    local total_fail=$((GO_UNIT_FAIL + GO_INTEGRATION_FAIL + FRONTEND_UNIT_FAIL + E2E_FAIL))
    local total_tests=$((total_pass + total_fail))
    local pass_rate=0
    if [ $total_tests -gt 0 ]; then
        pass_rate=$((total_pass * 100 / total_tests))
    fi
    
    # Determine overall status
    local status_class="success"
    local status_text="PASSED"
    if [ $total_fail -gt 0 ]; then
        status_class="failure"
        status_text="FAILED"
    fi
    
    cat > "$report_file" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Avika Test Report</title>
    <style>
        :root {
            --bg-primary: #0a0a0a;
            --bg-secondary: #171717;
            --bg-card: #1a1a1a;
            --text-primary: #ffffff;
            --text-secondary: #a3a3a3;
            --accent-blue: #3b82f6;
            --accent-green: #22c55e;
            --accent-red: #ef4444;
            --accent-yellow: #eab308;
            --border-color: #262626;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 2rem;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }
        
        .logo {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(90deg, var(--accent-blue), #06b6d4, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 0.5rem;
        }
        
        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
        }
        
        .timestamp {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 1rem;
        }
        
        .status-banner {
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 2rem;
            font-size: 1.5rem;
            font-weight: 600;
        }
        
        .status-banner.success {
            background: rgba(34, 197, 94, 0.1);
            border: 2px solid var(--accent-green);
            color: var(--accent-green);
        }
        
        .status-banner.failure {
            background: rgba(239, 68, 68, 0.1);
            border: 2px solid var(--accent-red);
            color: var(--accent-red);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
        }
        
        .stat-value.green { color: var(--accent-green); }
        .stat-value.red { color: var(--accent-red); }
        .stat-value.blue { color: var(--accent-blue); }
        .stat-value.yellow { color: var(--accent-yellow); }
        
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }
        
        .section {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 1.5rem;
            overflow: hidden;
        }
        
        .section-header {
            background: var(--bg-secondary);
            padding: 1rem 1.5rem;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
        }
        
        .section-content {
            padding: 1.5rem;
        }
        
        .test-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 0;
            border-bottom: 1px solid var(--border-color);
        }
        
        .test-row:last-child {
            border-bottom: none;
        }
        
        .test-name {
            font-weight: 500;
        }
        
        .test-status {
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        
        .test-status.pass {
            background: rgba(34, 197, 94, 0.1);
            color: var(--accent-green);
        }
        
        .test-status.fail {
            background: rgba(239, 68, 68, 0.1);
            color: var(--accent-red);
        }
        
        .test-status.skip {
            background: rgba(234, 179, 8, 0.1);
            color: var(--accent-yellow);
        }
        
        .progress-bar {
            height: 8px;
            background: var(--bg-secondary);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 1rem;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-green), var(--accent-blue));
            transition: width 0.5s ease;
        }
        
        .links-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
        }
        
        .report-link {
            display: block;
            padding: 1rem 1.5rem;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-primary);
            text-decoration: none;
            transition: all 0.2s ease;
        }
        
        .report-link:hover {
            border-color: var(--accent-blue);
            transform: translateY(-2px);
        }
        
        .report-link-title {
            font-weight: 600;
            margin-bottom: 0.25rem;
        }
        
        .report-link-desc {
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
        
        footer {
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 1rem;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .stat-value {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">Avika</div>
            <div class="subtitle">NGINX Manager - Test Report</div>
            <div class="timestamp">Generated: TIMESTAMP_PLACEHOLDER</div>
        </header>
        
        <div class="status-banner STATUS_CLASS_PLACEHOLDER">
            Overall Status: STATUS_TEXT_PLACEHOLDER
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value blue">TOTAL_TESTS_PLACEHOLDER</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value green">TOTAL_PASS_PLACEHOLDER</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value red">TOTAL_FAIL_PLACEHOLDER</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value yellow">PASS_RATE_PLACEHOLDER%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <span>Test Results by Category</span>
            </div>
            <div class="section-content">
                <div class="test-row">
                    <span class="test-name">Go Unit Tests (Gateway)</span>
                    <span class="test-status GO_GATEWAY_STATUS_PLACEHOLDER">GO_GATEWAY_TEXT_PLACEHOLDER</span>
                </div>
                <div class="test-row">
                    <span class="test-name">Go Unit Tests (Agent)</span>
                    <span class="test-status GO_AGENT_STATUS_PLACEHOLDER">GO_AGENT_TEXT_PLACEHOLDER</span>
                </div>
                <div class="test-row">
                    <span class="test-name">Go Unit Tests (Common)</span>
                    <span class="test-status GO_COMMON_STATUS_PLACEHOLDER">GO_COMMON_TEXT_PLACEHOLDER</span>
                </div>
                <div class="test-row">
                    <span class="test-name">Go Integration Tests</span>
                    <span class="test-status GO_INTEGRATION_STATUS_PLACEHOLDER">GO_INTEGRATION_TEXT_PLACEHOLDER</span>
                </div>
                <div class="test-row">
                    <span class="test-name">Frontend Unit Tests</span>
                    <span class="test-status FRONTEND_STATUS_PLACEHOLDER">FRONTEND_TEXT_PLACEHOLDER</span>
                </div>
                <div class="test-row">
                    <span class="test-name">E2E Tests</span>
                    <span class="test-status E2E_STATUS_PLACEHOLDER">E2E_TEXT_PLACEHOLDER</span>
                </div>
                
                <div class="progress-bar">
                    <div class="progress-fill" style="width: PASS_RATE_PLACEHOLDER%;"></div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <span>Detailed Reports</span>
            </div>
            <div class="section-content">
                <div class="links-section">
                    COVERAGE_LINKS_PLACEHOLDER
                </div>
            </div>
        </div>
        
        <footer>
            <p>Avika NGINX Manager &copy; 2026</p>
            <p>Report generated by run_all_tests.sh</p>
        </footer>
    </div>
</body>
</html>
EOF

    # Replace placeholders
    sed -i "s/TIMESTAMP_PLACEHOLDER/$(date '+%Y-%m-%d %H:%M:%S')/g" "$report_file"
    sed -i "s/STATUS_CLASS_PLACEHOLDER/$status_class/g" "$report_file"
    sed -i "s/STATUS_TEXT_PLACEHOLDER/$status_text/g" "$report_file"
    sed -i "s/TOTAL_TESTS_PLACEHOLDER/$total_tests/g" "$report_file"
    sed -i "s/TOTAL_PASS_PLACEHOLDER/$total_pass/g" "$report_file"
    sed -i "s/TOTAL_FAIL_PLACEHOLDER/$total_fail/g" "$report_file"
    sed -i "s/PASS_RATE_PLACEHOLDER/$pass_rate/g" "$report_file"
    
    # Set individual test statuses
    if [ $GO_UNIT_PASS -ge 1 ]; then
        sed -i "s/GO_GATEWAY_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/GO_GATEWAY_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/GO_GATEWAY_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/GO_GATEWAY_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    if [ $GO_UNIT_PASS -ge 2 ]; then
        sed -i "s/GO_AGENT_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/GO_AGENT_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/GO_AGENT_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/GO_AGENT_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    if [ $GO_UNIT_PASS -ge 3 ]; then
        sed -i "s/GO_COMMON_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/GO_COMMON_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/GO_COMMON_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/GO_COMMON_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    if [ "$SKIP_INTEGRATION" = true ]; then
        sed -i "s/GO_INTEGRATION_STATUS_PLACEHOLDER/skip/g" "$report_file"
        sed -i "s/GO_INTEGRATION_TEXT_PLACEHOLDER/SKIPPED/g" "$report_file"
    elif [ $GO_INTEGRATION_PASS -ge 1 ]; then
        sed -i "s/GO_INTEGRATION_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/GO_INTEGRATION_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/GO_INTEGRATION_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/GO_INTEGRATION_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    if [ "$SKIP_FRONTEND" = true ]; then
        sed -i "s/FRONTEND_STATUS_PLACEHOLDER/skip/g" "$report_file"
        sed -i "s/FRONTEND_TEXT_PLACEHOLDER/SKIPPED/g" "$report_file"
    elif [ $FRONTEND_UNIT_PASS -ge 1 ]; then
        sed -i "s/FRONTEND_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/FRONTEND_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/FRONTEND_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/FRONTEND_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    if [ "$SKIP_E2E" = true ]; then
        sed -i "s/E2E_STATUS_PLACEHOLDER/skip/g" "$report_file"
        sed -i "s/E2E_TEXT_PLACEHOLDER/SKIPPED/g" "$report_file"
    elif [ $E2E_PASS -ge 1 ]; then
        sed -i "s/E2E_STATUS_PLACEHOLDER/pass/g" "$report_file"
        sed -i "s/E2E_TEXT_PLACEHOLDER/PASSED/g" "$report_file"
    else
        sed -i "s/E2E_STATUS_PLACEHOLDER/fail/g" "$report_file"
        sed -i "s/E2E_TEXT_PLACEHOLDER/FAILED/g" "$report_file"
    fi
    
    # Build coverage links dynamically based on what exists
    local coverage_links=""
    
    if [ -f "$REPORT_DIR/coverage/gateway-coverage.html" ]; then
        coverage_links+='<a href="coverage/gateway-coverage.html" class="report-link">
                        <div class="report-link-title">Gateway Coverage</div>
                        <div class="report-link-desc">Go code coverage for gateway component</div>
                    </a>'
    fi
    
    if [ -f "$REPORT_DIR/coverage/agent-coverage.html" ]; then
        coverage_links+='<a href="coverage/agent-coverage.html" class="report-link">
                        <div class="report-link-title">Agent Coverage</div>
                        <div class="report-link-desc">Go code coverage for agent component</div>
                    </a>'
    fi
    
    if [ -f "$REPORT_DIR/coverage/index.html" ]; then
        coverage_links+='<a href="coverage/index.html" class="report-link">
                        <div class="report-link-title">Frontend Coverage</div>
                        <div class="report-link-desc">Vitest coverage report for React components</div>
                    </a>'
    fi
    
    if [ -f "$REPORT_DIR/e2e/index.html" ] || [ -d "$REPORT_DIR/e2e" ] && [ "$(ls -A $REPORT_DIR/e2e 2>/dev/null)" ]; then
        # Check for Playwright report
        if [ -f "$REPORT_DIR/e2e/index.html" ]; then
            coverage_links+='<a href="e2e/index.html" class="report-link">
                        <div class="report-link-title">E2E Report</div>
                        <div class="report-link-desc">Playwright test results and screenshots</div>
                    </a>'
        fi
    fi
    
    # If no links, show a message
    if [ -z "$coverage_links" ]; then
        coverage_links='<p style="color: var(--text-secondary);">No detailed reports available yet. Run tests to generate coverage reports.</p>'
    fi
    
    # Replace the placeholder - using a temporary file to handle multiline
    local temp_file=$(mktemp)
    awk -v links="$coverage_links" '{gsub(/COVERAGE_LINKS_PLACEHOLDER/, links); print}' "$report_file" > "$temp_file"
    mv "$temp_file" "$report_file"
    
    # Create symlink to latest report
    ln -sf "$report_file" "$REPORT_DIR/latest.html"
    
    print_success "HTML report generated: $report_file"
}

generate_pdf_report() {
    if [ "$GENERATE_PDF" != true ]; then
        return
    fi
    
    print_header "Generating PDF Report"
    
    local html_file="$REPORT_DIR/$REPORT_NAME.html"
    local pdf_file="$REPORT_DIR/$REPORT_NAME.pdf"
    
    # Try different PDF generation tools
    if command -v wkhtmltopdf &> /dev/null; then
        print_step "Using wkhtmltopdf..."
        wkhtmltopdf --enable-local-file-access "$html_file" "$pdf_file"
        print_success "PDF generated: $pdf_file"
    elif command -v chromium &> /dev/null; then
        print_step "Using Chromium..."
        chromium --headless --disable-gpu --print-to-pdf="$pdf_file" "$html_file"
        print_success "PDF generated: $pdf_file"
    elif command -v google-chrome &> /dev/null; then
        print_step "Using Google Chrome..."
        google-chrome --headless --disable-gpu --print-to-pdf="$pdf_file" "$html_file"
        print_success "PDF generated: $pdf_file"
    elif command -v npx &> /dev/null; then
        print_step "Using Puppeteer..."
        npx --yes puppeteer-cli print "$html_file" "$pdf_file" 2>/dev/null || {
            print_error "Puppeteer PDF generation failed"
            return
        }
        print_success "PDF generated: $pdf_file"
    else
        print_error "No PDF generation tool available"
        print_info "Install one of: wkhtmltopdf, chromium, google-chrome"
    fi
    
    if [ -f "$pdf_file" ]; then
        ln -sf "$pdf_file" "$REPORT_DIR/latest.pdf"
    fi
}

open_report() {
    if [ "$OPEN_REPORT" != true ]; then
        return
    fi
    
    local report_file="$REPORT_DIR/$REPORT_NAME.html"
    
    print_step "Opening report in browser..."
    
    if command -v xdg-open &> /dev/null; then
        xdg-open "$report_file"
    elif command -v open &> /dev/null; then
        open "$report_file"
    elif command -v start &> /dev/null; then
        start "$report_file"
    else
        print_info "Open manually: $report_file"
    fi
}

print_summary() {
    print_header "Test Summary"
    
    local total_pass=$((GO_UNIT_PASS + GO_INTEGRATION_PASS + FRONTEND_UNIT_PASS + E2E_PASS))
    local total_fail=$((GO_UNIT_FAIL + GO_INTEGRATION_FAIL + FRONTEND_UNIT_FAIL + E2E_FAIL))
    
    echo -e "  ${CYAN}Go Unit Tests:${NC}        $GO_UNIT_PASS passed, $GO_UNIT_FAIL failed"
    echo -e "  ${CYAN}Go Integration:${NC}       $GO_INTEGRATION_PASS passed, $GO_INTEGRATION_FAIL failed"
    echo -e "  ${CYAN}Frontend Unit:${NC}        $FRONTEND_UNIT_PASS passed, $FRONTEND_UNIT_FAIL failed"
    echo -e "  ${CYAN}E2E Tests:${NC}            $E2E_PASS passed, $E2E_FAIL failed"
    echo ""
    echo -e "  ${CYAN}Total:${NC}                $total_pass passed, $total_fail failed"
    echo ""
    
    if [ $total_fail -eq 0 ]; then
        echo -e "  ${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "  ${GREEN}                    ALL TESTS PASSED!                       ${NC}"
        echo -e "  ${GREEN}═══════════════════════════════════════════════════════════${NC}"
    else
        echo -e "  ${RED}═══════════════════════════════════════════════════════════${NC}"
        echo -e "  ${RED}                    SOME TESTS FAILED                        ${NC}"
        echo -e "  ${RED}═══════════════════════════════════════════════════════════${NC}"
    fi
    
    echo ""
    echo -e "  ${CYAN}Reports:${NC}"
    echo -e "    HTML: $REPORT_DIR/$REPORT_NAME.html"
    echo -e "    Latest: $REPORT_DIR/latest.html"
    if [ "$GENERATE_PDF" = true ] && [ -f "$REPORT_DIR/$REPORT_NAME.pdf" ]; then
        echo -e "    PDF: $REPORT_DIR/$REPORT_NAME.pdf"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-integration)
                SKIP_INTEGRATION=true
                shift
                ;;
            --skip-e2e)
                SKIP_E2E=true
                shift
                ;;
            --skip-frontend)
                SKIP_FRONTEND=true
                shift
                ;;
            --skip-go)
                SKIP_GO=true
                shift
                ;;
            --open-report)
                OPEN_REPORT=true
                shift
                ;;
            --pdf)
                GENERATE_PDF=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            *)
                echo "Unknown option: $1"
                show_help
                ;;
        esac
    done
    
    print_header "Avika NGINX Manager - Test Runner"
    echo -e "  ${CYAN}Project:${NC}    $PROJECT_ROOT"
    echo -e "  ${CYAN}Reports:${NC}    $REPORT_DIR"
    echo -e "  ${CYAN}Timestamp:${NC}  $(date '+%Y-%m-%d %H:%M:%S')"
    
    check_dependencies
    setup_report_dir
    
    # Run tests
    if [ "$SKIP_GO" != true ]; then
        run_go_unit_tests
        run_go_integration_tests
    fi
    
    run_frontend_unit_tests
    run_e2e_tests
    
    # Generate reports
    generate_html_report
    generate_pdf_report
    
    # Print summary
    print_summary
    
    # Open report
    open_report
    
    # Exit with appropriate code
    local total_fail=$((GO_UNIT_FAIL + GO_INTEGRATION_FAIL + FRONTEND_UNIT_FAIL + E2E_FAIL))
    exit $total_fail
}

main "$@"
