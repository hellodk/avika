// Package main — Avika workload generator.
// Simulates a geo-distributed NGINX fleet with realistic HTTP traffic including
// bots, diverse devices, referrers, and historical time-spread data.
//
// Usage:
//
//	go run ./tests/workload -config tests/workload/config.json -duration 5m -rps 500
//	go run ./tests/workload -config tests/workload/config.json -backfill 24h -rps 1000
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

	"crypto/x509"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

// ── Flags ────────────────────────────────────────────────────────────────────

var (
	configFile  = flag.String("config", "tests/workload/config.json", "Path to workload config")
	duration    = flag.Duration("duration", 5*time.Minute, "Real-time traffic duration")
	totalRPS    = flag.Int("rps", 500, "Total requests per second across all agents")
	backfill    = flag.Duration("backfill", 0, "Historical backfill window (e.g. 24h, 7d). Inserts past data rapidly.")
	setupOnly   = flag.Bool("setup-only", false, "Only create projects/environments")
	skipSetup   = flag.Bool("skip-setup", false, "Skip project/environment setup")
	report      = flag.Duration("report", 10*time.Second, "Metrics report interval")
	enableTLS   = flag.Bool("tls", false, "Enable TLS for gRPC connection")
	tlsCA       = flag.String("tls-ca", "", "CA certificate path (default: certs/ca.crt if exists, or TLS_CA_CERT_FILE env)")
	tlsInsecure = flag.Bool("tls-insecure", false, "Skip TLS certificate verification")
)

// ── Metrics ──────────────────────────────────────────────────────────────────

var (
	metricsSent      atomic.Int64
	metricsErrors    atomic.Int64
	metricsLatencyNs atomic.Int64
)

// ── Region data: IPs mapped to gateway's well-known GeoIP database ───────────

type regionData struct {
	clientIPs  []string
	userAgents []userAgentEntry
}

type userAgentEntry struct {
	ua     string
	weight int // higher = more likely
}

// All IPs match cmd/gateway/geo/geoip.go wellKnownIPs for accurate geo mapping.
var regions = map[string]regionData{
	"us-east": {
		clientIPs: []string{
			"8.8.8.8", "8.8.4.4",           // Google DNS → Mountain View
			"52.95.110.1",                    // AWS → Ashburn VA
			"13.107.21.200",                  // Microsoft → Redmond
			"34.117.59.81",                   // Google Cloud → Oregon
			"185.199.108.153",                // GitHub → San Francisco
			"151.101.1.69",                   // Fastly → San Francisco
			"104.16.132.229",                 // Cloudflare → San Francisco
			"99.79.0.1",                      // Rogers → Toronto (nearby)
		},
		userAgents: desktopMobileTabletBotMix("us"),
	},
	"eu-west": {
		clientIPs: []string{
			"91.198.174.192", // Wikimedia → Amsterdam
			"185.93.0.1",     // BT → London
			"185.157.0.1",    // Deutsche Telekom → Frankfurt
			"80.67.169.12",   // FDN → Paris
			"77.88.8.8",      // Yandex → Moscow
		},
		userAgents: desktopMobileTabletBotMix("eu"),
	},
	"ap-south": {
		clientIPs: []string{
			"103.10.124.1",  // Reliance Jio → Mumbai
			"49.36.128.1",   // Airtel → New Delhi
			"103.21.244.0",  // Cloudflare → Singapore
		},
		userAgents: desktopMobileTabletBotMix("ap"),
	},
	"ap-tokyo": {
		clientIPs: []string{
			"203.0.113.10",  // Test → Tokyo
			"202.12.29.205", // APNIC → Osaka
			"168.126.63.1",  // Korea Telecom → Seoul
		},
		userAgents: desktopMobileTabletBotMix("ap"),
	},
	"latam": {
		clientIPs: []string{
			"177.54.144.106", // Claro → São Paulo
			"189.240.36.1",   // Telmex → Mexico City
		},
		userAgents: desktopMobileTabletBotMix("latam"),
	},
	"africa": {
		clientIPs: []string{
			"41.203.65.114", // MTN → Johannesburg
			"196.216.2.1",   // MainOne → Lagos
		},
		userAgents: desktopMobileTabletBotMix("africa"),
	},
	"mena": {
		clientIPs: []string{
			"94.200.0.1", // Etisalat → Dubai
			"223.5.5.5",  // Alibaba → Hangzhou
		},
		userAgents: desktopMobileTabletBotMix("mena"),
	},
	"oceania": {
		clientIPs: []string{
			"1.1.1.1",     // Cloudflare → Sydney
			"1.0.0.1",     // Cloudflare → Sydney
			"139.130.4.5", // Telstra → Melbourne
		},
		userAgents: desktopMobileTabletBotMix("au"),
	},
}

// desktopMobileTabletBotMix returns a realistic 55% mobile / 35% desktop / 5% tablet / 5% bot
// distribution with region-appropriate device models.
func desktopMobileTabletBotMix(region string) []userAgentEntry {
	return []userAgentEntry{
		// ── Desktop (35%) ──
		{weight: 8, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
		{weight: 5, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"},
		{weight: 4, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"},
		{weight: 4, ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
		{weight: 3, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
		{weight: 3, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"},
		{weight: 2, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0"},
		{weight: 1, ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0"},
		// ── Mobile (55%) ──
		{weight: 12, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"},
		{weight: 10, ua: "Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
		{weight: 8, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
		{weight: 6, ua: "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"},
		{weight: 5, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"},
		{weight: 4, ua: "Mozilla/5.0 (Linux; Android 12; TECNO KI7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"},
		{weight: 3, ua: "Mozilla/5.0 (Linux; Android 13; Redmi Note 12 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"},
		{weight: 3, ua: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36"},
		// ── Tablet (5%) ──
		{weight: 3, ua: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"},
		{weight: 2, ua: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
		// ── Bots (5%) ──
		{weight: 2, ua: "Googlebot/2.1 (+http://www.google.com/bot.html)"},
		{weight: 1, ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"},
		{weight: 1, ua: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"},
		{weight: 1, ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"},
		{weight: 1, ua: "Twitterbot/1.0"},
		{weight: 1, ua: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)"},
		{weight: 1, ua: "curl/8.7.1"},
		{weight: 1, ua: "python-requests/2.31.0"},
	}
}

// ── Traffic patterns ─────────────────────────────────────────────────────────

type uriPattern struct {
	path      string
	weight    int
	latMinMs  int
	latMaxMs  int
}

var uriPatterns = []uriPattern{
	{"/", 15, 5, 30},
	{"/api/v1/users", 12, 10, 80},
	{"/api/v1/products", 10, 15, 120},
	{"/api/v1/orders", 8, 20, 200},
	{"/api/v1/auth/login", 6, 30, 150},
	{"/api/v1/search", 5, 50, 500},
	{"/health", 10, 1, 5},
	{"/static/js/app.bundle.js", 6, 2, 10},
	{"/static/css/main.css", 4, 2, 8},
	{"/static/js/vendor.js", 3, 2, 12},
	{"/images/logo.png", 3, 3, 15},
	{"/images/hero.webp", 2, 5, 25},
	{"/api/v1/notifications", 3, 10, 60},
	{"/api/v1/analytics", 2, 100, 800},
	{"/webhook/stripe", 2, 50, 300},
	{"/graphql", 4, 20, 250},
	{"/api/v2/feed", 3, 30, 200},
	{"/.well-known/openid-configuration", 1, 5, 20},
	{"/robots.txt", 2, 1, 3},
	{"/favicon.ico", 2, 1, 5},
	{"/sitemap.xml", 1, 5, 20},
	{"/api/v1/upload", 1, 100, 2000},
	{"/admin/dashboard", 1, 20, 100},
	{"/api/v1/ws/chat", 1, 10, 50},
}

// Weighted status codes: realistic distribution
var statusWeights = []struct {
	code   int32
	weight int
}{
	{200, 55}, {201, 8}, {204, 3}, {206, 1},
	{301, 4}, {302, 3}, {304, 5},
	{400, 3}, {401, 4}, {403, 2}, {404, 6}, {405, 1}, {429, 2},
	{500, 1}, {502, 1}, {503, 1}, {504, 1},
}

var methodWeights = []struct {
	method string
	weight int
}{
	{"GET", 65}, {"POST", 20}, {"PUT", 8}, {"DELETE", 4}, {"PATCH", 3},
}

var referrers = []struct {
	ref    string
	weight int
}{
	{"", 40}, // direct / no referrer
	{"https://www.google.com/search?q=nginx+monitoring", 10},
	{"https://www.google.com/search?q=avika+fleet+manager", 5},
	{"https://www.google.com/", 5},
	{"https://www.bing.com/search?q=nginx+management", 3},
	{"https://duckduckgo.com/?q=nginx+dashboard", 2},
	{"https://search.yahoo.com/search?p=nginx", 1},
	{"https://yandex.ru/search/?text=nginx", 1},
	{"https://www.reddit.com/r/nginx/comments/abc123", 3},
	{"https://news.ycombinator.com/item?id=12345678", 3},
	{"https://twitter.com/someone/status/123456", 2},
	{"https://www.linkedin.com/feed/update/urn:li:activity:123", 2},
	{"https://www.facebook.com/share?u=", 2},
	{"https://github.com/hellodk/avika", 4},
	{"https://stackoverflow.com/questions/12345/nginx-config", 2},
	{"https://dev.to/hellodk/avika-nginx-manager-abc", 1},
	{"https://medium.com/@user/nginx-fleet-management-123", 1},
	{"https://t.me/nginx_community", 1},
	{"https://slack-redir.net/link?url=https://avika.example.com", 1},
}

// ── Config types ─────────────────────────────────────────────────────────────

type Config struct {
	Gateway  struct {
		GRPCAddress string `json:"grpc_address"`
		HTTPAddress string `json:"http_address"`
	} `json:"gateway"`
	Auth struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"auth"`
	Projects []struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Description  string `json:"description"`
		Environments []struct {
			Name         string `json:"name"`
			Slug         string `json:"slug"`
			IsProduction bool   `json:"is_production"`
			Color        string `json:"color"`
		} `json:"environments"`
	} `json:"projects"`
	Agents []struct {
		ID           string `json:"id"`
		Project      string `json:"project"`
		Environment  string `json:"environment"`
		Region       string `json:"region"`
		Count        int    `json:"count"`
		NginxVersion string `json:"nginx_version"`
	} `json:"agents"`
}

// ── Pre-built weighted selectors (built once at startup) ─────────────────────

var (
	uriSel      []int
	statusSel   []int32
	methodSel   []string
	referrerSel []string
)

func init() {
	for i, u := range uriPatterns {
		for j := 0; j < u.weight; j++ {
			uriSel = append(uriSel, i)
		}
	}
	for _, s := range statusWeights {
		for j := 0; j < s.weight; j++ {
			statusSel = append(statusSel, s.code)
		}
	}
	for _, m := range methodWeights {
		for j := 0; j < m.weight; j++ {
			methodSel = append(methodSel, m.method)
		}
	}
	for _, r := range referrers {
		for j := 0; j < r.weight; j++ {
			referrerSel = append(referrerSel, r.ref)
		}
	}
}

// resolveGRPCCreds builds gRPC transport credentials based on TLS flags.
// Resolution: -tls-ca flag → TLS_CA_CERT_FILE env → certs/ca.crt (if exists) → skip verify
func resolveGRPCCreds() grpc.DialOption {
	if !*enableTLS {
		return grpc.WithTransportCredentials(insecure.NewCredentials())
	}

	tlsConfig := &tls.Config{}

	caPath := *tlsCA
	if caPath == "" {
		caPath = os.Getenv("TLS_CA_CERT_FILE")
	}
	if caPath == "" {
		if _, err := os.Stat("certs/ca.crt"); err == nil {
			caPath = "certs/ca.crt"
		}
	}

	if caPath != "" {
		caCert, err := os.ReadFile(caPath)
		if err != nil {
			log.Printf("Warning: Could not read CA file %s: %v. Falling back to skip-verify.", caPath, err)
			tlsConfig.InsecureSkipVerify = true
		} else {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM(caCert) {
				log.Printf("Warning: CA file %s contains no valid certificates. Falling back to skip-verify.", caPath)
				tlsConfig.InsecureSkipVerify = true
			} else {
				tlsConfig.RootCAs = pool
				log.Printf("TLS enabled with CA: %s", caPath)
			}
		}
	} else {
		log.Printf("TLS enabled with system certificate pool")
	}

	if *tlsInsecure {
		tlsConfig.InsecureSkipVerify = true
	}

	return grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig))
}

func buildUASel(entries []userAgentEntry) []int {
	var sel []int
	for i, e := range entries {
		for j := 0; j < e.weight; j++ {
			sel = append(sel, i)
		}
	}
	return sel
}

// ── Main ─────────────────────────────────────────────────────────────────────

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

	mode := "real-time"
	if *backfill > 0 {
		mode = fmt.Sprintf("backfill %s", *backfill)
	}

	log.Println("")
	log.Println("╔══════════════════════════════════════════════════════════════╗")
	log.Println("║           AVIKA WORKLOAD GENERATOR                          ║")
	log.Println("╠══════════════════════════════════════════════════════════════╣")
	log.Printf("║  Gateway gRPC:  %-42s ║", cfg.Gateway.GRPCAddress)
	log.Printf("║  Gateway HTTP:  %-42s ║", cfg.Gateway.HTTPAddress)
	log.Printf("║  Agents:        %-42d ║", totalAgents)
	log.Printf("║  Projects:      %-42d ║", len(cfg.Projects))
	log.Printf("║  Regions:       %-42d ║", len(regions))
	log.Printf("║  Target RPS:    %-42d ║", *totalRPS)
	log.Printf("║  Mode:          %-42s ║", mode)
	if *backfill == 0 {
		log.Printf("║  Duration:      %-42s ║", *duration)
	}
	log.Println("╚══════════════════════════════════════════════════════════════╝")
	log.Println("")

	// ── Phase 1: Setup ───────────────────────────────────────────────────
	if !*skipSetup {
		log.Println("▶ Phase 1: Setting up projects and environments...")
		if err := setupProjects(cfg); err != nil {
			log.Printf("  Warning: Setup had errors: %v (continuing)", err)
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

	var ctx context.Context
	var cancel context.CancelFunc
	if *backfill > 0 {
		ctx, cancel = context.WithCancel(context.Background())
	} else {
		ctx, cancel = context.WithTimeout(context.Background(), *duration)
	}
	defer cancel()

	go metricsReporter(ctx)

	var wg sync.WaitGroup
	rpsPerAgent := *totalRPS / totalAgents
	if rpsPerAgent < 1 {
		rpsPerAgent = 1
	}

	for _, ag := range cfg.Agents {
		region, ok := regions[ag.Region]
		if !ok {
			region = regions["us-east"] // fallback
		}
		uaSel := buildUASel(region.userAgents)

		for i := 0; i < ag.Count; i++ {
			agentID := strings.Replace(ag.ID, "{i}", fmt.Sprintf("%03d", i), 1)
			wg.Add(1)
			go func(id string, ag struct {
				ID           string `json:"id"`
				Project      string `json:"project"`
				Environment  string `json:"environment"`
				Region       string `json:"region"`
				Count        int    `json:"count"`
				NginxVersion string `json:"nginx_version"`
			}, r regionData, sel []int) {
				defer wg.Done()
				if *backfill > 0 {
					runBackfillAgent(ctx, cancel, cfg, id, ag.Project, ag.Environment, ag.NginxVersion, r, sel, rpsPerAgent)
				} else {
					runRealtimeAgent(ctx, cfg, id, ag.Project, ag.Environment, ag.NginxVersion, r, sel, rpsPerAgent)
				}
			}(agentID, ag, region, uaSel)
		}
	}
	log.Printf("  ✓ %d agents launched (%d RPS each)", totalAgents, rpsPerAgent)
	log.Println("▶ Phase 3: Running traffic simulation...")

	wg.Wait()
	printFinalReport()
}

// ── Real-time agent: sends data with current timestamps ──────────────────────

func runRealtimeAgent(ctx context.Context, cfg *Config, agentID, project, env, nginxVer string, region regionData, uaSel []int, rps int) {
	stream := connectAgent(ctx, cfg, agentID, project, env, nginxVer)
	if stream == nil {
		return
	}

	sendInterval := time.Second / time.Duration(rps)
	if sendInterval < 100*time.Microsecond {
		sendInterval = 100 * time.Microsecond
	}
	ticker := time.NewTicker(sendInterval)
	defer ticker.Stop()
	hbTicker := time.NewTicker(15 * time.Second)
	defer hbTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-hbTicker.C:
			sendHB(stream, agentID, project, env, nginxVer)
		case <-ticker.C:
			ts := time.Now()
			if err := sendTraffic(stream, agentID, region, uaSel, ts, nginxVer); err != nil {
				return
			}
		}
	}
}

// ── Backfill agent: sends historical data rapidly ────────────────────────────

func runBackfillAgent(ctx context.Context, cancel context.CancelFunc, cfg *Config, agentID, project, env, nginxVer string, region regionData, uaSel []int, rps int) {
	stream := connectAgent(ctx, cfg, agentID, project, env, nginxVer)
	if stream == nil {
		return
	}

	now := time.Now()
	start := now.Add(-*backfill)
	step := time.Second / time.Duration(rps)
	if step < time.Millisecond {
		step = time.Millisecond
	}

	for ts := start; ts.Before(now); ts = ts.Add(step) {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if err := sendTraffic(stream, agentID, region, uaSel, ts, nginxVer); err != nil {
			return
		}
		// Yield occasionally to avoid starving other goroutines
		if rand.Intn(100) == 0 {
			time.Sleep(time.Microsecond)
		}
	}
}

// ── Shared agent helpers ─────────────────────────────────────────────────────

func connectAgent(ctx context.Context, cfg *Config, agentID, project, env, nginxVer string) pb.Commander_ConnectClient {
	conn, err := grpc.Dial(cfg.Gateway.GRPCAddress,
		resolveGRPCCreds(),
		grpc.WithWriteBufferSize(512*1024),
		grpc.WithReadBufferSize(512*1024),
	)
	if err != nil {
		log.Printf("Agent %s: connect error: %v", agentID, err)
		metricsErrors.Add(1)
		return nil
	}

	client := pb.NewCommanderClient(conn)
	stream, err := client.Connect(ctx)
	if err != nil {
		log.Printf("Agent %s: stream error: %v", agentID, err)
		metricsErrors.Add(1)
		return nil
	}

	// Drain server commands
	go func() {
		for {
			if _, err := stream.Recv(); err != nil {
				return
			}
		}
	}()

	sendHB(stream, agentID, project, env, nginxVer)
	return stream
}

func sendHB(stream pb.Commander_ConnectClient, agentID, project, env, nginxVer string) {
	start := time.Now()
	err := stream.Send(&pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Heartbeat{
			Heartbeat: &pb.Heartbeat{
				Hostname:     agentID,
				Version:      nginxVer,
				AgentVersion: "1.109.6",
				Uptime:       3600 + rand.Float64()*36000,
				Instances: []*pb.NginxInstance{
					{Pid: "1", Version: nginxVer, ConfPath: "/etc/nginx/nginx.conf", Status: "running"},
				},
				IsPod: true,
				PodIp: fmt.Sprintf("10.244.%d.%d", rand.Intn(255), rand.Intn(255)),
				Labels: map[string]string{
					"project":     project,
					"environment": env,
				},
			},
		},
	})
	if err == nil {
		metricsSent.Add(1)
		metricsLatencyNs.Add(time.Since(start).Nanoseconds())
	}
}

func sendTraffic(stream pb.Commander_ConnectClient, agentID string, region regionData, uaSel []int, ts time.Time, nginxVer string) error {
	start := time.Now()
	var msg *pb.AgentMessage
	if rand.Float32() < 0.85 {
		msg = genLog(agentID, region, uaSel, ts)
	} else {
		msg = genMetrics(agentID, ts)
	}
	if err := stream.Send(msg); err != nil {
		metricsErrors.Add(1)
		return err
	}
	metricsSent.Add(1)
	metricsLatencyNs.Add(time.Since(start).Nanoseconds())
	return nil
}

// ── Log generation ───────────────────────────────────────────────────────────

func genLog(agentID string, region regionData, uaSel []int, ts time.Time) *pb.AgentMessage {
	uri := uriPatterns[uriSel[rand.Intn(len(uriSel))]]
	status := statusSel[rand.Intn(len(statusSel))]
	method := methodSel[rand.Intn(len(methodSel))]
	ref := referrerSel[rand.Intn(len(referrerSel))]

	clientIP := region.clientIPs[rand.Intn(len(region.clientIPs))]
	uaIdx := uaSel[rand.Intn(len(uaSel))]
	ua := region.userAgents[uaIdx].ua

	latMin, latMax := uri.latMinMs, uri.latMaxMs
	if status >= 500 {
		latMin *= 3
		latMax *= 5
	}
	latencyMs := latMin + rand.Intn(latMax-latMin+1)

	bodySize := int64(200 + rand.Intn(50000))
	if strings.HasPrefix(uri.path, "/static/") || strings.HasPrefix(uri.path, "/images/") {
		bodySize = int64(10000 + rand.Intn(500000))
	}
	if status == 204 || status == 304 {
		bodySize = 0
	}

	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: ts.Unix(),
		Payload: &pb.AgentMessage_LogEntry{
			LogEntry: &pb.LogEntry{
				Timestamp:     ts.UnixMilli(),
				LogType:       "access",
				RemoteAddr:    clientIP,
				RequestMethod: method,
				RequestUri:    uri.path,
				Status:        status,
				BodyBytesSent: bodySize,
				RequestTime:   float32(latencyMs) / 1000.0,
				UserAgent:     ua,
				Referer:       ref,
				XForwardedFor: clientIP,
				RequestId:     fmt.Sprintf("%08x%08x%08x%08x", rand.Uint32(), rand.Uint32(), rand.Uint32(), rand.Uint32()),
			},
		},
	}
}

func genMetrics(agentID string, ts time.Time) *pb.AgentMessage {
	active := int64(50 + rand.Intn(200))
	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: ts.Unix(),
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

// ── Project/environment setup via HTTP API ───────────────────────────────────

func setupProjects(cfg *Config) error {
	httpClient := &http.Client{
		Timeout:   15 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
	}
	token, err := login(cfg, httpClient)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	base := cfg.Gateway.HTTPAddress
	for _, proj := range cfg.Projects {
		body := fmt.Sprintf(`{"name":"%s","slug":"%s","description":"%s"}`, proj.Name, proj.Slug, proj.Description)
		req, _ := http.NewRequest("POST", base+"/api/projects", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", "avika_session="+token)
		resp, err := httpClient.Do(req)
		if err != nil {
			log.Printf("  Warning: create project %s: %v", proj.Name, err)
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var pr struct{ ID string `json:"id"` }
		json.Unmarshal(respBody, &pr)
		pid := pr.ID
		if pid == "" {
			pid = getProjectID(httpClient, base, token, proj.Slug)
		}
		if pid == "" {
			continue
		}
		log.Printf("  Project: %s (ID: %s)", proj.Name, pid[:min(8, len(pid))])

		for _, env := range proj.Environments {
			eb := fmt.Sprintf(`{"name":"%s","slug":"%s","is_production":%v,"color":"%s"}`, env.Name, env.Slug, env.IsProduction, env.Color)
			req, _ := http.NewRequest("POST", base+"/api/projects/"+pid+"/environments", strings.NewReader(eb))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", "avika_session="+token)
			resp, _ := httpClient.Do(req)
			if resp != nil {
				resp.Body.Close()
			}
			log.Printf("    Environment: %s", env.Name)
		}
	}
	return nil
}

func login(cfg *Config, client *http.Client) (string, error) {
	body := fmt.Sprintf(`{"username":"%s","password":"%s"}`, cfg.Auth.Username, cfg.Auth.Password)
	resp, err := client.Post(cfg.Gateway.HTTPAddress+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var lr struct{ Token string `json:"token"` }
	json.NewDecoder(resp.Body).Decode(&lr)
	if lr.Token == "" {
		return "", fmt.Errorf("empty token")
	}
	return lr.Token, nil
}

func getProjectID(client *http.Client, base, token, slug string) string {
	req, _ := http.NewRequest("GET", base+"/api/projects", nil)
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

// ── Metrics ──────────────────────────────────────────────────────────────────

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
			rps := float64(sent-lastSent) / now.Sub(lastTime).Seconds()
			avgLat := time.Duration(0)
			if sent > 0 {
				avgLat = time.Duration(metricsLatencyNs.Load() / sent)
			}
			log.Printf("📊 Sent: %d | Errors: %d | RPS: %.0f | Avg Latency: %s", sent, errors, rps, avgLat)
			lastSent = sent
			lastTime = now
		}
	}
}

func printFinalReport() {
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

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	return &cfg, json.Unmarshal(data, &cfg)
}
