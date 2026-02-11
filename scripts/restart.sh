#!/bin/bash
# Restart all NGINX Manager services

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🔄 Restarting NGINX Manager Services${NC}"
echo ""

# Stop services
"$SCRIPT_DIR/stop.sh"

echo ""
echo -e "${BLUE}Waiting 2 seconds before restart...${NC}"
sleep 2
echo ""

# Start services
"$SCRIPT_DIR/start.sh"

echo ""
echo -e "${GREEN}✓ Restart complete${NC}"
