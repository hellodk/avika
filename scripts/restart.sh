#!/bin/bash
# Restart all NGINX Manager services (stop then start)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Restarting all services..."
"$SCRIPT_DIR/stop.sh"
sleep 2
"$SCRIPT_DIR/start.sh"
