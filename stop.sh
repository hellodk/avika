#!/bin/bash

echo "🛑 Stopping NGINX AI Manager..."

# Stop Agent
if [ -f "agent.pid" ]; then
    echo "🤖 Stopping Agent..."
    kill $(cat agent.pid) 2>/dev/null || true
    rm agent.pid
fi

# Stop Frontend
if [ -f "frontend.pid" ]; then
    echo "🌐 Stopping Frontend..."
    kill $(cat frontend.pid) 2>/dev/null || true
    rm frontend.pid
fi

# Stop Infrastructure
echo "📦 Stopping infrastructure services..."
cd deploy/docker
docker-compose down
cd ../..

echo "✨ System stopped."
