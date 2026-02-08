#!/bin/bash
set -e

echo "🚀 Starting NGINX AI Manager..."

# Start infrastructure
echo "📦 Starting infrastructure services..."
cd deploy/docker
docker-compose up -d
cd ../..

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 5

# Initialize ClickHouse schema
echo "🗄️  Initializing ClickHouse schema..."
docker exec clickhouse clickhouse-client --database=nginx_analytics --multiquery < deploy/docker/clickhouse-schema.sql 2>/dev/null || echo "Schema already exists"

# Start Frontend
echo "🌐 Starting Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi
npm run dev > ../frontend.log 2>&1 &
echo $! > ../frontend.pid
cd ..

# Start Agent
echo "🤖 Starting Agent..."
if [ -f "agent" ]; then
    ./agent > agent.log 2>&1 &
else
    go run ./cmd/agent > agent.log 2>&1 &
fi
echo $! > agent.pid

# Check service status
echo "✅ Service Status:"
docker-compose -f deploy/docker/docker-compose.yaml ps

echo ""
echo "🌐 Access Points:"
echo "  - Frontend:          http://localhost:3000"
echo "  - Redpanda Console:  http://localhost:8080"
echo "  - ClickHouse:        http://localhost:8123/play"
echo ""
echo "📊 Available Pages:"
echo "  - Dashboard:         http://localhost:3000/"
echo "  - Inventory:         http://localhost:3000/inventory"
echo "  - Analytics:         http://localhost:3000/analytics"
echo ""
echo "✨ System is ready!"
