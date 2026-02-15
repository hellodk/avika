#!/bin/bash
# =============================================================================
# Avika Agent Resource Profiling Script
# =============================================================================
# This script profiles the agent under various load conditions and generates
# a comprehensive resource usage report.
#
# Usage: ./scripts/profile_agent.sh [options]
#   --duration    Test duration per phase (default: 30s)
#   --port        Agent health port (default: 5026)
#   --output      Output directory (default: ./profiling_results)
#   --skip-build  Skip building the agent
# =============================================================================

set -e

# Configuration
DURATION=${DURATION:-30}
HEALTH_PORT=${HEALTH_PORT:-5026}
OUTPUT_DIR=${OUTPUT_DIR:-"./profiling_results"}
SKIP_BUILD=${SKIP_BUILD:-false}
AGENT_PID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --duration)
            DURATION="$2"
            shift 2
            ;;
        --port)
            HEALTH_PORT="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Create output directory
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$OUTPUT_DIR/profile_report_$TIMESTAMP.md"

echo -e "${BLUE}=================================================="
echo -e "  Avika Agent Resource Profiling"
echo -e "==================================================${NC}"
echo ""
echo "Configuration:"
echo "  Duration per phase: ${DURATION}s"
echo "  Health port: $HEALTH_PORT"
echo "  Output: $OUTPUT_DIR"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Function to collect stats
collect_stats() {
    local label=$1
    local file="$OUTPUT_DIR/stats_${label}_$TIMESTAMP.json"
    
    if curl -s "http://localhost:$HEALTH_PORT/stats" > "$file" 2>/dev/null; then
        echo "$file"
    else
        echo ""
    fi
}

# Function to get memory from stats file
get_memory_mb() {
    local file=$1
    if [ -f "$file" ]; then
        jq -r '.memory.alloc_mb // 0' "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to get goroutines from stats file
get_goroutines() {
    local file=$1
    if [ -f "$file" ]; then
        jq -r '.goroutines // 0' "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to get heap objects from stats file
get_heap_objects() {
    local file=$1
    if [ -f "$file" ]; then
        jq -r '.memory.heap_objects // 0' "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to get GC count from stats file
get_gc_count() {
    local file=$1
    if [ -f "$file" ]; then
        jq -r '.gc.num_gc // 0' "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to get GC pause total from stats file
get_gc_pause_ms() {
    local file=$1
    if [ -f "$file" ]; then
        jq -r '.gc.pause_total_ms // 0' "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Step 1: Build the agent
echo -e "${BLUE}[1/6] Building agent...${NC}"
if [ "$SKIP_BUILD" = true ]; then
    echo "  Skipping build (--skip-build specified)"
else
    cd cmd/agent
    go build -o ../../bin/avika-agent .
    cd ../..
    echo -e "  ${GREEN}Build complete${NC}"
fi

# Step 2: Start the agent in test mode
echo -e "\n${BLUE}[2/6] Starting agent for profiling...${NC}"

# Create a mock nginx_status endpoint for testing
mkdir -p /tmp/avika-test
cat > /tmp/avika-test/nginx_status << 'EOF'
Active connections: 291 
server accepts handled requests
 16630948 16630948 31070465 
Reading: 6 Writing: 179 Waiting: 106
EOF

# Start a simple HTTP server for the mock (using Python if available)
if command -v python3 &> /dev/null; then
    cd /tmp/avika-test
    python3 -m http.server 18080 &> /dev/null &
    MOCK_PID=$!
    cd - > /dev/null
    sleep 1
    NGINX_STATUS_URL="http://127.0.0.1:18080/nginx_status"
else
    NGINX_STATUS_URL="http://127.0.0.1/nginx_status"
fi

# Start the agent (it will fail to connect to gateway but that's fine for profiling)
./bin/avika-agent \
    --health-port "$HEALTH_PORT" \
    --nginx-status-url "$NGINX_STATUS_URL" \
    --buffer-dir /tmp/avika-test/ \
    --server "localhost:15020" \
    --log-level info \
    2>&1 | tee "$OUTPUT_DIR/agent_log_$TIMESTAMP.txt" &
AGENT_PID=$!

echo "  Agent PID: $AGENT_PID"
sleep 3

# Verify agent is running
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo -e "  ${RED}Agent failed to start${NC}"
    exit 1
fi

# Wait for health endpoint to be ready
echo "  Waiting for health endpoint..."
for i in {1..10}; do
    if curl -s "http://localhost:$HEALTH_PORT/healthz" > /dev/null 2>&1; then
        echo -e "  ${GREEN}Agent health endpoint ready${NC}"
        break
    fi
    sleep 1
done

# Step 3: Collect baseline metrics
echo -e "\n${BLUE}[3/6] Collecting baseline metrics (idle state)...${NC}"
sleep 2
BASELINE_FILE=$(collect_stats "baseline")
if [ -z "$BASELINE_FILE" ]; then
    echo -e "  ${RED}Failed to collect baseline stats${NC}"
    exit 1
fi
echo -e "  ${GREEN}Baseline stats saved${NC}"

# Display baseline
echo ""
echo "  Baseline Metrics:"
echo "  ├─ Memory:      $(get_memory_mb "$BASELINE_FILE") MB"
echo "  ├─ Goroutines:  $(get_goroutines "$BASELINE_FILE")"
echo "  ├─ Heap Objects: $(get_heap_objects "$BASELINE_FILE")"
echo "  └─ GC Cycles:   $(get_gc_count "$BASELINE_FILE")"

# Step 4: Run sustained load test
echo -e "\n${BLUE}[4/6] Running sustained load test (${DURATION}s)...${NC}"
echo "  Simulating continuous metrics collection..."

# Collect multiple samples during the test period
SAMPLES=()
for i in $(seq 1 $((DURATION / 5))); do
    sleep 5
    SAMPLE_FILE=$(collect_stats "load_sample_$i")
    if [ -n "$SAMPLE_FILE" ]; then
        SAMPLES+=("$SAMPLE_FILE")
        MEM=$(get_memory_mb "$SAMPLE_FILE")
        GOR=$(get_goroutines "$SAMPLE_FILE")
        echo "  ├─ Sample $i: Memory=${MEM}MB, Goroutines=${GOR}"
    fi
done

# Step 5: Collect pprof profiles
echo -e "\n${BLUE}[5/6] Collecting pprof profiles...${NC}"

# Heap profile
echo "  Collecting heap profile..."
curl -s "http://localhost:$HEALTH_PORT/debug/pprof/heap" > "$OUTPUT_DIR/heap_$TIMESTAMP.pprof" 2>/dev/null && \
    echo -e "  ${GREEN}├─ Heap profile saved${NC}" || \
    echo -e "  ${YELLOW}├─ Heap profile failed (pprof may not be available)${NC}"

# Goroutine profile
echo "  Collecting goroutine profile..."
curl -s "http://localhost:$HEALTH_PORT/debug/pprof/goroutine" > "$OUTPUT_DIR/goroutine_$TIMESTAMP.pprof" 2>/dev/null && \
    echo -e "  ${GREEN}├─ Goroutine profile saved${NC}" || \
    echo -e "  ${YELLOW}├─ Goroutine profile failed${NC}"

# Allocs profile
echo "  Collecting allocs profile..."
curl -s "http://localhost:$HEALTH_PORT/debug/pprof/allocs" > "$OUTPUT_DIR/allocs_$TIMESTAMP.pprof" 2>/dev/null && \
    echo -e "  ${GREEN}└─ Allocs profile saved${NC}" || \
    echo -e "  ${YELLOW}└─ Allocs profile failed${NC}"

# CPU profile (5 seconds)
echo "  Collecting CPU profile (5s)..."
curl -s "http://localhost:$HEALTH_PORT/debug/pprof/profile?seconds=5" > "$OUTPUT_DIR/cpu_$TIMESTAMP.pprof" 2>/dev/null && \
    echo -e "  ${GREEN}└─ CPU profile saved${NC}" || \
    echo -e "  ${YELLOW}└─ CPU profile failed${NC}"

# Step 6: Collect final metrics and generate report
echo -e "\n${BLUE}[6/6] Generating report...${NC}"
FINAL_FILE=$(collect_stats "final")

# Calculate statistics
BASELINE_MEM=$(get_memory_mb "$BASELINE_FILE")
FINAL_MEM=$(get_memory_mb "$FINAL_FILE")
BASELINE_GOR=$(get_goroutines "$BASELINE_FILE")
FINAL_GOR=$(get_goroutines "$FINAL_FILE")
BASELINE_HEAP=$(get_heap_objects "$BASELINE_FILE")
FINAL_HEAP=$(get_heap_objects "$FINAL_FILE")
BASELINE_GC=$(get_gc_count "$BASELINE_FILE")
FINAL_GC=$(get_gc_count "$FINAL_FILE")
FINAL_GC_PAUSE=$(get_gc_pause_ms "$FINAL_FILE")

# Calculate averages from samples
if [ ${#SAMPLES[@]} -gt 0 ]; then
    TOTAL_MEM=0
    TOTAL_GOR=0
    MAX_MEM=0
    MAX_GOR=0
    for sample in "${SAMPLES[@]}"; do
        MEM=$(get_memory_mb "$sample")
        GOR=$(get_goroutines "$sample")
        TOTAL_MEM=$(echo "$TOTAL_MEM + $MEM" | bc)
        TOTAL_GOR=$((TOTAL_GOR + GOR))
        if (( $(echo "$MEM > $MAX_MEM" | bc -l) )); then
            MAX_MEM=$MEM
        fi
        if [ "$GOR" -gt "$MAX_GOR" ]; then
            MAX_GOR=$GOR
        fi
    done
    AVG_MEM=$(echo "scale=2; $TOTAL_MEM / ${#SAMPLES[@]}" | bc)
    AVG_GOR=$((TOTAL_GOR / ${#SAMPLES[@]}))
else
    AVG_MEM=$FINAL_MEM
    AVG_GOR=$FINAL_GOR
    MAX_MEM=$FINAL_MEM
    MAX_GOR=$FINAL_GOR
fi

# Memory growth calculation
MEM_GROWTH=$(echo "scale=2; $FINAL_MEM - $BASELINE_MEM" | bc)
GC_CYCLES=$((FINAL_GC - BASELINE_GC))

# Generate markdown report
cat > "$REPORT_FILE" << EOF
# Avika Agent Resource Profiling Report

**Generated:** $(date -Iseconds)  
**Test Duration:** ${DURATION}s per phase  
**Agent Version:** $(./bin/avika-agent --version 2>&1 | head -1 || echo "unknown")

## Executive Summary

| Metric | Baseline | Final | Peak | Avg |
|--------|----------|-------|------|-----|
| Memory (MB) | $BASELINE_MEM | $FINAL_MEM | $MAX_MEM | $AVG_MEM |
| Goroutines | $BASELINE_GOR | $FINAL_GOR | $MAX_GOR | $AVG_GOR |
| Heap Objects | $BASELINE_HEAP | $FINAL_HEAP | - | - |
| GC Cycles | $BASELINE_GC | $FINAL_GC | - | - |

## Memory Analysis

### Memory Footprint
- **Baseline Memory:** $BASELINE_MEM MB
- **Final Memory:** $FINAL_MEM MB
- **Peak Memory:** $MAX_MEM MB
- **Memory Growth:** $MEM_GROWTH MB (+$(echo "scale=1; $MEM_GROWTH * 100 / $BASELINE_MEM" | bc 2>/dev/null || echo "N/A")%)

### Garbage Collection
- **GC Cycles During Test:** $GC_CYCLES
- **Total GC Pause Time:** ${FINAL_GC_PAUSE}ms
- **Avg GC Pause per Cycle:** $(echo "scale=3; $FINAL_GC_PAUSE / $FINAL_GC" | bc 2>/dev/null || echo "N/A")ms

## Goroutine Analysis

- **Baseline Goroutines:** $BASELINE_GOR
- **Final Goroutines:** $FINAL_GOR
- **Peak Goroutines:** $MAX_GOR
- **Goroutine Growth:** $((FINAL_GOR - BASELINE_GOR))

### Goroutine Stability
$(if [ $((FINAL_GOR - BASELINE_GOR)) -lt 5 ]; then
    echo "✅ **STABLE** - Goroutine count remained stable (growth < 5)"
elif [ $((FINAL_GOR - BASELINE_GOR)) -lt 20 ]; then
    echo "⚠️ **MODERATE** - Some goroutine growth observed"
else
    echo "❌ **POTENTIAL LEAK** - Significant goroutine growth detected"
fi)

## Resource Efficiency Assessment

### Memory Efficiency
$(if (( $(echo "$MAX_MEM < 50" | bc -l) )); then
    echo "✅ **EXCELLENT** - Peak memory under 50MB"
elif (( $(echo "$MAX_MEM < 100" | bc -l) )); then
    echo "✅ **GOOD** - Peak memory under 100MB"
elif (( $(echo "$MAX_MEM < 200" | bc -l) )); then
    echo "⚠️ **MODERATE** - Peak memory under 200MB"
else
    echo "❌ **HIGH** - Peak memory exceeds 200MB"
fi)

### Memory Leak Detection
$(if (( $(echo "$MEM_GROWTH < 5" | bc -l) )); then
    echo "✅ **NO LEAK DETECTED** - Memory growth minimal"
elif (( $(echo "$MEM_GROWTH < 20" | bc -l) )); then
    echo "⚠️ **MONITOR** - Some memory growth observed"
else
    echo "❌ **POTENTIAL LEAK** - Significant memory growth detected"
fi)

## Stress Test Recommendations

Based on the profiling results:

### Production Deployment Recommendations

| Resource | Recommended | Limit |
|----------|-------------|-------|
| Memory Request | $(echo "scale=0; $MAX_MEM * 1.5 / 1" | bc)Mi | $(echo "scale=0; $MAX_MEM * 2.5 / 1" | bc)Mi |
| Memory Limit | $(echo "scale=0; $MAX_MEM * 2.5 / 1" | bc)Mi | $(echo "scale=0; $MAX_MEM * 4 / 1" | bc)Mi |
| CPU Request | 50m | 100m |
| CPU Limit | 200m | 500m |

### Kubernetes Resource Manifest

\`\`\`yaml
resources:
  requests:
    memory: "$(echo "scale=0; $MAX_MEM * 1.5 / 1" | bc)Mi"
    cpu: "50m"
  limits:
    memory: "$(echo "scale=0; $MAX_MEM * 2.5 / 1" | bc)Mi"
    cpu: "200m"
\`\`\`

## Profiling Artifacts

The following pprof profiles were collected:

- \`heap_$TIMESTAMP.pprof\` - Memory allocation profile
- \`goroutine_$TIMESTAMP.pprof\` - Goroutine stack traces
- \`allocs_$TIMESTAMP.pprof\` - Allocation profile
- \`cpu_$TIMESTAMP.pprof\` - CPU profile (5s sample)

### Analyzing Profiles

\`\`\`bash
# View heap profile
go tool pprof $OUTPUT_DIR/heap_$TIMESTAMP.pprof

# View goroutine stacks
go tool pprof $OUTPUT_DIR/goroutine_$TIMESTAMP.pprof

# View CPU profile
go tool pprof $OUTPUT_DIR/cpu_$TIMESTAMP.pprof

# Web UI (interactive)
go tool pprof -http=:8080 $OUTPUT_DIR/heap_$TIMESTAMP.pprof
\`\`\`

## Raw Data

### Baseline Stats
\`\`\`json
$(cat "$BASELINE_FILE" | jq . 2>/dev/null || cat "$BASELINE_FILE")
\`\`\`

### Final Stats
\`\`\`json
$(cat "$FINAL_FILE" | jq . 2>/dev/null || cat "$FINAL_FILE")
\`\`\`

---
*Report generated by Avika Agent Profiling Script*
EOF

# Cleanup mock server
if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
fi

# Print summary
echo ""
echo -e "${GREEN}=================================================="
echo -e "  Profiling Complete!"
echo -e "==================================================${NC}"
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo "Report: $REPORT_FILE"
echo ""
echo "Summary:"
echo "  ├─ Baseline Memory:  $BASELINE_MEM MB"
echo "  ├─ Final Memory:     $FINAL_MEM MB"
echo "  ├─ Peak Memory:      $MAX_MEM MB"
echo "  ├─ Memory Growth:    $MEM_GROWTH MB"
echo "  ├─ Goroutines:       $BASELINE_GOR → $FINAL_GOR"
echo "  └─ GC Cycles:        $GC_CYCLES"
echo ""
echo "To view the full report:"
echo "  cat $REPORT_FILE"
echo ""
echo "To analyze pprof profiles:"
echo "  go tool pprof -http=:8080 $OUTPUT_DIR/heap_$TIMESTAMP.pprof"
