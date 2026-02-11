#!/bin/bash
set -e

echo "Starting Avika Agent..."
# The agent binary now natively supports loading configuration from /etc/avika/avika-agent.conf
# No flags are needed as it defaults to this path.
# Environment variable overrides are still supported via command-line flags if needed, 
# but for simple file-based config, just running the binary is sufficient.

/usr/local/bin/avika-agent &

# Start NGINX in foreground
exec nginx -g "daemon off;"
