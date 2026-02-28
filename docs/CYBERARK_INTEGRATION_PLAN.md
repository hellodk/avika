# CyberArk Integration Plan for Avika NGINX Manager

## Executive Summary

This document outlines the comprehensive integration strategy for CyberArk Privileged Access Management (PAM) and related security controls for the Avika NGINX Manager platform. As a regulated financial entity, this integration addresses:

- **Privileged Access Management (PAM)** - Secure credential vaulting and retrieval
- **Privileged Session Management (PSM)** - Session recording and monitoring
- **Application Access Manager (AAM)** - Machine-to-machine authentication
- **SIEM Integration** - Centralized security event logging
- **Compliance Requirements** - SOX, PCI-DSS, SOC2, and financial regulatory frameworks

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [CyberArk Integration Architecture](#2-cyberark-integration-architecture)
3. [Implementation Phases](#3-implementation-phases)
4. [Detailed Component Design](#4-detailed-component-design)
5. [SIEM Integration Strategy](#5-siem-integration-strategy)
6. [Compliance Mapping](#6-compliance-mapping)
7. [Security Controls Matrix](#7-security-controls-matrix)
8. [Operational Procedures](#8-operational-procedures)
9. [Risk Assessment](#9-risk-assessment)
10. [Appendices](#appendices)

---

## 1. Current State Assessment

### 1.1 Existing Security Posture

| Component | Current State | Gap |
|-----------|---------------|-----|
| Secret Management | HashiCorp Vault (optional) | Not CyberArk-integrated, no rotation |
| User Authentication | Basic auth (SHA-256 + JWT) | No PAM, no MFA, no SSO |
| Agent Authentication | Pre-Shared Key (PSK) | Static keys, manual rotation |
| Session Recording | None | No privileged session audit |
| Audit Logging | Basic Go logs | No structured audit trail |
| SIEM Integration | None | No centralized security monitoring |
| Password Rotation | Manual | No automated credential lifecycle |

### 1.2 Components Requiring CyberArk Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AVIKA ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Frontend   │───▶│   Gateway    │◀───│    Agent     │                  │
│  │  (Next.js)   │    │    (Go)      │    │    (Go)      │                  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                  │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │  PostgreSQL  │    │  ClickHouse  │    │   Redpanda   │                  │
│  │   (State)    │    │   (TSDB)     │    │  (Streaming) │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
│  CREDENTIALS REQUIRING CYBERARK PROTECTION:                                 │
│  • PostgreSQL admin/app credentials                                         │
│  • ClickHouse admin/app credentials                                         │
│  • Redpanda/Kafka SASL credentials                                          │
│  • Agent PSK keys                                                           │
│  • JWT signing secrets                                                      │
│  • TLS certificates and private keys                                        │
│  • SMTP credentials                                                         │
│  • API tokens for external integrations                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Privileged Users and Access Patterns

| User Type | Current Access | Risk Level | CyberArk Control Needed |
|-----------|---------------|------------|-------------------------|
| Platform Admin | Full system access | Critical | PAM + PSM |
| SRE/DevOps | kubectl, DB access | High | PAM + PSM |
| Application | Service accounts | High | AAM/Conjur |
| Database Admin | PostgreSQL, ClickHouse | Critical | PAM + PSM + CPM |
| Security Team | Audit log access | Medium | PAM |
| Agent Service | gRPC to Gateway | High | AAM/Conjur |

---

## 2. CyberArk Integration Architecture

### 2.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CYBERARK INTEGRATED ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         CYBERARK PAM LAYER                               │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │    │
│  │  │    Vault    │  │     CPM     │  │     PSM     │  │    PVWA     │     │    │
│  │  │  (Secrets)  │  │ (Rotation)  │  │ (Sessions)  │  │ (Web Admin) │     │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘     │    │
│  │         │                │                │                              │    │
│  │         └────────────────┴────────────────┘                              │    │
│  │                          │                                               │    │
│  │         ┌────────────────┴────────────────┐                              │    │
│  │         │                                 │                              │    │
│  │  ┌──────▼──────┐                   ┌──────▼──────┐                       │    │
│  │  │   Conjur    │                   │     AAM     │                       │    │
│  │  │  (DevOps)   │                   │ (App2App)   │                       │    │
│  │  └──────┬──────┘                   └──────┬──────┘                       │    │
│  │         │                                 │                              │    │
│  └─────────┼─────────────────────────────────┼──────────────────────────────┘    │
│            │                                 │                                    │
│  ┌─────────┼─────────────────────────────────┼──────────────────────────────┐    │
│  │         │         AVIKA PLATFORM          │                               │    │
│  │         │                                 │                               │    │
│  │  ┌──────▼──────┐    ┌────────────────────▼──────┐    ┌──────────────┐    │    │
│  │  │  Credential │    │        Gateway            │    │    Agent     │    │    │
│  │  │   Provider  │───▶│   (CyberArk SDK)          │◀───│ (AAM Auth)   │    │    │
│  │  │   (Init)    │    └────────────────────┬──────┘    └──────────────┘    │    │
│  │  └─────────────┘                         │                               │    │
│  │                                          │                               │    │
│  │         ┌────────────────────────────────┼────────────────────┐          │    │
│  │         │                                │                    │          │    │
│  │  ┌──────▼──────┐    ┌──────────────┐    ┌▼─────────────┐     │          │    │
│  │  │  PostgreSQL │    │  ClickHouse  │    │   Redpanda   │     │          │    │
│  │  │ (CPM Mgmt)  │    │ (CPM Mgmt)   │    │  (CPM Mgmt)  │     │          │    │
│  │  └─────────────┘    └──────────────┘    └──────────────┘     │          │    │
│  │                                                               │          │    │
│  └───────────────────────────────────────────────────────────────┼──────────┘    │
│                                                                  │                │
│  ┌───────────────────────────────────────────────────────────────┼──────────┐    │
│  │                         SIEM LAYER                            │          │    │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │          │    │
│  │  │   Splunk/    │◀───│    OTEL      │◀───│  Audit Log   │◀───┘          │    │
│  │  │   QRadar     │    │  Collector   │    │   Exporter   │               │    │
│  │  └──────────────┘    └──────────────┘    └──────────────┘               │    │
│  │                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 CyberArk Components Selection

| Component | Purpose | Deployment |
|-----------|---------|------------|
| **CyberArk Vault** | Enterprise credential vault | On-prem or Privilege Cloud |
| **Central Policy Manager (CPM)** | Automated password rotation | Alongside Vault |
| **Privileged Session Manager (PSM)** | Session recording/proxy | Jump server model |
| **Conjur Enterprise** | Secrets for containers/K8s | Kubernetes-native |
| **Application Access Manager (AAM)** | App-to-app authentication | Agent/SDK model |
| **Privilege Cloud** (Alternative) | SaaS-based PAM | Cloud deployment |

### 2.3 Integration Patterns

#### Pattern 1: Credential Provider (CP) Model
```
Application → CyberArk CP SDK → Vault → Return Credential
                                  ↑
                                 CPM (Automatic Rotation)
```

#### Pattern 2: Conjur Secrets Injection (Kubernetes-Native)
```
Pod Init Container → Conjur API → Retrieve Secrets → Mount as ENV/Files
```

#### Pattern 3: Secretless Broker (Zero Trust)
```
Application → Secretless Broker → CyberArk → Target System
              (No app holds secrets)
```

**Recommendation**: Use **Pattern 2 (Conjur)** for Kubernetes workloads and **Pattern 1 (CP)** for non-containerized components.

---

## 3. Implementation Phases

### Phase 1: Foundation (4-6 weeks)

#### 1.1 CyberArk Infrastructure Setup
- [ ] Deploy CyberArk Vault (or Privilege Cloud tenant)
- [ ] Configure CPM for database credential rotation
- [ ] Set up Conjur Enterprise for Kubernetes secrets
- [ ] Establish network connectivity (firewall rules, VPN)
- [ ] Create Safe hierarchy for Avika credentials

#### 1.2 Safe Structure Design
```
Root
├── Avika-Production
│   ├── Database-Credentials
│   │   ├── PostgreSQL-Admin
│   │   ├── PostgreSQL-App
│   │   ├── ClickHouse-Admin
│   │   └── ClickHouse-App
│   ├── Application-Secrets
│   │   ├── JWT-Signing-Key
│   │   ├── PSK-Agent-Key
│   │   └── SMTP-Credentials
│   ├── TLS-Certificates
│   │   ├── Gateway-TLS
│   │   └── Agent-TLS
│   └── Service-Accounts
│       ├── Gateway-SA
│       └── Agent-SA
├── Avika-Staging
│   └── (mirror structure)
└── Avika-Development
    └── (mirror structure)
```

#### 1.3 Initial Credential Onboarding
- [ ] Migrate PostgreSQL credentials to CyberArk Vault
- [ ] Migrate ClickHouse credentials to CyberArk Vault
- [ ] Migrate Redpanda/Kafka credentials
- [ ] Configure CPM reconciliation accounts
- [ ] Test credential retrieval via AAM

### Phase 2: Application Integration (4-6 weeks)

#### 2.1 Gateway Integration
- [ ] Implement CyberArk Credential Provider SDK in Go
- [ ] Replace Vault client with CyberArk client
- [ ] Add credential caching with TTL
- [ ] Implement credential refresh on rotation
- [ ] Add fallback mechanisms for HA

#### 2.2 Agent Integration
- [ ] Implement AAM authentication for agents
- [ ] Replace PSK with CyberArk-managed secrets
- [ ] Add mutual TLS with CyberArk-managed certificates
- [ ] Implement agent identity attestation

#### 2.3 Conjur Kubernetes Integration
- [ ] Deploy Conjur Kubernetes Authenticator
- [ ] Configure ServiceAccount authentication
- [ ] Create Conjur policies for Avika workloads
- [ ] Implement secrets injection via Init containers
- [ ] Test with staging environment

### Phase 3: Session Management & Audit (3-4 weeks)

#### 3.1 PSM Integration
- [ ] Configure PSM for database access
- [ ] Set up PSM for kubectl/K8s admin access
- [ ] Create connection components for each target
- [ ] Configure session recording storage
- [ ] Integrate with SIEM for session events

#### 3.2 Audit Framework Implementation
- [ ] Design structured audit log schema
- [ ] Implement audit logging middleware in Gateway
- [ ] Add audit events for all privileged operations
- [ ] Configure log forwarding to SIEM
- [ ] Create audit dashboards and alerts

### Phase 4: SIEM Integration (2-3 weeks)

#### 4.1 Log Collection Pipeline
- [ ] Configure OTEL Collector for audit logs
- [ ] Add CyberArk syslog/SIEM integration
- [ ] Implement log enrichment (user context, geo, etc.)
- [ ] Configure log retention policies

#### 4.2 SIEM Configuration
- [ ] Create correlation rules for security events
- [ ] Build dashboards for privileged access monitoring
- [ ] Configure alerts for anomalous behavior
- [ ] Integrate CyberArk PTA (Privileged Threat Analytics)

### Phase 5: Compliance & Hardening (2-3 weeks)

#### 5.1 Compliance Validation
- [ ] Document compliance mappings (SOX, PCI-DSS)
- [ ] Generate compliance reports
- [ ] Conduct security assessment
- [ ] Address audit findings

#### 5.2 Operational Hardening
- [ ] Implement break-glass procedures
- [ ] Configure dual-control for critical operations
- [ ] Set up credential rotation schedules
- [ ] Document operational runbooks

---

## 4. Detailed Component Design

### 4.1 CyberArk Credential Provider Client (Go)

```go
// internal/common/cyberark/client.go
package cyberark

import (
    "context"
    "crypto/tls"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "sync"
    "time"
)

// Config holds CyberArk client configuration
type Config struct {
    // CyberArk Central Credential Provider (CCP) settings
    CCPHost     string        `yaml:"ccp_host"`     // e.g., "cyberark.company.com"
    CCPPort     int           `yaml:"ccp_port"`     // e.g., 443
    AppID       string        `yaml:"app_id"`       // Application ID registered in CyberArk
    CertFile    string        `yaml:"cert_file"`    // Client certificate for mutual TLS
    KeyFile     string        `yaml:"key_file"`     // Client private key
    CAFile      string        `yaml:"ca_file"`      // CA certificate
    
    // Conjur settings (for Kubernetes)
    ConjurURL       string `yaml:"conjur_url"`        // e.g., "https://conjur.company.com"
    ConjurAccount   string `yaml:"conjur_account"`    // Conjur account name
    ConjurAuthnURL  string `yaml:"conjur_authn_url"`  // Authentication endpoint
    
    // Cache settings
    CacheTTL        time.Duration `yaml:"cache_ttl"`         // How long to cache credentials
    RefreshBefore   time.Duration `yaml:"refresh_before"`    // Refresh credentials before expiry
    
    // Retry settings
    MaxRetries      int           `yaml:"max_retries"`
    RetryInterval   time.Duration `yaml:"retry_interval"`
}

// Client provides access to CyberArk secrets
type Client struct {
    config     Config
    httpClient *http.Client
    cache      *credentialCache
    mu         sync.RWMutex
}

// Credential represents a retrieved credential
type Credential struct {
    Username     string            `json:"username"`
    Password     string            `json:"password"`
    Address      string            `json:"address"`
    Properties   map[string]string `json:"properties"`
    LastChanged  time.Time         `json:"last_changed"`
    NextChange   time.Time         `json:"next_change"`
    RetrievedAt  time.Time         `json:"retrieved_at"`
}

// credentialCache stores credentials with TTL
type credentialCache struct {
    credentials map[string]*cachedCredential
    mu          sync.RWMutex
}

type cachedCredential struct {
    cred      *Credential
    expiresAt time.Time
}

// NewClient creates a new CyberArk client
func NewClient(cfg Config) (*Client, error) {
    if cfg.CacheTTL == 0 {
        cfg.CacheTTL = 5 * time.Minute
    }
    if cfg.RefreshBefore == 0 {
        cfg.RefreshBefore = 1 * time.Minute
    }
    if cfg.MaxRetries == 0 {
        cfg.MaxRetries = 3
    }
    if cfg.RetryInterval == 0 {
        cfg.RetryInterval = 2 * time.Second
    }

    // Configure TLS with client certificates
    tlsConfig := &tls.Config{
        MinVersion: tls.VersionTLS12,
    }

    if cfg.CertFile != "" && cfg.KeyFile != "" {
        cert, err := tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
        if err != nil {
            return nil, fmt.Errorf("failed to load client certificate: %w", err)
        }
        tlsConfig.Certificates = []tls.Certificate{cert}
    }

    client := &Client{
        config: cfg,
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
            Transport: &http.Transport{
                TLSClientConfig: tlsConfig,
            },
        },
        cache: &credentialCache{
            credentials: make(map[string]*cachedCredential),
        },
    }

    return client, nil
}

// GetCredential retrieves a credential from CyberArk CCP
func (c *Client) GetCredential(ctx context.Context, safe, object string) (*Credential, error) {
    cacheKey := fmt.Sprintf("%s/%s", safe, object)

    // Check cache first
    if cached := c.cache.get(cacheKey); cached != nil {
        return cached, nil
    }

    // Build CCP request URL
    url := fmt.Sprintf("https://%s:%d/AIMWebService/api/Accounts?AppID=%s&Safe=%s&Object=%s",
        c.config.CCPHost,
        c.config.CCPPort,
        c.config.AppID,
        safe,
        object,
    )

    var cred *Credential
    var lastErr error

    for attempt := 0; attempt < c.config.MaxRetries; attempt++ {
        if attempt > 0 {
            time.Sleep(c.config.RetryInterval)
        }

        req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
        if err != nil {
            lastErr = fmt.Errorf("failed to create request: %w", err)
            continue
        }

        resp, err := c.httpClient.Do(req)
        if err != nil {
            lastErr = fmt.Errorf("request failed: %w", err)
            continue
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
            body, _ := io.ReadAll(resp.Body)
            lastErr = fmt.Errorf("CyberArk returned status %d: %s", resp.StatusCode, string(body))
            continue
        }

        var ccpResp struct {
            Content       string `json:"Content"`       // The password
            UserName      string `json:"UserName"`
            Address       string `json:"Address"`
            Safe          string `json:"Safe"`
            Folder        string `json:"Folder"`
            Name          string `json:"Name"`
            LastTask      string `json:"LastTask"`
            LastSuccessChange    string `json:"LastSuccessChange"`
            LastSuccessVerify    string `json:"LastSuccessVerify"`
            LastSuccessReconcile string `json:"LastSuccessReconcile"`
        }

        if err := json.NewDecoder(resp.Body).Decode(&ccpResp); err != nil {
            lastErr = fmt.Errorf("failed to decode response: %w", err)
            continue
        }

        cred = &Credential{
            Username:    ccpResp.UserName,
            Password:    ccpResp.Content,
            Address:     ccpResp.Address,
            RetrievedAt: time.Now(),
            Properties: map[string]string{
                "safe":   ccpResp.Safe,
                "folder": ccpResp.Folder,
                "name":   ccpResp.Name,
            },
        }

        // Cache the credential
        c.cache.set(cacheKey, cred, c.config.CacheTTL)
        return cred, nil
    }

    return nil, fmt.Errorf("failed after %d attempts: %w", c.config.MaxRetries, lastErr)
}

// GetPostgresDSN builds a PostgreSQL DSN from CyberArk credentials
func (c *Client) GetPostgresDSN(ctx context.Context, safe, object string) (string, error) {
    cred, err := c.GetCredential(ctx, safe, object)
    if err != nil {
        return "", err
    }

    // Get database and host from credential properties or defaults
    host := cred.Address
    if host == "" {
        host = cred.Properties["host"]
    }
    port := cred.Properties["port"]
    if port == "" {
        port = "5432"
    }
    database := cred.Properties["database"]
    if database == "" {
        database = "avika"
    }

    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=require",
        cred.Username, cred.Password, host, port, database), nil
}

// GetClickHouseAddr returns ClickHouse connection details from CyberArk
func (c *Client) GetClickHouseAddr(ctx context.Context, safe, object string) (string, string, string, error) {
    cred, err := c.GetCredential(ctx, safe, object)
    if err != nil {
        return "", "", "", err
    }

    host := cred.Address
    if host == "" {
        host = cred.Properties["host"]
    }
    port := cred.Properties["port"]
    if port == "" {
        port = "9000"
    }

    return fmt.Sprintf("%s:%s", host, port), cred.Username, cred.Password, nil
}

// cache methods
func (cc *credentialCache) get(key string) *Credential {
    cc.mu.RLock()
    defer cc.mu.RUnlock()

    if cached, ok := cc.credentials[key]; ok {
        if time.Now().Before(cached.expiresAt) {
            return cached.cred
        }
    }
    return nil
}

func (cc *credentialCache) set(key string, cred *Credential, ttl time.Duration) {
    cc.mu.Lock()
    defer cc.mu.Unlock()

    cc.credentials[key] = &cachedCredential{
        cred:      cred,
        expiresAt: time.Now().Add(ttl),
    }
}

// Cleanup removes expired credentials from cache
func (cc *credentialCache) Cleanup() {
    cc.mu.Lock()
    defer cc.mu.Unlock()

    now := time.Now()
    for key, cached := range cc.credentials {
        if now.After(cached.expiresAt) {
            delete(cc.credentials, key)
        }
    }
}
```

### 4.2 Conjur Kubernetes Authenticator

```go
// internal/common/cyberark/conjur.go
package cyberark

import (
    "context"
    "encoding/base64"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "os"
    "strings"
    "time"
)

// ConjurClient provides Conjur secrets access for Kubernetes workloads
type ConjurClient struct {
    config    Config
    client    *http.Client
    token     string
    tokenExp  time.Time
    namespace string
    podName   string
    saToken   string
}

// NewConjurClient creates a Conjur client with K8s authentication
func NewConjurClient(cfg Config) (*ConjurClient, error) {
    // Read Kubernetes service account token
    saTokenBytes, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
    if err != nil {
        return nil, fmt.Errorf("failed to read ServiceAccount token: %w", err)
    }

    // Read namespace
    nsBytes, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
    if err != nil {
        return nil, fmt.Errorf("failed to read namespace: %w", err)
    }

    return &ConjurClient{
        config:    cfg,
        client:    &http.Client{Timeout: 30 * time.Second},
        namespace: string(nsBytes),
        podName:   os.Getenv("HOSTNAME"),
        saToken:   string(saTokenBytes),
    }, nil
}

// Authenticate obtains a Conjur access token using K8s authentication
func (c *ConjurClient) Authenticate(ctx context.Context) error {
    // Build authentication URL
    authnURL := fmt.Sprintf("%s/authn-k8s/%s/%s/authenticate",
        c.config.ConjurURL,
        url.PathEscape(c.config.ConjurAccount),
        url.PathEscape(fmt.Sprintf("host/conjur/authn-k8s/%s/apps/%s/*/*", 
            c.config.ConjurAuthnURL, c.namespace)),
    )

    req, err := http.NewRequestWithContext(ctx, "POST", authnURL, 
        strings.NewReader(c.saToken))
    if err != nil {
        return fmt.Errorf("failed to create auth request: %w", err)
    }

    req.Header.Set("Content-Type", "text/plain")
    req.Header.Set("Accept-Encoding", "base64")

    resp, err := c.client.Do(req)
    if err != nil {
        return fmt.Errorf("authentication request failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        body, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("authentication failed (status %d): %s", resp.StatusCode, string(body))
    }

    tokenBytes, err := io.ReadAll(resp.Body)
    if err != nil {
        return fmt.Errorf("failed to read token: %w", err)
    }

    // Decode base64 token
    decoded, err := base64.StdEncoding.DecodeString(string(tokenBytes))
    if err != nil {
        c.token = string(tokenBytes)
    } else {
        c.token = string(decoded)
    }

    // Token expires in 8 minutes by default
    c.tokenExp = time.Now().Add(8 * time.Minute)

    return nil
}

// GetSecret retrieves a secret from Conjur
func (c *ConjurClient) GetSecret(ctx context.Context, variableID string) (string, error) {
    // Check if token needs refresh
    if time.Now().Add(1 * time.Minute).After(c.tokenExp) {
        if err := c.Authenticate(ctx); err != nil {
            return "", fmt.Errorf("failed to refresh token: %w", err)
        }
    }

    secretURL := fmt.Sprintf("%s/secrets/%s/variable/%s",
        c.config.ConjurURL,
        url.PathEscape(c.config.ConjurAccount),
        url.PathEscape(variableID),
    )

    req, err := http.NewRequestWithContext(ctx, "GET", secretURL, nil)
    if err != nil {
        return "", fmt.Errorf("failed to create request: %w", err)
    }

    req.Header.Set("Authorization", "Token token=\""+c.token+"\"")

    resp, err := c.client.Do(req)
    if err != nil {
        return "", fmt.Errorf("request failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        body, _ := io.ReadAll(resp.Body)
        return "", fmt.Errorf("failed to get secret (status %d): %s", resp.StatusCode, string(body))
    }

    secret, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", fmt.Errorf("failed to read secret: %w", err)
    }

    return string(secret), nil
}
```

### 4.3 Audit Logger for SIEM Integration

```go
// internal/common/audit/logger.go
package audit

import (
    "context"
    "encoding/json"
    "fmt"
    "net"
    "os"
    "sync"
    "time"
)

// EventType represents the type of audit event
type EventType string

const (
    EventTypeAuth           EventType = "authentication"
    EventTypeAuthFailure    EventType = "authentication_failure"
    EventTypeAuthorization  EventType = "authorization"
    EventTypeCredAccess     EventType = "credential_access"
    EventTypeConfigChange   EventType = "configuration_change"
    EventTypeAgentConnect   EventType = "agent_connect"
    EventTypeAgentDisconnect EventType = "agent_disconnect"
    EventTypeDataAccess     EventType = "data_access"
    EventTypeAdminAction    EventType = "admin_action"
    EventTypeSystemEvent    EventType = "system_event"
)

// Severity levels aligned with CEF/LEEF standards
type Severity int

const (
    SeverityInfo     Severity = 1
    SeverityLow      Severity = 3
    SeverityMedium   Severity = 5
    SeverityHigh     Severity = 7
    SeverityCritical Severity = 10
)

// AuditEvent represents a structured audit log entry
type AuditEvent struct {
    // Standard fields (CEF-compatible)
    Timestamp     time.Time         `json:"timestamp"`
    EventType     EventType         `json:"event_type"`
    Severity      Severity          `json:"severity"`
    Outcome       string            `json:"outcome"`        // "success", "failure", "unknown"
    
    // Actor information
    UserID        string            `json:"user_id,omitempty"`
    Username      string            `json:"username,omitempty"`
    UserRole      string            `json:"user_role,omitempty"`
    SourceIP      string            `json:"source_ip,omitempty"`
    SourceHost    string            `json:"source_host,omitempty"`
    UserAgent     string            `json:"user_agent,omitempty"`
    SessionID     string            `json:"session_id,omitempty"`
    
    // Target information
    TargetType    string            `json:"target_type,omitempty"`   // "agent", "credential", "config"
    TargetID      string            `json:"target_id,omitempty"`
    TargetName    string            `json:"target_name,omitempty"`
    
    // Action details
    Action        string            `json:"action"`
    Resource      string            `json:"resource,omitempty"`
    Method        string            `json:"method,omitempty"`        // HTTP method or gRPC method
    
    // Request/Response details
    RequestID     string            `json:"request_id,omitempty"`
    RequestPath   string            `json:"request_path,omitempty"`
    ResponseCode  int               `json:"response_code,omitempty"`
    DurationMs    int64             `json:"duration_ms,omitempty"`
    
    // Additional context
    Details       map[string]string `json:"details,omitempty"`
    ErrorMessage  string            `json:"error_message,omitempty"`
    
    // Compliance tags
    ComplianceTags []string         `json:"compliance_tags,omitempty"` // ["PCI-DSS-8.2", "SOX"]
    
    // CyberArk correlation
    CyberArkSafe   string           `json:"cyberark_safe,omitempty"`
    CyberArkAccount string          `json:"cyberark_account,omitempty"`
    
    // Platform metadata
    Component     string            `json:"component"`       // "gateway", "agent", "frontend"
    Version       string            `json:"version"`
    Environment   string            `json:"environment"`     // "production", "staging"
    Hostname      string            `json:"hostname"`
    PodName       string            `json:"pod_name,omitempty"`
    Namespace     string            `json:"namespace,omitempty"`
}

// AuditLogger handles audit log collection and forwarding
type AuditLogger struct {
    config     AuditConfig
    syslog     *SyslogWriter
    otelWriter *OTELWriter
    buffer     chan *AuditEvent
    wg         sync.WaitGroup
    closeCh    chan struct{}
    
    // Metadata
    component   string
    version     string
    environment string
    hostname    string
    podName     string
    namespace   string
}

// AuditConfig holds audit logger configuration
type AuditConfig struct {
    // Output destinations
    EnableSyslog  bool   `yaml:"enable_syslog"`
    SyslogHost    string `yaml:"syslog_host"`     // e.g., "siem.company.com:514"
    SyslogProto   string `yaml:"syslog_proto"`    // "tcp" or "udp"
    
    EnableOTEL    bool   `yaml:"enable_otel"`
    OTELEndpoint  string `yaml:"otel_endpoint"`   // e.g., "otel-collector:4317"
    
    EnableFile    bool   `yaml:"enable_file"`
    FilePath      string `yaml:"file_path"`       // e.g., "/var/log/avika/audit.log"
    
    // Buffering
    BufferSize    int `yaml:"buffer_size"`
    FlushInterval time.Duration `yaml:"flush_interval"`
    
    // Filtering
    MinSeverity   Severity `yaml:"min_severity"`
    
    // Enrichment
    Component     string `yaml:"component"`
    Version       string `yaml:"version"`
    Environment   string `yaml:"environment"`
}

// NewAuditLogger creates a new audit logger
func NewAuditLogger(cfg AuditConfig) (*AuditLogger, error) {
    if cfg.BufferSize == 0 {
        cfg.BufferSize = 10000
    }
    if cfg.FlushInterval == 0 {
        cfg.FlushInterval = 1 * time.Second
    }

    hostname, _ := os.Hostname()
    
    al := &AuditLogger{
        config:      cfg,
        buffer:      make(chan *AuditEvent, cfg.BufferSize),
        closeCh:     make(chan struct{}),
        component:   cfg.Component,
        version:     cfg.Version,
        environment: cfg.Environment,
        hostname:    hostname,
        podName:     os.Getenv("HOSTNAME"),
        namespace:   os.Getenv("POD_NAMESPACE"),
    }

    // Initialize syslog if enabled
    if cfg.EnableSyslog {
        sw, err := NewSyslogWriter(cfg.SyslogHost, cfg.SyslogProto)
        if err != nil {
            return nil, fmt.Errorf("failed to create syslog writer: %w", err)
        }
        al.syslog = sw
    }

    // Initialize OTEL if enabled
    if cfg.EnableOTEL {
        ow, err := NewOTELWriter(cfg.OTELEndpoint)
        if err != nil {
            return nil, fmt.Errorf("failed to create OTEL writer: %w", err)
        }
        al.otelWriter = ow
    }

    // Start background writer
    al.wg.Add(1)
    go al.writer()

    return al, nil
}

// Log records an audit event
func (al *AuditLogger) Log(ctx context.Context, event *AuditEvent) {
    // Add metadata
    event.Timestamp = time.Now().UTC()
    event.Component = al.component
    event.Version = al.version
    event.Environment = al.environment
    event.Hostname = al.hostname
    event.PodName = al.podName
    event.Namespace = al.namespace

    // Extract request ID from context if available
    if reqID, ok := ctx.Value("request_id").(string); ok {
        event.RequestID = reqID
    }

    // Filter by severity
    if event.Severity < al.config.MinSeverity {
        return
    }

    // Send to buffer (non-blocking)
    select {
    case al.buffer <- event:
    default:
        // Buffer full, log warning and drop
        fmt.Fprintf(os.Stderr, "AUDIT: buffer full, dropping event: %s\n", event.Action)
    }
}

// writer processes events from the buffer
func (al *AuditLogger) writer() {
    defer al.wg.Done()

    ticker := time.NewTicker(al.config.FlushInterval)
    defer ticker.Stop()

    for {
        select {
        case event := <-al.buffer:
            al.writeEvent(event)
        case <-ticker.C:
            // Flush remaining events
            for {
                select {
                case event := <-al.buffer:
                    al.writeEvent(event)
                default:
                    goto done
                }
            }
        done:
        case <-al.closeCh:
            // Drain buffer before closing
            for {
                select {
                case event := <-al.buffer:
                    al.writeEvent(event)
                default:
                    return
                }
            }
        }
    }
}

// writeEvent sends event to all configured outputs
func (al *AuditLogger) writeEvent(event *AuditEvent) {
    jsonBytes, err := json.Marshal(event)
    if err != nil {
        fmt.Fprintf(os.Stderr, "AUDIT: failed to marshal event: %v\n", err)
        return
    }

    // Syslog output (CEF format)
    if al.syslog != nil {
        cefMsg := al.toCEF(event)
        al.syslog.Write(cefMsg)
    }

    // OTEL output
    if al.otelWriter != nil {
        al.otelWriter.WriteLog(event)
    }

    // File output (JSON lines)
    if al.config.EnableFile {
        f, err := os.OpenFile(al.config.FilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
        if err == nil {
            f.Write(append(jsonBytes, '\n'))
            f.Close()
        }
    }
}

// toCEF converts event to Common Event Format for SIEM
func (al *AuditLogger) toCEF(event *AuditEvent) string {
    // CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
    return fmt.Sprintf(
        "CEF:0|Avika|NGINX-Manager|%s|%s|%s|%d|"+
            "src=%s suser=%s outcome=%s msg=%s "+
            "cs1=%s cs1Label=Component cs2=%s cs2Label=Environment "+
            "rt=%d",
        event.Version,
        event.EventType,
        event.Action,
        event.Severity,
        event.SourceIP,
        event.Username,
        event.Outcome,
        event.Details["message"],
        event.Component,
        event.Environment,
        event.Timestamp.UnixMilli(),
    )
}

// Close shuts down the audit logger
func (al *AuditLogger) Close() error {
    close(al.closeCh)
    al.wg.Wait()

    if al.syslog != nil {
        al.syslog.Close()
    }
    if al.otelWriter != nil {
        al.otelWriter.Close()
    }

    return nil
}

// Helper functions for creating common audit events

// LogAuthSuccess logs a successful authentication
func (al *AuditLogger) LogAuthSuccess(ctx context.Context, username, sourceIP, sessionID string) {
    al.Log(ctx, &AuditEvent{
        EventType:      EventTypeAuth,
        Severity:       SeverityInfo,
        Outcome:        "success",
        Username:       username,
        SourceIP:       sourceIP,
        SessionID:      sessionID,
        Action:         "user_login",
        ComplianceTags: []string{"PCI-DSS-8.1", "SOX-AC-2"},
        Details:        map[string]string{"message": "User authenticated successfully"},
    })
}

// LogAuthFailure logs a failed authentication attempt
func (al *AuditLogger) LogAuthFailure(ctx context.Context, username, sourceIP, reason string) {
    al.Log(ctx, &AuditEvent{
        EventType:      EventTypeAuthFailure,
        Severity:       SeverityHigh,
        Outcome:        "failure",
        Username:       username,
        SourceIP:       sourceIP,
        Action:         "user_login_failed",
        ErrorMessage:   reason,
        ComplianceTags: []string{"PCI-DSS-8.1", "SOX-AC-7"},
        Details:        map[string]string{"message": "Authentication failed: " + reason},
    })
}

// LogCredentialAccess logs credential retrieval from CyberArk
func (al *AuditLogger) LogCredentialAccess(ctx context.Context, username, safe, account, purpose string) {
    al.Log(ctx, &AuditEvent{
        EventType:       EventTypeCredAccess,
        Severity:        SeverityMedium,
        Outcome:         "success",
        Username:        username,
        Action:          "credential_retrieved",
        CyberArkSafe:    safe,
        CyberArkAccount: account,
        ComplianceTags:  []string{"PCI-DSS-8.5", "SOX-AC-5"},
        Details:         map[string]string{"purpose": purpose},
    })
}

// SyslogWriter handles syslog output
type SyslogWriter struct {
    conn net.Conn
    mu   sync.Mutex
}

func NewSyslogWriter(addr, proto string) (*SyslogWriter, error) {
    conn, err := net.Dial(proto, addr)
    if err != nil {
        return nil, err
    }
    return &SyslogWriter{conn: conn}, nil
}

func (sw *SyslogWriter) Write(msg string) error {
    sw.mu.Lock()
    defer sw.mu.Unlock()
    _, err := sw.conn.Write([]byte(msg + "\n"))
    return err
}

func (sw *SyslogWriter) Close() error {
    return sw.conn.Close()
}

// OTELWriter handles OTEL log export (placeholder)
type OTELWriter struct {
    endpoint string
}

func NewOTELWriter(endpoint string) (*OTELWriter, error) {
    return &OTELWriter{endpoint: endpoint}, nil
}

func (ow *OTELWriter) WriteLog(event *AuditEvent) error {
    // Implementation would use OTEL SDK to export logs
    return nil
}

func (ow *OTELWriter) Close() error {
    return nil
}
```

### 4.4 Updated Configuration Schema

```go
// cmd/gateway/config/cyberark_config.go
package config

import "time"

// CyberArkConfig holds CyberArk integration settings
type CyberArkConfig struct {
    // Provider type: "ccp" (Central Credential Provider) or "conjur"
    Provider string `yaml:"provider"`
    
    // CCP (Central Credential Provider) settings
    CCP struct {
        Enabled     bool   `yaml:"enabled"`
        Host        string `yaml:"host"`
        Port        int    `yaml:"port"`
        AppID       string `yaml:"app_id"`
        CertFile    string `yaml:"cert_file"`
        KeyFile     string `yaml:"key_file"`
        CAFile      string `yaml:"ca_file"`
    } `yaml:"ccp"`
    
    // Conjur settings (for Kubernetes-native secrets)
    Conjur struct {
        Enabled    bool   `yaml:"enabled"`
        URL        string `yaml:"url"`
        Account    string `yaml:"account"`
        AuthnID    string `yaml:"authn_id"`     // K8s authenticator ID
        SSLVerify  bool   `yaml:"ssl_verify"`
    } `yaml:"conjur"`
    
    // Safe mappings for credentials
    Safes struct {
        PostgreSQL   SafeMapping `yaml:"postgresql"`
        ClickHouse   SafeMapping `yaml:"clickhouse"`
        Redpanda     SafeMapping `yaml:"redpanda"`
        SMTP         SafeMapping `yaml:"smtp"`
        JWTSecret    SafeMapping `yaml:"jwt_secret"`
        PSK          SafeMapping `yaml:"psk"`
    } `yaml:"safes"`
    
    // Cache settings
    CacheTTL      time.Duration `yaml:"cache_ttl"`
    RefreshBefore time.Duration `yaml:"refresh_before"`
    
    // Fallback to Vault if CyberArk unavailable
    FallbackToVault bool `yaml:"fallback_to_vault"`
}

// SafeMapping defines which Safe and Object contain a credential
type SafeMapping struct {
    Safe   string `yaml:"safe"`
    Object string `yaml:"object"`
}

// AuditConfig holds audit/SIEM integration settings  
type AuditConfig struct {
    Enabled bool `yaml:"enabled"`
    
    // Syslog/SIEM output
    Syslog struct {
        Enabled  bool   `yaml:"enabled"`
        Host     string `yaml:"host"`      // e.g., "siem.company.com:514"
        Protocol string `yaml:"protocol"`  // "tcp" or "udp"
        Format   string `yaml:"format"`    // "cef", "leef", or "json"
    } `yaml:"syslog"`
    
    // OTEL logs export
    OTEL struct {
        Enabled  bool   `yaml:"enabled"`
        Endpoint string `yaml:"endpoint"`
    } `yaml:"otel"`
    
    // File output (for debugging/backup)
    File struct {
        Enabled bool   `yaml:"enabled"`
        Path    string `yaml:"path"`
    } `yaml:"file"`
    
    // Event filtering
    MinSeverity int      `yaml:"min_severity"`
    EventTypes  []string `yaml:"event_types"`  // Filter specific event types
    
    // Enrichment
    IncludeRequestBody  bool `yaml:"include_request_body"`
    IncludeResponseBody bool `yaml:"include_response_body"`
    MaxBodySize         int  `yaml:"max_body_size"`
}
```

### 4.5 Helm Values Schema Extension

```yaml
# Additional values.yaml entries for CyberArk integration

# -- CyberArk Integration --
# Enterprise-grade Privileged Access Management
cyberark:
  # Provider selection: "ccp" or "conjur"
  provider: "conjur"
  
  # Central Credential Provider (CCP) - for traditional deployments
  ccp:
    enabled: false
    host: "cyberark-ccp.company.com"
    port: 443
    appID: "avika-production"
    # Mount client certificates from secrets
    certSecret: "avika-cyberark-cert"
    certKey: "tls.crt"
    keyKey: "tls.key"
    caSecret: "avika-cyberark-ca"
    caKey: "ca.crt"
  
  # Conjur Enterprise - for Kubernetes-native secrets
  conjur:
    enabled: true
    url: "https://conjur.company.com"
    account: "company"
    authnId: "authn-k8s/production-cluster"
    sslVerify: true
    # ServiceAccount must be configured in Conjur policy
    serviceAccount: "avika-gateway"
  
  # Safe/Policy mappings
  safes:
    postgresql:
      safe: "Avika-Production"
      object: "PostgreSQL-App"
      # For Conjur: variable ID format
      variableId: "avika/production/database/postgresql"
    clickhouse:
      safe: "Avika-Production"
      object: "ClickHouse-App"
      variableId: "avika/production/database/clickhouse"
    redpanda:
      safe: "Avika-Production"
      object: "Redpanda-SASL"
      variableId: "avika/production/kafka/redpanda"
    smtp:
      safe: "Avika-Production"
      object: "SMTP-Credentials"
      variableId: "avika/production/smtp/credentials"
    jwtSecret:
      safe: "Avika-Production"
      object: "JWT-Signing-Key"
      variableId: "avika/production/auth/jwt-secret"
    psk:
      safe: "Avika-Production"
      object: "Agent-PSK"
      variableId: "avika/production/agent/psk"
  
  # Credential caching
  cacheTTL: "5m"
  refreshBefore: "1m"
  
  # Fallback configuration
  fallbackToVault: false

# -- Audit Logging / SIEM Integration --
audit:
  enabled: true
  
  # Syslog output for SIEM
  syslog:
    enabled: true
    host: "siem.company.com:514"
    protocol: "tcp"    # Use TCP for reliability
    format: "cef"      # CEF for Splunk/ArcSight, LEEF for QRadar
  
  # OpenTelemetry Logs
  otel:
    enabled: true
    endpoint: "otel-collector:4317"
  
  # Local file backup
  file:
    enabled: false
    path: "/var/log/avika/audit.log"
  
  # Event filtering
  minSeverity: 1        # 1=Info, 3=Low, 5=Medium, 7=High, 10=Critical
  eventTypes: []        # Empty = all events
  
  # Request/Response logging (be careful with PII)
  includeRequestBody: false
  includeResponseBody: false
  maxBodySize: 1024

# -- Privileged Session Manager (PSM) --
# For recording admin sessions to databases, kubectl, etc.
psm:
  enabled: false
  # PSM connection broker address
  connectionBroker: "psm.company.com"
  # Session recording storage
  recordingStorage: "s3://cyberark-recordings/avika"
  # Targets requiring PSM access
  targets:
    - name: "postgresql"
      type: "database"
      connectionComponent: "PSM-PostgreSQL"
    - name: "clickhouse"
      type: "database"
      connectionComponent: "PSM-ClickHouse"
    - name: "kubernetes"
      type: "ssh"
      connectionComponent: "PSM-kubectl"
```

---

## 5. SIEM Integration Strategy

### 5.1 Log Collection Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOG COLLECTION ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        AVIKA COMPONENTS                                   │   │
│  │                                                                           │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                   │   │
│  │  │   Gateway   │    │    Agent    │    │   Frontend  │                   │   │
│  │  │             │    │             │    │             │                   │   │
│  │  │ • Auth logs │    │ • Config    │    │ • Access    │                   │   │
│  │  │ • API logs  │    │   changes   │    │   logs      │                   │   │
│  │  │ • Admin ops │    │ • Commands  │    │ • Sessions  │                   │   │
│  │  │ • Errors    │    │ • Errors    │    │ • Errors    │                   │   │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                   │   │
│  │         │                  │                  │                           │   │
│  │         └──────────────────┴──────────────────┘                           │   │
│  │                            │                                              │   │
│  └────────────────────────────┼──────────────────────────────────────────────┘   │
│                               │                                                  │
│  ┌────────────────────────────▼──────────────────────────────────────────────┐   │
│  │                      OTEL COLLECTOR                                        │   │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Receivers:                                                            │ │   │
│  │  │  • otlp (gRPC/HTTP from apps)                                        │ │   │
│  │  │  • filelog (container logs)                                          │ │   │
│  │  │  • syslog (CyberArk events)                                          │ │   │
│  │  └──────────────────────────────────────────────────────────────────────┘ │   │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Processors:                                                           │ │   │
│  │  │  • attributes (add env, cluster, namespace)                          │ │   │
│  │  │  • filter (drop non-security events)                                 │ │   │
│  │  │  • transform (CEF/LEEF formatting)                                   │ │   │
│  │  │  • batch (for efficiency)                                            │ │   │
│  │  └──────────────────────────────────────────────────────────────────────┘ │   │
│  │  ┌──────────────────────────────────────────────────────────────────────┐ │   │
│  │  │ Exporters:                                                            │ │   │
│  │  │  • splunk_hec (Splunk HTTP Event Collector)                          │ │   │
│  │  │  • syslog (IBM QRadar, ArcSight)                                     │ │   │
│  │  │  • elasticsearch (ELK Stack)                                         │ │   │
│  │  │  • loki (Grafana Loki)                                               │ │   │
│  │  └──────────────────────────────────────────────────────────────────────┘ │   │
│  └────────────────────────────┬──────────────────────────────────────────────┘   │
│                               │                                                  │
│  ┌────────────────────────────▼──────────────────────────────────────────────┐   │
│  │                        SIEM PLATFORMS                                      │   │
│  │                                                                            │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │   │
│  │  │   Splunk    │    │   QRadar    │    │  ArcSight   │                    │   │
│  │  │             │    │             │    │             │                    │   │
│  │  │ Dashboards  │    │ Offenses    │    │ Active      │                    │   │
│  │  │ Alerts      │    │ Rules       │    │ Channels    │                    │   │
│  │  │ Reports     │    │ Reports     │    │ Reports     │                    │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘                    │   │
│  │                                                                            │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Event Types and Severity Mapping

| Event Type | Severity | SIEM Category | Compliance |
|------------|----------|---------------|------------|
| `authentication` | Info | Authentication | PCI-DSS 8.1 |
| `authentication_failure` | High | Authentication | PCI-DSS 8.1, SOX AC-7 |
| `authorization` | Medium | Authorization | PCI-DSS 7.1 |
| `credential_access` | Medium | Privileged Activity | PCI-DSS 8.5 |
| `configuration_change` | High | Change Management | PCI-DSS 10.5 |
| `agent_connect` | Low | Network Activity | SOC2 CC6.1 |
| `agent_disconnect` | Low | Network Activity | SOC2 CC6.1 |
| `data_access` | Medium | Data Access | PCI-DSS 10.2 |
| `admin_action` | High | Administrative | SOX AC-2 |
| `system_event` | Info | System | SOC2 CC7.2 |

### 5.3 OTEL Collector Configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  filelog:
    include:
      - /var/log/pods/avika_*/*/*.log
    operators:
      - type: json_parser
        parse_from: body
      - type: move
        from: attributes.log
        to: body

  syslog:
    tcp:
      listen_address: "0.0.0.0:54527"
    protocol: rfc5424

processors:
  batch:
    timeout: 10s
    send_batch_size: 1000

  attributes:
    actions:
      - key: environment
        value: production
        action: upsert
      - key: cluster
        value: avika-prod
        action: upsert

  filter/security:
    logs:
      include:
        match_type: regexp
        record_attributes:
          - key: event_type
            value: "authentication|authorization|credential_access|admin_action"

  transform/cef:
    log_statements:
      - context: log
        statements:
          - set(attributes["cef.version"], "0")
          - set(attributes["cef.device_vendor"], "Avika")
          - set(attributes["cef.device_product"], "NGINX-Manager")

exporters:
  # Splunk HEC
  splunk_hec:
    token: "${SPLUNK_HEC_TOKEN}"
    endpoint: "https://splunk.company.com:8088/services/collector"
    source: "avika"
    sourcetype: "avika:audit"
    index: "security"
    tls:
      insecure_skip_verify: false

  # Syslog for QRadar/ArcSight
  syslog:
    endpoint: "siem.company.com:514"
    protocol: tcp
    format: rfc5424

  # Debug logging
  logging:
    loglevel: info

service:
  pipelines:
    logs/security:
      receivers: [otlp, filelog, syslog]
      processors: [batch, attributes, filter/security]
      exporters: [splunk_hec, syslog]

    logs/all:
      receivers: [otlp, filelog]
      processors: [batch, attributes]
      exporters: [logging]
```

### 5.4 SIEM Correlation Rules

#### Splunk Correlation Searches

```spl
# Failed Authentication Brute Force Detection
index=security sourcetype="avika:audit" event_type="authentication_failure"
| stats count by source_ip, username, _time span=5m
| where count > 5
| eval alert_severity="high"
| eval alert_name="Brute Force Attack Detected"

# Privileged Credential Access Anomaly
index=security sourcetype="avika:audit" event_type="credential_access"
| stats count by username, cyberark_safe, cyberark_account, _time span=1h
| eventstats avg(count) as avg_count, stdev(count) as stdev_count by username
| where count > (avg_count + 2*stdev_count)
| eval alert_severity="high"
| eval alert_name="Unusual Credential Access Pattern"

# Configuration Change Outside Change Window
index=security sourcetype="avika:audit" event_type="configuration_change"
| eval hour=strftime(_time, "%H")
| where hour < 6 OR hour > 22 OR (hour >= 6 AND hour <= 22 AND NOT match(day, "Mon|Tue|Wed|Thu|Fri"))
| eval alert_severity="critical"
| eval alert_name="Off-Hours Configuration Change"

# Agent Disconnection Spike
index=security sourcetype="avika:audit" event_type="agent_disconnect"
| bucket _time span=5m
| stats count by _time
| eventstats avg(count) as avg_count
| where count > (avg_count * 3)
| eval alert_severity="medium"
| eval alert_name="Mass Agent Disconnection"
```

---

## 6. Compliance Mapping

### 6.1 PCI-DSS 4.0 Requirements

| Requirement | Description | CyberArk Control | Avika Implementation |
|-------------|-------------|------------------|----------------------|
| **8.2.1** | Unique user IDs | PAM user management | Individual admin accounts via PVWA |
| **8.2.3** | Password complexity | CPM password policies | Enforce via CyberArk platform policy |
| **8.3.1** | MFA for admin access | PAM MFA integration | PVWA/PSM with MFA |
| **8.3.6** | Session management | PSM session recording | All admin sessions recorded |
| **8.6.1** | Service account management | AAM/Conjur | Application credentials from Vault |
| **10.2.1** | Audit log generation | Audit Logger | CEF logs to SIEM |
| **10.3.1** | Log integrity | Immutable storage | Write-once SIEM storage |
| **10.4.1** | Log review | SIEM dashboards | Daily review process |
| **10.5.1** | Log retention | SIEM retention | 1 year minimum |

### 6.2 SOX Controls

| Control ID | Description | CyberArk Control | Implementation |
|------------|-------------|------------------|----------------|
| **AC-2** | Account Management | PAM lifecycle | User provisioning via PVWA |
| **AC-5** | Separation of Duties | Safe-based RBAC | Role-based Safe access |
| **AC-6** | Least Privilege | CPM + AAM | Just-in-time credentials |
| **AC-7** | Unsuccessful Logons | Audit + alerts | SIEM correlation rules |
| **AU-2** | Audit Events | Audit Logger | All privileged events logged |
| **AU-12** | Audit Generation | OTEL + Syslog | Automated log collection |
| **SC-8** | Transmission Confidentiality | mTLS | Encrypted communications |

### 6.3 SOC 2 Trust Service Criteria

| Criteria | Description | Implementation |
|----------|-------------|----------------|
| **CC6.1** | Logical Access | CyberArk PAM for all privileged access |
| **CC6.2** | Authentication | MFA via CyberArk |
| **CC6.3** | Authorization | RBAC via Safe structure |
| **CC7.1** | System Operations | PSM session recording |
| **CC7.2** | Change Management | Configuration change audit |
| **CC7.3** | Incident Response | SIEM alerting |

---

## 7. Security Controls Matrix

### 7.1 Credential Lifecycle Management

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL LIFECYCLE WITH CYBERARK                      │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│    │   Create    │───▶│   Store     │───▶│   Rotate    │                 │
│    │             │    │             │    │             │                 │
│    │ • Generated │    │ • CyberArk  │    │ • CPM       │                 │
│    │   by CPM    │    │   Vault     │    │   automatic │                 │
│    │ • Complex   │    │ • Encrypted │    │ • Policy    │                 │
│    │   policy    │    │ • Audited   │    │   driven    │                 │
│    └─────────────┘    └─────────────┘    └──────┬──────┘                 │
│                                                 │                         │
│    ┌─────────────────────────────────────────────┘                        │
│    │                                                                      │
│    ▼                                                                      │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│    │   Verify    │───▶│  Retrieve   │───▶│   Revoke    │                 │
│    │             │    │             │    │             │                 │
│    │ • CPM       │    │ • AAM/CCP   │    │ • On        │                 │
│    │   periodic  │    │ • Cached    │    │   incident  │                 │
│    │ • Alert on  │    │ • Audited   │    │ • End of    │                 │
│    │   failure   │    │ • Rotated   │    │   lifecycle │                 │
│    └─────────────┘    └─────────────┘    └─────────────┘                 │
│                                                                           │
│    Rotation Schedule:                                                     │
│    • Database credentials: Every 30 days                                  │
│    • Service accounts: Every 90 days                                      │
│    • API keys: Every 30 days                                             │
│    • Certificates: 30 days before expiry                                  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Access Control Model

| Layer | Control | Implementation |
|-------|---------|----------------|
| **Network** | Firewall rules | Only CyberArk can reach target systems |
| **Authentication** | MFA + Certificates | CyberArk handles all authentication |
| **Authorization** | RBAC via Safes | Users only access assigned Safes |
| **Session** | PSM recording | All sessions recorded and searchable |
| **Audit** | CEF logging | All events sent to SIEM |

### 7.3 Encryption Requirements

| Data State | Encryption | Key Management |
|------------|------------|----------------|
| At Rest (Vault) | AES-256 | CyberArk HSM |
| In Transit | TLS 1.3 | CyberArk certificates |
| In Memory | Secure memory | Application controls |
| Logs | Encrypted storage | SIEM encryption |

---

## 8. Operational Procedures

### 8.1 Break-Glass Procedure

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         BREAK-GLASS PROCEDURE                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  TRIGGER CONDITIONS:                                                       │
│  • CyberArk PAM unavailable for > 15 minutes                              │
│  • Critical production incident requiring immediate access                 │
│  • Security incident requiring forensic access                            │
│                                                                            │
│  PROCEDURE:                                                                │
│                                                                            │
│  1. INITIATION                                                             │
│     ├─ Requestor: Submit ServiceNow ticket (Priority 1)                   │
│     ├─ Approver: Security Manager + Operations Manager                    │
│     └─ Time limit: 4 hours maximum                                        │
│                                                                            │
│  2. CREDENTIAL RETRIEVAL                                                   │
│     ├─ Location: Sealed envelope in physical safe                         │
│     ├─ Contents: Emergency admin credentials (rotated monthly)            │
│     ├─ Two-person rule: Requires 2 authorized personnel                   │
│     └─ Log: Sign physical access log                                      │
│                                                                            │
│  3. ACCESS EXECUTION                                                       │
│     ├─ All actions must be screen-recorded                                │
│     ├─ Secondary observer required                                        │
│     ├─ Document all commands executed                                     │
│     └─ Time-box to minimum required                                       │
│                                                                            │
│  4. POST-INCIDENT                                                          │
│     ├─ Rotate all emergency credentials immediately                       │
│     ├─ Submit incident report within 24 hours                            │
│     ├─ Security review within 48 hours                                    │
│     └─ Update CyberArk with any credential changes                       │
│                                                                            │
│  AUDIT REQUIREMENTS:                                                       │
│  • All break-glass events trigger automatic SIEM alert                    │
│  • Monthly review of break-glass usage                                    │
│  • Quarterly test of break-glass procedure                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Credential Rotation Runbook

```markdown
# Credential Rotation Runbook

## Automatic Rotation (CPM)

CPM handles automatic rotation for:
- PostgreSQL credentials (every 30 days)
- ClickHouse credentials (every 30 days)
- SMTP credentials (every 90 days)

### Monitoring CPM Rotation

1. Check CPM dashboard for rotation status
2. Review failed rotations daily
3. Investigate any rotation failures within 4 hours

### Manual Rotation Triggers

Initiate manual rotation when:
- Credential compromise suspected
- Employee termination
- Security audit requirement

## Manual Rotation Procedure

### PostgreSQL Credential Rotation

1. Log into PVWA
2. Navigate to Safe: Avika-Production > Database-Credentials
3. Select PostgreSQL-App account
4. Click "Change" > "Change Password"
5. CPM will:
   - Generate new password per policy
   - Update PostgreSQL
   - Verify connectivity
   - Update Vault
6. Verify application reconnection in Gateway logs
7. Document in change management ticket

### Emergency Rotation

For suspected compromise:
1. Immediately rotate affected credential
2. Review audit logs for unauthorized access
3. Notify Security team
4. Document incident
```

### 8.3 Monitoring and Alerting

| Alert | Condition | Severity | Response SLA |
|-------|-----------|----------|--------------|
| PAM Unavailable | No heartbeat > 5 min | Critical | 15 min |
| Rotation Failed | CPM rotation error | High | 4 hours |
| Auth Brute Force | >5 failures in 5 min | High | 15 min |
| Unusual Cred Access | 2+ std dev from baseline | Medium | 24 hours |
| PSM Session > 4 hrs | Long-running session | Low | Next business day |
| Certificate Expiry | < 30 days to expiry | Medium | 7 days |

---

## 9. Risk Assessment

### 9.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Residual Risk |
|------|------------|--------|------------|---------------|
| CyberArk unavailability | Low | High | HA deployment, break-glass | Low |
| Credential compromise | Low | Critical | Rotation, monitoring | Low |
| Insider threat | Medium | High | PSM recording, least privilege | Medium |
| Configuration drift | Medium | Medium | IaC, audit logging | Low |
| Compliance violation | Low | High | Automated controls, audits | Low |

### 9.2 Dependencies and Single Points of Failure

| Component | SPOF Risk | Mitigation |
|-----------|-----------|------------|
| CyberArk Vault | High | HA cluster, DR site |
| Conjur | Medium | Multi-node deployment |
| SIEM | Medium | Local log buffer |
| Network connectivity | Medium | Redundant paths |

---

## Appendices

### Appendix A: CyberArk Safe Policy Template

```json
{
  "SafeName": "Avika-Production",
  "Description": "Production credentials for Avika NGINX Manager",
  "OLACEnabled": true,
  "ManagingCPM": "PasswordManager",
  "NumberOfDaysRetention": 30,
  "NumberOfVersionsRetention": 5,
  "AutoPurgeEnabled": true,
  "Members": [
    {
      "MemberName": "Avika-Admins",
      "MemberType": "Group",
      "Permissions": {
        "UseAccounts": true,
        "RetrieveAccounts": true,
        "ListAccounts": true,
        "ViewAudit": true,
        "ViewSafeMembers": true
      }
    },
    {
      "MemberName": "Avika-Gateway-SA",
      "MemberType": "User",
      "Permissions": {
        "UseAccounts": true,
        "RetrieveAccounts": true,
        "ListAccounts": true
      }
    },
    {
      "MemberName": "CPMServiceAccount",
      "MemberType": "User",
      "Permissions": {
        "UseAccounts": true,
        "RetrieveAccounts": true,
        "ListAccounts": true,
        "AddAccounts": true,
        "UpdateAccountContent": true,
        "InitiateCPMAccountManagementOperations": true
      }
    }
  ]
}
```

### Appendix B: Conjur Policy Template

```yaml
# avika-policy.yml
- !policy
  id: avika
  body:
    - !policy
      id: production
      body:
        # Database credentials
        - !policy
          id: database
          body:
            - &database-variables
              - !variable postgresql/username
              - !variable postgresql/password
              - !variable postgresql/host
              - !variable clickhouse/username
              - !variable clickhouse/password
              - !variable clickhouse/host
        
        # Kafka/Redpanda credentials
        - !policy
          id: kafka
          body:
            - !variable redpanda/username
            - !variable redpanda/password
            - !variable redpanda/brokers
        
        # Application secrets
        - !policy
          id: auth
          body:
            - !variable jwt-secret
            - !variable psk-key
        
        # SMTP credentials
        - !policy
          id: smtp
          body:
            - !variable username
            - !variable password

    # Kubernetes authenticator
    - !policy
      id: authn-k8s
      body:
        - !webservice
        
        - !policy
          id: apps
          body:
            - !layer
            
            # Gateway service account
            - !host
              id: avika/gateway
              annotations:
                authn-k8s/namespace: avika
                authn-k8s/service-account: avika-gateway
                authn-k8s/authentication-container-name: authenticator
            
            # Agent service account  
            - !host
              id: avika/agent
              annotations:
                authn-k8s/namespace: avika
                authn-k8s/service-account: avika-agent
            
            - !grant
              role: !layer
              members:
                - !host avika/gateway
                - !host avika/agent

    # Permissions
    - !permit
      role: !layer authn-k8s/apps
      privileges: [read, execute]
      resources:
        - !variable production/database/postgresql/username
        - !variable production/database/postgresql/password
        - !variable production/database/clickhouse/username
        - !variable production/database/clickhouse/password
        - !variable production/kafka/redpanda/username
        - !variable production/kafka/redpanda/password
        - !variable production/auth/jwt-secret
        - !variable production/auth/psk-key
```

### Appendix C: Compliance Checklist

- [ ] CyberArk Vault deployed with HA
- [ ] CPM configured for all target systems
- [ ] PSM deployed for database/admin access
- [ ] Conjur deployed for Kubernetes workloads
- [ ] All credentials migrated to CyberArk
- [ ] Rotation policies configured
- [ ] SIEM integration operational
- [ ] Audit logs flowing to SIEM
- [ ] Correlation rules implemented
- [ ] Dashboards created for security monitoring
- [ ] Alerting configured and tested
- [ ] Break-glass procedure documented
- [ ] Operational runbooks completed
- [ ] Training completed for operations team
- [ ] Compliance report generated
- [ ] Security assessment passed

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-17 | Platform Team | Initial release |

---

*This document is classified as CONFIDENTIAL and should be handled according to company information security policies.*
