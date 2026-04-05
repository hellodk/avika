package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"sync"
	"sync/atomic"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	target         = flag.String("target", "localhost:5020", "Gateway target address")
	agentCount     = flag.Int("agents", 50, "Number of virtual agents to simulate")
	totalRPS       = flag.Int("rps", 50000, "Total targeted Requests Per Second across all agents")
	duration       = flag.Duration("duration", 5*time.Minute, "Duration of the test")
	batchSize      = flag.Int("batch", 100, "Batch size per send")
	reportInterval = flag.Duration("report", 5*time.Second, "Metrics report interval")
	enableTLS      = flag.Bool("tls", false, "Enable TLS for gRPC connection")
	tlsCA          = flag.String("tls-ca", "", "Path to CA certificate (default: certs/ca.crt if exists, or TLS_CA_CERT_FILE env)")
	tlsInsecure    = flag.Bool("tls-insecure", false, "Skip TLS certificate verification")
	simProject     = flag.String("project", "load-test", "Project label for simulated agents")
	simEnvironment = flag.String("environment", "benchmark", "Environment label for simulated agents")
)

// Global metrics
var (
	totalSent      atomic.Int64
	totalErrors    atomic.Int64
	totalLatencyNs atomic.Int64
)

func main() {
	flag.Parse()

	log.Printf("🚀 Starting High-Performance Load Test")
	log.Printf("   Target:     %s", *target)
	log.Printf("   Agents:     %d", *agentCount)
	log.Printf("   Target RPS: %d", *totalRPS)
	log.Printf("   Batch Size: %d", *batchSize)
	log.Printf("   Duration:   %s", *duration)

	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	// Start metrics reporter
	go metricsReporter(ctx)

	var wg sync.WaitGroup
	rpsPerAgent := *totalRPS / *agentCount

	startTime := time.Now()

	for i := 0; i < *agentCount; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			simulateAgent(ctx, fmt.Sprintf("sim-agent-%04d", id), rpsPerAgent)
		}(i)
	}

	wg.Wait()

	elapsed := time.Since(startTime)
	sent := totalSent.Load()
	errors := totalErrors.Load()
	avgLatency := time.Duration(0)
	if sent > 0 {
		avgLatency = time.Duration(totalLatencyNs.Load() / sent)
	}

	log.Println("")
	log.Println("═══════════════════════════════════════════════════════════")
	log.Println("🏁 Load Test Complete")
	log.Println("═══════════════════════════════════════════════════════════")
	log.Printf("   Duration:      %s", elapsed.Round(time.Second))
	log.Printf("   Total Sent:    %d messages", sent)
	log.Printf("   Total Errors:  %d", errors)
	log.Printf("   Avg RPS:       %.0f", float64(sent)/elapsed.Seconds())
	log.Printf("   Avg Latency:   %s", avgLatency)
	log.Printf("   Success Rate:  %.2f%%", float64(sent-errors)/float64(sent)*100)
	log.Println("═══════════════════════════════════════════════════════════")
}

func metricsReporter(ctx context.Context) {
	ticker := time.NewTicker(*reportInterval)
	defer ticker.Stop()

	lastSent := int64(0)
	lastTime := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sent := totalSent.Load()
			errors := totalErrors.Load()
			now := time.Now()

			intervalSent := sent - lastSent
			intervalDuration := now.Sub(lastTime).Seconds()
			currentRPS := float64(intervalSent) / intervalDuration

			avgLatency := time.Duration(0)
			if sent > 0 {
				avgLatency = time.Duration(totalLatencyNs.Load() / sent)
			}

			log.Printf("📊 [LIVE] Sent: %d | Errors: %d | RPS: %.0f | Avg Latency: %s",
				sent, errors, currentRPS, avgLatency)

			lastSent = sent
			lastTime = now
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

	// Resolve CA path: flag → env → default
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
	} else if *tlsInsecure {
		tlsConfig.InsecureSkipVerify = true
		log.Printf("TLS enabled with certificate verification disabled (insecure)")
	} else {
		// No CA and not insecure — use system roots
		log.Printf("TLS enabled with system certificate pool")
	}

	if *tlsInsecure {
		tlsConfig.InsecureSkipVerify = true
	}

	return grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig))
}

func simulateAgent(ctx context.Context, agentID string, rps int) {
	conn, err := grpc.Dial(*target,
		resolveGRPCCreds(),
		grpc.WithWriteBufferSize(1024*1024),
		grpc.WithReadBufferSize(1024*1024),
	)
	if err != nil {
		log.Printf("Agent %s failed to connect: %v", agentID, err)
		totalErrors.Add(1)
		return
	}
	defer conn.Close()

	client := pb.NewCommanderClient(conn)
	stream, err := client.Connect(ctx)
	if err != nil {
		log.Printf("Agent %s failed to open stream: %v", agentID, err)
		totalErrors.Add(1)
		return
	}

	// 1. Initial Heartbeat
	start := time.Now()
	err = stream.Send(&pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Heartbeat{
			Heartbeat: &pb.Heartbeat{
				Hostname:     agentID,
				Version:      "1.25.3",
				AgentVersion: "0.1.0-sim",
				Uptime:       100.0,
				Labels: map[string]string{
					"project":     *simProject,
					"environment": *simEnvironment,
				},
			},
		},
	})
	if err != nil {
		log.Printf("Agent %s failed heartbeat: %v", agentID, err)
		totalErrors.Add(1)
		return
	}
	totalSent.Add(1)
	totalLatencyNs.Add(time.Since(start).Nanoseconds())

	// Calculate send interval for target RPS
	sendInterval := time.Second / time.Duration(rps)
	if sendInterval < time.Microsecond {
		sendInterval = time.Microsecond
	}

	ticker := time.NewTicker(sendInterval)
	defer ticker.Stop()

	// Also send heartbeats periodically
	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeatTicker.C:
			// Send heartbeat
			start := time.Now()
			err = stream.Send(&pb.AgentMessage{
				AgentId:   agentID,
				Timestamp: time.Now().Unix(),
				Payload: &pb.AgentMessage_Heartbeat{
					Heartbeat: &pb.Heartbeat{
						Hostname:     agentID,
						Version:      "1.25.3",
						AgentVersion: "0.1.0-sim",
						Uptime:       time.Since(start).Seconds(),
						Labels: map[string]string{
							"project":     *simProject,
							"environment": *simEnvironment,
						},
					},
				},
			})
			if err == nil {
				totalSent.Add(1)
				totalLatencyNs.Add(time.Since(start).Nanoseconds())
			} else {
				totalErrors.Add(1)
			}
		case <-ticker.C:
			start := time.Now()
			var msg *pb.AgentMessage

			// Randomly send LogEntry (90%) or Metrics (10%)
			if rand.Float32() < 0.9 {
				msg = generateLogBatch(agentID)
			} else {
				msg = generateMetricsBatch(agentID)
			}

			err = stream.Send(msg)
			if err != nil {
				totalErrors.Add(1)
				// Reconnect on error
				return
			}
			totalSent.Add(1)
			totalLatencyNs.Add(time.Since(start).Nanoseconds())
		}
	}
}

func generateLogBatch(agentID string) *pb.AgentMessage {
	// Multi-location IP pools
	locIPs := []string{
		"104.16.24.12", // US
		"51.15.221.43", // EU
		"13.228.14.99", // ASIA
		"203.0.113.5",  // TEST
	}

	// Weighted status code selection
	var status int32
	var uri string

	r := rand.Float32()
	if r < 0.70 { // 70% 2xx
		status = []int32{200, 201}[rand.Intn(2)]
		uri = []string{"/health", "/api/v1/", "/index", "/"}[rand.Intn(4)]
	} else if r < 0.80 { // 10% 3xx
		status = []int32{301, 302}[rand.Intn(2)]
		uri = []string{"/legacy", "/redirect"}[rand.Intn(2)]
	} else if r < 0.95 { // 15% 4xx
		status = []int32{403, 404, 429}[rand.Intn(3)]
		uri = []string{"/forbidden", "/not-found", "/rate-limit"}[rand.Intn(3)]
	} else { // 5% 5xx
		status = []int32{500, 502, 504}[rand.Intn(3)]
		uri = []string{"/error", "/upstream", "/timeout"}[rand.Intn(3)]
	}

	methods := []string{"GET", "POST", "PUT", "DELETE"}

	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_LogEntry{
			LogEntry: &pb.LogEntry{
				Timestamp:     time.Now().Unix(),
				LogType:       "access",
				RemoteAddr:    locIPs[rand.Intn(len(locIPs))],
				RequestMethod: methods[rand.Intn(len(methods))],
				RequestUri:    uri,
				Status:        status,
				BodyBytesSent: int64(rand.Intn(5000)),
				RequestTime:   rand.Float32() * 0.5,
				RequestId:     fmt.Sprintf("trace-%d-%d", time.Now().UnixNano(), rand.Intn(1000)),
			},
		},
	}
}

func generateMetricsBatch(agentID string) *pb.AgentMessage {
	return &pb.AgentMessage{
		AgentId:   agentID,
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Metrics{
			Metrics: &pb.NginxMetrics{
				ActiveConnections: int64(rand.Intn(1000)),
				TotalRequests:     int64(rand.Intn(100000)),
				System: &pb.SystemMetrics{
					CpuUsagePercent:    rand.Float32() * 80,
					MemoryUsagePercent: rand.Float32() * 60,
				},
			},
		},
	}
}
