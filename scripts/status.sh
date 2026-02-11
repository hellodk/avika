#!/bin/bash
# Check status of all NGINX Manager services

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         NGINX Manager - Service Status                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check service status
check_service() {
    local service_name=$1
    local process_pattern=$2
    local port=$3
    
    echo -e "${BLUE}${service_name}${NC}"
    
    # Check if process is running
    PIDS=$(pgrep -f "$process_pattern" || true)
    
    if [ -z "$PIDS" ]; then
        echo -e "  Status: ${RED}✗ Not Running${NC}"
        return 1
    fi
    
    echo -e "  Status: ${GREEN}✓ Running${NC}"
    
    # Show PIDs
    for PID in $PIDS; do
        # Get process info
        UPTIME=$(ps -p $PID -o etime= | tr -d ' ')
        CPU=$(ps -p $PID -o %cpu= | tr -d ' ')
        MEM=$(ps -p $PID -o %mem= | tr -d ' ')
        
        echo "    PID: $PID | Uptime: $UPTIME | CPU: ${CPU}% | MEM: ${MEM}%"
    done
    
    # Check port if specified
    if [ -n "$port" ]; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo -e "    Port: ${GREEN}$port (listening)${NC}"
        elif ss -tuln 2>/dev/null | grep -q ":$port "; then
            echo -e "    Port: ${GREEN}$port (listening)${NC}"
        else
            echo -e "    Port: ${YELLOW}$port (not listening)${NC}"
        fi
    fi
    
    return 0
}

# Check each service
check_service "Gateway" "./gateway" "50051"
echo ""

check_service "Update Server" "./update-server" "8090"
echo ""

check_service "Agent" "./agent" "50052"
echo ""

check_service "Frontend (Next.js)" "next dev" "3000"
echo ""

# Check external dependencies
echo -e "${BLUE}External Dependencies${NC}"

# PostgreSQL
if docker ps | grep -q postgres; then
    echo -e "  PostgreSQL: ${GREEN}✓ Running (Docker)${NC}"
else
    echo -e "  PostgreSQL: ${RED}✗ Not Running${NC}"
fi

# ClickHouse
if docker ps | grep -q clickhouse; then
    echo -e "  ClickHouse: ${GREEN}✓ Running (Docker)${NC}"
else
    echo -e "  ClickHouse: ${RED}✗ Not Running${NC}"
fi

echo ""

# Overall status
GATEWAY_RUNNING=$(pgrep -f "./gateway" > /dev/null && echo "1" || echo "0")
UPDATE_SERVER_RUNNING=$(pgrep -f "./update-server" > /dev/null && echo "1" || echo "0")
AGENT_RUNNING=$(pgrep -f "./agent" > /dev/null && echo "1" || echo "0")
FRONTEND_RUNNING=$(pgrep -f "next dev" > /dev/null && echo "1" || echo "0")

if [ "$GATEWAY_RUNNING" = "1" ] && [ "$AGENT_RUNNING" = "1" ] && [ "$FRONTEND_RUNNING" = "1" ] && [ "$UPDATE_SERVER_RUNNING" = "1" ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ All services are running${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠ Some services are not running${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "To start all services: ./scripts/start.sh"
fi

echo ""

# Show recent logs if services are running
if [ "$GATEWAY_RUNNING" = "1" ] || [ "$AGENT_RUNNING" = "1" ] || [ "$FRONTEND_RUNNING" = "1" ]; then
    echo -e "${CYAN}Recent Logs (last 5 lines):${NC}"
    echo ""
    
    if [ "$UPDATE_SERVER_RUNNING" = "1" ] && [ -f "logs/update-server.log" ]; then
        echo -e "${BLUE}Update Server:${NC}"
        tail -5 logs/update-server.log | sed 's/^/  /'
        echo ""
    fi

    if [ "$GATEWAY_RUNNING" = "1" ] && [ -f "logs/gateway.log" ]; then
        echo -e "${BLUE}Gateway:${NC}"
        tail -5 logs/gateway.log | sed 's/^/  /'
        echo ""
    fi
    
    if [ "$AGENT_RUNNING" = "1" ] && [ -f "logs/agent.log" ]; then
        echo -e "${BLUE}Agent:${NC}"
        tail -5 logs/agent.log | sed 's/^/  /'
        echo ""
    fi
fi
