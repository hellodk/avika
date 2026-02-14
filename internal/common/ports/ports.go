// Package ports defines standardized port assignments for the nginx-manager platform.
// All application ports are in the range 5020-5050 to avoid collisions with common services.
package ports

const (
	// Gateway ports
	GatewayGRPC      = 5020 // Main gRPC server for agent connections
	GatewayHTTP      = 5021 // HTTP server for WebSocket (terminal) and reports
	GatewayMetrics   = 5022 // Prometheus metrics endpoint

	// Agent ports
	AgentMgmtGRPC    = 5025 // Agent management gRPC (gateway connects back to agents)
	AgentHealth      = 5026 // Agent health check HTTP endpoint

	// Update Server
	UpdateServerHTTP = 5030 // Binary update server

	// Frontend (for reference, actual config in Next.js)
	FrontendHTTP     = 5031 // Next.js frontend

	// Infrastructure (standard ports, documented here for reference)
	// These use standard ports for compatibility with tooling:
	// - PostgreSQL: 5432
	// - ClickHouse Native: 9000
	// - ClickHouse HTTP: 8123
	// - Redpanda/Kafka: 9092, 29092 (external)
	// - OTel Collector gRPC: 4317
	// - OTel Collector HTTP: 4318
)

// PortConfig holds configurable port settings
type PortConfig struct {
	GatewayGRPC      int `yaml:"gateway_grpc" json:"gateway_grpc"`
	GatewayHTTP      int `yaml:"gateway_http" json:"gateway_http"`
	GatewayMetrics   int `yaml:"gateway_metrics" json:"gateway_metrics"`
	AgentMgmtGRPC    int `yaml:"agent_mgmt_grpc" json:"agent_mgmt_grpc"`
	AgentHealth      int `yaml:"agent_health" json:"agent_health"`
	UpdateServerHTTP int `yaml:"update_server_http" json:"update_server_http"`
	FrontendHTTP     int `yaml:"frontend_http" json:"frontend_http"`
}

// DefaultPortConfig returns the default port configuration
func DefaultPortConfig() PortConfig {
	return PortConfig{
		GatewayGRPC:      GatewayGRPC,
		GatewayHTTP:      GatewayHTTP,
		GatewayMetrics:   GatewayMetrics,
		AgentMgmtGRPC:    AgentMgmtGRPC,
		AgentHealth:      AgentHealth,
		UpdateServerHTTP: UpdateServerHTTP,
		FrontendHTTP:     FrontendHTTP,
	}
}
