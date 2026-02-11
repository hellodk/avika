package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"sync"

	"github.com/user/nginx-manager/cmd/agent/buffer"
	"github.com/user/nginx-manager/cmd/agent/config"
	"github.com/user/nginx-manager/cmd/agent/discovery"
	"github.com/user/nginx-manager/cmd/agent/health"
	"github.com/user/nginx-manager/cmd/agent/logs"
	"github.com/user/nginx-manager/cmd/agent/metrics"
	"github.com/user/nginx-manager/cmd/agent/updater"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/proto"
)

var (
	serverAddr = flag.String("server", "localhost:50051", "The server address in the format of host:port")
	agentID    = flag.String("id", "", "The agent ID (default: hostname-ip)")
	logLevel   = flag.String("log-level", "info", "Log level (debug, info, error)")
	logFile    = flag.String("log-file", "", "Path to log file. If empty, logs to stdout")
	bufferDir  = flag.String("buffer-dir", "./", "Directory to store the persistent buffer")
	version    = flag.Bool("version", false, "Display version and exit")
	healthPort = flag.Int("health-port", 8080, "Port for health check endpoints")

	// NGINX configuration
	nginxStatusURL = flag.String("nginx-status-url", "http://127.0.0.1/nginx_status", "URL for NGINX stub_status")
	accessLogPath  = flag.String("access-log-path", "/var/log/nginx/access.log", "Path to NGINX access log")
	errorLogPath   = flag.String("error-log-path", "/var/log/nginx/error.log", "Path to NGINX error log")
	logFormat      = flag.String("log-format", "combined", "Log format (combined or json)")

	// Self-Update
	updateServer   = flag.String("update-server", "", "URL of the update server (e.g., http://192.168.1.10:8090). If empty, self-update is disabled")
	updateInterval = flag.Duration("update-interval", 168*time.Hour, "Interval between update checks (default: 1 week)")

	// Config File
	configFile = flag.String("config", "/etc/avika/avika-agent.conf", "Path to configuration file")
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
	startTime     = time.Now()
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
		case "GATEWAY_SERVER":
			if !setFlags["server"] {
				*serverAddr = val
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
		}
	}
	return scanner.Err()
}

func main() {
	flag.Parse()

	// Load configuration
	if err := loadConfig(*configFile); err != nil {
		if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Warning: Failed to load config file: %v\n", err)
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

	log.Printf("Starting agent %s (version %s) with server %s", *agentID, Version, *serverAddr)

	// 2. Start Health Check Server
	healthServer := health.NewServer(*healthPort)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := healthServer.Start(); err != nil {
			log.Printf("Health server error: %v", err)
		}
	}()

	// 3. Start Self-Updater (if enabled)
	if *updateServer != "" {
		globalUpdater = updater.New(*updateServer, Version)
		wg.Add(1)
		go func() {
			defer wg.Done()
			globalUpdater.Run(*updateInterval)
		}()
	}

	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := healthServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("Health server shutdown error: %v", err)
		}
	}()

	// 3. Initialize Persistent Buffer
	wal, err := buffer.NewFileBuffer(*bufferDir + "agent")
	if err != nil {
		log.Printf("FATAL: Failed to initialize buffer: %v", err)
		os.Exit(1)
	}
	defer func() {
		log.Println("Closing buffer...")
		if err := wal.Close(); err != nil {
			log.Printf("Error closing buffer: %v", err)
		}
	}()

	// Initial backup on node add/start
	if err := config.BackupNginxConfig("startup"); err != nil {
		log.Printf("Warning: startup backup failed: %v", err)
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
				log.Println("Log collection goroutine shutting down...")
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
				log.Println("Metrics collection goroutine shutting down...")
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
				if len(instances) > 0 {
					primaryNginxVersion = instances[0].Version
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
						},
					},
				}
				writeToBuffer(wal, hbMsg)

				// Metrics
				nginxMetrics, err := metricsCollector.Collect()
				if err != nil {
					log.Printf("Metrics collection failed: %v", err)
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
		startMgmtService(ctx)
	}()

	// Mark service as ready
	healthServer.SetReady(true)
	log.Println("Agent is ready")

	// -------------------------------------------------------------------------
	// Sender (Consumer) -> Gateway
	// -------------------------------------------------------------------------
	wg.Add(1)
	go func() {
		defer wg.Done()
		senderLoop(ctx, wal, *agentID)
	}()

	// Wait for shutdown signal
	sig := <-sigChan
	log.Printf("Received signal %v, initiating graceful shutdown...", sig)

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
		log.Println("All goroutines stopped gracefully")
	case <-time.After(30 * time.Second):
		log.Println("Shutdown timeout exceeded, forcing exit")
	}

	log.Println("Agent shutdown complete")
}

func getOrGenerateAgentID() string {
	const idFile = ".agent_id"

	// 1. Try reading from file
	data, err := os.ReadFile(idFile)
	if err == nil {
		id := strings.TrimSpace(string(data))
		if id != "" {
			return id
		}
	}

	// 2. Fallback to generating new one
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "unknown"
	}

	// Get outbound IP for initial ID generation
	ip := "unknown"
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		localAddr := conn.LocalAddr().(*net.UDPAddr)
		ip = localAddr.IP.String()
		conn.Close()
	}

	hostname = strings.ReplaceAll(hostname, " ", "-")
	id := fmt.Sprintf("%s+%s", hostname, ip)

	// 3. Persist for next restart
	if err := os.WriteFile(idFile, []byte(id), 0644); err != nil {
		log.Printf("Warning: failed to persist agent ID: %v", err)
	}

	return id
}

func writeToBuffer(wal *buffer.FileBuffer, msg *pb.AgentMessage) {
	log.Printf("Writing message to buffer: type %T", msg.Payload)
	data, err := proto.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	if err := wal.Write(data); err != nil {
		log.Printf("Failed to write to buffer: %v", err)
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

	// Determine log path based on type
	logPath := *accessLogPath
	if req.LogType == "error" {
		logPath = *errorLogPath
	}

	// 1. Get Tail (Last N lines)
	logEntries, err := logs.GetLastN(logPath, int(req.TailLines))
	if err != nil {
		log.Printf("Failed to get last N logs: %v", err)
		return
	}

	log.Printf("Sending %d historical log entries for %s", len(logEntries), cmdID)

	// 2. Send entries back via stream
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
}

func senderLoop(ctx context.Context, wal *buffer.FileBuffer, agentID string) {
	defer log.Println("Sender loop exited")
	var conn *grpc.ClientConn
	var client pb.CommanderClient
	ss := &StreamSync{}

	for {
		select {
		case <-ctx.Done():
			log.Println("Sender loop shutting down...")
			if conn != nil {
				conn.Close()
			}
			return
		default:
		}

		// 1. Connect / Reconnect
		if ss.GetStream() == nil {
			var err error
			// Strip protocol if present (gRPC dial expects host:port)
			targetAddr := *serverAddr
			targetAddr = strings.TrimPrefix(targetAddr, "http://")
			targetAddr = strings.TrimPrefix(targetAddr, "https://")

			log.Printf("Connecting to %s...", targetAddr)

			// Dial with backoff? Simple wait for now
			conn, err = grpc.Dial(targetAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				log.Printf("Connection failed: %v. Retrying in 5s...", err)
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
				log.Printf("Stream creation failed: %v. Retrying in 5s...", err)
				conn.Close()
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}
			ss.SetStream(stream)
			log.Println("Connected to Gateway")

			// Start Receiver routine (for commands)
			go func() {
				// Ensure receiver exits when context is done
				defer func() {
					log.Println("Receiver routine exiting")
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
						log.Printf("Stream disconnected (Recv): %v", err)
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
		log.Printf("Sending message from buffer: type %T", msg.Payload)
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
		log.Printf("Successfully sent message")

		// Success -> Ack
		if err := wal.Ack(offset); err != nil {
			log.Printf("Failed to ack offset: %v", err)
		}
	}
}

func setupLogging() error {
	if *logFile != "" {
		f, err := os.OpenFile(*logFile, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
		if err != nil {
			return fmt.Errorf("error opening log file: %w", err)
		}
		log.SetOutput(f)
	}
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	return nil
}
