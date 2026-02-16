# TODO: Agent Update Architecture

> Design for unified agent updates across containerized and VM-based deployments

## Status: Planning

---

## Problem Statement

The Avika agent needs to support self-updates in two different deployment models:

| Environment | Update Model | Challenges |
|-------------|--------------|------------|
| **Containers (K8s)** | Image replacement | Immutable; can't patch running container |
| **VMs / Bare Metal** | In-place binary update | Need graceful restart, rollback |

---

## Recommended Architecture: Dual-Mode Update Strategy

The agent detects its environment and uses the appropriate update mechanism.

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UPDATE SERVER                                │
│  (Gateway @ :5021/updates or dedicated update server)               │
│                                                                      │
│  /updates/                                                           │
│    ├── manifest.json        # Version info, checksums               │
│    ├── agent-linux-amd64    # Binary for VMs                        │
│    ├── agent-linux-arm64    # Binary for VMs                        │
│    └── helm-values.yaml     # Latest image tags for K8s             │
└─────────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┴──────────────────┐
           │                                      │
           ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────────┐
│   VM/Bare Metal     │              │   Kubernetes            │
│                     │              │                         │
│  Agent detects:     │              │  Agent detects:         │
│  - No K8s env vars  │              │  - KUBERNETES_SERVICE_* │
│  - Systemd/init     │              │  - Container runtime    │
│                     │              │                         │
│  Update action:     │              │  Update action:         │
│  1. Download binary │              │  1. Signal controller   │
│  2. Verify checksum │              │  2. Controller triggers │
│  3. Swap binary     │              │     rolling update      │
│  4. Graceful restart│              │  3. New pods with new   │
│                     │              │     image deployed      │
└─────────────────────┘              └─────────────────────────┘
```

---

## Implementation Tasks

### Phase 1: Environment Detection

- [ ] Add deployment mode detection to agent startup
- [ ] Detect Kubernetes via `KUBERNETES_SERVICE_HOST` env var
- [ ] Detect container runtime via `/.dockerenv` or `/run/.containerenv`
- [ ] Add `DEPLOYMENT_MODE` config option for manual override

```go
type DeploymentMode string

const (
    ModeVM         DeploymentMode = "vm"
    ModeContainer  DeploymentMode = "container"
)

func detectDeploymentMode() DeploymentMode {
    // Check for Kubernetes environment
    if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
        return ModeContainer
    }
    // Check for container runtime indicators
    if _, err := os.Stat("/.dockerenv"); err == nil {
        return ModeContainer
    }
    if _, err := os.Stat("/run/.containerenv"); err == nil {
        return ModeContainer
    }
    return ModeVM
}
```

### Phase 2: Update Manifest System

- [ ] Define manifest JSON schema
- [ ] Implement manifest endpoint on gateway (`/updates/manifest.json`)
- [ ] Include version, checksums, download URLs, changelog
- [ ] Support minimum version requirements for forced updates

```json
{
  "version": "0.1.44",
  "released_at": "2026-02-15T20:00:00Z",
  "binaries": {
    "linux-amd64": {
      "url": "/updates/agent-linux-amd64",
      "sha256": "abc123...",
      "size": 18500000
    },
    "linux-arm64": {
      "url": "/updates/agent-linux-arm64",
      "sha256": "def456...",
      "size": 17800000
    }
  },
  "container_image": "hellodk/avika-agent:0.1.44",
  "min_version": "0.1.40",
  "changelog": "Fixed WAL directory creation"
}
```

### Phase 3: VM Self-Update Implementation

- [ ] Download new binary to temp location
- [ ] Verify SHA256 checksum before swap
- [ ] Implement atomic binary swap with backup
- [ ] Support multiple restart methods: `exec()`, `systemd`, `signal`
- [ ] WAL buffer ensures no data loss during restart

```go
func atomicBinarySwap(newBinary, targetPath string) error {
    // 1. Verify new binary is executable
    if err := os.Chmod(newBinary, 0755); err != nil {
        return err
    }
    
    // 2. Create backup
    backupPath := targetPath + ".backup"
    os.Rename(targetPath, backupPath)
    
    // 3. Atomic rename (same filesystem = atomic on Linux)
    if err := os.Rename(newBinary, targetPath); err != nil {
        // Rollback
        os.Rename(backupPath, targetPath)
        return err
    }
    
    return nil
}

func execRestart() error {
    exe, err := os.Executable()
    if err != nil {
        return err
    }
    return syscall.Exec(exe, os.Args, os.Environ())
}
```

### Phase 4: Container Update Signaling

- [ ] Agent reports available update to gateway
- [ ] Gateway stores pending update info per agent
- [ ] Dashboard shows which agents have updates available
- [ ] Option 1: Manual trigger from UI for rolling update
- [ ] Option 2: Avika Controller (CRD) for automated K8s updates

### Phase 5: Staged Rollouts

- [ ] Add `UPDATE_ROLLOUT_PERCENT` config (0-100)
- [ ] Agents use ID hash to determine if in current wave
- [ ] Gateway can adjust rollout percentage dynamically
- [ ] Implement canary detection (monitor error rates after update)

```go
func shouldUpdateInWave(agentID string, rolloutPercent int) bool {
    h := fnv.New32a()
    h.Write([]byte(agentID))
    bucket := int(h.Sum32() % 100)
    return bucket < rolloutPercent
}
```

---

## Config File Changes

Add to `avika-agent.conf`:

```ini
# -----------------------------------------------------------------------------
# SELF-UPDATE CONFIGURATION
# -----------------------------------------------------------------------------

# Update server URL (empty = auto-derive from gateway)
UPDATE_SERVER=""

# Update check interval
UPDATE_INTERVAL="1h"

# Update mode: "auto" | "vm-only" | "signal-only" | "disabled"
#   auto        - Detect environment and use appropriate method
#   vm-only     - Only perform in-place updates (ignore in containers)
#   signal-only - Only report updates to gateway (never self-update)
#   disabled    - No update checking at all
UPDATE_MODE="auto"

# For VM mode: restart method after update
#   exec     - Replace current process (seamless, recommended)
#   systemd  - Use 'systemctl restart avika-agent'
#   signal   - Send SIGHUP to self
UPDATE_RESTART_METHOD="exec"

# Staged rollout: percentage of agents to update per wave (0-100)
# Agents use their ID hash to determine if they're in current wave
UPDATE_ROLLOUT_PERCENT="100"
```

---

## Alternative Architectures (Considered)

### Option 2: Controller-Based Updates (K8s Native)

A dedicated Kubernetes controller that:
- Watches manifest for new versions
- Triggers rolling updates via `kubectl set image` or Helm
- Manages version state across the cluster

**Pros**: Clean separation, K8s-native
**Cons**: Additional component to maintain

### Option 3: Sidecar Updater Pattern

Separate `avika-updater` service that:
- Polls for updates independently
- Downloads and validates binaries
- Restarts the main agent service

**Pros**: Updater survives agent crashes, can update itself
**Cons**: More complexity, two services to manage

---

## Data Flow: VM Self-Update

```
Agent                    Update Server              Filesystem
  │                           │                          │
  │── GET /updates/manifest ─▶│                          │
  │◀── manifest.json ─────────│                          │
  │                           │                          │
  │ [Compare versions]        │                          │
  │                           │                          │
  │── GET /updates/agent-* ──▶│                          │
  │◀── binary stream ─────────│                          │
  │                           │                          │
  │────────────────────────── Write to /tmp/agent.new ──▶│
  │                           │                          │
  │ [Verify SHA256]           │                          │
  │                           │                          │
  │────────────────────────── chmod +x ─────────────────▶│
  │                           │                          │
  │────────────────────────── rename /tmp → /usr/local ─▶│
  │                           │                          │
  │ [exec() new binary OR systemctl restart]             │
  │                           │                          │
  ▼ [New process starts, reads WAL buffer, continues]    │
```

---

## Summary Table

| Aspect | VM Mode | Container Mode |
|--------|---------|----------------|
| **Detection** | No K8s env vars | `KUBERNETES_SERVICE_HOST` present |
| **Update trigger** | Agent polls update server | Agent polls, but signals gateway |
| **Update action** | Download → verify → swap → exec() | Gateway triggers rolling update |
| **Rollback** | Keep `.backup` binary, auto-restore on crash | K8s handles via replica sets |
| **Data safety** | WAL buffer persists across restart | WAL buffer + PVC if needed |
| **Staged rollout** | Agent ID hash determines wave | Deployment strategy in K8s |

---

## Files to Modify

- [ ] `cmd/agent/main.go` - Add deployment mode detection
- [ ] `cmd/agent/updater.go` - Extend with dual-mode logic
- [ ] `cmd/gateway/main.go` - Add manifest endpoint
- [ ] `nginx-agent/avika-agent.conf` - Add new config options
- [ ] `api/proto/agent.proto` - Add update status to heartbeat

---

## References

- Current updater implementation: `cmd/agent/updater.go`
- Current config: `nginx-agent/avika-agent.conf`
- Build script: `scripts/build-stack.sh`
