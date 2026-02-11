# Agent Version Tracking - Implementation Summary

## ✅ What Was Implemented

### 1. **Version Variables in Agent** (`cmd/agent/main.go`)

Added build metadata variables that can be set at compile time:

```go
var (
    Version   = "0.1.0-dev"
    BuildDate = "unknown"
    GitCommit = "unknown"
    GitBranch = "unknown"
)
```

### 2. **Enhanced Protobuf Definition** (`api/proto/agent.proto`)

Updated `Heartbeat` message to include agent build metadata:

```protobuf
message Heartbeat {
  string hostname = 1;
  string version = 2;          // NGINX version
  double uptime = 3;
  repeated NginxInstance instances = 4;
  bool is_pod = 5;
  string pod_ip = 6;
  string agent_version = 7;    // Agent version
  string build_date = 8;        // Build timestamp
  string git_commit = 9;        // Git commit hash
  string git_branch = 10;       // Git branch name
}
```

Updated `AgentInfo` message:

```protobuf
message AgentInfo {
  // ... existing fields ...
  string build_date = 12;
  string git_commit = 13;
  string git_branch = 14;
}
```

### 3. **Agent Sends Build Metadata** (`cmd/agent/main.go`)

Agent now sends version info in every heartbeat:

```go
Heartbeat: &pb.Heartbeat{
    Hostname:     currentHostname,
    Version:      Version,  // NGINX version
    AgentVersion: Version,  // Agent version
    BuildDate:    BuildDate,
    GitCommit:    GitCommit,
    GitBranch:    GitBranch,
    // ... other fields
}
```

### 4. **Gateway Stores Build Metadata** (`cmd/gateway/main.go`)

Updated `AgentSession` struct:

```go
type AgentSession struct {
    id           string
    hostname     string
    version      string  // NGINX version
    agentVersion string  // Agent binary version
    buildDate    string  // Build timestamp
    gitCommit    string  // Git commit hash
    gitBranch    string  // Git branch name
    // ... other fields
}
```

Gateway now stores and exposes build metadata in `ListAgents` response.

### 5. **Docker Build Integration**

The Dockerfile injects version info at build time:

```dockerfile
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s \
    -X 'main.Version=${VERSION}' \
    -X 'main.BuildDate=${BUILD_DATE}' \
    -X 'main.GitCommit=${GIT_COMMIT}' \
    -X 'main.GitBranch=${GIT_BRANCH}'" \
    -o agent .
```

## 📊 How It Works

### Development Build (Local)

```bash
go build -o agent ./cmd/agent
./agent -version
# Output:
# NGINX Manager Agent
# Version:    0.1.0-dev
# Build Date: unknown
# Git Commit: unknown
# Git Branch: unknown
```

### Production Build (Docker/CI)

```bash
docker build \
  --build-arg VERSION=1.2.3 \
  --build-arg BUILD_DATE=2026-02-10T14:05:42Z \
  --build-arg GIT_COMMIT=abc1234 \
  --build-arg GIT_BRANCH=main \
  -t nginx-manager-agent:1.2.3 .

# Agent will show:
# Version:    1.2.3
# Build Date: 2026-02-10T14:05:42Z
# Git Commit: abc1234
# Git Branch: main
```

### CI/CD Automatic Build

The GitHub Actions workflow automatically:
1. Reads version from `VERSION` file
2. Gets git metadata
3. Builds Docker image with version embedded
4. Pushes with semantic version tags

## 🎯 Where Version Info Appears

1. **Agent CLI**: `./agent -version`
2. **Agent Heartbeat**: Sent to gateway every 5 seconds
3. **Gateway API**: `/api/servers` returns agent version
4. **Frontend Inventory**: Shows agent version for each server
5. **Docker Labels**: Image metadata includes version

## 🔄 Version Update Workflow

### Manual (Local Development)

```bash
# Update VERSION file
echo "0.2.0" > VERSION

# Build with version
./scripts/docker-build.sh
```

### Automatic (CI/CD)

```bash
# Commit with semantic message
git commit -m "feat: add new feature"
git push origin main

# GitHub Actions will:
# 1. Detect "feat:" → minor bump (0.1.0 → 0.2.0)
# 2. Update VERSION file
# 3. Build Docker image with version
# 4. Push to Docker Hub
# 5. Create GitHub release
```

## 🐛 Troubleshooting

### Version shows as "0.1.0-dev"

**Cause**: Built without ldflags
**Solution**: Use Docker build or set ldflags manually:

```bash
go build -ldflags="-X 'main.Version=1.0.0'" -o agent ./cmd/agent
```

### Version not updating in UI

**Cause**: Old agent still running
**Solution**: Restart agent to send new version in heartbeat:

```bash
pkill -9 -f "./agent"
./agent -id prod-nginx-agent &
```

### Build date shows "unknown"

**Cause**: BUILD_DATE not passed to Docker build
**Solution**: Use the build script which sets it automatically:

```bash
./scripts/docker-build.sh
```

## ✅ Verification

Check version is working:

```bash
# 1. Check agent binary
./agent -version

# 2. Check heartbeat (gateway logs)
grep "Registered agent" /tmp/gateway.log

# 3. Check API response
curl http://localhost:3000/api/servers | jq '.[].agent_version'

# 4. Check Docker image labels
docker inspect nginx-manager-agent:latest | jq '.[0].Config.Labels'
```

---

## 🔄 Automated Self-Updates

The agent now supports an automated self-update mechanism, allowing for seamless fleet management.

### Features
- **Pull-based**: Agent polls for updates every 5 minutes (default).
- **Secure**: SHA256 checksum verification before execution.
- **Environment Aware**: Automatic distinction between K8s (process exit) and Standalone (service restart).

For detailed documentation on the update server and distribution process, see [docs/SELF_UPDATE_PLAN.md](./SELF_UPDATE_PLAN.md).

---

**Status**: ✅ **Complete** - Agent version tracking and automated self-updates fully implemented!
