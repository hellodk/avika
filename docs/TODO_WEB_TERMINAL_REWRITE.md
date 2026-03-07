# Web Terminal Implementation Rewrite

## Overview

Complete rewrite of the web terminal feature to support:
- Kubernetes Pod exec (current)
- VM SSH connections (new)
- Enterprise-grade security for Financial Institutions
- Complex network topologies (NAT, firewalls)

## Architecture

```
┌─────────────┐     ┌─────────────────────────────────────┐     ┌─────────────┐
│   Browser   │────▶│           Avika Gateway              │◀────│   Agents    │
│  (xterm.js) │ WSS │  Terminal Proxy + Session Manager    │ gRPC│  (Pod/VM)   │
└─────────────┘     └─────────────────────────────────────┘     └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Vault/Secrets  │
                    └─────────────────┘
```

### Design Principles

1. **Single Entry Point**: Browser connects ONLY to Gateway (one port: 5021)
2. **Agent-Initiated Connections**: Agents connect outbound to Gateway (NAT-friendly)
3. **Zero Direct Access**: No browser-to-agent direct connections
4. **Full Audit Trail**: Every session recorded and logged
5. **Protocol Agnostic**: Support SSH (VMs) and gRPC/exec (Pods) through same interface

---

## Phase 1: Foundation Refactor [Priority: HIGH]

### 1.1 Gateway Terminal Proxy Service

**File:** `cmd/gateway/terminal_proxy.go` (new)

```go
// TerminalProxyService handles all terminal connections
type TerminalProxyService struct {
    sessions     map[string]*TerminalSession
    sessionStore SessionStore        // For persistence
    auditLogger  AuditLogger         // For compliance
    sshPool      *SSHConnectionPool  // For VM connections
    grpcPool     *GRPCConnectionPool // For Pod connections
    vaultClient  *VaultClient        // For secrets (optional)
}

type TerminalSession struct {
    ID            string
    AgentID       string
    AgentType     string    // "pod" or "vm"
    UserID        string
    Username      string
    StartedAt     time.Time
    LastActivity  time.Time
    Recording     *SessionRecording
    Status        SessionStatus
}
```

**Tasks:**
- [ ] Create `TerminalProxyService` struct
- [ ] Implement session lifecycle (create, destroy, reconnect)
- [ ] Add session timeout handling (configurable idle timeout)
- [ ] Create WebSocket handler that delegates to proxy service
- [ ] Remove current inline terminal handling from `main.go`

### 1.2 Protocol Handlers

**File:** `cmd/gateway/terminal_handlers.go` (new)

```go
// ProtocolHandler interface for different connection types
type ProtocolHandler interface {
    Connect(ctx context.Context, session *TerminalSession) error
    Send(data []byte) error
    Receive() ([]byte, error)
    Resize(cols, rows uint16) error
    Close() error
}

// GRPCHandler for Kubernetes pods (existing flow, refactored)
type GRPCHandler struct {
    client pb.AgentServiceClient
    stream pb.AgentService_ExecuteClient
}

// SSHHandler for VM agents (new)
type SSHHandler struct {
    client  *ssh.Client
    session *ssh.Session
    stdin   io.WriteCloser
    stdout  io.Reader
}
```

**Tasks:**
- [ ] Define `ProtocolHandler` interface
- [ ] Refactor existing gRPC exec into `GRPCHandler`
- [ ] Implement `SSHHandler` using `golang.org/x/crypto/ssh`
- [ ] Add handler factory to select based on agent type

### 1.3 Agent Connection Model (Agent-Initiated)

**Current Problem:** Gateway tries to connect TO agents (blocked by NAT/firewall)
**Solution:** Agents establish persistent connection TO Gateway

**File:** `cmd/agent/reverse_tunnel.go` (new for VM agents)

```go
// ReverseTunnel maintains outbound connection to gateway
type ReverseTunnel struct {
    gatewayAddr  string
    agentID      string
    sshConfig    *ssh.ClientConfig
    reconnectInterval time.Duration
}

func (rt *ReverseTunnel) Start(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        default:
            rt.connect()
            rt.waitForDisconnect()
            time.Sleep(rt.reconnectInterval)
        }
    }
}
```

**Tasks:**
- [ ] Add reverse tunnel client to VM agent
- [ ] Implement auto-reconnect with exponential backoff
- [ ] Add heartbeat to detect stale connections
- [ ] Gateway: Accept incoming tunnel registrations
- [ ] Store tunnel connections in connection pool

---

## Phase 2: SSH Support for VMs [Priority: HIGH]

### 2.1 SSH Client in Gateway

**File:** `cmd/gateway/ssh_client.go` (new)

```go
// SSHConnectionPool manages SSH connections to VM agents
type SSHConnectionPool struct {
    connections map[string]*SSHConnection
    mu          sync.RWMutex
}

type SSHConnection struct {
    AgentID     string
    Client      *ssh.Client
    Tunnel      net.Conn      // Reverse tunnel from agent
    CreatedAt   time.Time
    LastUsed    time.Time
}

// ConnectViaReverseTunnel uses agent's reverse tunnel for SSH
func (p *SSHConnectionPool) ConnectViaReverseTunnel(
    agentID string, 
    creds SSHCredentials,
) (*ssh.Client, error) {
    // Get the reverse tunnel connection from agent
    tunnel := p.getTunnel(agentID)
    
    // Establish SSH over the tunnel
    conn, chans, reqs, err := ssh.NewClientConn(tunnel, "", creds.Config())
    // ...
}
```

**Tasks:**
- [ ] Implement SSH connection pool
- [ ] Support SSH over reverse tunnel
- [ ] Handle connection lifecycle (timeout, cleanup)
- [ ] Add connection health checking

### 2.2 Credential Management

**File:** `cmd/gateway/credentials.go` (new)

Support three credential sources:

#### Option B: HashiCorp Vault Integration

```go
type VaultCredentialProvider struct {
    client *vault.Client
    path   string // e.g., "secret/avika/ssh-keys"
}

func (v *VaultCredentialProvider) GetCredentials(agentID string) (*SSHCredentials, error) {
    secret, err := v.client.Logical().Read(fmt.Sprintf("%s/%s", v.path, agentID))
    // Parse and return SSH key or password
}
```

#### Option C: Agent-Side Keys

```go
type AgentSideCredentialProvider struct {
    // Agent generates and stores its own SSH keys
    // Gateway requests public key during registration
    // User's SSH key must be in agent's authorized_keys
}
```

#### Option D: User-Prompted Credentials

```go
type PromptedCredentialProvider struct {
    // Frontend prompts user for username/password
    // Credentials passed securely via WSS
    // NOT stored (ephemeral for session only)
}
```

**Tasks:**
- [ ] Create `CredentialProvider` interface
- [ ] Implement Vault integration (`VaultCredentialProvider`)
- [ ] Implement agent-side key exchange mechanism
- [ ] Implement user-prompted credentials flow
- [ ] Add credential caching with TTL (for Vault)
- [ ] **Security:** Never log credentials, use secure memory

---

## Phase 3: Session Management [Priority: HIGH]

### 3.1 Session Recording (Audit Compliance)

**File:** `cmd/gateway/session_recording.go` (new)

```go
// SessionRecording captures all terminal I/O for audit
type SessionRecording struct {
    SessionID   string
    AgentID     string
    UserID      string
    StartTime   time.Time
    EndTime     time.Time
    Events      []RecordingEvent
    storage     RecordingStorage
}

type RecordingEvent struct {
    Timestamp time.Time
    Type      string // "input", "output", "resize"
    Data      []byte
}

// RecordingStorage interface for pluggable backends
type RecordingStorage interface {
    Save(recording *SessionRecording) error
    Load(sessionID string) (*SessionRecording, error)
    List(filter RecordingFilter) ([]SessionRecording, error)
}

// Implementations:
// - FileRecordingStorage (local files, default)
// - S3RecordingStorage (AWS S3/MinIO)
// - PostgresRecordingStorage (database BLOB)
```

**Tasks:**
- [ ] Implement session recording capture
- [ ] Create asciicast-compatible format for playback
- [ ] Implement file-based storage (default)
- [ ] Add S3 storage option for enterprise
- [ ] Create playback API endpoint
- [ ] Add recording retention policy (configurable)

### 3.2 Session Persistence & Reconnection

```go
// SessionStore persists session state for reconnection
type SessionStore interface {
    Save(session *TerminalSession) error
    Load(sessionID string) (*TerminalSession, error)
    Delete(sessionID string) error
    ListByUser(userID string) ([]TerminalSession, error)
}

// Redis-based implementation for distributed deployments
type RedisSessionStore struct {
    client *redis.Client
    ttl    time.Duration
}
```

**Tasks:**
- [ ] Implement session state persistence
- [ ] Add reconnection token generation
- [ ] Handle browser refresh/disconnect gracefully
- [ ] Implement session resume API
- [ ] Add session listing for users

### 3.3 Idle Timeout & Auto-Disconnect

```go
const (
    DefaultIdleTimeout    = 30 * time.Minute
    MaxSessionDuration    = 8 * time.Hour  // Compliance: force re-auth
    WarningBeforeTimeout  = 5 * time.Minute
)

func (s *TerminalSession) MonitorActivity() {
    ticker := time.NewTicker(1 * time.Minute)
    for range ticker.C {
        idle := time.Since(s.LastActivity)
        if idle > s.IdleTimeout {
            s.Disconnect("idle timeout")
            return
        }
        if idle > s.IdleTimeout - WarningBeforeTimeout {
            s.SendWarning("Session will timeout in 5 minutes")
        }
    }
}
```

**Tasks:**
- [ ] Implement activity tracking
- [ ] Add configurable idle timeout
- [ ] Send timeout warnings to client
- [ ] Implement max session duration (compliance)
- [ ] Log session termination reasons

---

## Phase 4: Frontend Rewrite [Priority: MEDIUM]

### 4.1 New Terminal Component

**File:** `frontend/src/components/Terminal/TerminalContainer.tsx` (new)

```tsx
interface TerminalContainerProps {
    agentId: string;
    agentType: 'pod' | 'vm';
    onClose: () => void;
}

// Features:
// - Session state management
// - Reconnection handling
// - Credential prompt (for VM Option D)
// - Recording indicator
// - Connection status
// - Resize handling
```

**Tasks:**
- [ ] Create new `TerminalContainer` component
- [ ] Implement session state machine (connecting → connected → disconnected)
- [ ] Add reconnection UI with retry button
- [ ] Create credential prompt modal for VMs
- [ ] Add session recording indicator
- [ ] Implement terminal resize handling
- [ ] Add copy/paste support
- [ ] Remove old `TerminalOverlay.tsx`

### 4.2 Terminal API Client

**File:** `frontend/src/lib/terminal-client.ts` (new)

```typescript
class TerminalClient {
    private ws: WebSocket | null = null;
    private sessionId: string | null = null;
    private reconnectAttempts = 0;
    
    async connect(agentId: string, options?: ConnectOptions): Promise<void>;
    async reconnect(sessionId: string): Promise<void>;
    send(data: string): void;
    resize(cols: number, rows: number): void;
    disconnect(): void;
    
    // Events
    onData: (data: string) => void;
    onStatus: (status: ConnectionStatus) => void;
    onError: (error: Error) => void;
}
```

**Tasks:**
- [ ] Create `TerminalClient` class
- [ ] Implement automatic reconnection
- [ ] Add connection status events
- [ ] Handle binary data properly
- [ ] Add heartbeat/ping mechanism

---

## Phase 5: Authentication & Authorization [Priority: MEDIUM]

### 5.1 Terminal Access Control

**NOTE:** Keep relaxed for MVP, implement fully in future release.

```go
// TerminalAccessPolicy defines who can access what
type TerminalAccessPolicy struct {
    // For MVP: Allow all authenticated users
    // Future: Role-based access control
}

// Future RBAC model:
type TerminalPermission struct {
    Role      string   // "admin", "operator", "viewer"
    Actions   []string // "connect", "view_recording", "download_recording"
    AgentTags []string // "production", "staging", "dev"
}
```

**Tasks (MVP):**
- [ ] Verify user is authenticated before terminal access
- [ ] Log terminal access (who, when, which agent)
- [ ] Add basic rate limiting

**Tasks (Future - TODO):**
- [ ] Implement role-based access control
- [ ] Add agent tagging for access policies
- [ ] Implement approval workflow for production access
- [ ] Add MFA requirement for sensitive agents
- [ ] Integrate with enterprise SSO (SAML/OIDC)

### 5.2 Audit Logging

```go
type TerminalAuditLog struct {
    Timestamp   time.Time
    EventType   string    // "session_start", "session_end", "command_executed"
    UserID      string
    Username    string
    AgentID     string
    AgentName   string
    SourceIP    string
    Details     map[string]interface{}
}
```

**Tasks:**
- [ ] Log all terminal session events
- [ ] Include user identity and source IP
- [ ] Store in database for querying
- [ ] Add audit log API for compliance reports
- [ ] Implement log retention policy

---

## Phase 6: Agent Updates [Priority: MEDIUM]

### 6.1 Pod Agent Updates

**File:** `cmd/agent/mgmt_service.go` (existing, update)

**Tasks:**
- [ ] Ensure PTY executor is robust
- [ ] Add shell detection (bash/sh/ash)
- [ ] Implement terminal resize via gRPC
- [ ] Add session cleanup on disconnect

### 6.2 VM Agent Updates

**File:** `cmd/agent/reverse_tunnel.go` (new)

**Tasks:**
- [ ] Add reverse SSH tunnel capability
- [ ] Implement tunnel reconnection
- [ ] Add tunnel health monitoring
- [ ] Support multiple gateway endpoints (HA)
- [ ] Add tunnel authentication (agent PSK)

### 6.3 Agent Configuration

```yaml
# /etc/avika/agent.conf (VM)
GATEWAYS=gateway1.example.com:5020,gateway2.example.com:5020
REVERSE_TUNNEL_ENABLED=true
REVERSE_TUNNEL_LOCAL_PORT=22
TUNNEL_RECONNECT_INTERVAL=30s
TUNNEL_HEARTBEAT_INTERVAL=10s
```

**Tasks:**
- [ ] Add tunnel configuration options
- [ ] Support multiple gateway addresses
- [ ] Add graceful tunnel shutdown

---

## Phase 7: Testing [Priority: HIGH]

### 7.1 Unit Tests

- [ ] `terminal_proxy_test.go` - Session management
- [ ] `ssh_client_test.go` - SSH connection handling
- [ ] `credentials_test.go` - Credential providers
- [ ] `session_recording_test.go` - Recording capture/playback

### 7.2 Integration Tests

- [ ] Pod terminal connection flow
- [ ] VM terminal via reverse tunnel
- [ ] Session reconnection
- [ ] Credential retrieval from Vault

### 7.3 E2E Tests

- [ ] Browser → Gateway → Pod terminal
- [ ] Browser → Gateway → VM terminal
- [ ] Session recording and playback
- [ ] Idle timeout handling

---

## Security Considerations

### Must Have (MVP)

- [ ] All WebSocket connections over TLS (WSS)
- [ ] Session tokens with expiration
- [ ] Input sanitization (prevent command injection)
- [ ] Rate limiting on terminal connections
- [ ] Audit logging of all sessions

### Should Have (Enterprise)

- [ ] SSH key rotation
- [ ] Vault integration for secrets
- [ ] Session recording encryption
- [ ] IP allowlisting for terminal access
- [ ] Break-glass access procedures

### Future Enhancements

- [ ] MFA for terminal access
- [ ] Just-in-time access provisioning
- [ ] Privileged access management (PAM) integration
- [ ] Command filtering/blocking
- [ ] Real-time session monitoring

---

## Configuration

### Gateway Configuration

```yaml
terminal:
  enabled: true
  idle_timeout: 30m
  max_session_duration: 8h
  recording:
    enabled: true
    storage: file  # file, s3, postgres
    path: /var/lib/avika/recordings
    retention_days: 90
  
  ssh:
    enabled: true
    credential_provider: vault  # vault, agent, prompt
    vault_path: secret/avika/ssh
    connection_timeout: 30s
    
  security:
    require_auth: true
    rate_limit: 10/minute
    allowed_ips: []  # Empty = allow all
```

### Agent Configuration (VM)

```yaml
tunnel:
  enabled: true
  gateway_addresses:
    - gateway.example.com:5020
  reconnect_interval: 30s
  heartbeat_interval: 10s
  local_ssh_port: 22
```

---

## Migration Plan

### Step 1: Deploy New Gateway (Backward Compatible)
- New terminal proxy service alongside existing
- Feature flag to switch between old/new
- Test with subset of users

### Step 2: Update Pod Agents
- Minimal changes (already working via gRPC)
- Add terminal resize support

### Step 3: Update VM Agents
- Add reverse tunnel capability
- Deploy to test VMs first

### Step 4: Enable Session Recording
- Start recording all sessions
- Verify storage and playback

### Step 5: Full Rollout
- Remove old terminal code
- Enable for all users

---

## Dependencies

### Go Packages (Gateway)

```go
import (
    "golang.org/x/crypto/ssh"           // SSH client
    "github.com/hashicorp/vault/api"    // Vault client (optional)
    "github.com/gorilla/websocket"      // WebSocket (existing)
    "github.com/redis/go-redis/v9"      // Session store (optional)
)
```

### NPM Packages (Frontend)

```json
{
    "@xterm/xterm": "^5.x",           // Terminal UI (existing)
    "@xterm/addon-fit": "^0.x",       // Auto-resize (existing)
    "@xterm/addon-web-links": "^0.x"  // Clickable links (new)
}
```

---

## Timeline Estimate

| Phase | Description | Effort |
|-------|-------------|--------|
| Phase 1 | Foundation Refactor | 3-4 days |
| Phase 2 | SSH Support | 3-4 days |
| Phase 3 | Session Management | 3-4 days |
| Phase 4 | Frontend Rewrite | 2-3 days |
| Phase 5 | Auth & Audit | 2-3 days |
| Phase 6 | Agent Updates | 2-3 days |
| Phase 7 | Testing | 2-3 days |
| **Total** | | **17-24 days** |

---

## References

- [Apache Guacamole Architecture](https://guacamole.apache.org/doc/gug/guacamole-architecture.html)
- [xterm.js Documentation](https://xtermjs.org/docs/)
- [How to create web-based terminals](https://dev.to/saisandeepvaddi/how-to-create-web-based-terminals-38d)
- [Go SSH Package](https://pkg.go.dev/golang.org/x/crypto/ssh)
- [HashiCorp Vault SSH Secrets](https://developer.hashicorp.com/vault/docs/secrets/ssh)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-19 | 1.0 | Initial design document |
