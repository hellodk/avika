package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/avika-ai/avika/internal/common/vault"
	"gopkg.in/yaml.v3"
)

// Port constants - all application ports in range 5020-5050
const (
	DefaultGRPCPort    = 5020
	DefaultHTTPPort    = 5021
	DefaultMetricsPort = 5022
	DefaultAgentPort   = 5025 // Port agents expose for management
)

// ServerConfig holds server-related configuration
type ServerConfig struct {
	GRPCPort    int    `yaml:"grpc_port"`
	HTTPPort    int    `yaml:"http_port"`
	MetricsPort int    `yaml:"metrics_port"`
	Host        string `yaml:"host"`
	UpdatesDir  string `yaml:"updates_dir"` // Directory for serving agent updates

	// ExternalGRPCAddr is the host:port that agents should connect to for gRPC.
	// Set this when the gateway is behind a reverse proxy (HAProxy, nginx, etc.)
	// and the external gRPC port differs from the internal one.
	// Examples: "ncn112.com:443" (HAProxy), "ncn112.com:8443" (nginx).
	// If empty, the /updates/install endpoint falls back to Host:443.
	ExternalGRPCAddr string `yaml:"external_grpc_addr"`

	// Legacy fields for backward compatibility
	Port   string `yaml:"port"`
	WSPort string `yaml:"ws_port"`
}

// SecurityConfig holds security-related settings
type SecurityConfig struct {
	AllowedOrigins    []string      `yaml:"allowed_origins"`
	EnableRateLimit   bool          `yaml:"enable_rate_limit"`
	RateLimitRPS      int           `yaml:"rate_limit_rps"`
	RateLimitBurst    int           `yaml:"rate_limit_burst"`
	ShutdownTimeout   time.Duration `yaml:"shutdown_timeout"`
	EnableTLS         bool          `yaml:"enable_tls"`
	TLSCertFile       string        `yaml:"tls_cert_file"`
	TLSKeyFile        string        `yaml:"tls_key_file"`
	TLSCACertFile     string        `yaml:"tls_ca_cert_file"` // CA for verifying client certs (mTLS)
	RequireClientCert bool          `yaml:"require_client_cert"`
}

// DatabaseConfig holds PostgreSQL configuration
type DatabaseConfig struct {
	DSN             string        `yaml:"dsn"`
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
	MaxRetries      int           `yaml:"max_retries"`
	RetryInterval   time.Duration `yaml:"retry_interval"`
}

// ClickHouseConfig holds ClickHouse configuration
type ClickHouseConfig struct {
	Address         string        `yaml:"address"`
	Database        string        `yaml:"database"`
	Username        string        `yaml:"username"`
	Password        string        `yaml:"password"`
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
	BatchSize       int           `yaml:"batch_size"`
	FlushInterval   time.Duration `yaml:"flush_interval"`
}

// KafkaConfig holds Kafka/Redpanda configuration
type KafkaConfig struct {
	Brokers string `yaml:"brokers"`
	GroupID string `yaml:"group_id"`
}

// SMTPConfig holds email configuration
type SMTPConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	From     string `yaml:"from"`
	UseTLS   bool   `yaml:"use_tls"`
}

// AgentConfig holds agent-related gateway settings
type AgentConfig struct {
	MgmtPort         int           `yaml:"mgmt_port"`
	HeartbeatTimeout time.Duration `yaml:"heartbeat_timeout"`
	PruneInterval    time.Duration `yaml:"prune_interval"`
	RetentionPeriod  time.Duration `yaml:"retention_period"`
}

// SecretsProviderConfig holds configuration for the secrets management provider
type SecretsProviderConfig struct {
	Provider string `yaml:"provider"` // "vault", "cyberark", or "none"

	Vault struct {
		Address string `yaml:"address"`
		Token   string `yaml:"token"`
	} `yaml:"vault"`

	CyberArk struct {
		ApplianceURL string `yaml:"appliance_url"`
		Account      string `yaml:"account"`
		Token        string `yaml:"token"`
	} `yaml:"cyberark"`
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	Enabled           bool   `yaml:"enabled"`
	Username          string `yaml:"username"`
	PasswordHash      string `yaml:"password_hash"` // SHA-256 hash of password
	JWTSecret         string `yaml:"jwt_secret"`    // Auto-generated if empty
	TokenExpiry       string `yaml:"token_expiry"`  // e.g., "24h"
	CookieSecure      bool   `yaml:"cookie_secure"` // Set to true for HTTPS
	CookieDomain      string `yaml:"cookie_domain"`
	InitialSecretPath string `yaml:"initial_secret_path"` // File to write initial secret
}

// PSKConfig holds Pre-Shared Key authentication for agents
type PSKConfig struct {
	Enabled          bool   `yaml:"enabled"`
	Key              string `yaml:"key"`                // Pre-shared key (hex-encoded, 64 chars = 32 bytes)
	AllowAutoEnroll  bool   `yaml:"allow_auto_enroll"`  // Allow agents to auto-register
	TimestampWindow  string `yaml:"timestamp_window"`   // Clock skew tolerance, e.g., "5m"
	RequireHostMatch bool   `yaml:"require_host_match"` // Require hostname to match
}

// OIDCConfig holds OpenID Connect SSO configuration
type OIDCConfig struct {
	Enabled       bool              `yaml:"enabled"`
	ProviderURL   string            `yaml:"provider_url"` // e.g., https://accounts.google.com, https://login.microsoftonline.com/{tenant}/v2.0
	ClientID      string            `yaml:"client_id"`
	ClientSecret  string            `yaml:"client_secret"`
	RedirectURL   string            `yaml:"redirect_url"`   // Callback URL, e.g., https://avika.example.com/api/auth/oidc/callback
	Scopes        []string          `yaml:"scopes"`         // OIDC scopes, typically ["openid", "profile", "email", "groups"]
	GroupsClaim   string            `yaml:"groups_claim"`   // JWT claim containing groups, e.g., "groups" or "roles"
	GroupMapping  map[string]string `yaml:"group_mapping"`  // Map OIDC groups to Avika teams, e.g., {"admins": "platform-admins"}
	DefaultRole   string            `yaml:"default_role"`   // Role for SSO users without team mapping: "viewer" or "admin"
	AutoProvision bool              `yaml:"auto_provision"` // Auto-create users on first SSO login
}

// LDAPConfig holds LDAP Enterprise configuration
type LDAPConfig struct {
	Enabled       bool              `yaml:"enabled"`
	URL           string            `yaml:"url"`           // ldap:// or ldaps:// URL
	BindDN        string            `yaml:"bind_dn"`       // Service account DN
	BindPassword  string            `yaml:"bind_password"` // Service account password
	BaseDN        string            `yaml:"base_dn"`       // Base DN for users and groups
	UserFilter    string            `yaml:"user_filter"`   // e.g. (uid=%s) or (sAMAccountName=%s)
	GroupFilter   string            `yaml:"group_filter"`  // e.g. (memberUid=%s) or (member=%s)
	GroupMapping  map[string]string `yaml:"group_mapping"` // Map LDAP groups to Avika teams
	DefaultRole   string            `yaml:"default_role"`
	AutoProvision bool              `yaml:"auto_provision"`
}

// SAMLConfig holds SAML 2.0 Enterprise SSO configuration
type SAMLConfig struct {
	Enabled        bool              `yaml:"enabled"`
	IdPMetadataURL string            `yaml:"idp_metadata_url"` // URL to fetch IdP metadata
	EntityID       string            `yaml:"entity_id"`        // SP Entity ID (this gateway)
	RootURL        string            `yaml:"root_url"`         // Gateway Root URL for ACS and Metadata
	CertFile       string            `yaml:"cert_file"`        // SP Certificate
	KeyFile        string            `yaml:"key_file"`         // SP Private Key
	GroupsClaim    string            `yaml:"groups_claim"`     // Attribute containing groups
	GroupMapping   map[string]string `yaml:"group_mapping"`    // Map SAML groups to Avika teams
	DefaultRole    string            `yaml:"default_role"`
	AutoProvision  bool              `yaml:"auto_provision"`
}

// LLMConfig holds configuration for AI/LLM-powered features
type LLMConfig struct {
	Enabled          bool    `yaml:"enabled"`           // Enable AI-powered error analysis
	Provider         string  `yaml:"provider"`          // openai, anthropic, ollama, azure, mock, lmstudio, llamacpp, vllm, vllm_metal
	APIKey           string  `yaml:"api_key"`           // API key for cloud providers
	Model            string  `yaml:"model"`             // Model name (e.g., gpt-4-turbo, claude-3-sonnet)
	BaseURL          string  `yaml:"base_url"`          // Custom base URL (for Ollama or Azure)
	MaxTokens        int     `yaml:"max_tokens"`        // Max tokens per request
	Temperature      float32 `yaml:"temperature"`       // Temperature for generation (0.0-1.0)
	TimeoutSeconds   int     `yaml:"timeout_seconds"`   // Request timeout
	RetryAttempts    int     `yaml:"retry_attempts"`    // Number of retry attempts
	RateLimitRPM     int     `yaml:"rate_limit_rpm"`    // Rate limit (requests per minute)
	EnableCaching    bool    `yaml:"enable_caching"`    // Cache LLM responses
	CacheTTLMinutes  int     `yaml:"cache_ttl_minutes"` // Cache TTL in minutes
	FallbackProvider string  `yaml:"fallback_provider"` // Fallback provider if primary fails
}

// Config holds all gateway configuration
type Config struct {
	Server          ServerConfig          `yaml:"server"`
	Security        SecurityConfig        `yaml:"security"`
	Database        DatabaseConfig        `yaml:"database"`
	ClickHouse      ClickHouseConfig      `yaml:"clickhouse"`
	Kafka           KafkaConfig           `yaml:"kafka"`
	SMTP            SMTPConfig            `yaml:"smtp"`
	Agent           AgentConfig           `yaml:"agent"`
	SecretsProvider SecretsProviderConfig `yaml:"secrets_provider"`
	Auth            AuthConfig            `yaml:"auth"`
	PSK             PSKConfig             `yaml:"psk"`
	OIDC            OIDCConfig            `yaml:"oidc"`
	LDAP            LDAPConfig            `yaml:"ldap"`
	SAML            SAMLConfig            `yaml:"saml"`
	LLM             LLMConfig             `yaml:"llm"`
	// LogLevel is the minimum log level: debug, info, warn, error (default: info). Set via LOG_LEVEL env.
	LogLevel string `yaml:"log_level"`
	// LogFormat is output format: json or console. Set via LOG_FORMAT env.
	LogFormat string `yaml:"log_format"`
}

// GetGRPCAddress returns the formatted gRPC listen address
func (c *Config) GetGRPCAddress() string {
	// Prioritize GRPCPort (int) over legacy Port (string)
	if c.Server.GRPCPort > 0 {
		return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.GRPCPort)
	}
	// Fallback to legacy field if set
	if c.Server.Port != "" {
		if strings.HasPrefix(c.Server.Port, ":") {
			return c.Server.Port
		}
		return ":" + c.Server.Port
	}
	return fmt.Sprintf("%s:%d", c.Server.Host, DefaultGRPCPort)
}

// GetHTTPAddress returns the formatted HTTP listen address
func (c *Config) GetHTTPAddress() string {
	// Prioritize HTTPPort (int) over legacy WSPort (string)
	if c.Server.HTTPPort > 0 {
		return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.HTTPPort)
	}
	// Fallback to legacy field
	if c.Server.WSPort != "" {
		if strings.HasPrefix(c.Server.WSPort, ":") {
			return c.Server.WSPort
		}
		return ":" + c.Server.WSPort
	}
	return fmt.Sprintf("%s:%d", c.Server.Host, DefaultHTTPPort)
}

// GetMetricsAddress returns the formatted metrics listen address
func (c *Config) GetMetricsAddress() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.MetricsPort)
}

// LoadConfig loads configuration from file and environment
func LoadConfig(path string) (*Config, error) {
	cfg := defaultConfig()

	// Load from file if exists
	if path != "" {
		f, err := os.Open(path)
		if err == nil {
			defer f.Close()
			decoder := yaml.NewDecoder(f)
			if err := decoder.Decode(cfg); err != nil {
				return nil, fmt.Errorf("failed to decode config: %w", err)
			}
		}
	}

	// Override with environment variables
	loadEnvOverrides(cfg)

	// Load secrets from external provider if configured
	if cfg.SecretsProvider.Provider == "vault" || cfg.SecretsProvider.Provider == "cyberark" {
		if err := loadExternalSecrets(cfg); err != nil {
			log.Printf("Warning: Failed to load external secrets from %s: %v (using fallback config)", cfg.SecretsProvider.Provider, err)
		}
	}

	return cfg, nil
}

// loadExternalSecrets loads sensitive configuration from the configured external provider
func loadExternalSecrets(cfg *Config) error {
	if cfg.SecretsProvider.Provider == "vault" {
		vaultClient, err := vault.NewClient(vault.Config{
			Address: cfg.SecretsProvider.Vault.Address,
			Token:   cfg.SecretsProvider.Vault.Token,
		})
		if err != nil {
			return fmt.Errorf("failed to create Vault client: %w", err)
		}

		// Retry Vault connection up to 5 times with backoff
		maxRetries := 5
		for i := 0; i < maxRetries; i++ {
			if vaultClient.IsAvailable() {
				break
			}
			if i == maxRetries-1 {
				return fmt.Errorf("Vault is not available at %s after %d retries", cfg.SecretsProvider.Vault.Address, maxRetries)
			}
			log.Printf("Vault not ready, retrying in %d seconds... (attempt %d/%d)", i+1, i+1, maxRetries)
			time.Sleep(time.Duration(i+1) * time.Second)
		}

		log.Printf("Loading secrets from Vault at %s", cfg.SecretsProvider.Vault.Address)

		// Load PostgreSQL credentials
		if pgDSN, err := vaultClient.GetPostgresDSN(); err == nil {
			cfg.Database.DSN = pgDSN
			log.Println("Loaded PostgreSQL credentials from Vault")
		} else {
			log.Printf("Warning: Could not load PostgreSQL config from Vault: %v", err)
		}

		// Load ClickHouse credentials
		if chAddr, err := vaultClient.GetClickHouseAddr(); err == nil {
			cfg.ClickHouse.Address = chAddr
			log.Println("Loaded ClickHouse credentials from Vault")
		} else {
			log.Printf("Warning: Could not load ClickHouse config from Vault: %v", err)
		}

		// Load Redpanda/Kafka credentials
		if rpCfg, err := vaultClient.GetRedpandaConfig(); err == nil {
			cfg.Kafka.Brokers = rpCfg.Brokers
			log.Println("Loaded Redpanda credentials from Vault")
		} else {
			log.Printf("Warning: Could not load Redpanda config from Vault: %v", err)
		}

		return nil
	} else if cfg.SecretsProvider.Provider == "cyberark" {
		// Mock CyberArk implementation - in a real app, this would use the CyberArk Go SDK
		// Due to time constraints, this logs the intention but relies on the external-secrets operator
		// injecting standard kubernetes secrets, which means the config doesn't actually need to pull them directly.
		log.Printf("CyberArk provider configured. Relying on external-secrets operator injected kubernetes secrets in deployment.")
		return nil
	}

	return fmt.Errorf("unknown secret provider: %s", cfg.SecretsProvider.Provider)
}

// defaultConfig returns a Config with sensible defaults
func defaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort:    DefaultGRPCPort,
			HTTPPort:    DefaultHTTPPort,
			MetricsPort: DefaultMetricsPort,
			Host:        "",
			// Legacy fields left empty to avoid overriding newer int fields
			Port:   "",
			WSPort: "",
		},
		Security: SecurityConfig{
			AllowedOrigins:  []string{"http://localhost:5031", "http://localhost:3000", "http://127.0.0.1:5031"},
			EnableRateLimit: true,
			RateLimitRPS:    100,
			RateLimitBurst:  200,
			ShutdownTimeout: 30 * time.Second,
			EnableTLS:       false,
		},
		Database: DatabaseConfig{
			DSN:             "", // Set via DATABASE_URL or DB_DSN environment variable
			MaxOpenConns:    25,
			MaxIdleConns:    25,
			ConnMaxLifetime: 5 * time.Minute,
			MaxRetries:      3,
			RetryInterval:   2 * time.Second,
		},
		ClickHouse: ClickHouseConfig{
			Address:         "localhost:9000",
			Database:        "nginx_analytics",
			Username:        "default",
			Password:        "", // Set via CLICKHOUSE_PASSWORD env var or Kubernetes secret
			MaxOpenConns:    50,
			MaxIdleConns:    50,
			ConnMaxLifetime: 30 * time.Minute,
			BatchSize:       10000,
			FlushInterval:   time.Second,
		},
		Kafka: KafkaConfig{
			Brokers: "localhost:9092",
			GroupID: "gateway-consumer",
		},
		SMTP: SMTPConfig{
			Host:   "smtp.gmail.com",
			Port:   587,
			From:   "alerts@avika.local",
			UseTLS: true,
		},
		Agent: AgentConfig{
			MgmtPort:         DefaultAgentPort,
			HeartbeatTimeout: 30 * time.Second,
			PruneInterval:    12 * time.Hour,
			RetentionPeriod:  10 * 24 * time.Hour,
		},
		SecretsProvider: SecretsProviderConfig{
			Provider: "none",
			Vault: struct {
				Address string `yaml:"address"`
				Token   string `yaml:"token"`
			}{
				Address: "http://vault.utilities.svc.cluster.local:8200",
				Token:   "",
			},
			CyberArk: struct {
				ApplianceURL string `yaml:"appliance_url"`
				Account      string `yaml:"account"`
				Token        string `yaml:"token"`
			}{
				ApplianceURL: "https://conjur.utilities.svc.cluster.local",
				Account:      "default",
				Token:        "",
			},
		},
		Auth: AuthConfig{
			Enabled:           false,
			Username:          "admin",
			PasswordHash:      "", // Must be set if auth is enabled
			JWTSecret:         "", // Auto-generated if empty
			TokenExpiry:       "24h",
			CookieSecure:      false,
			CookieDomain:      "",
			InitialSecretPath: "/var/lib/avika/initial-admin-password",
		},
		PSK: PSKConfig{
			Enabled:          false,
			Key:              "", // Auto-generated if empty and enabled
			AllowAutoEnroll:  true,
			TimestampWindow:  "5m",
			RequireHostMatch: false,
		},
		OIDC: OIDCConfig{
			Enabled:       false,
			ProviderURL:   "",
			ClientID:      "",
			ClientSecret:  "",
			RedirectURL:   "",
			Scopes:        []string{"openid", "profile", "email", "groups"},
			GroupsClaim:   "groups",
			GroupMapping:  make(map[string]string),
			DefaultRole:   "viewer",
			AutoProvision: true,
		},
		LDAP: LDAPConfig{
			Enabled:       false,
			URL:           "",
			BindDN:        "",
			BindPassword:  "",
			BaseDN:        "",
			UserFilter:    "(uid=%s)",
			GroupFilter:   "(memberUid=%s)",
			GroupMapping:  make(map[string]string),
			DefaultRole:   "viewer",
			AutoProvision: true,
		},
		SAML: SAMLConfig{
			Enabled:        false,
			IdPMetadataURL: "",
			EntityID:       "",
			RootURL:        "",
			CertFile:       "",
			KeyFile:        "",
			GroupsClaim:    "groups",
			GroupMapping:   make(map[string]string),
			DefaultRole:    "viewer",
			AutoProvision:  true,
		},
		LLM: LLMConfig{
			Enabled:          false,
			Provider:         "openai",
			APIKey:           "",
			Model:            "gpt-4-turbo",
			BaseURL:          "",
			MaxTokens:        4096,
			Temperature:      0.3,
			TimeoutSeconds:   60,
			RetryAttempts:    3,
			RateLimitRPM:     60,
			EnableCaching:    true,
			CacheTTLMinutes:  30,
			FallbackProvider: "",
		},
		LogLevel:  "info",
		LogFormat: "json",
	}
}

// loadEnvOverrides applies environment variable overrides
func loadEnvOverrides(cfg *Config) {
	// Logging (dynamic level via LOG_LEVEL, format via LOG_FORMAT)
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		cfg.LogFormat = v
	}
	// Server
	if v := os.Getenv("GATEWAY_GRPC_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Server.GRPCPort = port
			cfg.Server.Port = fmt.Sprintf(":%d", port)
		}
	}
	if v := os.Getenv("GATEWAY_HTTP_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Server.HTTPPort = port
			cfg.Server.WSPort = fmt.Sprintf(":%d", port)
		}
	}
	if v := os.Getenv("GATEWAY_METRICS_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Server.MetricsPort = port
		}
	}
	// Legacy env vars for backward compatibility
	if v := os.Getenv("GATEWAY_PORT"); v != "" {
		cfg.Server.Port = v
	}
	if v := os.Getenv("GATEWAY_WS_PORT"); v != "" {
		cfg.Server.WSPort = v
	}
	if v := os.Getenv("GATEWAY_UPDATES_DIR"); v != "" {
		cfg.Server.UpdatesDir = v
	}

	// Security
	if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
		cfg.Security.AllowedOrigins = strings.Split(v, ",")
	}
	if v := os.Getenv("ENABLE_RATE_LIMIT"); v != "" {
		cfg.Security.EnableRateLimit = v == "true" || v == "1"
	}
	if v := os.Getenv("RATE_LIMIT_RPS"); v != "" {
		if rps, err := strconv.Atoi(v); err == nil {
			cfg.Security.RateLimitRPS = rps
		}
	}
	if v := os.Getenv("ENABLE_TLS"); v != "" {
		cfg.Security.EnableTLS = v == "true" || v == "1"
	}
	if v := os.Getenv("TLS_CERT_FILE"); v != "" {
		cfg.Security.TLSCertFile = v
	}
	if v := os.Getenv("TLS_KEY_FILE"); v != "" {
		cfg.Security.TLSKeyFile = v
	}
	if v := os.Getenv("TLS_CA_CERT_FILE"); v != "" {
		cfg.Security.TLSCACertFile = v
	}
	if v := os.Getenv("REQUIRE_CLIENT_CERT"); v != "" {
		cfg.Security.RequireClientCert = v == "true" || v == "1"
	}

	// Database
	if v := os.Getenv("DB_DSN"); v != "" {
		cfg.Database.DSN = v
	}
	if v := os.Getenv("DB_MAX_CONNS"); v != "" {
		if conns, err := strconv.Atoi(v); err == nil {
			cfg.Database.MaxOpenConns = conns
			cfg.Database.MaxIdleConns = conns
		}
	}

	// ClickHouse
	if v := os.Getenv("CLICKHOUSE_ADDR"); v != "" {
		cfg.ClickHouse.Address = v
	}
	if v := os.Getenv("CLICKHOUSE_DATABASE"); v != "" {
		cfg.ClickHouse.Database = v
	}
	if v := os.Getenv("CLICKHOUSE_USER"); v != "" {
		cfg.ClickHouse.Username = v
	}
	if v := os.Getenv("CLICKHOUSE_PASSWORD"); v != "" {
		cfg.ClickHouse.Password = v
	}
	if v := os.Getenv("CLICKHOUSE_BATCH_SIZE"); v != "" {
		if size, err := strconv.Atoi(v); err == nil {
			cfg.ClickHouse.BatchSize = size
		}
	}

	// Kafka
	if v := os.Getenv("KAFKA_BROKERS"); v != "" {
		cfg.Kafka.Brokers = v
	}
	if v := os.Getenv("KAFKA_GROUP_ID"); v != "" {
		cfg.Kafka.GroupID = v
	}

	// SMTP
	if v := os.Getenv("SMTP_HOST"); v != "" {
		cfg.SMTP.Host = v
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.SMTP.Port = port
		}
	}
	if v := os.Getenv("SMTP_USER"); v != "" {
		cfg.SMTP.Username = v
	}
	if v := os.Getenv("SMTP_PASS"); v != "" {
		cfg.SMTP.Password = v
	}
	if v := os.Getenv("SMTP_FROM"); v != "" {
		cfg.SMTP.From = v
	}

	// Agent
	if v := os.Getenv("AGENT_MGMT_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Agent.MgmtPort = port
		}
	}

	// Secrets Provider (Replaces Vault toggle)
	if v := os.Getenv("SECRETS_PROVIDER"); v != "" {
		cfg.SecretsProvider.Provider = v
	}
	if v := os.Getenv("VAULT_ADDR"); v != "" {
		cfg.SecretsProvider.Vault.Address = v
	}
	if v := os.Getenv("VAULT_TOKEN"); v != "" {
		cfg.SecretsProvider.Vault.Token = v
	}
	if v := os.Getenv("CYBERARK_URL"); v != "" {
		cfg.SecretsProvider.CyberArk.ApplianceURL = v
	}
	if v := os.Getenv("CYBERARK_ACCOUNT"); v != "" {
		cfg.SecretsProvider.CyberArk.Account = v
	}
	if v := os.Getenv("CYBERARK_TOKEN"); v != "" {
		cfg.SecretsProvider.CyberArk.Token = v
	}

	// Auth
	if v := os.Getenv("AUTH_ENABLED"); v != "" {
		cfg.Auth.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("AUTH_USERNAME"); v != "" {
		cfg.Auth.Username = v
	}
	if v := os.Getenv("AUTH_PASSWORD_HASH"); v != "" {
		cfg.Auth.PasswordHash = v
	}
	if v := os.Getenv("AUTH_JWT_SECRET"); v != "" {
		cfg.Auth.JWTSecret = v
	}
	if v := os.Getenv("AUTH_TOKEN_EXPIRY"); v != "" {
		cfg.Auth.TokenExpiry = v
	}
	if v := os.Getenv("AUTH_COOKIE_SECURE"); v != "" {
		cfg.Auth.CookieSecure = v == "true" || v == "1"
	}
	if v := os.Getenv("AUTH_COOKIE_DOMAIN"); v != "" {
		cfg.Auth.CookieDomain = v
	}
	if v := os.Getenv("AUTH_INITIAL_SECRET_PATH"); v != "" {
		cfg.Auth.InitialSecretPath = v
	}

	// PSK (Pre-Shared Key for Agent Authentication)
	if v := os.Getenv("PSK_ENABLED"); v != "" {
		cfg.PSK.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("PSK_KEY"); v != "" {
		cfg.PSK.Key = v
	}
	if v := os.Getenv("PSK_ALLOW_AUTO_ENROLL"); v != "" {
		cfg.PSK.AllowAutoEnroll = v == "true" || v == "1"
	}
	if v := os.Getenv("PSK_TIMESTAMP_WINDOW"); v != "" {
		cfg.PSK.TimestampWindow = v
	}
	if v := os.Getenv("PSK_REQUIRE_HOST_MATCH"); v != "" {
		cfg.PSK.RequireHostMatch = v == "true" || v == "1"
	}

	// OIDC (OpenID Connect SSO)
	if v := os.Getenv("OIDC_ENABLED"); v != "" {
		cfg.OIDC.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("OIDC_PROVIDER_URL"); v != "" {
		cfg.OIDC.ProviderURL = v
	}
	if v := os.Getenv("OIDC_CLIENT_ID"); v != "" {
		cfg.OIDC.ClientID = v
	}
	if v := os.Getenv("OIDC_CLIENT_SECRET"); v != "" {
		cfg.OIDC.ClientSecret = v
	}
	if v := os.Getenv("OIDC_REDIRECT_URL"); v != "" {
		cfg.OIDC.RedirectURL = v
	}
	if v := os.Getenv("OIDC_SCOPES"); v != "" {
		cfg.OIDC.Scopes = strings.Split(v, ",")
	}
	if v := os.Getenv("OIDC_GROUPS_CLAIM"); v != "" {
		cfg.OIDC.GroupsClaim = v
	}
	if v := os.Getenv("OIDC_DEFAULT_ROLE"); v != "" {
		cfg.OIDC.DefaultRole = v
	}
	if v := os.Getenv("OIDC_AUTO_PROVISION"); v != "" {
		cfg.OIDC.AutoProvision = v == "true" || v == "1"
	}
	if v := os.Getenv("OIDC_GROUP_MAPPING"); v != "" {
		var mapping map[string]string
		if err := json.Unmarshal([]byte(v), &mapping); err == nil {
			cfg.OIDC.GroupMapping = mapping
		}
	}

	// LDAP (Enterprise Active Directory / OpenLDAP)
	if v := os.Getenv("LDAP_ENABLED"); v != "" {
		cfg.LDAP.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("LDAP_URL"); v != "" {
		cfg.LDAP.URL = v
	}
	if v := os.Getenv("LDAP_BIND_DN"); v != "" {
		cfg.LDAP.BindDN = v
	}
	if v := os.Getenv("LDAP_BIND_PASSWORD"); v != "" {
		cfg.LDAP.BindPassword = v
	}
	if v := os.Getenv("LDAP_BASE_DN"); v != "" {
		cfg.LDAP.BaseDN = v
	}
	if v := os.Getenv("LDAP_USER_FILTER"); v != "" {
		cfg.LDAP.UserFilter = v
	}
	if v := os.Getenv("LDAP_GROUP_FILTER"); v != "" {
		cfg.LDAP.GroupFilter = v
	}
	if v := os.Getenv("LDAP_DEFAULT_ROLE"); v != "" {
		cfg.LDAP.DefaultRole = v
	}
	if v := os.Getenv("LDAP_AUTO_PROVISION"); v != "" {
		cfg.LDAP.AutoProvision = v == "true" || v == "1"
	}
	if v := os.Getenv("LDAP_GROUP_MAPPING"); v != "" {
		var mapping map[string]string
		if err := json.Unmarshal([]byte(v), &mapping); err == nil {
			cfg.LDAP.GroupMapping = mapping
		}
	}

	// SAML 2.0 (Enterprise SSO)
	if v := os.Getenv("SAML_ENABLED"); v != "" {
		cfg.SAML.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("SAML_IDP_METADATA_URL"); v != "" {
		cfg.SAML.IdPMetadataURL = v
	}
	if v := os.Getenv("SAML_ENTITY_ID"); v != "" {
		cfg.SAML.EntityID = v
	}
	if v := os.Getenv("SAML_ROOT_URL"); v != "" {
		cfg.SAML.RootURL = v
	}
	if v := os.Getenv("SAML_CERT_FILE"); v != "" {
		cfg.SAML.CertFile = v
	}
	if v := os.Getenv("SAML_KEY_FILE"); v != "" {
		cfg.SAML.KeyFile = v
	}
	if v := os.Getenv("SAML_GROUPS_CLAIM"); v != "" {
		cfg.SAML.GroupsClaim = v
	}
	if v := os.Getenv("SAML_DEFAULT_ROLE"); v != "" {
		cfg.SAML.DefaultRole = v
	}
	if v := os.Getenv("SAML_AUTO_PROVISION"); v != "" {
		cfg.SAML.AutoProvision = v == "true" || v == "1"
	}
	if v := os.Getenv("SAML_GROUP_MAPPING"); v != "" {
		var mapping map[string]string
		if err := json.Unmarshal([]byte(v), &mapping); err == nil {
			cfg.SAML.GroupMapping = mapping
		}
	}

	// LLM (AI-powered Error Analysis)
	if v := os.Getenv("LLM_ENABLED"); v != "" {
		cfg.LLM.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("LLM_PROVIDER"); v != "" {
		cfg.LLM.Provider = v
	}
	if v := os.Getenv("LLM_API_KEY"); v != "" {
		cfg.LLM.APIKey = v
	}
	if v := os.Getenv("LLM_MODEL"); v != "" {
		cfg.LLM.Model = v
	}
	if v := os.Getenv("LLM_BASE_URL"); v != "" {
		cfg.LLM.BaseURL = v
	}
	if v := os.Getenv("LLM_MAX_TOKENS"); v != "" {
		if tokens, err := strconv.Atoi(v); err == nil {
			cfg.LLM.MaxTokens = tokens
		}
	}
	if v := os.Getenv("LLM_TEMPERATURE"); v != "" {
		if temp, err := strconv.ParseFloat(v, 32); err == nil {
			cfg.LLM.Temperature = float32(temp)
		}
	}
	if v := os.Getenv("LLM_TIMEOUT_SECONDS"); v != "" {
		if timeout, err := strconv.Atoi(v); err == nil {
			cfg.LLM.TimeoutSeconds = timeout
		}
	}
	if v := os.Getenv("LLM_RETRY_ATTEMPTS"); v != "" {
		if retries, err := strconv.Atoi(v); err == nil {
			cfg.LLM.RetryAttempts = retries
		}
	}
	if v := os.Getenv("LLM_RATE_LIMIT_RPM"); v != "" {
		if rpm, err := strconv.Atoi(v); err == nil {
			cfg.LLM.RateLimitRPM = rpm
		}
	}
	if v := os.Getenv("LLM_ENABLE_CACHING"); v != "" {
		cfg.LLM.EnableCaching = v == "true" || v == "1"
	}
	if v := os.Getenv("LLM_CACHE_TTL_MINUTES"); v != "" {
		if ttl, err := strconv.Atoi(v); err == nil {
			cfg.LLM.CacheTTLMinutes = ttl
		}
	}
	if v := os.Getenv("LLM_FALLBACK_PROVIDER"); v != "" {
		cfg.LLM.FallbackProvider = v
	}
}
