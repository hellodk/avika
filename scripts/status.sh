#!/bin/bash
# Show status of NGINX Manager services (Gateway, Agent, Frontend, Update Server)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         NGINX Manager - Service Status                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

status_of() {
    local name=$1
    local pattern=$2
    local port=$3
    if pgrep -f "$pattern" > /dev/null; then
        local pids=$(pgrep -f "$pattern" | tr '\n' ' ')
        echo -e "${name}: ${GREEN}✓ Running${NC} (PID(s): $pids)"
        if [ -n "$port" ]; then
            if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$port" 2>/dev/null; then
                echo "  Port $port: listening"
            fi
        fi
    else
        echo -e "${name}: ${RED}✗ Not running${NC}"
    fi
    echo ""
}

status_of "Gateway"     "\./gateway"       "5020"
status_of "Agent"       "\./agent"         "5025"
status_of "Frontend"    "next dev"         "3000"
status_of "Update Server" "\./update-server" "5021"

echo -e "${BLUE}Management:${NC}"
echo "  Start:   ./scripts/start.sh"
echo "  Stop:    ./scripts/stop.sh"
echo "  Restart: ./scripts/restart.sh"
echo ""
