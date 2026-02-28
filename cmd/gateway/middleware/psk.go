// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// PSKConfig holds Pre-Shared Key authentication configuration.
type PSKConfig struct {
	Enabled          bool          `json:"enabled"`
	Key              string        `json:"key"`                // The pre-shared key (hex-encoded)
	AllowAutoEnroll  bool          `json:"allow_auto_enroll"`  // Allow agents to auto-register on first connect
	TimestampWindow  time.Duration `json:"timestamp_window"`   // Allowed clock skew (default: 5 minutes)
	RequireHostMatch bool          `json:"require_host_match"` // Require agent hostname to match registered host
}

// DefaultPSKConfig returns default PSK configuration.
func DefaultPSKConfig() PSKConfig {
	return PSKConfig{
		Enabled:          false,
		Key:              "",
		AllowAutoEnroll:  true,
		TimestampWindow:  5 * time.Minute,
		RequireHostMatch: false,
	}
}

// PSKManager handles Pre-Shared Key authentication for agents.
type PSKManager struct {
	config           PSKConfig
	mu               sync.RWMutex
	registeredAgents map[string]*RegisteredAgent // agentID -> agent info
}

// RegisteredAgent represents an agent registered with the gateway.
type RegisteredAgent struct {
	AgentID      string    `json:"agent_id"`
	Hostname     string    `json:"hostname"`
	IPAddress    string    `json:"ip_address"`
	RegisteredAt time.Time `json:"registered_at"`
	LastSeen     time.Time `json:"last_seen"`
	Approved     bool      `json:"approved"` // For manual approval mode
}

// NewPSKManager creates a new PSK manager.
func NewPSKManager(config PSKConfig) *PSKManager {
	// Generate PSK if enabled but not provided
	if config.Enabled && config.Key == "" {
		key := make([]byte, 32)
		rand.Read(key)
		config.Key = hex.EncodeToString(key)

		log.Println("")
		log.Println("*************************************************************")
		log.Println("Agent PSK Authentication Enabled")
		log.Println("")
		log.Println("A Pre-Shared Key has been auto-generated for agent authentication.")
		log.Println("Configure this key on all agents that need to connect:")
		log.Println("")
		log.Printf("PSK: %s", config.Key)
		log.Println("")
		log.Println("Add to agent config (avika-agent.conf):")
		log.Printf("PSK=\"%s\"", config.Key)
		log.Println("")
		log.Println("*************************************************************")
		log.Println("")
	}

	return &PSKManager{
		config:           config,
		registeredAgents: make(map[string]*RegisteredAgent),
	}
}

// GetPSK returns the current PSK (for display/config purposes).
func (pm *PSKManager) GetPSK() string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.config.Key
}

// IsEnabled returns whether PSK authentication is enabled.
func (pm *PSKManager) IsEnabled() bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.config.Enabled
}

// ValidateAgentAuth validates an agent's authentication credentials.
// Returns (agentID, error) - agentID is extracted from the auth header.
func (pm *PSKManager) ValidateAgentAuth(agentID, hostname, signature, timestamp string) error {
	if !pm.config.Enabled {
		return nil // PSK disabled, allow all
	}

	if signature == "" || timestamp == "" {
		return fmt.Errorf("missing authentication credentials (signature or timestamp)")
	}

	// Parse and validate timestamp
	ts, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return fmt.Errorf("invalid timestamp format: %w", err)
	}

	// Check timestamp is within acceptable window (prevents replay attacks)
	now := time.Now()
	if now.Sub(ts) > pm.config.TimestampWindow || ts.Sub(now) > pm.config.TimestampWindow {
		return fmt.Errorf("timestamp outside acceptable window (clock skew > %v)", pm.config.TimestampWindow)
	}

	// Verify HMAC signature
	// Signature format: HMAC-SHA256(PSK, "agentID:hostname:timestamp")
	expectedSig := pm.computeSignature(agentID, hostname, timestamp)
	if !hmac.Equal([]byte(signature), []byte(expectedSig)) {
		return fmt.Errorf("invalid signature - PSK mismatch")
	}

	// Check if agent is registered
	pm.mu.Lock()
	defer pm.mu.Unlock()

	agent, exists := pm.registeredAgents[agentID]
	if !exists {
		if pm.config.AllowAutoEnroll {
			// Auto-register the agent
			pm.registeredAgents[agentID] = &RegisteredAgent{
				AgentID:      agentID,
				Hostname:     hostname,
				RegisteredAt: now,
				LastSeen:     now,
				Approved:     true, // Auto-approved in auto-enroll mode
			}
			log.Printf("Auto-enrolled new agent: %s (hostname: %s)", agentID, hostname)
		} else {
			return fmt.Errorf("agent not registered and auto-enrollment is disabled")
		}
	} else {
		// Update last seen
		agent.LastSeen = now

		// Optionally verify hostname matches
		if pm.config.RequireHostMatch && agent.Hostname != hostname {
			return fmt.Errorf("hostname mismatch: expected %s, got %s", agent.Hostname, hostname)
		}

		// Check if approved (for manual approval mode)
		if !agent.Approved {
			return fmt.Errorf("agent registered but pending approval")
		}
	}

	return nil
}

// computeSignature generates the expected HMAC signature.
func (pm *PSKManager) computeSignature(agentID, hostname, timestamp string) string {
	key, _ := hex.DecodeString(pm.config.Key)
	message := fmt.Sprintf("%s:%s:%s", agentID, hostname, timestamp)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// RegisterAgent manually registers an agent (for non-auto-enroll mode).
func (pm *PSKManager) RegisterAgent(agentID, hostname string, approved bool) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.registeredAgents[agentID] = &RegisteredAgent{
		AgentID:      agentID,
		Hostname:     hostname,
		RegisteredAt: time.Now(),
		LastSeen:     time.Now(),
		Approved:     approved,
	}

	log.Printf("Registered agent: %s (hostname: %s, approved: %v)", agentID, hostname, approved)
}

// ApproveAgent approves a pending agent.
func (pm *PSKManager) ApproveAgent(agentID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	agent, exists := pm.registeredAgents[agentID]
	if !exists {
		return fmt.Errorf("agent not found: %s", agentID)
	}

	agent.Approved = true
	log.Printf("Approved agent: %s", agentID)
	return nil
}

// RevokeAgent removes an agent's registration.
func (pm *PSKManager) RevokeAgent(agentID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if _, exists := pm.registeredAgents[agentID]; !exists {
		return fmt.Errorf("agent not found: %s", agentID)
	}

	delete(pm.registeredAgents, agentID)
	log.Printf("Revoked agent: %s", agentID)
	return nil
}

// ListAgents returns all registered agents.
func (pm *PSKManager) ListAgents() []*RegisteredAgent {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	agents := make([]*RegisteredAgent, 0, len(pm.registeredAgents))
	for _, agent := range pm.registeredAgents {
		agents = append(agents, agent)
	}
	return agents
}

// PSK Metadata keys for gRPC
const (
	PSKAgentIDKey    = "x-avika-agent-id"
	PSKHostnameKey   = "x-avika-hostname"
	PSKSignatureKey  = "x-avika-signature"
	PSKTimestampKey  = "x-avika-timestamp"
)

// Context key for PSK authentication status
type pskAuthKey struct{}

// PSKAuthStatus stores PSK authentication status in context
type PSKAuthStatus struct {
	Authenticated bool
	AgentID       string
}

// GetPSKAuthStatus retrieves PSK auth status from context
func GetPSKAuthStatus(ctx context.Context) *PSKAuthStatus {
	if val := ctx.Value(pskAuthKey{}); val != nil {
		return val.(*PSKAuthStatus)
	}
	return nil
}

// UnaryPSKInterceptor creates a gRPC unary interceptor for PSK authentication.
func (pm *PSKManager) UnaryPSKInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		if !pm.IsEnabled() {
			return handler(ctx, req)
		}

		// Extract metadata
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		agentID := getMetadataValue(md, PSKAgentIDKey)
		hostname := getMetadataValue(md, PSKHostnameKey)
		signature := getMetadataValue(md, PSKSignatureKey)
		timestamp := getMetadataValue(md, PSKTimestampKey)

		if err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp); err != nil {
			log.Printf("PSK auth failed for agent %s: %v", agentID, err)
			return nil, status.Errorf(codes.Unauthenticated, "authentication failed: %v", err)
		}

		return handler(ctx, req)
	}
}

// wrappedServerStream wraps gRPC ServerStream to inject context values
type wrappedServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (w *wrappedServerStream) Context() context.Context {
	return w.ctx
}

// StreamPSKInterceptor creates a gRPC stream interceptor for PSK authentication.
func (pm *PSKManager) StreamPSKInterceptor() grpc.StreamServerInterceptor {
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		if !pm.IsEnabled() {
			// PSK disabled - pass through without authentication marker
			return handler(srv, ss)
		}

		// Extract metadata
		md, ok := metadata.FromIncomingContext(ss.Context())
		if !ok {
			return status.Error(codes.Unauthenticated, "missing metadata")
		}

		agentID := getMetadataValue(md, PSKAgentIDKey)
		hostname := getMetadataValue(md, PSKHostnameKey)
		signature := getMetadataValue(md, PSKSignatureKey)
		timestamp := getMetadataValue(md, PSKTimestampKey)

		if err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp); err != nil {
			log.Printf("PSK auth failed for agent %s: %v", agentID, err)
			return status.Errorf(codes.Unauthenticated, "authentication failed: %v", err)
		}

		// Store auth status in context for the handler to access
		newCtx := context.WithValue(ss.Context(), pskAuthKey{}, &PSKAuthStatus{
			Authenticated: true,
			AgentID:       agentID,
		})

		return handler(srv, &wrappedServerStream{ServerStream: ss, ctx: newCtx})
	}
}

// getMetadataValue safely extracts a value from gRPC metadata.
func getMetadataValue(md metadata.MD, key string) string {
	values := md.Get(key)
	if len(values) > 0 {
		return values[0]
	}
	// Try lowercase (gRPC normalizes to lowercase)
	values = md.Get(strings.ToLower(key))
	if len(values) > 0 {
		return values[0]
	}
	return ""
}

// ComputeAgentSignature is a helper function for agents to compute their auth signature.
// This would be used in the agent code to sign requests.
func ComputeAgentSignature(psk, agentID, hostname string) (signature, timestamp string) {
	ts := time.Now().UTC().Format(time.RFC3339)
	key, _ := hex.DecodeString(psk)
	message := fmt.Sprintf("%s:%s:%s", agentID, hostname, ts)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil)), ts
}
