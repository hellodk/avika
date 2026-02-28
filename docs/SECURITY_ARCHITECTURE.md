# Security Architecture

> Comprehensive security model for Avika NGINX Manager

## Overview

Avika implements a multi-layer security model to protect both the management plane (UI/API) and the data plane (agent-gateway communication).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY LAYERS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│   │   Layer 1   │      │   Layer 2   │      │   Layer 3   │                │
│   │ User Auth   │      │ Agent PSK   │      │  Transport  │                │
│   │             │      │             │      │   (TLS)     │                │
│   │ - Login     │      │ - HMAC-SHA  │      │             │                │
│   │ - Sessions  │      │ - Timestamp │      │ - gRPC TLS  │                │
│   │ - Password  │      │ - Auto/Man  │      │ - HTTPS     │                │
│   │   Change    │      │   Enroll    │      │             │                │
│   └─────────────┘      └─────────────┘      └─────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: User Authentication

### First-Time Setup (Jenkins-Style)

When authentication is enabled without a pre-configured password, the system generates an initial admin password automatically.

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIRST-TIME SETUP FLOW                         │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │   Gateway    │
     │   Startup    │
     └──────┬───────┘
            │
            ▼
    ┌───────────────────┐
    │ auth.enabled=true │
    │ passwordHash=""   │──────── No password configured?
    └───────────────────┘
            │ Yes
            ▼
    ┌───────────────────────────────────────────┐
    │ Generate random 32-byte password          │
    │ Display in logs (like Jenkins)            │
    │ Write to /var/lib/avika/initial-password  │
    └───────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────────────────────────────┐
    │ ***************************************   │
    │ Avika initial setup required.             │
    │                                           │
    │ Username: admin                           │
    │ Password: a1b2c3d4e5f6g7h8i9j0k1l2m3n4   │
    │                                           │
    │ Please change this password immediately.  │
    │ ***************************************   │
    └───────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────┐      ┌───────────────────┐
    │   User Login      │─────▶│ Force Password    │
    │ (initial pass)    │      │    Change         │
    └───────────────────┘      └───────────────────┘
            │                          │
            ▼                          ▼
    ┌───────────────────┐      ┌───────────────────┐
    │ requirePassChange │      │ Delete initial    │
    │     = true        │      │ secret file       │
    └───────────────────┘      └───────────────────┘
```

### Session Management

```
┌──────────────────────────────────────────────────────────────────┐
│                     SESSION FLOW                                  │
└──────────────────────────────────────────────────────────────────┘

    Browser                    Frontend                   Gateway
       │                          │                          │
       │──── POST /login ────────▶│                          │
       │     {user, pass}         │───── POST /api/auth ────▶│
       │                          │       /login             │
       │                          │                          │
       │                          │◀──── Set-Cookie: ────────│
       │◀─────────────────────────│       avika_session=xyz  │
       │   Set-Cookie:            │                          │
       │   avika_session=xyz      │                          │
       │                          │                          │
       │──── GET /inventory ─────▶│                          │
       │     Cookie: xyz          │───── Validate token ────▶│
       │                          │                          │
       │◀──── Page content ───────│◀──── User context ───────│
       │                          │                          │
```

### Configuration

```yaml
# Helm values.yaml
auth:
  enabled: true
  username: "admin"
  passwordHash: ""  # Empty = generate initial password
  tokenExpiry: "24h"
  cookieSecure: true  # Use true for HTTPS
  initialSecretPath: "/var/lib/avika/initial-admin-password"
```

---

## Layer 2: Agent PSK Authentication

### Overview

Pre-Shared Key (PSK) authentication prevents unauthorized agents from connecting to the gateway. This is similar to how Zabbix authenticates its agents.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PSK AUTHENTICATION MODEL                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────┐
                        │    GATEWAY      │
                        │                 │
                        │  PSK: abc123... │◀────── Same PSK
                        │                 │
                        └────────┬────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
            ▼                    ▼                    ▼
    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
    │   Agent 1     │    │   Agent 2     │    │   Agent 3     │
    │               │    │               │    │               │
    │ PSK: abc123...│    │ PSK: abc123...│    │ PSK: wrong!   │
    │      ✓        │    │      ✓        │    │      ✗        │
    └───────────────┘    └───────────────┘    └───────────────┘
         Allowed              Allowed              Rejected
```

### HMAC Signature Flow

Each agent request includes a cryptographic signature to prove possession of the PSK:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SIGNATURE GENERATION                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    Agent                                              Gateway
      │                                                   │
      │  1. Collect auth data:                           │
      │     - agent_id: "nginx-prod-01"                  │
      │     - hostname: "prod-server-1"                  │
      │     - timestamp: "2026-02-16T15:04:05Z"          │
      │                                                   │
      │  2. Create message:                              │
      │     "nginx-prod-01:prod-server-1:2026-02-16..."  │
      │                                                   │
      │  3. Sign with PSK:                               │
      │     signature = HMAC-SHA256(PSK, message)        │
      │                                                   │
      │──────── gRPC Request ────────────────────────────▶│
      │  Headers:                                         │
      │    x-avika-agent-id: nginx-prod-01               │
      │    x-avika-hostname: prod-server-1               │
      │    x-avika-timestamp: 2026-02-16T15:04:05Z       │
      │    x-avika-signature: base64(signature)          │
      │                                                   │
      │                                                   │  4. Gateway verifies:
      │                                                   │     - Timestamp within 5min
      │                                                   │     - Recompute signature
      │                                                   │     - Compare signatures
      │                                                   │
      │◀─────── Response (if valid) ─────────────────────│
      │                                                   │
```

### Enrollment Modes

#### Mode 1: Auto-Enrollment (Default)

New agents are automatically registered on first valid connection:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTO-ENROLLMENT MODE                          │
└─────────────────────────────────────────────────────────────────┘

    New Agent                           Gateway
        │                                  │
        │──── Connect with valid PSK ─────▶│
        │                                  │
        │                                  │  Check: Agent registered?
        │                                  │     No → Auto-register
        │                                  │          Log: "Enrolled nginx-01"
        │                                  │
        │◀──── Connection accepted ────────│
        │                                  │
```

#### Mode 2: Manual Approval

Agents must be pre-registered or approved before connecting:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MANUAL APPROVAL MODE                          │
└─────────────────────────────────────────────────────────────────┘

    Admin                  Gateway                    New Agent
      │                       │                           │
      │                       │◀── Connect with PSK ──────│
      │                       │                           │
      │                       │  Check: Agent registered?  │
      │                       │     No → Reject           │
      │                       │                           │
      │                       │──── Error: Not enrolled ──▶│
      │                       │                           │
      │── Register agent ────▶│                           │
      │   POST /api/agents    │                           │
      │   {id, hostname}      │                           │
      │                       │                           │
      │◀── Success ───────────│                           │
      │                       │                           │
      │                       │◀── Retry connect ─────────│
      │                       │                           │
      │                       │──── Success ──────────────▶│
      │                       │                           │
```

### Configuration

```yaml
# Helm values.yaml
psk:
  enabled: true
  key: ""  # Empty = auto-generate and log
  allowAutoEnroll: true  # false for manual approval
  timestampWindow: "5m"  # Clock skew tolerance
  requireHostMatch: false  # Strict hostname checking
```

**Agent Configuration** (`avika-agent.conf`):

```ini
# Pre-Shared Key for gateway authentication
# Must match the gateway's PSK
PSK="your-64-char-hex-key-here"
```

---

## PSK Storage Best Practices

> ⚠️ **CRITICAL**: Never store PSK values in plain text in version control, ConfigMaps, or environment variables visible in logs.

### Recommended Storage Methods

#### 1. Kubernetes Secrets (Recommended for K8s)

```bash
# Create secret (value is base64 encoded automatically)
kubectl create secret generic avika-psk \
  --from-literal=psk=$(openssl rand -hex 32) \
  -n avika

# Reference in Helm values
psk:
  enabled: true
  existingSecret: "avika-psk"
  existingSecretKey: "psk"
```

#### 2. HashiCorp Vault (Enterprise)

```bash
# Store in Vault
vault kv put secret/avika/psk key=$(openssl rand -hex 32)

# Reference via External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: avika-psk
spec:
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: avika-psk
  data:
    - secretKey: psk
      remoteRef:
        key: secret/avika/psk
        property: key
```

#### 3. AWS Secrets Manager / Azure Key Vault / GCP Secret Manager

```yaml
# Using External Secrets Operator with AWS
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: avika-psk
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: avika-psk
  data:
    - secretKey: psk
      remoteRef:
        key: avika/production/psk
```

#### 4. Jenkins Credentials (CI/CD)

```groovy
// Jenkinsfile
pipeline {
    environment {
        AVIKA_PSK = credentials('avika-psk-credential-id')
    }
    stages {
        stage('Deploy') {
            steps {
                sh '''
                    helm upgrade avika ./deploy/helm/avika \
                      --set psk.enabled=true \
                      --set psk.key=${AVIKA_PSK}
                '''
            }
        }
    }
}
```

#### 5. SOPS (Secrets OPerationS) for GitOps

```bash
# Encrypt secrets file
sops --encrypt --age $(cat ~/.sops/age/keys.txt | grep public | cut -d: -f2) \
  secrets.yaml > secrets.enc.yaml

# secrets.yaml (before encryption)
psk:
  key: "your-64-char-hex-key"

# Use with Helm
helm upgrade avika ./deploy/helm/avika \
  -f <(sops -d secrets.enc.yaml)
```

### Anti-Patterns (DO NOT DO)

```yaml
# ❌ BAD: Plain text in values.yaml (committed to git)
psk:
  key: "abc123def456..."

# ❌ BAD: Plain text in ConfigMap
apiVersion: v1
kind: ConfigMap
data:
  PSK: "abc123def456..."

# ❌ BAD: Environment variable in Dockerfile
ENV PSK="abc123def456..."

# ❌ BAD: Command line argument visible in process list
./agent -psk abc123def456...
```

### Recommended Patterns

```yaml
# ✅ GOOD: Reference existing secret
psk:
  enabled: true
  existingSecret: "avika-psk"

# ✅ GOOD: Inject via CI/CD with masked variables
# (GitLab CI example)
deploy:
  script:
    - helm upgrade avika ./chart --set psk.key=$AVIKA_PSK
  variables:
    AVIKA_PSK:
      value: $CI_VAULT_PSK
      masked: true

# ✅ GOOD: Mount secret as file (never in env)
volumes:
  - name: psk
    secret:
      secretName: avika-psk
volumeMounts:
  - name: psk
    mountPath: /etc/avika/psk
    readOnly: true
```

### PSK Rotation Strategy

```bash
#!/bin/bash
# rotate-psk.sh - Rotate PSK with zero downtime

# 1. Generate new PSK
NEW_PSK=$(openssl rand -hex 32)

# 2. Update secret (gateway will pick up on restart)
kubectl create secret generic avika-psk-new \
  --from-literal=psk=$NEW_PSK -n avika --dry-run=client -o yaml | \
  kubectl apply -f -

# 3. Update agents first (they can connect with either PSK during transition)
# ... deploy agents with new PSK ...

# 4. Restart gateway to use new PSK
kubectl rollout restart deployment/avika-gateway -n avika

# 5. Cleanup old secret
kubectl delete secret avika-psk-old -n avika
```

### PSK Status Indicator in UI

The Inventory page displays PSK authentication status for each agent:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Agent Fleet                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Agent                        IP Address    Status    PSK                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  web-server-01 🛡️ K8s        10.0.1.5      Online    Authenticated         │
│  api-gateway-02 🛡️           10.0.2.8      Online    Authenticated         │
│  worker-node-03 ⚠️           10.0.3.12     Online    Unauthenticated       │
│  db-server-04 🛡️             10.0.4.20     Offline   Authenticated         │
└─────────────────────────────────────────────────────────────────────────────┘

🛡️ = Shield icon (green) - PSK authenticated
⚠️ = Shield-off icon (amber) - Not PSK authenticated (security risk)
```

**Icons:**
- **🛡️ Green Shield**: Agent authenticated with valid PSK
- **⚠️ Amber Shield-Off**: Agent connected without PSK (unauthenticated)
- **No icon**: PSK feature is disabled globally

This visual indicator helps administrators quickly identify:
1. Which agents are properly secured with PSK
2. Which agents may have connected before PSK was enabled
3. Potential security risks requiring attention

---

## Layer 3: Transport Security (TLS)

### gRPC TLS (Agent ↔ Gateway)

```yaml
# Gateway values.yaml
security:
  tls:
    enabled: true
    certSecret: "avika-gateway-tls"
    keySecret: "avika-gateway-tls"
```

### HTTPS (Browser ↔ Frontend)

Use Ingress with TLS:

```yaml
ingress:
  enabled: true
  tls:
    - secretName: avika-tls
      hosts:
        - avika.yourdomain.com
```

---

## Complete Security Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE SECURITY MODEL                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │    Internet     │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │         Ingress             │
                              │   (TLS Termination)         │
                              └──────────────┬──────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        │                        │
         ┌──────────────────┐               │              ┌──────────────────┐
         │     Browser      │               │              │   NGINX Agent    │
         │                  │               │              │                  │
         │ 1. HTTPS         │               │              │ 1. PSK Auth      │
         │ 2. Session Cookie│               │              │ 2. HMAC Signature│
         │ 3. First Login   │               │              │ 3. gRPC (TLS)    │
         │    Password Chg  │               │              │                  │
         └────────┬─────────┘               │              └────────┬─────────┘
                  │                         │                       │
                  ▼                         │                       ▼
         ┌──────────────────┐               │              ┌──────────────────┐
         │    Frontend      │               │              │     Gateway      │
         │                  │               │              │                  │
         │ - Auth Middleware│               │              │ - PSK Interceptor│
         │ - Protected      │◀──────────────┴─────────────▶│ - User Auth      │
         │   Routes         │                              │ - Rate Limiting  │
         │                  │                              │                  │
         └──────────────────┘                              └──────────────────┘
```

---

## Security Comparison

| Feature | Without Security | With Security |
|---------|-----------------|---------------|
| **UI Access** | Anyone can access | Login required |
| **Initial Setup** | Open | Password generated, must change |
| **Agent Connection** | Any agent can connect | PSK required |
| **Agent Registration** | Implicit | Auto or manual approval |
| **Replay Attacks** | Possible | Timestamp validation |
| **Transport** | Plain HTTP/gRPC | TLS encrypted |

---

## Quick Setup Commands

### Enable Basic Auth

```bash
# Deploy with auth (initial password auto-generated)
helm install avika ./deploy/helm/avika \
  --set auth.enabled=true

# Check logs for initial password
kubectl logs -f deployment/avika-gateway -n avika | grep -A5 "initial setup"
```

### Enable PSK Authentication

```bash
# Generate a PSK
PSK=$(openssl rand -hex 32)
echo "PSK: $PSK"

# Deploy with PSK
helm install avika ./deploy/helm/avika \
  --set psk.enabled=true \
  --set psk.key=$PSK
```

### Configure Agent with PSK

```bash
# On each NGINX server, add to avika-agent.conf:
echo "PSK=\"$PSK\"" >> /etc/avika/avika-agent.conf

# Restart agent
systemctl restart avika-agent
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/change-password` | POST | Change password |
| `/api/agents` | GET | List registered agents (PSK mode) |
| `/api/agents/{id}/approve` | POST | Approve pending agent |
| `/api/agents/{id}/revoke` | POST | Revoke agent access |

---

## Files Reference

| File | Purpose |
|------|---------|
| `cmd/gateway/middleware/auth.go` | User authentication middleware |
| `cmd/gateway/middleware/psk.go` | PSK authentication for agents |
| `cmd/gateway/config/config.go` | Configuration structures |
| `deploy/helm/avika/values.yaml` | Helm configuration |
| `frontend/src/middleware.ts` | Frontend route protection |
| `frontend/src/app/login/page.tsx` | Login UI |
