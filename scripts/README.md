# Service Management Scripts - README

## ✅ What Was Created

I've created professional service management scripts to replace manual `pkill` commands:

### **Scripts Created:**

1. **`scripts/start.sh`** - Start all services
2. **`scripts/stop.sh`** - Stop all services gracefully
3. **`scripts/restart.sh`** - Restart all services
4. **`scripts/status.sh`** - Check service status

---

## 🚀 Quick Start

```bash
# Start all services
./scripts/start.sh

# Check status
./scripts/status.sh

# Stop all services
./scripts/stop.sh

# Restart all services
./scripts/restart.sh
```

---

## 📋 Script Details

### **start.sh**

**Features:**
- ✅ Checks if services are already running (prevents duplicates)
- ✅ Creates `logs/` directory automatically
- ✅ Starts services in correct order: Gateway → Agent → Frontend
- ✅ Waits for each service to be ready
- ✅ Shows PIDs, URLs, and log locations
- ✅ Prompts to restart if already running

**Output:**
```
╔════════════════════════════════════════════════════════════╗
║         Starting NGINX Manager Services                   ║
╚════════════════════════════════════════════════════════════╝

📡 Starting Gateway...
  PID: 12345
  Logs: logs/gateway.log
✓ Gateway started successfully

🤖 Starting Agent...
  PID: 12346
  Agent ID: prod-nginx-agent
  Logs: logs/agent.log
✓ Agent started successfully

🌐 Starting Frontend...
  PID: 12347
  URL: http://localhost:3000
  Logs: logs/frontend.log
✓ Frontend started successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All services started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### **stop.sh**

**Features:**
- ✅ Graceful shutdown (SIGTERM first)
- ✅ Force kill after 10 seconds if needed
- ✅ Stops in reverse order: Frontend → Gateway → Agent
- ✅ Shows which services were stopped
- ✅ Lists any remaining processes

**Output:**
```
🛑 Stopping NGINX Manager Services

Stopping Frontend (Next.js)...
  Sending SIGTERM to PIDs: 12347
✓ Frontend (Next.js) stopped gracefully

Stopping Gateway...
  Sending SIGTERM to PIDs: 12345
✓ Gateway stopped gracefully

Stopping Agent...
  Sending SIGTERM to PIDs: 12346
✓ Agent stopped gracefully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All services stopped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### **status.sh**

**Features:**
- ✅ Shows running/stopped status for each service
- ✅ Displays PID, uptime, CPU usage, memory usage
- ✅ Checks if ports are listening
- ✅ Shows external dependencies (PostgreSQL, ClickHouse)
- ✅ Displays recent logs (last 5 lines)
- ✅ Overall health summary

**Output:**
```
╔════════════════════════════════════════════════════════════╗
║         NGINX Manager - Service Status                    ║
╚════════════════════════════════════════════════════════════╝

Gateway
  Status: ✓ Running
    PID: 21495 | Uptime: 03:14:38 | CPU: 0.1% | MEM: 0.0%
    Port: 50051 (listening)

Agent
  Status: ✓ Running
    PID: 276553 | Uptime: 08:41 | CPU: 1.9% | MEM: 0.0%
    Port: 50052 (listening)

Frontend (Next.js)
  Status: ✓ Running
    PID: 184680 | Uptime: 01:11:38 | CPU: 0.0% | MEM: 0.0%
    Port: 3000 (listening)

External Dependencies
  PostgreSQL: ✓ Running (Docker)
  ClickHouse: ✓ Running (Docker)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All services are running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### **restart.sh**

**Features:**
- ✅ Stops all services
- ✅ Waits 2 seconds
- ✅ Starts all services
- ✅ Simple and clean

---

## 📁 Log Management

All logs are stored in `logs/` directory:

```
logs/
├── gateway.log    # Gateway service logs
├── agent.log      # Agent service logs
└── frontend.log   # Frontend (Next.js) logs
```

**View logs:**
```bash
# Real-time monitoring
tail -f logs/gateway.log
tail -f logs/agent.log
tail -f logs/frontend.log

# All logs at once
tail -f logs/*.log

# Last 50 lines
tail -50 logs/gateway.log
```

---

## 🔧 Environment Variables

### Agent
```bash
export AGENT_ID=prod-nginx-agent  # Agent identifier
./scripts/start.sh
```

### Gateway
```bash
export DB_DSN=postgres://user:pass@localhost/db
export CLICKHOUSE_ADDR=localhost:9000
./scripts/start.sh
```

---

## 🔍 Troubleshooting

### Service Won't Start

1. **Check if port is in use:**
   ```bash
   netstat -tuln | grep -E "3000|50051|50052"
   ```

2. **Check logs:**
   ```bash
   tail -50 logs/gateway.log
   ```

3. **Ensure dependencies are running:**
   ```bash
   docker ps | grep -E "postgres|clickhouse"
   ```

### Service Won't Stop

1. **Force stop:**
   ```bash
   ./scripts/stop.sh  # Already tries force kill
   ```

2. **Manual force kill (last resort):**
   ```bash
   pkill -9 -f "./gateway"
   pkill -9 -f "./agent"
   pkill -9 -f "next dev"
   ```

### Port Already in Use

1. **Find process:**
   ```bash
   lsof -i :3000
   lsof -i :50051
   ```

2. **Kill process:**
   ```bash
   kill -9 <PID>
   ```

---

## 📊 Monitoring

### Watch Status
```bash
watch -n 2 ./scripts/status.sh
```

### Monitor Resources
```bash
htop -p $(pgrep -d',' -f "gateway|agent|next")
```

### Check Health
```bash
# Gateway
grpcurl -plaintext localhost:50051 list

# Frontend
curl http://localhost:3000/api/servers
```

---

## 🔄 Development Workflow

```bash
# 1. Make code changes
vim cmd/agent/main.go

# 2. Rebuild
go build -o agent ./cmd/agent

# 3. Restart services
./scripts/restart.sh

# 4. Check status
./scripts/status.sh

# 5. View logs
tail -f logs/agent.log
```

---

## 💡 Best Practices

1. ✅ **Always use scripts** - Don't use `pkill` directly
2. ✅ **Check status first** - Avoid duplicate processes
3. ✅ **Monitor logs** - Use `tail -f logs/*.log`
4. ✅ **Graceful shutdown** - Let `stop.sh` handle it
5. ✅ **Verify health** - Run `status.sh` after changes

---

## 📚 Related Documentation

- `docs/SERVICE_MANAGEMENT.txt` - Quick reference guide
- `docs/VERSIONING_GUIDE.md` - CI/CD and versioning
- `docs/SECURITY_GUIDE.md` - Security best practices

---

## ✅ Summary

**Before (Manual):**
```bash
pkill -9 -f "./gateway"
pkill -9 -f "./agent"
./gateway &
./agent -id prod-nginx-agent &
```

**Now (Professional):**
```bash
./scripts/restart.sh
```

**Much better!** 🎉
