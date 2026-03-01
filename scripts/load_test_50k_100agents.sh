#!/bin/bash
#
# Avika Load Test: 50K RPS with 100 NGINX Agent Instances
# =========================================================
# This script performs a comprehensive load test and records observations.
#

set -e

# Configuration
GATEWAY_TARGET="${GATEWAY_TARGET:-localhost:5020}"
TOTAL_RPS=50000
AGENT_COUNT=100
DURATION="${DURATION:-5m}"
BATCH_SIZE=100
REPORT_INTERVAL="5s"
WARMUP_DURATION="30s"
COOLDOWN_DURATION="30s"

# Directories
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$PROJECT_ROOT/load_test_results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DIR="$RESULTS_DIR/lt_50k_100agents_$TIMESTAMP"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure results directory exists
mkdir -p "$TEST_DIR"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                           ║"
echo "║     🚀 AVIKA LOAD TEST: 50K RPS / 100 NGINX INSTANCES                     ║"
echo "║                                                                           ║"
echo "╠═══════════════════════════════════════════════════════════════════════════╣"
echo "║  Configuration:                                                           ║"
echo "║    • Target Gateway:    $GATEWAY_TARGET                                   ║"
echo "║    • Total RPS:         $TOTAL_RPS requests/second                        ║"
echo "║    • Agent Instances:   $AGENT_COUNT                                      ║"
echo "║    • RPS per Agent:     $((TOTAL_RPS / AGENT_COUNT))                      ║"
echo "║    • Test Duration:     $DURATION                                         ║"
echo "║    • Batch Size:        $BATCH_SIZE                                       ║"
echo "║    • Results Dir:       $TEST_DIR                                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}▶ Checking prerequisites...${NC}"
    
    # Check if gateway is reachable
    if ! nc -z ${GATEWAY_TARGET%:*} ${GATEWAY_TARGET#*:} 2>/dev/null; then
        echo -e "${RED}✗ Gateway not reachable at $GATEWAY_TARGET${NC}"
        echo -e "${YELLOW}  Starting gateway...${NC}"
        
        # Try to start gateway
        if [ -f "$PROJECT_ROOT/bin/gateway" ]; then
            cd "$PROJECT_ROOT"
            nohup ./bin/gateway > "$TEST_DIR/gateway.log" 2>&1 &
            GATEWAY_PID=$!
            echo $GATEWAY_PID > "$TEST_DIR/gateway.pid"
            sleep 5
            
            if ! nc -z ${GATEWAY_TARGET%:*} ${GATEWAY_TARGET#*:} 2>/dev/null; then
                echo -e "${RED}✗ Failed to start gateway${NC}"
                exit 1
            fi
        else
            echo -e "${RED}✗ Gateway binary not found. Please build and start gateway first.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}✓ Gateway is reachable at $GATEWAY_TARGET${NC}"
    
    # Build simulator if needed
    if [ ! -f "$PROJECT_ROOT/bin/simulator" ]; then
        echo -e "${YELLOW}  Building simulator...${NC}"
        cd "$PROJECT_ROOT"
        go build -o bin/simulator cmd/simulator/main.go
    fi
    echo -e "${GREEN}✓ Simulator ready${NC}"
}

# Function to collect baseline metrics
collect_baseline() {
    echo -e "${YELLOW}▶ Collecting baseline metrics...${NC}"
    
    # System info
    {
        echo "=== SYSTEM INFORMATION ==="
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "Kernel: $(uname -r)"
        echo "CPU: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
        echo "CPU Cores: $(nproc)"
        echo "Total RAM: $(free -h | grep Mem | awk '{print $2}')"
        echo "Available RAM: $(free -h | grep Mem | awk '{print $7}')"
        echo ""
        echo "=== BASELINE RESOURCE USAGE ==="
        echo "CPU Usage: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')%"
        echo "Memory Usage: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100}')"
        echo ""
        echo "=== GO RUNTIME ==="
        echo "GOMAXPROCS: ${GOMAXPROCS:-$(nproc)}"
        go version
    } > "$TEST_DIR/baseline_system.txt"
    
    # Gateway process info (if running)
    GATEWAY_PID=$(pgrep -f "bin/gateway" 2>/dev/null | head -1 || echo "")
    if [ -n "$GATEWAY_PID" ]; then
        {
            echo "=== GATEWAY PROCESS BASELINE ==="
            echo "PID: $GATEWAY_PID"
            ps -p "$GATEWAY_PID" -o pid,ppid,pcpu,pmem,rss,vsz,cmd --no-headers 2>/dev/null || echo "Process info unavailable"
        } > "$TEST_DIR/baseline_gateway.txt"
    fi
    
    echo -e "${GREEN}✓ Baseline collected${NC}"
}

# Function to monitor resources during test
start_resource_monitor() {
    echo -e "${YELLOW}▶ Starting resource monitor...${NC}"
    
    # Monitor system resources every second
    (
        while true; do
            TIMESTAMP_MS=$(date +%s%3N)
            CPU=$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')
            MEM=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100}')
            
            # Gateway process stats
            GATEWAY_PID=$(pgrep -f "bin/gateway" 2>/dev/null | head -1 || echo "")
            if [ -n "$GATEWAY_PID" ]; then
                GATEWAY_CPU=$(ps -p "$GATEWAY_PID" -o pcpu --no-headers 2>/dev/null | xargs || echo "0")
                GATEWAY_MEM=$(ps -p "$GATEWAY_PID" -o pmem --no-headers 2>/dev/null | xargs || echo "0")
                GATEWAY_RSS=$(ps -p "$GATEWAY_PID" -o rss --no-headers 2>/dev/null | xargs || echo "0")
            else
                GATEWAY_CPU="0"
                GATEWAY_MEM="0"
                GATEWAY_RSS="0"
            fi
            
            echo "$TIMESTAMP_MS,$CPU,$MEM,$GATEWAY_CPU,$GATEWAY_MEM,$GATEWAY_RSS"
            sleep 1
        done
    ) > "$TEST_DIR/resource_metrics.csv" &
    MONITOR_PID=$!
    echo $MONITOR_PID > "$TEST_DIR/monitor.pid"
    
    # Add CSV header
    echo "timestamp_ms,system_cpu,system_mem,gateway_cpu,gateway_mem,gateway_rss_kb" | cat - "$TEST_DIR/resource_metrics.csv" > temp && mv temp "$TEST_DIR/resource_metrics.csv"
    
    echo -e "${GREEN}✓ Resource monitor started (PID: $MONITOR_PID)${NC}"
}

stop_resource_monitor() {
    if [ -f "$TEST_DIR/monitor.pid" ]; then
        MONITOR_PID=$(cat "$TEST_DIR/monitor.pid")
        kill $MONITOR_PID 2>/dev/null || true
        rm -f "$TEST_DIR/monitor.pid"
    fi
}

# Function to run warmup
run_warmup() {
    echo -e "${YELLOW}▶ Running warmup ($WARMUP_DURATION)...${NC}"
    
    # Run simulator at 10% load for warmup
    WARMUP_RPS=$((TOTAL_RPS / 10))
    timeout ${WARMUP_DURATION} "$PROJECT_ROOT/bin/simulator" \
        -target "$GATEWAY_TARGET" \
        -agents 10 \
        -rps $WARMUP_RPS \
        -duration ${WARMUP_DURATION} \
        -report 10s 2>&1 | tee "$TEST_DIR/warmup.log" || true
    
    echo -e "${GREEN}✓ Warmup complete${NC}"
    sleep 5
}

# Function to run main load test
run_load_test() {
    echo -e "${CYAN}"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "                         STARTING MAIN LOAD TEST                            "
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
    
    START_TIME=$(date +%s)
    
    # Run the simulator
    "$PROJECT_ROOT/bin/simulator" \
        -target "$GATEWAY_TARGET" \
        -agents $AGENT_COUNT \
        -rps $TOTAL_RPS \
        -duration $DURATION \
        -batch $BATCH_SIZE \
        -report $REPORT_INTERVAL 2>&1 | tee "$TEST_DIR/load_test.log"
    
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                         LOAD TEST COMPLETED                                ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Elapsed Time: ${ELAPSED}s"
}

# Function to run cooldown
run_cooldown() {
    echo -e "${YELLOW}▶ Running cooldown ($COOLDOWN_DURATION)...${NC}"
    sleep ${COOLDOWN_DURATION%s}
    echo -e "${GREEN}✓ Cooldown complete${NC}"
}

# Function to collect final metrics
collect_final_metrics() {
    echo -e "${YELLOW}▶ Collecting final metrics...${NC}"
    
    # Gateway process info
    GATEWAY_PID=$(pgrep -f "bin/gateway" 2>/dev/null | head -1 || echo "")
    if [ -n "$GATEWAY_PID" ]; then
        {
            echo "=== GATEWAY PROCESS FINAL ==="
            echo "PID: $GATEWAY_PID"
            ps -p "$GATEWAY_PID" -o pid,ppid,pcpu,pmem,rss,vsz,cmd --no-headers 2>/dev/null || echo "Process info unavailable"
            echo ""
            echo "=== GATEWAY FILE DESCRIPTORS ==="
            ls /proc/"$GATEWAY_PID"/fd 2>/dev/null | wc -l || echo "0"
            echo ""
            echo "=== GATEWAY THREADS ==="
            ls /proc/"$GATEWAY_PID"/task 2>/dev/null | wc -l || echo "0"
        } > "$TEST_DIR/final_gateway.txt" 2>&1
    fi
    
    # System final state
    {
        echo "=== FINAL SYSTEM STATE ==="
        echo "Date: $(date)"
        echo "CPU Usage: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')%"
        echo "Memory Usage: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100}')"
        echo ""
        echo "=== NETWORK STATS ==="
        ss -s
    } > "$TEST_DIR/final_system.txt"
    
    echo -e "${GREEN}✓ Final metrics collected${NC}"
}

# Function to analyze results
analyze_results() {
    echo -e "${YELLOW}▶ Analyzing results...${NC}"
    
    # Parse simulator output
    if [ -f "$TEST_DIR/load_test.log" ]; then
        # Extract key metrics from log
        TOTAL_SENT=$(grep "Total Sent:" "$TEST_DIR/load_test.log" | tail -1 | awk '{print $3}')
        TOTAL_ERRORS=$(grep "Total Errors:" "$TEST_DIR/load_test.log" | tail -1 | awk '{print $3}')
        AVG_RPS=$(grep "Avg RPS:" "$TEST_DIR/load_test.log" | tail -1 | awk '{print $3}')
        AVG_LATENCY=$(grep "Avg Latency:" "$TEST_DIR/load_test.log" | tail -1 | awk '{print $3}')
        SUCCESS_RATE=$(grep "Success Rate:" "$TEST_DIR/load_test.log" | tail -1 | awk '{print $3}')
    fi
    
    # Analyze resource metrics
    if [ -f "$TEST_DIR/resource_metrics.csv" ]; then
        # Calculate averages (skip header)
        AVG_SYSTEM_CPU=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' '{sum+=$2; count++} END {printf "%.1f", sum/count}')
        MAX_SYSTEM_CPU=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' 'BEGIN{max=0} {if($2>max)max=$2} END {printf "%.1f", max}')
        AVG_GATEWAY_CPU=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' '{sum+=$4; count++} END {printf "%.1f", sum/count}')
        MAX_GATEWAY_CPU=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' 'BEGIN{max=0} {if($4>max)max=$4} END {printf "%.1f", max}')
        AVG_GATEWAY_MEM=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' '{sum+=$6; count++} END {printf "%.0f", sum/count/1024}')
        MAX_GATEWAY_MEM=$(tail -n +2 "$TEST_DIR/resource_metrics.csv" | awk -F',' 'BEGIN{max=0} {if($6>max)max=$6} END {printf "%.0f", max/1024}')
    fi
    
    echo -e "${GREEN}✓ Analysis complete${NC}"
}

# Function to generate report
generate_report() {
    echo -e "${YELLOW}▶ Generating report...${NC}"
    
    REPORT_FILE="$TEST_DIR/LOAD_TEST_REPORT.md"
    
    cat > "$REPORT_FILE" << EOF
# Avika Load Test Report

## Test Configuration

| Parameter | Value |
|-----------|-------|
| **Date** | $(date) |
| **Gateway Target** | $GATEWAY_TARGET |
| **Total RPS** | $TOTAL_RPS |
| **Agent Instances** | $AGENT_COUNT |
| **RPS per Agent** | $((TOTAL_RPS / AGENT_COUNT)) |
| **Test Duration** | $DURATION |
| **Batch Size** | $BATCH_SIZE |

## System Information

| Metric | Value |
|--------|-------|
| **Hostname** | $(hostname) |
| **CPU** | $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs) |
| **CPU Cores** | $(nproc) |
| **Total RAM** | $(free -h | grep Mem | awk '{print $2}') |
| **Go Version** | $(go version | awk '{print $3}') |
| **GOMAXPROCS** | ${GOMAXPROCS:-$(nproc)} |

## Test Results

### Throughput

| Metric | Value |
|--------|-------|
| **Total Messages Sent** | ${TOTAL_SENT:-N/A} |
| **Total Errors** | ${TOTAL_ERRORS:-N/A} |
| **Average RPS** | ${AVG_RPS:-N/A} |
| **Success Rate** | ${SUCCESS_RATE:-N/A} |

### Latency

| Metric | Value |
|--------|-------|
| **Average Latency** | ${AVG_LATENCY:-N/A} |

### Resource Utilization

| Metric | Average | Maximum |
|--------|---------|---------|
| **System CPU** | ${AVG_SYSTEM_CPU:-N/A}% | ${MAX_SYSTEM_CPU:-N/A}% |
| **Gateway CPU** | ${AVG_GATEWAY_CPU:-N/A}% | ${MAX_GATEWAY_CPU:-N/A}% |
| **Gateway Memory** | ${AVG_GATEWAY_MEM:-N/A} MB | ${MAX_GATEWAY_MEM:-N/A} MB |

## Observations

### Performance Summary

\`\`\`
Target RPS:     $TOTAL_RPS
Achieved RPS:   ${AVG_RPS:-N/A}
Achievement:    $(echo "scale=1; ${AVG_RPS:-0} / $TOTAL_RPS * 100" | bc 2>/dev/null || echo "N/A")%
\`\`\`

### Key Findings

1. **Throughput**: The system ${AVG_RPS:+achieved ${AVG_RPS} RPS}${AVG_RPS:-could not be measured}
2. **Error Rate**: ${TOTAL_ERRORS:-0} errors out of ${TOTAL_SENT:-0} messages
3. **Resource Usage**: Gateway CPU peaked at ${MAX_GATEWAY_CPU:-N/A}%, Memory at ${MAX_GATEWAY_MEM:-N/A} MB

### Recommendations

Based on the test results:

- If CPU > 80%: Consider horizontal scaling or increasing GOMAXPROCS
- If Memory > 1GB: Review memory allocation and connection pooling
- If Error Rate > 1%: Investigate network issues or increase timeouts
- If RPS < Target: Consider batching optimizations or async processing

## Files Generated

- \`load_test.log\` - Simulator output
- \`resource_metrics.csv\` - Time-series resource data
- \`baseline_system.txt\` - Pre-test system state
- \`final_system.txt\` - Post-test system state
- \`warmup.log\` - Warmup phase output

## Charts

Resource metrics can be visualized using:

\`\`\`bash
# Import CSV into Grafana or use gnuplot:
gnuplot -p -e "set datafile separator ','; set xlabel 'Time'; set ylabel 'CPU %'; plot '$TEST_DIR/resource_metrics.csv' using 1:2 with lines title 'System CPU', '' using 1:4 with lines title 'Gateway CPU'"
\`\`\`

---

*Report generated by Avika Load Test Suite*
*Timestamp: $(date -Iseconds)*
EOF

    echo -e "${GREEN}✓ Report generated: $REPORT_FILE${NC}"
}

# Main execution
main() {
    trap 'stop_resource_monitor; echo -e "${RED}Test interrupted${NC}"' INT TERM
    
    echo ""
    echo -e "${CYAN}Starting load test at $(date)${NC}"
    echo ""
    
    check_prerequisites
    collect_baseline
    start_resource_monitor
    
    echo ""
    run_warmup
    
    echo ""
    run_load_test
    
    echo ""
    run_cooldown
    
    stop_resource_monitor
    collect_final_metrics
    analyze_results
    generate_report
    
    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                           ║"
    echo "║     ✅ LOAD TEST COMPLETE                                                 ║"
    echo "║                                                                           ║"
    echo "╠═══════════════════════════════════════════════════════════════════════════╣"
    echo "║  Results saved to: $TEST_DIR"
    echo "║                                                                           ║"
    echo "║  Key files:                                                               ║"
    echo "║    • LOAD_TEST_REPORT.md  - Detailed report with observations             ║"
    echo "║    • load_test.log        - Raw test output                               ║"
    echo "║    • resource_metrics.csv - Time-series resource data                     ║"
    echo "╚═══════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Display quick summary
    echo ""
    echo -e "${BLUE}Quick Summary:${NC}"
    echo "  Total Sent:    ${TOTAL_SENT:-N/A} messages"
    echo "  Total Errors:  ${TOTAL_ERRORS:-N/A}"
    echo "  Average RPS:   ${AVG_RPS:-N/A}"
    echo "  Avg Latency:   ${AVG_LATENCY:-N/A}"
    echo "  Success Rate:  ${SUCCESS_RATE:-N/A}"
    echo ""
}

main "$@"
