package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"time"

	pb "github.com/user/nginx-manager/api/proto"
	"github.com/user/nginx-manager/cmd/agent/buffer"
	"github.com/user/nginx-manager/cmd/agent/config"
	"github.com/user/nginx-manager/cmd/agent/discovery"
	"github.com/user/nginx-manager/cmd/agent/logs"
	"github.com/user/nginx-manager/cmd/agent/metrics"
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
)

var startTime = time.Now()

func main() {
	flag.Parse()

	setupLogging()

	// 1. Get or Generate Persistent Agent ID
	if *agentID == "" {
		*agentID = getOrGenerateAgentID()
	}

	log.Printf("Starting agent %s with server %s", *agentID, *serverAddr)

	// Initialize Persistent Buffer
	wal, err := buffer.NewFileBuffer(*bufferDir + "agent")
	if err != nil {
		log.Fatalf("Failed to initialize buffer: %v", err)
	}
	defer wal.Close()

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
		"/var/log/nginx/access.log",
		"/var/log/nginx/error.log",
		"localhost:4317", // OTel OTLP gRPC endpoint
		*agentID,
		currentHostname,
	)
	collector.Start()
	defer collector.Stop()

	// Metrics Collector
	metricsCollector := metrics.NewNginxCollector("http://127.0.0.1/nginx_status")

	// Goroutine: Collect Logs -> Buffer
	go func() {
		logChan := collector.GetGatewayChannel()
		for entry := range logChan {
			msg := &pb.AgentMessage{
				AgentId:   *agentID,
				Timestamp: time.Now().Unix(),
				Payload: &pb.AgentMessage_LogEntry{
					LogEntry: entry,
				},
			}
			writeToBuffer(wal, msg)
		}
	}()

	// Goroutine: Collect Metrics & Heartbeats -> Buffer
	go func() {
		for {
			// Dynamic Hostname Detection
			h, err := os.Hostname()
			if err == nil && h != "" {
				currentHostname = h
			}

			// Heartbeat
			instances, _ := discoverer.Scan(context.Background())
			hbMsg := &pb.AgentMessage{
				AgentId:   *agentID,
				Timestamp: time.Now().Unix(),
				Payload: &pb.AgentMessage_Heartbeat{
					Heartbeat: &pb.Heartbeat{
						Hostname:  currentHostname,
						Version:   "0.1.1",
						Uptime:    time.Since(startTime).Seconds(),
						Instances: instances,
					},
				},
			}
			writeToBuffer(wal, hbMsg)

			// Metrics
			nginxMetrics, err := metricsCollector.Collect()
			if err == nil {
				metricMsg := &pb.AgentMessage{
					AgentId:   *agentID,
					Timestamp: time.Now().Unix(),
					Payload: &pb.AgentMessage_Metrics{
						Metrics: nginxMetrics,
					},
				}
				writeToBuffer(wal, metricMsg)
			}

			time.Sleep(5 * time.Second)
		}
	}()

	// -------------------------------------------------------------------------
	// Sender (Consumer) -> Gateway
	// -------------------------------------------------------------------------
	senderLoop(wal)
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
	data, err := proto.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	if err := wal.Write(data); err != nil {
		log.Printf("Failed to write to buffer: %v", err)
	}
}

func senderLoop(wal *buffer.FileBuffer) {
	var conn *grpc.ClientConn
	var client pb.CommanderClient
	var stream pb.Commander_ConnectClient

	for {
		// 1. Connect / Reconnect
		if stream == nil {
			var err error
			log.Printf("Connecting to %s...", *serverAddr)

			// Dial with backoff? Simple wait for now
			conn, err = grpc.Dial(*serverAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				log.Printf("Connection failed: %v. Retrying in 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}

			client = pb.NewCommanderClient(conn)
			stream, err = client.Connect(context.Background())
			if err != nil {
				log.Printf("Stream creation failed: %v. Retrying in 5s...", err)
				conn.Close()
				time.Sleep(5 * time.Second)
				continue
			}
			log.Println("Connected to Gateway")

			// Start Receiver routine (for commands)
			go func() {
				for {
					if stream == nil {
						return
					} // Exit if stream invalid
					cmd, err := stream.Recv()
					if err != nil {
						log.Printf("Stream disconnected (Recv): %v", err)
						// Signal main loop to reconnect?
						// Main sender loop will detect on Send failure.
						return
					}
					log.Printf("Received command: %v", cmd)
				}
			}()
		}

		// 2. Read from Buffer & Send
		data, offset, err := wal.ReadNext()
		if err != nil {
			log.Printf("Buffer read error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		// If no data, wait a bit
		if data == nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		// Unmarshal to verify/check or just send?
		var msg pb.AgentMessage
		if err := proto.Unmarshal(data, &msg); err != nil {
			log.Printf("Corrupt message in buffer at offset %d, skipping: %v", offset, err)
			wal.Ack(offset) // Skip corrupt message
			continue
		}

		// Send
		if err := stream.Send(&msg); err != nil {
			log.Printf("Failed to send: %v. Reconnecting...", err)
			stream = nil
			if conn != nil {
				conn.Close()
			}
			time.Sleep(2 * time.Second)
			continue // Retry loop will handle reconnection
		}

		// Success -> Ack
		if err := wal.Ack(offset); err != nil {
			log.Printf("Failed to ack offset: %v", err)
		}
	}
}

func setupLogging() {
	if *logFile != "" {
		f, err := os.OpenFile(*logFile, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
		if err != nil {
			log.Fatalf("error opening file: %v", err)
		}
		log.SetOutput(f)
	}
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
