package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

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

// Config holds all gateway configuration
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Security   SecurityConfig   `yaml:"security"`
	Database   DatabaseConfig   `yaml:"database"`
	ClickHouse ClickHouseConfig `yaml:"clickhouse"`
	Kafka      KafkaConfig      `yaml:"kafka"`
	SMTP       SMTPConfig       `yaml:"smtp"`
	Agent      AgentConfig      `yaml:"agent"`
}

// GetGRPCAddress returns the formatted gRPC listen address
func (c *Config) GetGRPCAddress() string {
	// Support legacy Port field
	if c.Server.Port != "" && strings.HasPrefix(c.Server.Port, ":") {
		return c.Server.Port
	}
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.GRPCPort)
}

// GetHTTPAddress returns the formatted HTTP listen address
func (c *Config) GetHTTPAddress() string {
	// Support legacy WSPort field
	if c.Server.WSPort != "" && strings.HasPrefix(c.Server.WSPort, ":") {
		return c.Server.WSPort
	}
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.HTTPPort)
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

	return cfg, nil
}

// defaultConfig returns a Config with sensible defaults
func defaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort:    DefaultGRPCPort,
			HTTPPort:    DefaultHTTPPort,
			MetricsPort: DefaultMetricsPort,
			Host:        "",
			// Legacy defaults for backward compatibility
			Port:   fmt.Sprintf(":%d", DefaultGRPCPort),
			WSPort: fmt.Sprintf(":%d", DefaultHTTPPort),
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
			DSN:             "postgres://admin:password@localhost:5432/nginx_manager?sslmode=disable",
			MaxOpenConns:    25,
			MaxIdleConns:    25,
			ConnMaxLifetime: 5 * time.Minute,
			MaxRetries:      3,
			RetryInterval:   2 * time.Second,
		},
		ClickHouse: ClickHouseConfig{
			Address:         "localhost:9000",
			Database:        "nginx_analytics",
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
			From:   "alerts@nginx-manager.local",
			UseTLS: true,
		},
		Agent: AgentConfig{
			MgmtPort:         DefaultAgentPort,
			HeartbeatTimeout: 30 * time.Second,
			PruneInterval:    12 * time.Hour,
			RetentionPeriod:  10 * 24 * time.Hour,
		},
	}
}

// loadEnvOverrides applies environment variable overrides
func loadEnvOverrides(cfg *Config) {
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
}
