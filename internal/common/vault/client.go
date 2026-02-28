package vault

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client provides access to HashiCorp Vault secrets
type Client struct {
	addr   string
	token  string
	client *http.Client
}

// Config holds Vault client configuration
type Config struct {
	Address string
	Token   string
	Timeout time.Duration
}

// SecretData represents the data portion of a Vault KV v2 secret
type SecretData map[string]interface{}

// VaultResponse represents the response from Vault KV v2 API
type VaultResponse struct {
	RequestID     string `json:"request_id"`
	LeaseID       string `json:"lease_id"`
	Renewable     bool   `json:"renewable"`
	LeaseDuration int    `json:"lease_duration"`
	Data          struct {
		Data     SecretData `json:"data"`
		Metadata struct {
			CreatedTime  string `json:"created_time"`
			Version      int    `json:"version"`
			Destroyed    bool   `json:"destroyed"`
			DeletionTime string `json:"deletion_time"`
		} `json:"metadata"`
	} `json:"data"`
	Errors []string `json:"errors"`
}

// NewClient creates a new Vault client
func NewClient(cfg Config) (*Client, error) {
	if cfg.Address == "" {
		cfg.Address = os.Getenv("VAULT_ADDR")
		if cfg.Address == "" {
			cfg.Address = "http://vault.utilities.svc.cluster.local:8200"
		}
	}

	if cfg.Token == "" {
		cfg.Token = os.Getenv("VAULT_TOKEN")
		if cfg.Token == "" {
			// Try to read from file (for Kubernetes SA auth)
			if tokenBytes, err := os.ReadFile("/var/run/secrets/vault/token"); err == nil {
				cfg.Token = string(tokenBytes)
			}
		}
	}

	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}

	return &Client{
		addr:  cfg.Address,
		token: cfg.Token,
		client: &http.Client{
			Timeout: cfg.Timeout,
		},
	}, nil
}

// NewClientFromEnv creates a Vault client from environment variables
func NewClientFromEnv() (*Client, error) {
	return NewClient(Config{})
}

// GetSecret retrieves a secret from Vault KV v2
// path should be like "avika/postgresql" (without "secret/data/" prefix)
func (c *Client) GetSecret(path string) (SecretData, error) {
	url := fmt.Sprintf("%s/v1/secret/data/%s", c.addr, path)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("X-Vault-Token", c.token)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch secret: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("secret not found: %s", path)
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vault error (status %d): %s", resp.StatusCode, string(body))
	}

	var vaultResp VaultResponse
	if err := json.NewDecoder(resp.Body).Decode(&vaultResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(vaultResp.Errors) > 0 {
		return nil, fmt.Errorf("vault errors: %v", vaultResp.Errors)
	}

	return vaultResp.Data.Data, nil
}

// GetString retrieves a string value from a secret
func (c *Client) GetString(path, key string) (string, error) {
	secret, err := c.GetSecret(path)
	if err != nil {
		return "", err
	}

	val, ok := secret[key]
	if !ok {
		return "", fmt.Errorf("key %q not found in secret %q", key, path)
	}

	str, ok := val.(string)
	if !ok {
		return "", fmt.Errorf("key %q is not a string", key)
	}

	return str, nil
}

// MustGetString retrieves a string value or panics
func (c *Client) MustGetString(path, key string) string {
	val, err := c.GetString(path, key)
	if err != nil {
		panic(err)
	}
	return val
}

// IsAvailable checks if Vault is reachable and healthy
func (c *Client) IsAvailable() bool {
	url := fmt.Sprintf("%s/v1/sys/health", c.addr)
	resp, err := c.client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// PostgresConfig retrieves PostgreSQL configuration from Vault
type PostgresConfig struct {
	Host     string
	Port     string
	Database string
	Username string
	Password string
}

// GetPostgresConfig retrieves PostgreSQL config from Vault
func (c *Client) GetPostgresConfig() (*PostgresConfig, error) {
	secret, err := c.GetSecret("avika/postgresql")
	if err != nil {
		return nil, err
	}

	return &PostgresConfig{
		Host:     secret["host"].(string),
		Port:     secret["port"].(string),
		Database: secret["database"].(string),
		Username: secret["username"].(string),
		Password: secret["password"].(string),
	}, nil
}

// GetPostgresDSN returns a PostgreSQL connection string from Vault
func (c *Client) GetPostgresDSN() (string, error) {
	cfg, err := c.GetPostgresConfig()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		cfg.Username, cfg.Password, cfg.Host, cfg.Port, cfg.Database), nil
}

// ClickHouseConfig retrieves ClickHouse configuration from Vault
type ClickHouseConfig struct {
	Host     string
	Port     string
	HTTPPort string
	Database string
	Username string
	Password string
}

// GetClickHouseConfig retrieves ClickHouse config from Vault
func (c *Client) GetClickHouseConfig() (*ClickHouseConfig, error) {
	secret, err := c.GetSecret("avika/clickhouse")
	if err != nil {
		return nil, err
	}

	return &ClickHouseConfig{
		Host:     secret["host"].(string),
		Port:     secret["port"].(string),
		HTTPPort: secret["http_port"].(string),
		Database: secret["database"].(string),
		Username: secret["username"].(string),
		Password: secret["password"].(string),
	}, nil
}

// GetClickHouseAddr returns ClickHouse address from Vault
func (c *Client) GetClickHouseAddr() (string, error) {
	cfg, err := c.GetClickHouseConfig()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s:%s", cfg.Host, cfg.Port), nil
}

// RedpandaConfig retrieves Redpanda/Kafka configuration from Vault
type RedpandaConfig struct {
	Brokers string
	Topic   string
}

// GetRedpandaConfig retrieves Redpanda config from Vault
func (c *Client) GetRedpandaConfig() (*RedpandaConfig, error) {
	secret, err := c.GetSecret("avika/redpanda")
	if err != nil {
		return nil, err
	}

	return &RedpandaConfig{
		Brokers: secret["brokers"].(string),
		Topic:   secret["topic"].(string),
	}, nil
}
