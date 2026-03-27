#!/bin/bash
# Quick load test: 50k RPS, 500 agents, 2m. Wrapper for scripts/load_test.sh (simple mode).
export RPS="${RPS:-50000}" AGENTS="${AGENTS:-500}" DURATION="${DURATION:-2m}" SIMPLE=1
exec "$(dirname "$0")/load_test.sh"
