package main

import (
	"bufio"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"sync"

	"github.com/avika-ai/avika/cmd/agent/buffer"
	"github.com/avika-ai/avika/cmd/agent/config"
	"github.com/avika-ai/avika/cmd/agent/discovery"
	"github.com/avika-ai/avika/cmd/agent/health"
	"github.com/avika-ai/avika/cmd/agent/logs"
	"github.com/avika-ai/avika/cmd/agent/metrics"
	"github.com/avika-ai/avika/cmd/agent/updater"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/proto"
)

// Port constants - application ports in range 5020-5050
const (
	DefaultGatewayPort = 5020 // Gateway gRPC port
	DefaultHealthPort  = 5026 // Agent health check port
	DefaultMgmtPort    = 5025 // Agent management gRPC port
)

var (
	gatewayAddr   = flag.String("gateway", "", "Gateway address(es) - comma-separated for multi-gateway (e.g., 'gw1:5020,gw2:5020')")
	agentID       = flag.String("id", "", "The agent ID (default: hostname)")
	logLevel      = flag.String("log-level", "info", "Log level (debug, info, warn, error). Set via LOG_LEVEL env for dynamic override.")
	logFile       = flag.String("log-file", "/var/log/avika-agent/agent.log", "Path to log file. If empty, logs to stdout")
	bufferDir     = flag.String("buffer-dir", "/var/lib/avika-agent/data", "Directory to store the persistent buffer")
	version       = flag.Bool("version", false, "Display version and exit")
	healthPort    = flag.Int("health-port", DefaultHealthPort, "Port for health check endpoints")
	mgmtPort      = flag.Int("mgmt-port", DefaultMgmtPort, "Port for management gRPC server")
	pskKey        = flag.String("psk", "", "Pre-Shared Key for gateway authentication")
	tlsCertFile   = flag.String("tls-cert", "", "Path to TLS client certificate file")
	tlsKeyFile    = flag.String("tls-key", "", "Path to TLS client key file")
	tlsCACertFile = flag.String("tls-ca", "", "Path to TLS CA certificate file")
	enableTLS     = flag.Bool("tls", false, "Enable TLS/mTLS for gateway connection")
	tlsInsecure   = flag.Bool("tls-insecure", false, "Allow insecure TLS connections (skip certificate verification)")

	// NGINX configuration
	nginxStatusURL  = flag.String("nginx-status-url", "http://127.0.0.1/nginx_status", "URL for NGINX stub_status")
	accessLogPath   = flag.String("access-log-path", "/var/log/nginx/access.log", "Path to NGINX access log")
	errorLogPath    = flag.String("error-log-path", "/var/log/nginx/error.log", "Path to NGINX error log")
	logFormat       = flag.String("log-format", "combined", "Log format (combined or json)")
	nginxConfigPath = flag.String("nginx-config-path", "/etc/nginx/nginx.conf", "Path to NGINX configuration file")

	// Self-Update
	updateServer   = flag.String("update-server", "", "URL of the update server (e.g., http://gateway:5021). If empty, auto-derived from gateway address. Set to 'disabled' to turn off")
	updateInterval = flag.Duration("update-interval", 168*time.Hour, "Interval between update checks (default: 1 week)")

	// Config File
	configFile = flag.String("config", "/etc/avika/avika-agent.conf", "Path to configuration file")

	// Management address advertisement: host or host:port the gateway should use to dial this agent (Option A - correct IP)
	mgmtAdvertise = flag.String("mgmt-advertise", "", "Address to advertise for gateway dial-back (e.g. 10.0.2.15 or 10.0.2.15:5025). Also set via AVIKA_MGMT_ADVERTISE.")

	// Optional CIDR to avoid for mgmt (e.g. VirtualBox NAT 10.0.2.0/24). When set, prefer an interface outside this CIDR.
	// Leave unset in Class A–only enterprise; only the default-route vs 192.168.x heuristic runs when unset.
	mgmtNatCIDR = flag.String("mgmt-nat-cidr", "", "CIDR to avoid when choosing mgmt IP (e.g. 10.0.2.0/24). Env: AVIKA_MGMT_NAT_CIDR.")
	// Syslog SIEM Fan-out
	syslogEnabled  = flag.Bool("syslog-enabled", false, "Enable syslog fan-out for SIEM")
	syslogTarget   = flag.String("syslog-target", "", "Syslog server target (e.g., 'udp://10.0.0.1:514')")
	syslogFacility = flag.String("syslog-facility", "local7", "Syslog facility")
	syslogSeverity = flag.String("syslog-severity", "info", "Syslog severity")
)

// Version information - set at build time via -ldflags
var (
	Version   = "0.1.0-dev"
	BuildDate = "unknown"
	GitCommit = "unknown"
	GitBranch = "unknown"
)

var (
	globalUpdater *updater.Updater
	currentHostname, _ = os.Hostname()
	currentIP       = getChosenIP()

	startTime     = time.Now()
	agentLabels   = make(map[string]string) // Labels for auto-assignment (project, environment, etc.)
)

// loadConfig reads key=value pairs from file and updates flags if not set via CLI
func loadConfig(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Track explicitly set flags so config file doesn't override CLI args
	setFlags := make(map[string]bool)
	flag.Visit(func(f *flag.Flag) {
		setFlags[f.Name] = true
	})

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.Trim(strings.TrimSpace(parts[1]), "\"'")

		// Mapping config keys to flags
		switch key {
		case "GATEWAYS":
			// Gateway address(es) - single or comma-separated for multi-gateway
			if !setFlags["gateway"] {
				*gatewayAddr = val
			}
		case "AGENT_ID":
			if !setFlags["id"] {
				*agentID = val
			}
		case "HEALTH_PORT":
			if !setFlags["health-port"] {
				if i, err := strconv.Atoi(val); err == nil {
					*healthPort = i
				}
			}
		case "UPDATE_SERVER":
			if !setFlags["update-server"] {
				*updateServer = val
			}
		case "UPDATE_INTERVAL":
			if !setFlags["update-interval"] {
				if d, err := time.ParseDuration(val); err == nil {
					*updateInterval = d
				}
			}
		case "NGINX_STATUS_URL":
			if !setFlags["nginx-status-url"] {
				*nginxStatusURL = val
			}
		case "TLS":
			if !setFlags["tls"] {
				*enableTLS = val == "true" || val == "1"
			}
		case "TLS_CERT":
			if !setFlags["tls-cert"] {
				*tlsCertFile = val
			}
		case "TLS_KEY":
			if !setFlags["tls-key"] {
				*tlsKeyFile = val
			}
		case "TLS_CA":
			if !setFlags["tls-ca"] {
				*tlsCACertFile = val
			}
		case "TLS_INSECURE":
			if !setFlags["tls-insecure"] {
				*tlsInsecure = val == "true" || val == "1"
			}
		case "ACCESS_LOG_PATH":
			if !setFlags["access-log-path"] {
				*accessLogPath = val
			}
		case "ERROR_LOG_PATH":
			if !setFlags["error-log-path"] {
				*errorLogPath = val
			}
		case "LOG_FORMAT":
			if !setFlags["log-format"] {
				*logFormat = val
			}
		case "NGINX_CONFIG_PATH":
			if !setFlags["nginx-config-path"] {
				*nginxConfigPath = val
			}
		case "BUFFER_DIR":
			if !setFlags["buffer-dir"] {
				*bufferDir = val
			}
		case "LOG_LEVEL":
			if !setFlags["log-level"] {
				*logLevel = val
			}
		case "LOG_FILE":
			if !setFlags["log-file"] {
				*logFile = val
			}
		case "MGMT_PORT":
			if !setFlags["mgmt-port"] {
				if i, err := strconv.Atoi(val); err == nil {
					*mgmtPort = i
				}
			}
		case "PSK_KEY":
			if !setFlags["psk"] {
				*pskKey = val
			}
		case "AVIKA_MGMT_ADVERTISE", "MGMT_ADVERTISE":
			if *mgmtAdvertise == "" {
				*mgmtAdvertise = val
			}
		case "AVIKA_MGMT_NAT_CIDR", "MGMT_NAT_CIDR":
			if !setFlags["mgmt-nat-cidr"] {
				*mgmtNatCIDR = val
			}
		case "SYSLOG_ENABLED":
			if !setFlags["syslog-enabled"] {
				*syslogEnabled = val == "true" || val == "1"
			}
		case "SYSLOG_TARGET":
			if !setFlags["syslog-target"] {
				*syslogTarget = val
			}
		case "SYSLOG_FACILITY":
			if !setFlags["syslog-facility"] {
				*syslogFacility = val
			}
		case "SYSLOG_SEVERITY":
			if !setFlags["syslog-severity"] {
				*syslogSeverity = val
			}
		default:
			// Parse labels with LABEL_ prefix: LABEL_project=myproject
			if strings.HasPrefix(key, "LABEL_") {
				labelKey := strings.TrimPrefix(key, "LABEL_")
				if labelKey != "" {
					agentLabels[labelKey] = val
				}
			}
		}
	}
	return scanner.Err()
}

// loadEnv reads configuration from environment variables.
// Priority: CLI flags > env vars > config file
func loadEnv() {
	setFlags := make(map[string]bool)
	flag.Visit(func(f *flag.Flag) {
		setFlags[f.Name] = true
	})

	// Map of env var name to (flag name, current value pointer, value type)
	envMappings := []struct {
		envKey   string
		flagName string
		apply    func(val string)
	}{
		// Support both GATEWAYS and GATEWAY_SERVER for compatibility
		{"GATEWAYS", "gateway", func(val string) { *gatewayAddr = val }},
		{"GATEWAY_SERVER", "gateway", func(val string) { *gatewayAddr = val }},
		{"AGENT_ID", "id", func(val string) { *agentID = val }},
		{"UPDATE_SERVER", "update-server", func(val string) { *updateServer = val }},
		{"UPDATE_INTERVAL", "update-interval", func(val string) {
			if d, err := time.ParseDuration(val); err == nil {
				*updateInterval = d
			}
		}},
		{"HEALTH_PORT", "health-port", func(val string) {
			if i, err := strconv.Atoi(val); err == nil {
				*healthPort = i
			}
		}},
		{"MGMT_PORT", "mgmt-port", func(val string) {
			if i, err := strconv.Atoi(val); err == nil {
				*mgmtPort = i
			}
		}},
		{"NGINX_STATUS_URL", "nginx-status-url", func(val string) { *nginxStatusURL = val }},
		{"ACCESS_LOG_PATH", "access-log-path", func(val string) { *accessLogPath = val }},
		{"ERROR_LOG_PATH", "error-log-path", func(val string) { *errorLogPath = val }},
		{"LOG_FORMAT", "log-format", func(val string) { *logFormat = val }},
		{"NGINX_CONFIG_PATH", "nginx-config-path", func(val string) { *nginxConfigPath = val }},
		{"BUFFER_DIR", "buffer-dir", func(val string) { *bufferDir = val }},
		{"LOG_LEVEL", "log-level", func(val string) { *logLevel = val }},
		{"LOG_FILE", "log-file", func(val string) { *logFile = val }},
		{"PSK_KEY", "psk", func(val string) { *pskKey = val }},
		{"AVIKA_MGMT_ADVERTISE", "mgmt-advertise", func(val string) { *mgmtAdvertise = val }},
		{"MGMT_ADVERTISE", "mgmt-advertise", func(val string) { *mgmtAdvertise = val }},
		{"AVIKA_MGMT_NAT_CIDR", "mgmt-nat-cidr", func(val string) { *mgmtNatCIDR = val }},
		{"MGMT_NAT_CIDR", "mgmt-nat-cidr", func(val string) { *mgmtNatCIDR = val }},
		{"TLS", "tls", func(val string) { *enableTLS = val == "true" || val == "1" }},
		{"AVIKA_TLS", "tls", func(val string) { *enableTLS = val == "true" || val == "1" }},
		{"TLS_INSECURE", "tls-insecure", func(val string) { *tlsInsecure = val == "true" || val == "1" }},
		{"AVIKA_TLS_INSECURE", "tls-insecure", func(val string) { *tlsInsecure = val == "true" || val == "1" }},
		{"SYSLOG_ENABLED", "syslog-enabled", func(val string) { *syslogEnabled = val == "true" || val == "1" }},
		{"SYSLOG_TARGET", "syslog-target", func(val string) { *syslogTarget = val }},
		{"SYSLOG_FACILITY", "syslog-facility", func(val string) { *syslogFacility = val }},
		{"SYSLOG_SEVERITY", "syslog-severity", func(val string) { *syslogSeverity = val }},
	}

	for _, m := range envMappings {
		if setFlags[m.flagName] {
			continue // CLI flag takes precedence
		}
		if val := os.Getenv(m.envKey); val != "" {
			m.apply(val)
		}
	}

	// Parse labels from AVIKA_LABEL_* environment variables
	for _, env := range os.Environ() {
		if strings.HasPrefix(env, "AVIKA_LABEL_") {
			parts := strings.SplitN(env, "=", 2)
			if len(parts) == 2 {
				labelKey := strings.TrimPrefix(parts[0], "AVIKA_LABEL_")
				if labelKey != "" {
					agentLabels[strings.ToLower(labelKey)] = parts[1]
				}
			}
		}
	}
}

// getGatewayAddresses returns the list of gateway addresses to connect to
// The -gateway flag (and GATEWAYS config) accepts comma-separated values for multi-gateway mode
func getGatewayAddresses() []string {
	var addresses []string

	// Parse comma-separated addresses from -gateway flag or GATEWAYS config
	if *gatewayAddr != "" {
		for _, addr := range strings.Split(*gatewayAddr, ",") {
			addr = strings.TrimSpace(addr)
			if strings.HasPrefix(addr, "https://") {
				*enableTLS = true
			}
			addr = strings.TrimPrefix(addr, "http://")
			addr = strings.TrimPrefix(addr, "https://")
			if addr != "" {
				addresses = append(addresses, addr)
			}
		}
	}

	// Default if nothing configured
	if len(addresses) == 0 {
		addresses = append(addresses, "localhost:5020")
	}

	return addresses
}

// deriveUpdateServerFromGateway constructs the update server URL from the gateway address.
// Gateway gRPC runs on port 5020, HTTP (with updates) runs on port 5021.
func deriveUpdateServerFromGateway(gatewayAddr string) string {
	// Take the first gateway if multiple are specified
	firstGateway := strings.Split(gatewayAddr, ",")[0]
	firstGateway = strings.TrimSpace(firstGateway)

	// Strip any scheme prefix (http://, https://)
	firstGateway = strings.TrimPrefix(firstGateway, "http://")
	firstGateway = strings.TrimPrefix(firstGateway, "https://")

	// Try to split host:port
	host, port, err := net.SplitHostPort(firstGateway)
	if err != nil {
		// No port specified - use the whole string as host with default gRPC port
		host = firstGateway
		port = strconv.Itoa(DefaultGatewayPort)
	}

	if host == "" {
		return ""
	}

	// Convert gRPC port to HTTP port (5020 -> 5021, or gRPC+1)
	httpPort := "5021"
	if port == "5020" || port == "50051" {
		httpPort = "5021"
	} else if p, err := strconv.Atoi(port); err == nil {
		httpPort = strconv.Itoa(p + 1)
	}

	return fmt.Sprintf("http://%s:%s/updates", host, httpPort)
}

func main() {
	flag.Parse()

	// Load configuration from file (if exists)
	if err := loadConfig(*configFile); err != nil {
		if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Warning: Failed to load config file: %v\n", err)
		}
	}

	// Load configuration from environment variables (overrides config file, but not CLI flags)
	loadEnv()

	// Load version from file if not set via ldflags (e.g. local dev)
	if strings.Contains(Version, "dev") || Version == "0.1.0" {
		if data, err := os.ReadFile("VERSION"); err == nil {
			Version = strings.TrimSpace(string(data))
		}
	}

	if *version {
		fmt.Printf("NGINX Manager Agent\n")
		fmt.Printf("Version:    %s\n", Version)
		fmt.Printf("Build Date: %s\n", BuildDate)
		fmt.Printf("Git Commit: %s\n", GitCommit)
		fmt.Printf("Git Branch: %s\n", GitBranch)
		os.Exit(0)
	}

	// Reject unknown subcommands/arguments
	if len(flag.Args()) > 0 {
		fmt.Fprintf(os.Stderr, "Error: Unknown command or argument: %s\n", flag.Args()[0])
		fmt.Fprintf(os.Stderr, "Usage: %s [OPTIONS]\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "\nCommon options:\n")
		fmt.Fprintf(os.Stderr, "  -version              Display version information\n")
		fmt.Fprintf(os.Stderr, "  -server string        Gateway server address (default \"localhost:50051\")\n")
		fmt.Fprintf(os.Stderr, "  -id string            Agent ID (default: hostname-ip)\n")
		fmt.Fprintf(os.Stderr, "  -health-port int      Health check port (default 8080)\n")
		fmt.Fprintf(os.Stderr, "\nRun '%s -h' for full options\n", os.Args[0])
		os.Exit(1)
	}

	if err := setupLogging(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to setup logging: %v\n", err)
		os.Exit(1)
	}

	// Create context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Setup signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	// WaitGroup to track all goroutines
	var wg sync.WaitGroup

	// 1. Get or Generate Persistent Agent ID
	if *agentID == "" {
		*agentID = getOrGenerateAgentID()
	}

	agentInfo("=== Avika Agent Starting ===")
	agentInfo("Agent ID:  %s", *agentID)
	agentInfo("Agent IP:  %s", currentIP)
	agentInfo("Version:   %s", Version)
	if Version == "0.1.0-dev" {
		agentWarn("Binary reports 0.1.0-dev; it was likely built without the repo VERSION. Rebuild the gateway image and reinstall or self-update the agent to get the correct version.")
	}
	agentInfo("Buffer:    %s", *bufferDir)
	agentInfo("Gateways:  %s", *gatewayAddr)
	agentInfo("============================")
	agentLabelsMu.RLock()
	if len(agentLabels) > 0 {
		labelsCopy := make(map[string]string, len(agentLabels))
		for k, v := range agentLabels {
			labelsCopy[k] = v
		}
		agentInfo("Agent labels: %v", labelsCopy)
	}
	agentLabelsMu.RUnlock()

	// 2. Start Health Check Server
	healthServer := health.NewServer(*healthPort)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := healthServer.Start(); err != nil {
			agentWarn("Health server error: %v", err)
		}
	}()

	// 3. Start Self-Updater (if enabled or auto-derived from gateway)
	effectiveUpdateServer := *updateServer
	if effectiveUpdateServer == "" && *gatewayAddr != "" {
		// Auto-derive from first gateway address
		// Gateway gRPC is on port 5020, HTTP (with updates) is on port 5021
		effectiveUpdateServer = deriveUpdateServerFromGateway(*gatewayAddr)
		if effectiveUpdateServer != "" {
			agentInfo("Auto-derived update server from gateway: %s", effectiveUpdateServer)
		}
	} else if strings.ToLower(effectiveUpdateServer) == "disabled" {
		effectiveUpdateServer = ""
		agentInfo("Self-update disabled via configuration")
	}

	if effectiveUpdateServer != "" {
		globalUpdater = updater.New(effectiveUpdateServer, Version)
		wg.Add(1)
		go func() {
			defer wg.Done()
			startUpdaterLoop(ctx, globalUpdater, *updateInterval)
			<-ctx.Done()
		}()
	}

	// 3. Initialize Persistent Buffer
	wal, err := buffer.NewFileBuffer(*bufferDir + "agent")
	if err != nil {
			agentError("Failed to initialize buffer: %v", err)
		os.Exit(1)
	}

	// Initial backup on node add/start
	if err := config.BackupNginxConfig("startup"); err != nil {
		agentWarn("Startup backup failed: %v", err)
	}

	// -------------------------------------------------------------------------
	// Data Collection (Producers) -> Buffer
	// -------------------------------------------------------------------------

	// Discovery Service
	discoverer := discovery.NewDiscoverer()

	// Initial hostname for components that need it at start
	currentHostname, _ := os.Hostname()

	// Log Collector
	collector := logs.NewLogCollector(
		*accessLogPath,
		*errorLogPath,
		*logFormat,
		"localhost:4317", // OTel OTLP gRPC endpoint
		*agentID,
		currentHostname,
		logs.LogSyslogConfig{
			Enabled:       *syslogEnabled,
			TargetAddress: *syslogTarget,
			Facility:      *syslogFacility,
			Severity:      *syslogSeverity,
		},
	)
	collector.Start()
	defer collector.Stop()

	// Metrics Collector
	metricsCollector := metrics.NewNginxCollector(*nginxStatusURL)

	// Goroutine: Collect Logs -> Buffer
	wg.Add(1)
	go func() {
		defer wg.Done()
		logChan := collector.GetGatewayChannel()
		for {
			select {
			case <-ctx.Done():
				agentInfo("Log collection goroutine shutting down...")
				return
			case entry, ok := <-logChan:
				if !ok {
					return
				}
				msg := &pb.AgentMessage{
					AgentId:   *agentID,
					Timestamp: time.Now().Unix(),
					Payload: &pb.AgentMessage_LogEntry{
						LogEntry: entry,
					},
				}
				writeToBuffer(wal, msg)
			}
		}
	}()

	// Goroutine: Collect Metrics & Heartbeats -> Buffer
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				agentInfo("Metrics collection goroutine shutting down...")
				return
			case <-ticker.C:
				// Dynamic Hostname Detection
				h, err := os.Hostname()
				if err == nil && h != "" {
					currentHostname = h
				}

				// Heartbeat
				instances, _ := discoverer.Scan(context.Background())
				isPod, podIP := detectK8s()

				// Determine primary NGINX version
				primaryNginxVersion := "unknown"
				lastMetricsVersion := metricsCollector.GetLastDetectedVersion()

				if len(instances) > 0 {
					for _, inst := range instances {
						if inst.Version == "unknown" && lastMetricsVersion != "" {
							inst.Version = lastMetricsVersion
						}
					}
					primaryNginxVersion = instances[0].Version
				} else if lastMetricsVersion != "" {
					// Even if no process found via discovery (unlikely if metrics work),
					// we can report the version from metrics API
					primaryNginxVersion = lastMetricsVersion
				}

				// Fallback for K8s sidecar mode: try to extract from HTTP Server header if native discovery fails
				if primaryNginxVersion == "unknown" && *nginxStatusURL != "" {
					client := &http.Client{Timeout: 1 * time.Second}
					if resp, err := client.Get(*nginxStatusURL); err == nil {
						serverHeader := resp.Header.Get("Server") // e.g. "nginx/1.25.3"
						if strings.HasPrefix(strings.ToLower(serverHeader), "nginx/") {
							primaryNginxVersion = serverHeader[6:]
						}
						resp.Body.Close()
					}
				}

				hbMsg := &pb.AgentMessage{
					AgentId:   *agentID,
					Timestamp: time.Now().Unix(),
					Payload: &pb.AgentMessage_Heartbeat{
						Heartbeat: &pb.Heartbeat{
							Hostname:     currentHostname,
							Version:      primaryNginxVersion, // NGINX Version
							AgentVersion: Version,             // Agent Version
							Uptime:       time.Since(startTime).Seconds(),
							Instances:    instances,
							IsPod:        isPod,
							PodIp:        podIP,
							BuildDate:    BuildDate,
							GitCommit:    GitCommit,
							GitBranch:    GitBranch,
							Labels: func() map[string]string {
								agentLabelsMu.RLock()
								defer agentLabelsMu.RUnlock()
								if len(agentLabels) == 0 {
									return map[string]string{}
								}
								m := make(map[string]string, len(agentLabels))
								for k, v := range agentLabels {
									m[k] = v
								}
								return m
							}(), // Labels for auto-assignment
							MgmtAddress:           getChosenMgmtAddress(),   // host:port for gateway dial-back (backward compat)
							MgmtAddressCandidates: getAllCandidateMgmtAddresses(), // all candidate host:port for gateway to probe
						},
					},
				}
				writeToBuffer(wal, hbMsg)

				// Metrics - always try to send even if NGINX metrics fail
				nginxMetrics, err := metricsCollector.Collect()
				if err != nil {
					agentWarn("NGINX metrics collection failed: %v", err)
					// Still send system metrics even if NGINX metrics fail
					systemMetrics, sysErr := metricsCollector.CollectSystemOnly()
					if sysErr == nil && systemMetrics != nil {
						// Create a minimal NginxMetrics with just system data
						fallbackMetrics := &pb.NginxMetrics{
							System: systemMetrics,
						}
						metricMsg := &pb.AgentMessage{
							AgentId:   *agentID,
							Timestamp: time.Now().Unix(),
							Payload: &pb.AgentMessage_Metrics{
								Metrics: fallbackMetrics,
							},
						}
						writeToBuffer(wal, metricMsg)
					}
				} else {
					metricMsg := &pb.AgentMessage{
						AgentId:   *agentID,
						Timestamp: time.Now().Unix(),
						Payload: &pb.AgentMessage_Metrics{
							Metrics: nginxMetrics,
						},
					}
					writeToBuffer(wal, metricMsg)
				}
			}
		}
	}()

	// Start Management Service (gRPC) in background
	wg.Add(1)
	go func() {
		defer wg.Done()
		var serverTLSCreds credentials.TransportCredentials
		if *enableTLS {
			creds, err := loadAgentTLSCredentials()
			if err == nil {
				serverTLSCreds = creds
			} else {
				agentWarn("Failed to load TLS credentials for management service: %v", err)
			}
		}

		agentInfo("Starting Management Service with NGINX config: %s", *nginxConfigPath)
		startMgmtService(ctx, *nginxConfigPath, *mgmtPort, serverTLSCreds)
	}()

	// Mark service as ready
	healthServer.SetReady(true)
	agentInfo("Agent is ready")

	// -------------------------------------------------------------------------
	// Sender (Consumer) -> Gateway(s)
	// -------------------------------------------------------------------------
	gateways := getGatewayAddresses()
	agentInfo("Connecting to %d gateway(s): %v", len(gateways), gateways)

	for _, gwAddr := range gateways {
		wg.Add(1)
		go func(addr string) {
			defer wg.Done()
			senderLoop(ctx, wal, *agentID, addr)
		}(gwAddr)
	}

	// Wait for shutdown signal
	sig := <-sigChan
		agentInfo("Received signal %v, initiating graceful shutdown...", sig)

	// Mark as not ready
	healthServer.SetReady(false)

	// Cancel context to stop all goroutines
	cancel()

	// Wait for all goroutines to finish with timeout
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		agentInfo("All goroutines stopped gracefully")
	case <-time.After(10 * time.Second):
		agentWarn("Shutdown timeout exceeded (10s), forcing exit")
	}

	// Cleanup buffer before final exit
	agentInfo("Closing buffer...")
	if err := wal.Close(); err != nil {
		agentWarn("Error closing buffer: %v", err)
	}

	// Shutdown health server
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 3*time.Second)
	if err := healthServer.Shutdown(shutdownCtx); err != nil {
		agentWarn("Health server shutdown error: %v", err)
	}
	shutdownCancel()

	agentInfo("Agent shutdown complete")
}

// getPreferredIPv4 returns the first non-loopback IPv4 address from system interfaces.
func getPreferredIPv4() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipv4 := ipnet.IP.To4(); ipv4 != nil {
				return ipv4.String()
			}
		}
	}
	return ""
}

// ipInCIDR returns true if ip is inside the given CIDR (e.g. "10.0.2.0/24").
func ipInCIDR(ipStr, cidrStr string) bool {
	if cidrStr == "" {
		return false
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	_, network, err := net.ParseCIDR(cidrStr)
	if err != nil {
		return false
	}
	return network.Contains(ip)
}

// isVirtualBoxNAT returns true if ip is in 10.0.2.0/24 (VirtualBox NAT). Used only when
// we also have a 192.168.x interface (lab/VM pattern); not used in Class A–only enterprise.
func isVirtualBoxNAT(ip string) bool {
	return ipInCIDR(ip, "10.0.2.0/24")
}

// has192168 returns true if the host has at least one 192.168.0.0/16 address.
func has192168() bool {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return false
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipv4 := ipnet.IP.To4(); ipv4 != nil && ipv4[0] == 192 && ipv4[1] == 168 {
				return true
			}
		}
	}
	return false
}

// getPreferredMgmtIPv4 returns an IP preferred for management. avoidCIDR is optional (e.g. "10.0.2.0/24").
// When avoidCIDR is set: return first candidate not in that CIDR (for enterprise AVIKA_MGMT_NAT_CIDR).
// When avoidCIDR is empty and we have 192.168.x: return first 192.168.x (VirtualBox host-only/bridged).
// Otherwise return first candidate.
func getPreferredMgmtIPv4(avoidCIDR string) string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	var candidates []string
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipv4 := ipnet.IP.To4(); ipv4 != nil {
				candidates = append(candidates, ipv4.String())
			}
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	if avoidCIDR != "" {
		for _, ip := range candidates {
			if !ipInCIDR(ip, avoidCIDR) {
				return ip
			}
		}
		return candidates[0]
	}
	// VirtualBox heuristic: prefer 192.168.0.0/16 when present
	for _, ip := range candidates {
		p := net.ParseIP(ip)
		if p != nil && p.To4() != nil && p[0] == 192 && p[1] == 168 {
			return ip
		}
	}
	return candidates[0]
}

// getDefaultRouteIPv4 returns the IPv4 of the interface that has the default route (Linux only).
// Parses /proc/net/route and finds the interface for destination 00000000, then returns its first IPv4.
func getDefaultRouteIPv4() string {
	if runtime.GOOS != "linux" {
		return ""
	}
	data, err := os.ReadFile("/proc/net/route")
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		iface := fields[0]
		dest := fields[1]
		if dest != "00000000" {
			continue
		}
		ifc, err := net.InterfaceByName(iface)
		if err != nil {
			continue
		}
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipv4 := ipnet.IP.To4(); ipv4 != nil {
					return ipv4.String()
				}
			}
		}
		return ""
	}
	return ""
}

// getChosenIP returns the IP to use for agent_id suffix and for building mgmt_address.
// Order: AVIKA_MGMT_ADVERTISE > (if AVIKA_MGMT_NAT_CIDR set and default-route in that CIDR: prefer other) > (VirtualBox: default 10.0.2.x and has 192.168.x: prefer 192.168.x) > default-route > first non-loopback.
// In Class A–only enterprise (no 192.168.x), the VirtualBox heuristic never runs; use AVIKA_MGMT_ADVERTISE or default-route.
func getChosenIP() string {
	if *mgmtAdvertise != "" {
		host, _, err := net.SplitHostPort(*mgmtAdvertise)
		if err != nil {
			return strings.TrimSpace(*mgmtAdvertise)
		}
		return host
	}
	defaultRouteIP := getDefaultRouteIPv4()

	if *mgmtNatCIDR != "" {
		if defaultRouteIP != "" && ipInCIDR(defaultRouteIP, *mgmtNatCIDR) {
			if preferred := getPreferredMgmtIPv4(*mgmtNatCIDR); preferred != "" {
				return preferred
			}
		}
		if defaultRouteIP != "" {
			return defaultRouteIP
		}
		return getPreferredMgmtIPv4(*mgmtNatCIDR)
	}

	// VirtualBox-only heuristic: only when default route is 10.0.2.x and host has 192.168.x (lab/VM).
	// In enterprise with only 10.0.0.0/8, has192168() is false → we use default-route.
	if defaultRouteIP != "" && isVirtualBoxNAT(defaultRouteIP) && has192168() {
		if preferred := getPreferredMgmtIPv4(""); preferred != "" {
			return preferred
		}
	}
	if defaultRouteIP != "" {
		return defaultRouteIP
	}
	return getPreferredIPv4()
}

// getChosenMgmtAddress returns the host:port the gateway should use to dial this agent (for Heartbeat.mgmt_address).
func getChosenMgmtAddress() string {
	if *mgmtAdvertise != "" {
		if _, _, err := net.SplitHostPort(*mgmtAdvertise); err == nil {
			return *mgmtAdvertise
		}
		return net.JoinHostPort(strings.TrimSpace(*mgmtAdvertise), strconv.Itoa(*mgmtPort))
	}
	ip := getChosenIP()
	if ip == "" {
		return ""
	}
	return net.JoinHostPort(ip, strconv.Itoa(*mgmtPort))
}

// getAllCandidateMgmtAddresses returns all non-loopback IPv4 host:port for the agent's mgmt port.
// The gateway can probe these to pick a reachable address (K8s CNI, multi-NIC, Vagrant, etc.).
func getAllCandidateMgmtAddresses() []string {
	port := strconv.Itoa(*mgmtPort)
	if *mgmtAdvertise != "" {
		host, _, err := net.SplitHostPort(*mgmtAdvertise)
		if err != nil {
			host = strings.TrimSpace(*mgmtAdvertise)
		}
		if host != "" {
			return []string{net.JoinHostPort(host, port)}
		}
	}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	var out []string
	seen := make(map[string]bool)
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipv4 := ipnet.IP.To4(); ipv4 != nil {
				ipStr := ipv4.String()
				if !seen[ipStr] {
					seen[ipStr] = true
					out = append(out, net.JoinHostPort(ipStr, port))
				}
			}
		}
	}
	return out
}

func getOrGenerateAgentID() string {
	idFile := filepath.Join(*bufferDir, "agent_id")

	// 1. Try reading from file (stable across restarts)
	data, err := os.ReadFile(idFile)
	if err == nil {
		id := strings.TrimSpace(string(data))
		if id != "" {
			// Migrate old-format ID (hostname+10.0.2.15) to new format (hostname-10-0-2-15) so UI and URLs are consistent
			if migrated := migrateAgentIDToNewFormat(id); migrated != "" {
				if writeErr := os.WriteFile(idFile, []byte(migrated), 0644); writeErr != nil {
					agentWarn("Failed to persist migrated agent ID: %v", writeErr)
				}
				return migrated
			}
			return id
		}
	}

	// 2. Generate agent_id = hostname + "-" + sanitizedIP (no "+" or "." in ID; e.g. hostname-192-168-1-100)
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "unknown"
	}
	hostname = strings.ReplaceAll(hostname, " ", "-")

	chosenIP := getChosenIP()
	var agentID string
	if chosenIP != "" {
		agentID = hostname + "-" + sanitizeAgentIDSuffix(chosenIP)
	} else {
		agentID = hostname
	}

	// 3. Persist for next restart
	if err := os.WriteFile(idFile, []byte(agentID), 0644); err != nil {
		agentWarn("Failed to persist agent ID: %v", err)
	}

	return agentID
}

// sanitizeAgentIDSuffix replaces "." with "-" in the IP so agent IDs are safe in URLs/logs (e.g. 10.0.2.15 -> 10-0-2-15).
func sanitizeAgentIDSuffix(ip string) string {
	return strings.ReplaceAll(ip, ".", "-")
}

// migrateAgentIDToNewFormat converts old-format agent ID (hostname+10.0.2.15) to new format (hostname-10-0-2-15).
// Returns the new ID if migration applied, or "" if id is already in new format or not recognisable.
func migrateAgentIDToNewFormat(id string) string {
	if id == "" || !strings.Contains(id, "+") {
		return ""
	}
	parts := strings.SplitN(id, "+", 2)
	hostname := strings.TrimSpace(parts[0])
	ip := strings.TrimSpace(parts[1])
	if hostname == "" || ip == "" {
		return ""
	}
	hostname = strings.ReplaceAll(hostname, " ", "-")
	return hostname + "-" + sanitizeAgentIDSuffix(ip)
}

func writeToBuffer(wal *buffer.FileBuffer, msg *pb.AgentMessage) {
	agentDebug("Writing message to buffer: type %T", msg.Payload)
	data, err := proto.Marshal(msg)
	if err != nil {
		agentWarn("Failed to marshal message: %v", err)
		return
	}
	if err := wal.Write(data); err != nil {
		agentWarn("Failed to write to buffer: %v", err)
	}
}

func detectK8s() (bool, string) {
	// 1. Check for K8s service account secret
	_, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount")

	// 2. Check for common K8s env vars
	hasK8sEnv := os.Getenv("KUBERNETES_SERVICE_HOST") != "" ||
		os.Getenv("KUBERNETES_PORT") != ""

	// 3. Check /proc/1/cpuset (reliable in containers)
	isContainer := false
	if data, err := os.ReadFile("/proc/1/cpuset"); err == nil {
		if strings.Contains(string(data), "kubepods") || strings.Contains(string(data), "docker") {
			isContainer = true
		}
	}

	isPod := err == nil || hasK8sEnv || isContainer

	if !isPod {
		return false, ""
	}

	// 4. Try to get Pod IP from environment (set via Downward API)
	podIP := os.Getenv("POD_IP")
	if podIP == "" {
		// Fallback: get first non-loopback IP
		if addrs, err := net.InterfaceAddrs(); err == nil {
			for _, addr := range addrs {
				if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
					if ipnet.IP.To4() != nil {
						podIP = ipnet.IP.String()
						break
					}
				}
			}
		}
	}

	return true, podIP
}

type StreamSync struct {
	mu     sync.Mutex
	stream pb.Commander_ConnectClient
}

func (s *StreamSync) Send(msg *pb.AgentMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stream == nil {
		return fmt.Errorf("stream is nil")
	}
	return s.stream.Send(msg)
}

func (s *StreamSync) SetStream(stream pb.Commander_ConnectClient) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stream = stream
}

func (s *StreamSync) GetStream() pb.Commander_ConnectClient {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stream
}

func handleCommand(cmd *pb.ServerCommand, ss *StreamSync, agentID string) {
	log.Printf("Processing command %s", cmd.CommandId)

	switch payload := cmd.Payload.(type) {
	case *pb.ServerCommand_LogRequest:
		go handleLogRequest(cmd.CommandId, payload.LogRequest, ss, agentID)
	case *pb.ServerCommand_Action:
		log.Printf("Action command received: %s", payload.Action.Type)
		// For now just log, could trigger reload etc.
	case *pb.ServerCommand_Update:
		log.Printf("🚀 Remote update command received (target: %s, URL: %s)", payload.Update.Version, payload.Update.UpdateUrl)
		if globalUpdater != nil {
			// If a specific URL is provided in the command, override the default
			targetURL := payload.Update.UpdateUrl
			go globalUpdater.CheckAndApply(targetURL)
		} else {
			log.Printf("⚠️  Update command ignored: Self-update is not configured on this agent")
		}
	}
}

func handleLogRequest(cmdID string, req *pb.LogRequest, ss *StreamSync, agentID string) {
	log.Printf("Handling LogRequest: %s (tail: %d, follow: %v)", req.LogType, req.TailLines, req.Follow)

	logPath := *accessLogPath
	if req.LogType == "error" {
		logPath = *errorLogPath
	}

	// 1. Send tail (last N lines)
	tailN := int(req.TailLines)
	if tailN <= 0 {
		tailN = 200
	}
	logEntries, err := logs.GetLastN(logPath, tailN)
	if err != nil {
		log.Printf("Failed to get last N logs: %v", err)
		return
	}
	for _, entry := range logEntries {
		msg := &pb.AgentMessage{
			AgentId:   agentID,
			Timestamp: time.Now().Unix(),
			Payload: &pb.AgentMessage_LogEntry{
				LogEntry: entry,
			},
		}
		if err := ss.Send(msg); err != nil {
			log.Printf("Failed to send log entry: %v", err)
			return
		}
	}

	// 2. If follow, tail from end and stream new lines until send fails (e.g. client disconnected)
	if !req.Follow {
		return
	}
	format := *logFormat
	if req.LogType == "error" {
		format = "combined"
	}
	followChan, stop, err := logs.FollowFromEnd(logPath, req.LogType, format)
	if err != nil {
		log.Printf("Failed to start log follow: %v", err)
		return
	}
	defer stop()

	for entry := range followChan {
		msg := &pb.AgentMessage{
			AgentId:   agentID,
			Timestamp: time.Now().Unix(),
			Payload: &pb.AgentMessage_LogEntry{
				LogEntry: entry,
			},
		}
		if err := ss.Send(msg); err != nil {
			log.Printf("Log follow send failed (client likely disconnected): %v", err)
			return
		}
	}
}

// buildBootstrapHeartbeat returns a minimal heartbeat so the gateway can register this agent
// as soon as the stream is established, even if the WAL is corrupt and no buffered messages are sent.
func buildBootstrapHeartbeat(agentID string) *pb.AgentMessage {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}
	isPod, podIP := detectK8s()
	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Heartbeat{
			Heartbeat: &pb.Heartbeat{
				Hostname:     hostname,
				Version:      "unknown",
				AgentVersion: Version,
				Uptime:       0,
				Instances:    nil,
				IsPod:        isPod,
				PodIp:        podIP,
				BuildDate:             BuildDate,
				GitCommit:             GitCommit,
				GitBranch:             GitBranch,
				MgmtAddress:           getChosenMgmtAddress(),
				MgmtAddressCandidates: getAllCandidateMgmtAddresses(),
			},
		},
	}
}

func senderLoop(ctx context.Context, wal *buffer.FileBuffer, agentID string, gatewayAddr string) {
	defer agentInfo("Sender loop for %s exited", gatewayAddr)
	var conn *grpc.ClientConn
	var client pb.CommanderClient
	ss := &StreamSync{}

	for {
		select {
		case <-ctx.Done():
			agentInfo("Sender loop for %s shutting down...", gatewayAddr)
			if conn != nil {
				conn.Close()
			}
			return
		default:
		}

		// 1. Connect / Reconnect
		if ss.GetStream() == nil {
			var err error
			// Gateway address already has protocol stripped
			targetAddr := gatewayAddr

					agentInfo("Connecting to gateway %s...", targetAddr)

			dialOpts := []grpc.DialOption{}

			if *enableTLS {
				tlsCreds, err := loadAgentTLSCredentials()
				if err != nil {
					agentWarn("Failed to load TLS credentials: %v using insecure as fallback", err)
					dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
				} else {
					dialOpts = append(dialOpts, grpc.WithTransportCredentials(tlsCreds))
					agentInfo("Using TLS for gateway connection")
				}
			} else {
				dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
			}

			if *pskKey != "" {
				agentInfo("Using PSK authentication")
				h, _ := os.Hostname()
				if h == "" {
					h = "unknown"
				}
				dialOpts = append(dialOpts, grpc.WithPerRPCCredentials(&pskCreds{
					agentID:  agentID,
					hostname: h,
					key:      *pskKey,
				}))
			}

			// Dial with backoff? Simple wait for now
			conn, err = grpc.Dial(targetAddr, dialOpts...)
			if err != nil {
				agentWarn("Connection failed: %v. Retrying in 5s...", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}

			client = pb.NewCommanderClient(conn)
			// Use the main context so connection attempt is cancelled on shutdown
			stream, err := client.Connect(ctx)
			if err != nil {
				agentWarn("Stream creation failed: %v. Retrying in 5s...", err)
				conn.Close()
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}
			ss.SetStream(stream)
			agentInfo("Connected to Gateway %s", targetAddr)

			// Send one heartbeat immediately so the gateway registers this agent (session) even if the WAL is corrupt.
			if err := ss.Send(buildBootstrapHeartbeat(agentID)); err != nil {
				agentWarn("Bootstrap heartbeat failed: %v", err)
				ss.SetStream(nil)
				conn.Close()
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}

			// Start Receiver routine (for commands)
			go func() {
				// Ensure receiver exits when context is done
				defer func() {
					agentInfo("Receiver routine exiting")
				}()

				for {
					select {
					case <-ctx.Done():
						return
					default:
					}

					currentStream := ss.GetStream()
					if currentStream == nil {
						return
					}
					cmd, err := currentStream.Recv()
					if err != nil {
						agentWarn("Stream disconnected (Recv): %v", err)
						ss.SetStream(nil)
						return
					}
					handleCommand(cmd, ss, agentID)
				}
			}()
		}

		// 2. Read from Buffer & Send
		data, offset, err := wal.ReadNext()
		if err != nil {
			log.Printf("Buffer read error: %v", err)
			if strings.Contains(err.Error(), "suspiciously large message length") {
				agentWarn("CRITICAL: Buffer corruption detected at offset %d. Message length reported as huge. This usually means the WAL file is corrupted.", offset)
				agentWarn("Attempting to skip the corrupted length header (4 bytes) to realign...")
				if skipErr := wal.SkipCorrupt(offset); skipErr != nil {
					agentError("Failed to skip corrupt message: %v", skipErr)
				} else {
					agentInfo("Successfully advanced read offset past corruption.")
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(1 * time.Second):
				continue
			}
		}

		// If no data, wait a bit
		if data == nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(100 * time.Millisecond):
				continue
			}
		}

		// Unmarshal to verify/check or just send?
		var msg pb.AgentMessage
		if err := proto.Unmarshal(data, &msg); err != nil {
			log.Printf("Corrupt message in buffer at offset %d, skipping: %v", offset, err)
			wal.Ack(offset) // Skip corrupt message
			continue
		}

		// Send
		ptype := getPayloadType(&msg)
		agentDebug("[%s] Sending message from buffer: type %s (%d bytes) at offset %d", gatewayAddr, ptype, len(data), offset)
		if err := ss.Send(&msg); err != nil {
			log.Printf("Failed to send: %v. Reconnecting...", err)
			ss.SetStream(nil)
			if conn != nil {
				conn.Close()
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
				continue // Retry loop will handle reconnection
			}
		}
		agentInfo("[%s] Successfully sent message type %s (%d bytes)", gatewayAddr, getPayloadType(&msg), len(data))

		// Success -> Ack
		if err := wal.Ack(offset); err != nil {
			log.Printf("Failed to ack offset: %v", err)
		}
	}
}

// getPayloadType returns a human-readable name for the message payload
func getPayloadType(msg *pb.AgentMessage) string {
	if msg == nil || msg.Payload == nil {
		return "Empty"
	}
	typeName := fmt.Sprintf("%T", msg.Payload)
	// Example: *pb.AgentMessage_Heartbeat -> Heartbeat
	if lastDot := strings.LastIndex(typeName, "_"); lastDot != -1 {
		return typeName[lastDot+1:]
	}
	return typeName
}

// isRunningInContainer detects if running inside a container
func isRunningInContainer() bool {
	// Check for container-specific markers
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	// Check cgroup for kubernetes/docker
	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		content := string(data)
		if strings.Contains(content, "docker") ||
			strings.Contains(content, "kubepods") ||
			strings.Contains(content, "containerd") {
			return true
		}
	}
	// Check for Kubernetes environment variables
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return true
	}
	return false
}

// log level order for filtering (higher = more severe)
const (
	agentLevelDebug = iota
	agentLevelInfo
	agentLevelWarn
	agentLevelError
)

var currentLogLevel int = agentLevelInfo

func parseLogLevel(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return agentLevelDebug
	case "info":
		return agentLevelInfo
	case "warn", "warning":
		return agentLevelWarn
	case "error":
		return agentLevelError
	default:
		return agentLevelInfo
	}
}

// agentLog writes a formatted log line with timestamp and level if level is enabled. Use agentDebug/agentInfo/agentWarn/agentError.
func agentLog(level string, levelNum int, format string, args ...interface{}) {
	if levelNum < currentLogLevel {
		return
	}
	msg := fmt.Sprintf(format, args...)
	ts := time.Now().UTC().Format(time.RFC3339)
	line := fmt.Sprintf("%s [%s] %s", ts, strings.ToUpper(level), msg)
	_ = log.Output(2, line)
}

func agentDebug(format string, args ...interface{}) { agentLog("debug", agentLevelDebug, format, args...) }
func agentInfo(format string, args ...interface{})  { agentLog("info", agentLevelInfo, format, args...) }
func agentWarn(format string, args ...interface{}) { agentLog("warn", agentLevelWarn, format, args...) }
func agentError(format string, args ...interface{}) { agentLog("error", agentLevelError, format, args...) }

func setupLogging() error {
	// Apply dynamic log level from flag/env (default: info)
	currentLogLevel = parseLogLevel(*logLevel)

	if *logFile != "" {
		// Create log directory if it doesn't exist
		logDir := filepath.Dir(*logFile)
		if logDir != "" && logDir != "." {
			if err := os.MkdirAll(logDir, 0755); err != nil {
				// Fallback to stdout if directory creation fails (e.g. permission denied)
				fmt.Printf("Warning: failed to create log directory %s: %v. Falling back to stdout logging.\n", logDir, err)
				*logFile = ""
			}
		}

		if *logFile != "" {
			f, err := os.OpenFile(*logFile, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
			if err != nil {
				// Fallback to stdout if file open fails
				fmt.Printf("Warning: failed to open log file %s: %v. Falling back to stdout logging.\n", *logFile, err)
				*logFile = ""
			} else {
				log.SetOutput(f)
				agentInfo("Logging to file: %s", *logFile)
			}
		}
	}
	
	if *logFile == "" {
		// Log to stdout - provide context about where logs will go
		if isRunningInContainer() {
			agentInfo("Logging to stdout (container mode - use 'kubectl logs' or container runtime to view)")
		} else {
			if os.Getenv("INVOCATION_ID") == "" && os.Getppid() != 1 {
				agentWarn("Logging to stdout but not running under systemd. Consider setting LOG_FILE for persistent logs.")
			} else {
				agentInfo("Logging to stdout (systemd mode - use 'journalctl -u avika-agent' to view)")
			}
		}
	}
	// Single-line format: timestamp [LEVEL] message (no extra prefix from log package)
	log.SetFlags(0)
	return nil
}

// pskCreds implements grpc.PerRPCCredentials for PSK authentication
type pskCreds struct {
	agentID  string
	hostname string
	key      string
}

func (c *pskCreds) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	key, err := hex.DecodeString(c.key)
	if err != nil {
		return nil, fmt.Errorf("invalid PSK key (must be hex-encoded): %v", err)
	}

	// Compute HMAC-SHA256 signature
	// Signature format: HMAC-SHA256(PSK, "agentID:hostname:timestamp")
	message := fmt.Sprintf("%s:%s:%s", c.agentID, c.hostname, timestamp)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(message))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return map[string]string{
		"x-avika-agent-id":  c.agentID,
		"x-avika-hostname":  c.hostname,
		"x-avika-timestamp": timestamp,
		"x-avika-signature": signature,
	}, nil
}

func (c *pskCreds) RequireTransportSecurity() bool {
	return *enableTLS // PSK can be sent over TLS if enabled
}

func loadAgentTLSCredentials() (credentials.TransportCredentials, error) {
	// Load client certificate and key if provided (for mTLS)
	var certificates []tls.Certificate
	if *tlsCertFile != "" && *tlsKeyFile != "" {
		cert, err := tls.LoadX509KeyPair(*tlsCertFile, *tlsKeyFile)
		if err != nil {
			return nil, fmt.Errorf("could not load client key pair: %s", err)
		}
		certificates = append(certificates, cert)
	}

	// Load CA certificate for verifying server certificate
	certPool := x509.NewCertPool()
	if *tlsCACertFile != "" {
		caCert, err := os.ReadFile(*tlsCACertFile)
		if err != nil {
			return nil, fmt.Errorf("could not read CA cert: %s", err)
		}
		if ok := certPool.AppendCertsFromPEM(caCert); !ok {
			return nil, fmt.Errorf("failed to append CA cert")
		}
	} else {
		// Use system cert pool if no CA provided
		var err error
		certPool, err = x509.SystemCertPool()
		if err != nil {
			return nil, fmt.Errorf("failed to load system cert pool: %v", err)
		}
	}

	config := &tls.Config{
		Certificates:       certificates,
		RootCAs:            certPool,
		InsecureSkipVerify: *tlsInsecure,
	}

	return credentials.NewTLS(config), nil
}
