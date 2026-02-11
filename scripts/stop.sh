#!/bin/bash
# Stop all NGINX Manager services gracefully

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛑 Stopping NGINX Manager Services${NC}"
echo ""

# Function to stop a service
stop_service() {
    local service_name=$1
    local process_pattern=$2
    
    echo -e "${YELLOW}Stopping ${service_name}...${NC}"
    
    # Find PIDs
    PIDS=$(pgrep -f "$process_pattern" || true)
    
    if [ -z "$PIDS" ]; then
        echo -e "${GREEN}✓ ${service_name} is not running${NC}"
        return 0
    fi
    
    # Try graceful shutdown first (SIGTERM)
    echo "  Sending SIGTERM to PIDs: $PIDS"
    kill -TERM $PIDS 2>/dev/null || true
    
    # Wait up to 10 seconds for graceful shutdown
    for i in {1..10}; do
        sleep 1
        if ! pgrep -f "$process_pattern" > /dev/null; then
            echo -e "${GREEN}✓ ${service_name} stopped gracefully${NC}"
            return 0
        fi
    done
    
    # Force kill if still running
    PIDS=$(pgrep -f "$process_pattern" || true)
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}  Forcing shutdown with SIGKILL...${NC}"
        kill -9 $PIDS 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓ ${service_name} force stopped${NC}"
    fi
}

# Stop services in reverse order of dependencies
stop_service "Frontend (Next.js)" "next dev"
stop_service "Gateway" "./gateway"
stop_service "Agent" "./agent"
stop_service "Update Server" "./update-server"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All services stopped${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show remaining processes (if any)
if pgrep -f "gateway|agent|next dev|update-server" > /dev/null; then
    echo -e "${YELLOW}⚠ Some processes may still be running:${NC}"
    ps aux | grep -E "gateway|agent|next dev|update-server" | grep -v grep
fi
