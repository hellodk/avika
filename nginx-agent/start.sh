#!/bin/bash
set -e

echo "Starting Avika NGINX Agent setup..."

# Fix log paths - nginx:stable symlinks logs to /dev/stdout and /dev/stderr
# but the agent's log tailer needs actual files to follow
LOG_DIR="/var/log/nginx"

# Remove symlinks if they exist and create actual log files
if [ -L "$LOG_DIR/access.log" ]; then
    rm -f "$LOG_DIR/access.log"
    touch "$LOG_DIR/access.log"
    chmod 644 "$LOG_DIR/access.log"
    echo "Created actual access.log file (was symlink to stdout)"
fi

if [ -L "$LOG_DIR/error.log" ]; then
    rm -f "$LOG_DIR/error.log"
    touch "$LOG_DIR/error.log"
    chmod 644 "$LOG_DIR/error.log"
    echo "Created actual error.log file (was symlink to stderr)"
fi

# Ensure nginx user can write to logs
chown -R nginx:nginx "$LOG_DIR" 2>/dev/null || true

echo "Starting Avika Agent..."
/usr/local/bin/avika-agent &

# Start NGINX in foreground
exec nginx -g "daemon off;"
