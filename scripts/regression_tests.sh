#!/bin/bash
# =============================================================================
# Avika Regression Tests
# =============================================================================
# Tests for known issues that have been fixed:
# 1. Version display showing hardcoded fallback instead of actual version
# 2. Dashboard not showing nginx agent data (logs not flowing)
#
# Run: ./scripts/regression_tests.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test results array
declare -a FAILED_TESTS

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("$1")
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if running in Kubernetes context
check_k8s() {
    if ! kubectl cluster-info &>/dev/null; then
        echo -e "${RED}ERROR: kubectl not configured or cluster not accessible${NC}"
        exit 1
    fi
}

# Get expected version from VERSION file
get_expected_version() {
    if [ -f "VERSION" ]; then
        cat VERSION | tr -d '\n'
    else
        echo "unknown"
    fi
}

# -----------------------------------------------------------------------------
# TEST SUITE 1: Version Configuration Tests
# -----------------------------------------------------------------------------

test_version_file_exists() {
    log_info "Testing VERSION file exists..."
    if [ -f "VERSION" ]; then
        local version=$(cat VERSION | tr -d '\n')
        if [ -n "$version" ] && [ "$version" != "0.1.0" ]; then
            log_success "VERSION file exists with value: $version"
        else
            log_failure "VERSION file exists but has invalid value: '$version'"
        fi
    else
        log_failure "VERSION file not found in project root"
    fi
}

test_version_no_hardcoded_fallback_in_login() {
    log_info "Testing login page has no hardcoded version fallback..."
    local login_file="frontend/src/app/login/page.tsx"
    if [ -f "$login_file" ]; then
        if grep -q '|| "0.1.0"' "$login_file" || grep -q "|| '0.1.0'" "$login_file"; then
            log_failure "login/page.tsx contains hardcoded fallback to 0.1.0"
        else
            log_success "login/page.tsx has no hardcoded version fallback"
        fi
    else
        log_skip "login/page.tsx not found"
    fi
}

test_version_no_hardcoded_fallback_in_config() {
    log_info "Testing next.config.ts has no silent fallback..."
    local config_file="frontend/next.config.ts"
    if [ -f "$config_file" ]; then
        # Check for throw statement (good) vs silent fallback (bad)
        if grep -q 'throw new Error.*VERSION' "$config_file"; then
            log_success "next.config.ts throws error when VERSION is missing"
        elif grep -q '|| "0.1.0"' "$config_file"; then
            log_failure "next.config.ts has silent fallback to 0.1.0"
        else
            log_success "next.config.ts has no silent version fallback"
        fi
    else
        log_skip "next.config.ts not found"
    fi
}

test_dockerfile_requires_version() {
    log_info "Testing Dockerfile requires VERSION arg..."
    local dockerfile="frontend/Dockerfile"
    if [ -f "$dockerfile" ]; then
        if grep -q 'if \[ -z "\$VERSION" \]' "$dockerfile"; then
            log_success "Dockerfile validates VERSION arg is provided"
        elif grep -q 'ARG VERSION=0.1.0' "$dockerfile" || grep -q "ARG VERSION='0.1.0'" "$dockerfile"; then
            log_failure "Dockerfile has default VERSION=0.1.0 (should require explicit value)"
        else
            log_success "Dockerfile does not have hardcoded default VERSION"
        fi
    else
        log_skip "frontend/Dockerfile not found"
    fi
}

test_makefile_checks_version() {
    log_info "Testing Makefile validates VERSION file..."
    if [ -f "Makefile" ]; then
        if grep -q 'check-version' "Makefile" && grep -q 'VERSION file not found' "Makefile"; then
            log_success "Makefile has check-version target that validates VERSION"
        else
            log_failure "Makefile missing check-version validation"
        fi
    else
        log_skip "Makefile not found"
    fi
}

# -----------------------------------------------------------------------------
# TEST SUITE 2: Agent Log Flow Tests (requires K8s)
# -----------------------------------------------------------------------------

test_nginx_logs_not_symlinked() {
    log_info "Testing nginx log files are not symlinks to stdout..."
    local namespace="${AVIKA_NAMESPACE:-utilities}"
    
    # Get first nginx pod
    local pod=$(kubectl get pods -n "$namespace" -l app=nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$pod" ]; then
        log_skip "No nginx pods found in namespace $namespace"
        return
    fi
    
    # Check if access.log is a symlink
    local is_symlink=$(kubectl exec -n "$namespace" "$pod" -- sh -c '[ -L /var/log/nginx/access.log ] && echo "yes" || echo "no"' 2>/dev/null)
    if [ "$is_symlink" = "no" ]; then
        log_success "access.log is a regular file (not symlink)"
    else
        log_failure "access.log is still a symlink to stdout - agent cannot tail it"
    fi
}

test_agent_config_uses_json_format() {
    log_info "Testing agent config uses JSON log format..."
    local config_file="nginx-agent/avika-agent.conf"
    if [ -f "$config_file" ]; then
        if grep -q 'LOG_FORMAT="json"' "$config_file"; then
            log_success "Agent config uses JSON log format"
        else
            log_failure "Agent config should use JSON format to match nginx telemetry format"
        fi
    else
        log_skip "avika-agent.conf not found"
    fi
}

test_start_script_fixes_symlinks() {
    log_info "Testing start.sh removes log symlinks..."
    local start_file="nginx-agent/start.sh"
    if [ -f "$start_file" ]; then
        if grep -q 'rm -f.*access.log' "$start_file" && grep -q 'touch.*access.log' "$start_file"; then
            log_success "start.sh removes symlinks and creates actual files"
        else
            log_failure "start.sh missing symlink fix logic"
        fi
    else
        log_skip "nginx-agent/start.sh not found"
    fi
}

test_clickhouse_has_access_logs() {
    log_info "Testing ClickHouse has access log data..."
    local namespace="${AVIKA_NAMESPACE:-avika}"
    
    # Check if ClickHouse pod exists
    local ch_pod=$(kubectl get pods -n "$namespace" -l app.kubernetes.io/name=clickhouse -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$ch_pod" ]; then
        ch_pod=$(kubectl get pods -n "$namespace" | grep clickhouse | head -1 | awk '{print $1}')
    fi
    
    if [ -z "$ch_pod" ]; then
        log_skip "ClickHouse pod not found"
        return
    fi
    
    # Query access logs count
    local count=$(kubectl exec -n "$namespace" "$ch_pod" -- clickhouse-client -q "SELECT count() FROM nginx_analytics.access_logs" 2>/dev/null || echo "0")
    
    if [ "$count" -gt 0 ]; then
        log_success "ClickHouse has $count access log entries"
    else
        log_failure "ClickHouse has 0 access logs - data not flowing from agents"
    fi
}

test_dashboard_api_returns_data() {
    log_info "Testing dashboard API returns analytics data..."
    local namespace="${AVIKA_NAMESPACE:-avika}"
    
    # Get frontend pod
    local fe_pod=$(kubectl get pods -n "$namespace" -l app=avika-frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$fe_pod" ]; then
        fe_pod=$(kubectl get pods -n "$namespace" | grep frontend | head -1 | awk '{print $1}')
    fi
    
    if [ -z "$fe_pod" ]; then
        log_skip "Frontend pod not found"
        return
    fi
    
    # Call analytics API
    local response=$(kubectl exec -n "$namespace" "$fe_pod" -- wget -q -O - "http://127.0.0.1:5031/avika/api/analytics?window=1h" 2>/dev/null || echo "{}")
    
    # Check if request_rate has data
    if echo "$response" | grep -q '"request_rate":\[\]'; then
        log_failure "Dashboard API returns empty request_rate - no data flowing"
    elif echo "$response" | grep -q '"request_rate":\['; then
        log_success "Dashboard API returns request_rate data"
    else
        log_skip "Could not parse dashboard API response"
    fi
}

test_agents_connected() {
    log_info "Testing agents are connected to gateway..."
    local namespace="${AVIKA_NAMESPACE:-avika}"
    
    # Get frontend pod
    local fe_pod=$(kubectl get pods -n "$namespace" -l app=avika-frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$fe_pod" ]; then
        fe_pod=$(kubectl get pods -n "$namespace" | grep frontend | head -1 | awk '{print $1}')
    fi
    
    if [ -z "$fe_pod" ]; then
        log_skip "Frontend pod not found"
        return
    fi
    
    # Call servers API
    local response=$(kubectl exec -n "$namespace" "$fe_pod" -- wget -q -O - "http://127.0.0.1:5031/avika/api/servers" 2>/dev/null || echo "{}")
    
    # Count agents
    local agent_count=$(echo "$response" | grep -o '"agent_id"' | wc -l)
    
    if [ "$agent_count" -gt 0 ]; then
        log_success "$agent_count agent(s) connected to gateway"
    else
        log_failure "No agents connected to gateway"
    fi
}

# -----------------------------------------------------------------------------
# TEST SUITE 3: Version Display in Deployed App
# -----------------------------------------------------------------------------

test_deployed_version_matches() {
    log_info "Testing deployed frontend shows correct version..."
    local namespace="${AVIKA_NAMESPACE:-avika}"
    local expected_version=$(get_expected_version)
    
    if [ "$expected_version" = "unknown" ]; then
        log_skip "Cannot determine expected version (VERSION file missing)"
        return
    fi
    
    # Get gateway pod to curl frontend
    local gw_pod=$(kubectl get pods -n "$namespace" | grep gateway | head -1 | awk '{print $1}')
    if [ -z "$gw_pod" ]; then
        log_skip "Gateway pod not found"
        return
    fi
    
    # Fetch login page and check version
    local html=$(kubectl exec -n "$namespace" "$gw_pod" -- curl -s http://avika-frontend.avika.svc.cluster.local:5031/avika/login 2>/dev/null || echo "")
    
    if echo "$html" | grep -q "v$expected_version"; then
        log_success "Login page shows correct version: v$expected_version"
    elif echo "$html" | grep -q "v0.1.0"; then
        log_failure "Login page shows hardcoded v0.1.0 instead of v$expected_version"
    else
        log_skip "Could not verify version in login page"
    fi
}

test_frontend_env_version() {
    log_info "Testing frontend pod has correct version env..."
    local namespace="${AVIKA_NAMESPACE:-avika}"
    local expected_version=$(get_expected_version)
    
    # Get frontend pod
    local fe_pod=$(kubectl get pods -n "$namespace" | grep frontend | head -1 | awk '{print $1}')
    if [ -z "$fe_pod" ]; then
        log_skip "Frontend pod not found"
        return
    fi
    
    # Check .env.production in pod
    local env_version=$(kubectl exec -n "$namespace" "$fe_pod" -- cat .env.production 2>/dev/null | grep NEXT_PUBLIC_APP_VERSION | cut -d= -f2)
    
    if [ "$env_version" = "$expected_version" ]; then
        log_success "Frontend .env.production has correct version: $env_version"
    elif [ -z "$env_version" ]; then
        log_failure "Frontend .env.production missing NEXT_PUBLIC_APP_VERSION"
    else
        log_failure "Frontend .env.production has wrong version: $env_version (expected: $expected_version)"
    fi
}

# -----------------------------------------------------------------------------
# Main Test Runner
# -----------------------------------------------------------------------------

run_all_tests() {
    log_section "AVIKA REGRESSION TESTS"
    echo "Expected version: $(get_expected_version)"
    echo "Timestamp: $(date)"
    
    log_section "TEST SUITE 1: Version Configuration"
    test_version_file_exists
    test_version_no_hardcoded_fallback_in_login
    test_version_no_hardcoded_fallback_in_config
    test_dockerfile_requires_version
    test_makefile_checks_version
    
    # Check if we're in K8s context for cluster tests
    if kubectl cluster-info &>/dev/null; then
        log_section "TEST SUITE 2: Agent Log Flow (Kubernetes)"
        test_nginx_logs_not_symlinked
        test_agent_config_uses_json_format
        test_start_script_fixes_symlinks
        test_agents_connected
        test_clickhouse_has_access_logs
        test_dashboard_api_returns_data
        
        log_section "TEST SUITE 3: Version Display (Kubernetes)"
        test_deployed_version_matches
        test_frontend_env_version
    else
        log_section "TEST SUITE 2 & 3: Skipped (No Kubernetes)"
        log_skip "Kubernetes not available - skipping cluster tests"
    fi
    
    # Summary
    log_section "TEST SUMMARY"
    echo -e "Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "${RED}FAILED TESTS:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "  - $test"
        done
        echo ""
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

# Run tests
cd "$(dirname "$0")/.."
run_all_tests
