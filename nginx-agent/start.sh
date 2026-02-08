#!/bin/bash
set -e

ID="${POD_NAME:-$(hostname)}"

echo "Starting agent with ID=$ID"

/usr/local/bin/agent -server 192.168.1.10:50051 -id "$ID" &

exec nginx -g "daemon off;"
