#!/bin/bash
# Full harness load test: 50k RPS, 100 agents, 5m, with baseline/report. Wrapper for scripts/load_test.sh.
export RPS="${RPS:-50000}" AGENTS="${AGENTS:-100}" DURATION="${DURATION:-5m}"
exec "$(dirname "$0")/load_test.sh"
