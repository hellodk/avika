// Package main implements a realistic NGINX fleet traffic simulator for Avika.
// It creates projects, environments, registers agents with geo-distributed labels,
// and generates realistic HTTP access log traffic with proper geo-IP mapping.
//
// Usage:
//
//	go run ./tests/workload -config tests/workload/config.json -duration 5m -rps 500
package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ── Config types ─────────────────────────────────────────────────────────────

type Config struct {
	Gateway  GatewayConfig            `json:"gateway"`
	Auth     AuthConfig               `json:"auth"`
	Projects []ProjectConfig          `json:"projects"`
	Agents   []AgentGroupConfig       `json:"agents"`
	Regions  map[string]RegionConfig  `json:"regions"`
	Traffic  TrafficConfig            `json:"traffic"`
}

type GatewayConfig struct {
	GRPCAddress string `json:"grpc_address"`
	HTTPAddress string `json:"http_address"`
}

type AuthConfig struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type ProjectConfig struct {
	Name         string              `json:"name"`
	Slug         string              `json:"slug"`
	Description  string              `json:"description"`
	Environments []EnvironmentConfig `json:"environments"`
}

type EnvironmentConfig struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	IsProduction bool   `json:"is_production"`
	Color        string `json:"color"`
}

type AgentGroupConfig struct {
	ID           string `json:"id"`
	Project      string `json:"project"`
	Environment  string `json:"environment"`
	Region       string `json:"region"`
	Count        int    `json:"count"`
	NginxVersion string `json:"nginx_version"`
}

type RegionConfig struct {
	ClientIPs  []string `json:"client_ips"`
	UserAgents []string `json:"user_agents"`
}

type TrafficConfig struct {
	URIs          []URIConfig       `json:"uris"`
	StatusWeights map[string]int    `json:"status_weights"`
	Methods       map[string]int    `json:"methods"`
	Referers      []string          `json:"referers"`
}

type URIConfig struct {
	Path      string `json:"path"`
	Weight    int    `json:"weight"`
	LatencyMS [2]int `json:"latency_ms"`
}

// ── Flags ────────────────────────────────────────────────────────────────────

var (
	configFile = flag.String("config", "tests/workload/config.json", "Path to workload config")
	duration   = flag.Duration("duration", 5*time.Minute, "Test duration")
	totalRPS   = flag.Int("rps", 500, "Total requests per second across all agents")
	setupOnly  = flag.Bool("setup-only", false, "Only create projects/environments, don't run traffic")
	skipSetup  = flag.Bool("skip-setup", false, "Skip project/environment setup, only run traffic")
	report     = flag.Duration("report", 10*time.Second, "Metrics report interval")
)

// ── Metrics ──────────────────────────────────────────────────────────────────

var (
	metricsSent      atomic.Int64
	metricsErrors    atomic.Int64
	metricsLatencyNs atomic.Int64
)

func main() {
	flag.Parse()

	cfg, err := loadConfig(*configFile)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	totalAgents := 0
	for _, ag := range cfg.Agents {
		totalAgents += ag.Count
	}

	log.Println("")
	log.Println("╔══════════════════════════════════════════════════════════════╗")
	log.Println("║           AVIKA WORKLOAD GENERATOR                          ║")
	log.Println("╠══════════════════════════════════════════════════════════════╣")
	log.Printf("║  Gateway gRPC:  %-42s ║", cfg.Gateway.GRPCAddress)
	log.Printf("║  Gateway HTTP:  %-42s ║", cfg.Gateway.HTTPAddress)
	log.Printf("║  Agents:        %-42d ║", totalAgents)
	log.Printf("║  Projects:      %-42d ║", len(cfg.Projects))
	log.Printf("║  Regions:       %-42d ║", len(cfg.Regions))
	log.Printf("║  Target RPS:    %-42d ║", *totalRPS)
	log.Printf("║  Duration:      %-42s ║", *duration)
	log.Println("╚══════════════════════════════════════════════════════════════╝")
	log.Println("")

	// ── Phase 1: Setup projects & environments ───────────────────────────
	if !*skipSetup {
		log.Println("▶ Phase 1: Setting up projects and environments...")
		if err := setupProjectsAndEnvironments(cfg); err != nil {
			log.Printf("  Warning: Setup had errors: %v (continuing anyway)", err)
		} else {
			log.Println("  ✓ Projects and environments created")
		}
	}

	if *setupOnly {
		log.Println("Setup complete (--setup-only). Exiting.")
		return
	}

	// ── Phase 2: Launch agents ───────────────────────────────────────────
	log.Println("▶ Phase 2: Launching simulated agents...")

	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	// Start metrics reporter
	go metricsReporter(ctx)

	var wg sync.WaitGroup
	rpsPerAgent := *totalRPS / totalAgents
	if rpsPerAgent < 1 {
		rpsPerAgent = 1
	}

	agentIndex := 0
	for _, ag := range cfg.Agents {
		regionCfg := cfg.Regions[ag.Region]
		for i := 0; i < ag.Count; i++ {
			agentID := strings.Replace(ag.ID, "{i}", fmt.Sprintf("%03d", i), 1)
			wg.Add(1)
			go func(id string, ag AgentGroupConfig, region RegionConfig) {
				defer wg.Done()
				runAgent(ctx, cfg, id, ag, region, rpsPerAgent)
			}(agentID, ag, regionCfg)
			agentIndex++
		}
	}
	log.Printf("  ✓ %d agents launched (%d RPS each)", totalAgents, rpsPerAgent)

	// ── Phase 3: Wait for completion ─────────────────────────────────────
	log.Println("▶ Phase 3: Running traffic simulation...")
	wg.Wait()

	// Final report
	sent := metricsSent.Load()
	errors := metricsErrors.Load()
	avgLat := time.Duration(0)
	if sent > 0 {
		avgLat = time.Duration(metricsLatencyNs.Load() / sent)
	}
	log.Println("")
	log.Println("═══════════════════════════════════════════════════════════════")
	log.Println("  WORKLOAD COMPLETE")
	log.Println("═══════════════════════════════════════════════════════════════")
	log.Printf("  Total Sent:    %d", sent)
	log.Printf("  Total Errors:  %d", errors)
	log.Printf("  Avg Latency:   %s", avgLat)
	if sent > 0 {
		log.Printf("  Success Rate:  %.2f%%", float64(sent-errors)/float64(sent)*100)
	}
	log.Println("═══════════════════════════════════════════════════════════════")
}

// ── Config loader ────────────────────────────────────────────────────────────

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// ── Phase 1: HTTP setup ──────────────────────────────────────────────────────

func setupProjectsAndEnvironments(cfg *Config) error {
	token, err := login(cfg)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}
	baseURL := cfg.Gateway.HTTPAddress

	for _, proj := range cfg.Projects {
		// Create project
		body := fmt.Sprintf(`{"name":"%s","slug":"%s","description":"%s"}`, proj.Name, proj.Slug, proj.Description)
		req, _ := http.NewRequest("POST", baseURL+"/api/projects", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "avika_session="+token)
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("  Warning: Failed to create project %s: %v", proj.Name, err)
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// Extract project ID
		var projResp struct {
			ID string `json:"id"`
		}
		json.Unmarshal(respBody, &projResp)
		projectID := projResp.ID
		if projectID == "" {
			// Try to get existing project
			projectID = getProjectID(client, baseURL, token, proj.Slug)
		}
		if projectID == "" {
			log.Printf("  Warning: Could not get ID for project %s", proj.Name)
			continue
		}
		log.Printf("  Project: %s (ID: %s)", proj.Name, projectID[:8])

		// Create environments
		for _, env := range proj.Environments {
			envBody := fmt.Sprintf(`{"name":"%s","slug":"%s","is_production":%v,"color":"%s"}`,
				env.Name, env.Slug, env.IsProduction, env.Color)
			req, _ := http.NewRequest("POST", baseURL+"/api/projects/"+projectID+"/environments", strings.NewReader(envBody))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", "avika_session="+token)
			resp, err := client.Do(req)
			if err != nil {
				log.Printf("    Warning: Failed to create env %s: %v", env.Name, err)
				continue
			}
			resp.Body.Close()
			log.Printf("    Environment: %s (%s)", env.Name, env.Slug)
		}
	}
	return nil
}

func login(cfg *Config) (string, error) {
	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}
	body := fmt.Sprintf(`{"username":"%s","password":"%s"}`, cfg.Auth.Username, cfg.Auth.Password)
	resp, err := client.Post(cfg.Gateway.HTTPAddress+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var loginResp struct {
		Token string `json:"token"`
	}
	json.NewDecoder(resp.Body).Decode(&loginResp)
	if loginResp.Token == "" {
		return "", fmt.Errorf("empty token in login response")
	}
	return loginResp.Token, nil
}

func getProjectID(client *http.Client, baseURL, token, slug string) string {
	req, _ := http.NewRequest("GET", baseURL+"/api/projects", nil)
	req.Header.Set("Cookie", "avika_session="+token)
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var projects []struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	}
	json.NewDecoder(resp.Body).Decode(&projects)
	for _, p := range projects {
		if p.Slug == slug {
			return p.ID
		}
	}
	return ""
}

// ── Phase 2: Agent simulation ────────────────────────────────────────────────

func runAgent(ctx context.Context, cfg *Config, agentID string, ag AgentGroupConfig, region RegionConfig, rps int) {
	conn, err := grpc.Dial(cfg.Gateway.GRPCAddress,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithWriteBufferSize(512*1024),
		grpc.WithReadBufferSize(512*1024),
	)
	if err != nil {
		log.Printf("Agent %s: connect error: %v", agentID, err)
		metricsErrors.Add(1)
		return
	}
	defer conn.Close()

	client := pb.NewCommanderClient(conn)
	stream, err := client.Connect(ctx)
	if err != nil {
		log.Printf("Agent %s: stream error: %v", agentID, err)
		metricsErrors.Add(1)
		return
	}

	// Start receiving server commands (discard — required to keep stream alive)
	go func() {
		for {
			_, err := stream.Recv()
			if err != nil {
				return
			}
		}
	}()

	// Initial heartbeat with labels for auto-assignment
	sendHeartbeat(stream, agentID, ag)

	// Traffic generation
	sendInterval := time.Second / time.Duration(rps)
	if sendInterval < 100*time.Microsecond {
		sendInterval = 100 * time.Microsecond
	}
	ticker := time.NewTicker(sendInterval)
	defer ticker.Stop()

	heartbeatTicker := time.NewTicker(15 * time.Second)
	defer heartbeatTicker.Stop()

	uriSelector := buildWeightedSelector(cfg.Traffic.URIs)
	statusSelector := buildStatusSelector(cfg.Traffic.StatusWeights)
	methodSelector := buildMethodSelector(cfg.Traffic.Methods)

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeatTicker.C:
			sendHeartbeat(stream, agentID, ag)
		case <-ticker.C:
			start := time.Now()
			var msg *pb.AgentMessage

			if rand.Float32() < 0.85 {
				msg = generateRealisticLog(agentID, region, cfg.Traffic, uriSelector, statusSelector, methodSelector)
			} else {
				msg = generateRealisticMetrics(agentID, ag)
			}

			if err := stream.Send(msg); err != nil {
				metricsErrors.Add(1)
				return // reconnect on error
			}
			metricsSent.Add(1)
			metricsLatencyNs.Add(time.Since(start).Nanoseconds())
		}
	}
}

func sendHeartbeat(stream pb.Commander_ConnectClient, agentID string, ag AgentGroupConfig) {
	start := time.Now()
	err := stream.Send(&pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Heartbeat{
			Heartbeat: &pb.Heartbeat{
				Hostname:     agentID,
				Version:      ag.NginxVersion,
				AgentVersion: "1.109.5",
				Uptime:       float64(time.Since(start).Seconds()) + 3600,
				Instances: []*pb.NginxInstance{
					{Pid: "1", Version: ag.NginxVersion, ConfPath: "/etc/nginx/nginx.conf", Status: "running"},
				},
				IsPod: true,
				PodIp: fmt.Sprintf("10.244.%d.%d", rand.Intn(255), rand.Intn(255)),
				Labels: map[string]string{
					"project":     ag.Project,
					"environment": ag.Environment,
					"region":      ag.Region,
				},
			},
		},
	})
	if err != nil {
		metricsErrors.Add(1)
		return
	}
	metricsSent.Add(1)
	metricsLatencyNs.Add(time.Since(start).Nanoseconds())
}

// ── Traffic generators ───────────────────────────────────────────────────────

func generateRealisticLog(agentID string, region RegionConfig, traffic TrafficConfig, uriSel, statusSel, methodSel []int) *pb.AgentMessage {
	uri := traffic.URIs[pickWeighted(uriSel)]
	status := statusSel[rand.Intn(len(statusSel))]
	method := methodSel[rand.Intn(len(methodSel))]

	clientIP := ""
	userAgent := "Mozilla/5.0"
	if len(region.ClientIPs) > 0 {
		clientIP = region.ClientIPs[rand.Intn(len(region.ClientIPs))]
	}
	if len(region.UserAgents) > 0 {
		userAgent = region.UserAgents[rand.Intn(len(region.UserAgents))]
	}

	// Latency varies by status code — errors tend to be slower
	latMin, latMax := uri.LatencyMS[0], uri.LatencyMS[1]
	if status >= 500 {
		latMin *= 3
		latMax *= 5
	} else if status == 429 {
		latMin = 1
		latMax = 5
	}
	latencyMs := latMin + rand.Intn(latMax-latMin+1)

	bodySize := 200 + rand.Intn(50000)
	if strings.HasPrefix(uri.Path, "/static/") || strings.HasPrefix(uri.Path, "/images/") {
		bodySize = 10000 + rand.Intn(500000)
	}

	referer := ""
	if len(traffic.Referers) > 0 {
		referer = traffic.Referers[rand.Intn(len(traffic.Referers))]
	}

	methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	methodStr := methods[0]
	if method < len(methods) {
		methodStr = methods[method]
	}

	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_LogEntry{
			LogEntry: &pb.LogEntry{
				Timestamp:     time.Now().UnixMilli(),
				LogType:       "access",
				RemoteAddr:    clientIP,
				RequestMethod: methodStr,
				RequestUri:    uri.Path,
				Status:        int32(status),
				BodyBytesSent: int64(bodySize),
				RequestTime:   float32(latencyMs) / 1000.0,
				UserAgent:     userAgent,
				Referer:       referer,
				XForwardedFor: clientIP,
				RequestId:     fmt.Sprintf("%08x%08x%08x%08x", rand.Uint32(), rand.Uint32(), rand.Uint32(), rand.Uint32()),
			},
		},
	}
}

func generateRealisticMetrics(agentID string, ag AgentGroupConfig) *pb.AgentMessage {
	active := int64(50 + rand.Intn(200))
	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Metrics{
			Metrics: &pb.NginxMetrics{
				ActiveConnections:   active,
				AcceptedConnections: int64(100000 + rand.Intn(500000)),
				HandledConnections:  int64(100000 + rand.Intn(500000)),
				TotalRequests:       int64(500000 + rand.Intn(2000000)),
				Reading:             int64(rand.Intn(20)),
				Writing:             int64(rand.Intn(int(active))),
				Waiting:             int64(rand.Intn(int(active))),
				RequestsPerSecond:   float64(100 + rand.Intn(1000)),
				System: &pb.SystemMetrics{
					CpuUsagePercent:    float32(5 + rand.Intn(60)),
					MemoryUsagePercent: float32(30 + rand.Intn(50)),
					MemoryTotalBytes:   8 * 1024 * 1024 * 1024,
					MemoryUsedBytes:    uint64((3 + rand.Intn(5)) * 1024 * 1024 * 1024),
					NetworkRxBytes:     uint64(rand.Intn(1000000000)),
					NetworkTxBytes:     uint64(rand.Intn(1000000000)),
					NetworkRxRate:      float32(rand.Intn(100000)),
					NetworkTxRate:      float32(rand.Intn(100000)),
				},
			},
		},
	}
}

// ── Weighted selection helpers ───────────────────────────────────────────────

func buildWeightedSelector(uris []URIConfig) []int {
	var sel []int
	for i, u := range uris {
		for j := 0; j < u.Weight; j++ {
			sel = append(sel, i)
		}
	}
	return sel
}

func buildStatusSelector(weights map[string]int) []int {
	var sel []int
	for code, w := range weights {
		var c int
		fmt.Sscanf(code, "%d", &c)
		for i := 0; i < w; i++ {
			sel = append(sel, c)
		}
	}
	return sel
}

func buildMethodSelector(weights map[string]int) []int {
	methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	var sel []int
	for i, m := range methods {
		if w, ok := weights[m]; ok {
			for j := 0; j < w; j++ {
				sel = append(sel, i)
			}
		}
	}
	return sel
}

func pickWeighted(sel []int) int {
	return sel[rand.Intn(len(sel))]
}

// ── Metrics reporter ─────────────────────────────────────────────────────────

func metricsReporter(ctx context.Context) {
	ticker := time.NewTicker(*report)
	defer ticker.Stop()

	lastSent := int64(0)
	lastTime := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sent := metricsSent.Load()
			errors := metricsErrors.Load()
			now := time.Now()

			intervalSent := sent - lastSent
			rps := float64(intervalSent) / now.Sub(lastTime).Seconds()

			avgLat := time.Duration(0)
			if sent > 0 {
				avgLat = time.Duration(metricsLatencyNs.Load() / sent)
			}

			log.Printf("📊 Sent: %d | Errors: %d | RPS: %.0f | Avg Latency: %s",
				sent, errors, rps, avgLat)

			lastSent = sent
			lastTime = now
		}
	}
}
