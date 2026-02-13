#!/bin/bash
# Start all NGINX Manager services

set -e

# Timezone Configuration (Default: IST)
export TZ=${TZ:-Asia/Kolkata}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Starting NGINX Manager Services                   ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to stop a service
stop_service() {
    local service_name=$1
    local process_pattern=$2
    
    echo -e "${YELLOW}  Stopping existing ${service_name}...${NC}"
    
    # Find PIDs
    PIDS=$(pgrep -f "$process_pattern" || true)
    
    if [ -z "$PIDS" ]; then
        return 0
    fi
    
    # Try graceful shutdown first (SIGTERM)
    kill -TERM $PIDS 2>/dev/null || true
    
    # Wait up to 5 seconds for graceful shutdown
    for i in {1..5}; do
        sleep 1
        if ! pgrep -f "$process_pattern" > /dev/null; then
            echo -e "${GREEN}  ✓ Stopped gracefully${NC}"
            return 0
        fi
    done
    
    # Force kill if still running
    PIDS=$(pgrep -f "$process_pattern" || true)
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}  Forcing shutdown with SIGKILL...${NC}"
        kill -9 $PIDS 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}  ✓ Force stopped${NC}"
    fi
}

# Check if services are already running
check_running() {
    local service_name=$1
    local process_pattern=$2
    
    if pgrep -f "$process_pattern" > /dev/null; then
        echo -e "${YELLOW}⚠ ${service_name} is already running${NC}"
        read -p "Do you want to restart it? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            stop_service "$service_name" "$process_pattern"
            return 1  # Processed stopped, ready to start
        else
            return 0  # Skip
        fi
    fi
    return 1  # Not running, start it
}

# Create log directory
mkdir -p "$PROJECT_ROOT/logs"

# 0. Start Infrastructure
echo -e "${BLUE}📦 Starting Infrastructure...${NC}"
cd "$PROJECT_ROOT/deploy/docker"
docker-compose up -d
cd "$PROJECT_ROOT"

# Wait for Postgres
echo -e "${YELLOW}  Waiting for Database (Postgres) to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0
until nc -z localhost 5432 || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    echo -n "."
    sleep 1
    ((RETRY_COUNT++))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Postgres failed to start within timeout${NC}"
    exit 1
fi
echo -e " ${GREEN}✓ Postgres is up${NC}"

# Wait for ClickHouse
echo -e "${YELLOW}  Waiting for Analytics (ClickHouse) to be ready...${NC}"
RETRY_COUNT=0
until curl -s http://localhost:8123 > /dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    echo -n "."
    sleep 1
    ((RETRY_COUNT++))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ ClickHouse failed to start within timeout${NC}"
    exit 1
fi
echo -e " ${GREEN}✓ ClickHouse is up${NC}"
echo ""

# 1. Start Gateway
echo -e "${BLUE}📡 Starting Gateway...${NC}"
if ! check_running "Gateway" "\./gateway"; then
    cd "$PROJECT_ROOT"
    nohup ./gateway > logs/gateway.log 2>&1 &
    GATEWAY_PID=$!
    echo "  PID: $GATEWAY_PID"
    echo "  Logs: logs/gateway.log"
    sleep 2
    
    if ps -p $GATEWAY_PID > /dev/null; then
        echo -e "${GREEN}✓ Gateway started successfully${NC}"
    else
        echo -e "${RED}✗ Gateway failed to start. Check logs/gateway.log${NC}"
        exit 1
    fi
fi
echo ""

# 1.5 Start Update Server (Distribution)
echo -e "${BLUE}📦 Starting Update Server...${NC}"
if ! check_running "Update Server" "\./update-server"; then
    cd "$PROJECT_ROOT"
    if [ ! -f "./update-server" ]; then
        echo -e "${YELLOW}  Building update server...${NC}"
        go build -o update-server ./cmd/update-server
    fi
    mkdir -p dist/bin
    
    nohup ./update-server > logs/update-server.log 2>&1 &
    UPDATE_SERVER_PID=$!
    echo "  PID: $UPDATE_SERVER_PID"
    echo "  URL: http://localhost:8090"
    echo "  Logs: logs/update-server.log"
    sleep 2
    
    if ps -p $UPDATE_SERVER_PID > /dev/null; then
        echo -e "${GREEN}✓ Update Server started successfully${NC}"
    else
        echo -e "${RED}✗ Update Server failed to start. Check logs/update-server.log${NC}"
        # Not critical, continue
    fi
fi
echo ""

# 2. Start Agent
echo -e "${BLUE}🤖 Starting Agent...${NC}"
if ! check_running "Agent" "\./agent"; then
    cd "$PROJECT_ROOT"
    
    # Get agent ID (default or from env)
    AGENT_ID=${AGENT_ID:-"prod-nginx-agent"}
    NGINX_STATUS_URL=${NGINX_STATUS_URL:-"http://127.0.0.1:9113/stub_status"}
    UPDATE_SERVER_URL=${UPDATE_SERVER_URL:-"http://localhost:8090"}
    
    nohup ./agent -id "$AGENT_ID" \
                  -nginx-status-url "$NGINX_STATUS_URL" \
                  -update-server "$UPDATE_SERVER_URL" \
                  -update-interval "1m" > logs/agent.log 2>&1 &
    AGENT_PID=$!
    echo "  PID: $AGENT_PID"
    echo "  Agent ID: $AGENT_ID"
    echo "  Logs: logs/agent.log"
    sleep 2
    
    if ps -p $AGENT_PID > /dev/null; then
        echo -e "${GREEN}✓ Agent started successfully${NC}"
    else
        echo -e "${RED}✗ Agent failed to start. Check logs/agent.log${NC}"
        exit 1
    fi
fi
echo ""

# 3. Start Frontend
echo -e "${BLUE}🌐 Starting Frontend...${NC}"
if ! check_running "Frontend" "next dev"; then
    cd "$PROJECT_ROOT/frontend"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}  Installing dependencies...${NC}"
        npm install
    fi
    
    nohup npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "  PID: $FRONTEND_PID"
    echo "  URL: http://localhost:3000"
    echo "  Logs: logs/frontend.log"
    
    # Wait for frontend to be ready
    echo -e "${YELLOW}  Waiting for frontend to be ready...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Frontend started successfully${NC}"
            break
        fi
        sleep 1
    done
fi
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All services started${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Service Status:${NC}"
echo ""

# Show running processes
ps aux | grep -E "gateway|agent|next dev" | grep -v grep | awk '{printf "  %-20s PID: %-8s CPU: %-6s MEM: %-6s\n", $11, $2, $3"%", $4"%"}'

echo ""
echo -e "${CYAN}Access Points:${NC}"
echo "  Frontend:  http://localhost:3000"
echo "  Gateway:   localhost:50051 (gRPC)"
echo "  Agent:     localhost:50052 (gRPC)"
echo ""
echo -e "${CYAN}Logs:${NC}"
echo "  Gateway:   tail -f logs/gateway.log"
echo "  Agent:     tail -f logs/agent.log"
echo "  Frontend:  tail -f logs/frontend.log"
echo ""
echo -e "${CYAN}Management:${NC}"
echo "  Stop all:  ./scripts/stop.sh"
echo "  Restart:   ./scripts/restart.sh"
echo "  Status:    ./scripts/status.sh"
echo ""
