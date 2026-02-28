#!/bin/bash
# Script to generate 50k RPS load for 2 minutes using the simulator

echo "=================================================="
echo "🚀 Starting 50k RPS Load Test Simulation"
echo "   Target: 50,000 Requests Per Second"
echo "   Agents: 500 (100 RPS each)"
echo "   Duration: 2 Minutes"
echo "=================================================="

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Check if simulator exists or run via go run
if [ -f "./bin/simulator" ]; then
    ./bin/simulator --rps 50000 --agents 500 --duration 2m
else
    echo "Simulator binary not found, running via go run..."
    go run cmd/simulator/main.go --rps 50000 --agents 500 --duration 2m
fi

echo "=================================================="
echo "✅ Load Test Completed"
echo "=================================================="
