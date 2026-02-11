package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/peer"
)

// ... existing code ...

type EndpointStats struct {
	Requests int64
	Errors   int64
	Latency  float64 // Sum of latency
	P95      float64 // Approximate
}

type AnalyticsCache struct {
	sync.RWMutex
	TotalRequests  int64
	TotalErrors    int64
	StatusCodes    map[string]int64
	EndpointStats  map[string]*EndpointStats
	RequestHistory []*pb.TimeSeriesPoint // Last 24h by hour or minute
}

type server struct {
	pb.UnimplementedCommanderServer
	pb.UnimplementedAgentServiceServer

	// Map agent_id -> *AgentSession
	sessions sync.Map

	// Map agent_id -> []*pb.UptimeReport
	uptimeReports sync.Map

	// List of recommendations (simple in-memory store for MVP)
	recommendations []*pb.Recommendation
	recMu           sync.RWMutex

	db         *DB
	clickhouse *ClickHouseDB
	analytics  *AnalyticsCache // Keep for legacy/fallback or remove later
}

type AgentSession struct {
	id             string
	hostname       string
	version        string // NGINX version
	agentVersion   string // Agent binary version
	buildDate      string // Build timestamp
	gitCommit      string // Git commit hash
	gitBranch      string // Git branch name
	instancesCount int
	uptime         string
	ip             string
	stream         pb.Commander_ConnectServer
	logChans       map[string]chan *pb.LogEntry // subscription_id -> channel
	mu             sync.Mutex
	lastActive     time.Time
	status         string // "online" or "offline"
	isPod          bool
	podIP          string
}

func (s *server) Connect(stream pb.Commander_ConnectServer) error {
	// ... (existing logging) ...

	var currentSession *AgentSession

	defer func() {
		if currentSession != nil {
			currentSession.mu.Lock()
			currentSession.status = "offline"
			currentSession.lastActive = time.Now()
			currentSession.stream = nil // Clear stream

			// Persist offline status
			if err := s.db.UpsertAgent(currentSession); err != nil {
				log.Printf("Failed to update agent status db: %v", err)
			}

			currentSession.mu.Unlock()
			log.Printf("Agent %s disconnected (marked offline)", currentSession.id)
		}
	}()

	for {
		msg, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			log.Printf("Stream error: %v", err)
			return err
		}

		// Log message
		log.Printf("Received message from agent %s: type %T", msg.AgentId, msg.Payload)

		switch payload := msg.Payload.(type) {
		case *pb.AgentMessage_Heartbeat:
			hb := payload.Heartbeat
			agentID := msg.AgentId

			// 0. Extract IP from peer context
			ip := "unknown"
			if p, ok := peer.FromContext(stream.Context()); ok {
				ip = p.Addr.String()
				if host, _, err := net.SplitHostPort(ip); err == nil {
					ip = host
				}
			}

			// 1. Smart Version Fallback
			nginxVersion := hb.Version
			agentVer := hb.AgentVersion
			if len(hb.Instances) > 0 && hb.Instances[0].Version != "unknown" && hb.Instances[0].Version != "" {
				nginxVersion = hb.Instances[0].Version
			}
			// If AgentVersion is empty, then hb.Version was likely the agent version (old agents)
			if agentVer == "" && hb.Version != "" && hb.Version != nginxVersion {
				agentVer = hb.Version
			}
			if agentVer == "" {
				agentVer = "0.1.0" // Default fallback
			}

			// 2. Smart Pod Detection Fallback (if agent fails to detect it)
			isPod := hb.IsPod
			if !isPod {
				// K8s pods usually have hostnames like <deployment>-<replicaset>-<hash>
				// Standard pattern is [a-z0-9]([-a-z0-9]*[a-z0-9])? (\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*
				parts := strings.Split(hb.Hostname, "-")
				if len(parts) >= 3 && len(parts[len(parts)-1]) >= 4 && len(parts[len(parts)-2]) >= 4 {
					isPod = true
				}
			}

			// 3. Register/Update session
			val, loaded := s.sessions.Load(agentID)
			if !loaded {
				currentSession = &AgentSession{
					id:             agentID,
					hostname:       hb.Hostname,
					version:        nginxVersion,
					agentVersion:   agentVer,
					buildDate:      hb.BuildDate,
					gitCommit:      hb.GitCommit,
					gitBranch:      hb.GitBranch,
					instancesCount: len(hb.Instances),
					uptime:         fmt.Sprintf("%.1fs", hb.Uptime),
					stream:         stream,
					logChans:       make(map[string]chan *pb.LogEntry),
					status:         "online",
					lastActive:     time.Now(),
					ip:             ip,
					isPod:          isPod,
					podIP:          hb.PodIp,
				}
				s.sessions.Store(agentID, currentSession)
				log.Printf("Registered agent %s (%s) at %s (Pod: %v)", agentID, hb.Hostname, ip, isPod)
			} else {
				// Reconnecting - update existing session
				currentSession = val.(*AgentSession)
				currentSession.mu.Lock()
				currentSession.stream = stream
				currentSession.status = "online"
				currentSession.hostname = hb.Hostname
				currentSession.ip = ip
				currentSession.version = nginxVersion
				currentSession.agentVersion = agentVer
				currentSession.buildDate = hb.BuildDate
				currentSession.gitCommit = hb.GitCommit
				currentSession.gitBranch = hb.GitBranch
				currentSession.instancesCount = len(hb.Instances)
				currentSession.uptime = fmt.Sprintf("%.2fs", hb.Uptime)
				currentSession.isPod = isPod
				currentSession.podIP = hb.PodIp
				currentSession.lastActive = time.Now()
				currentSession.mu.Unlock()
			}

			// Persist to DB
			if err := s.db.UpsertAgent(currentSession); err != nil {
				log.Printf("Failed to persist agent heartbeat: %v", err)
			}

			// Log heartbeat
			log.Printf("Heartbeat from %s (v%s) | NGINX Instances: %d",
				hb.Hostname, hb.Version, len(hb.Instances))

		case *pb.AgentMessage_LogEntry:
			if currentSession != nil {
				entry := payload.LogEntry

				// 1. Distribute to subscribers
				currentSession.mu.Lock()
				for _, ch := range currentSession.logChans {
					select {
					case ch <- entry:
					default:
					}
				}
				currentSession.mu.Unlock()

				// 2. Insert into ClickHouse
				if s.clickhouse != nil {
					// Async insert/batching would be better, but sync for now
					go func(e *pb.LogEntry, agentID string) {
						if err := s.clickhouse.InsertAccessLog(e, agentID); err != nil {
							log.Printf("Failed to insert log to CH: %v", err)
						}
					}(entry, currentSession.id)
				}

				// 3. Aggregate Analytics (Legacy in-memory, keep for now as fallback/realtime cache)
				s.analytics.Lock()
				s.analytics.TotalRequests++
				if entry.Status >= 400 {
					s.analytics.TotalErrors++
				}

				statusKey := fmt.Sprintf("%d", entry.Status)
				s.analytics.StatusCodes[statusKey]++

				// Endpoint Stats
				if _, ok := s.analytics.EndpointStats[entry.RequestUri]; !ok {
					s.analytics.EndpointStats[entry.RequestUri] = &EndpointStats{}
				}
				stats := s.analytics.EndpointStats[entry.RequestUri]
				stats.Requests++
				if entry.Status >= 400 {
					stats.Errors++
				}
				stats.Latency += float64(entry.RequestTime)

				// Update TimeSeries (bucketing by hour for simplicity in this snippet)
				// In a real impl, we'd have a ticker to create new buckets.
				// Here we just append to the last bucket or create one.
				nowStr := time.Now().Format("15:00")
				if len(s.analytics.RequestHistory) == 0 {
					s.analytics.RequestHistory = append(s.analytics.RequestHistory, &pb.TimeSeriesPoint{Time: nowStr})
				}
				lastPoint := s.analytics.RequestHistory[len(s.analytics.RequestHistory)-1]
				if lastPoint.Time != nowStr {
					s.analytics.RequestHistory = append(s.analytics.RequestHistory, &pb.TimeSeriesPoint{Time: nowStr})
					lastPoint = s.analytics.RequestHistory[len(s.analytics.RequestHistory)-1]
					// Keep history small
					if len(s.analytics.RequestHistory) > 24 {
						s.analytics.RequestHistory = s.analytics.RequestHistory[1:]
					}
				}
				lastPoint.Requests++
				if entry.Status >= 400 {
					lastPoint.Errors++
				}

				s.analytics.Unlock()
			}

		case *pb.AgentMessage_Metrics:
			if currentSession != nil {
				metrics := payload.Metrics

				// Insert NGINX metrics
				if s.clickhouse != nil {
					go func(m *pb.NginxMetrics, agentID string) {
						if err := s.clickhouse.InsertNginxMetrics(m, agentID); err != nil {
							log.Printf("Failed to insert NGINX metrics to CH: %v", err)
						}
					}(metrics, currentSession.id)

					// Insert system metrics if present
					if metrics.System != nil {
						go func(sm *pb.SystemMetrics, agentID string) {
							if err := s.clickhouse.InsertSystemMetrics(sm, agentID); err != nil {
								log.Printf("Failed to insert system metrics to CH: %v", err)
							}
						}(metrics.System, currentSession.id)
					}
				}
			}
		}
	}
}

func (s *server) GetLogs(req *pb.LogRequest, stream pb.AgentService_GetLogsServer) error {
	val, ok := s.sessions.Load(req.InstanceId)
	if !ok {
		return fmt.Errorf("agent %s not connected", req.InstanceId)
	}
	session := val.(*AgentSession)

	if session.status == "offline" {
		return fmt.Errorf("agent %s is offline", req.InstanceId)
	}

	// Create subscription channel
	subID := fmt.Sprintf("%d", time.Now().UnixNano())
	logChan := make(chan *pb.LogEntry, 100)

	session.mu.Lock()
	session.logChans[subID] = logChan
	session.mu.Unlock()

	defer func() {
		session.mu.Lock()
		delete(session.logChans, subID)
		session.mu.Unlock()
		close(logChan)
	}()

	// Send Log Request to Agent
	cmdID := fmt.Sprintf("log-%s", subID)
	// Check if stream is active
	if session.stream == nil {
		return fmt.Errorf("agent stream lost")
	}

	err := session.stream.Send(&pb.ServerCommand{
		CommandId: cmdID,
		Payload: &pb.ServerCommand_LogRequest{
			LogRequest: req,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send log request to agent: %w", err)
	}

	// Stream logs to client
	ctx := stream.Context()
	for {
		select {
		case entry := <-logChan:
			if err := stream.Send(entry); err != nil {
				return err
			}
		case <-ctx.Done():
			return nil
		}
	}
}
func (s *server) ListAgents(ctx context.Context, req *pb.ListAgentsRequest) (*pb.ListAgentsResponse, error) {
	var agents []*pb.AgentInfo

	s.sessions.Range(func(key, value interface{}) bool {
		session := value.(*AgentSession)

		status := session.status
		if status == "" {
			status = "online" // Default fallback
		}

		agents = append(agents, &pb.AgentInfo{
			AgentId:        session.id,
			Hostname:       session.hostname,
			Version:        session.version,
			AgentVersion:   session.agentVersion,
			Status:         status,
			InstancesCount: int32(session.instancesCount),
			Uptime:         session.uptime,
			Ip:             session.ip,
			LastSeen:       session.lastActive.Unix(),
			IsPod:          session.isPod,
			PodIp:          session.podIP,
			BuildDate:      session.buildDate,
			GitCommit:      session.gitCommit,
			GitBranch:      session.gitBranch,
		})
		return true
	})

	// Load latest version from file
	version := "0.1.0"
	if data, err := os.ReadFile("VERSION"); err == nil {
		version = strings.TrimSpace(string(data))
	}

	return &pb.ListAgentsResponse{
		Agents:        agents,
		SystemVersion: version,
	}, nil
}

func (s *server) GetAgent(ctx context.Context, req *pb.GetAgentRequest) (*pb.AgentInfo, error) {
	val, ok := s.sessions.Load(req.AgentId)
	if !ok {
		return nil, fmt.Errorf("agent %s not found", req.AgentId)
	}
	session := val.(*AgentSession)

	return &pb.AgentInfo{
		AgentId:        session.id,
		Hostname:       session.hostname,
		Version:        session.version,
		Status:         session.status,
		InstancesCount: int32(session.instancesCount),
		Uptime:         session.uptime,
		Ip:             session.ip,
		LastSeen:       session.lastActive.Unix(),
	}, nil
}

func (s *server) RemoveAgent(ctx context.Context, req *pb.RemoveAgentRequest) (*pb.RemoveAgentResponse, error) {
	if _, ok := s.sessions.Load(req.AgentId); ok {
		s.sessions.Delete(req.AgentId)

		// Remove from DB
		if err := s.db.RemoveAgent(req.AgentId); err != nil {
			log.Printf("Failed to remove agent from DB: %v", err)
			return &pb.RemoveAgentResponse{Success: false}, nil
		}

		log.Printf("Agent %s manually removed from inventory", req.AgentId)
		return &pb.RemoveAgentResponse{Success: true}, nil
	}
	return &pb.RemoveAgentResponse{Success: false}, nil
}

func (s *server) UpdateAgent(ctx context.Context, req *pb.UpdateAgentRequest) (*pb.UpdateAgentResponse, error) {
	val, ok := s.sessions.Load(req.AgentId)
	if !ok {
		return nil, fmt.Errorf("agent %s not found", req.AgentId)
	}
	session := val.(*AgentSession)

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.status != "online" || session.stream == nil {
		return &pb.UpdateAgentResponse{
			Success: false,
			Message: "Agent is offline or has no active stream",
		}, nil
	}

	// Send update command
	err := session.stream.Send(&pb.ServerCommand{
		CommandId: fmt.Sprintf("upd-%d", time.Now().Unix()),
		Payload: &pb.ServerCommand_Update{
			Update: &pb.Update{
				Version:   "latest",
				UpdateUrl: "http://192.168.1.10:8090", // Hardcoded LAN IP for now, should be configurable
			},
		},
	})

	if err != nil {
		return &pb.UpdateAgentResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to send update command: %v", err),
		}, nil
	}

	log.Printf("🚀 Triggered remote update for agent %s", req.AgentId)
	return &pb.UpdateAgentResponse{
		Success: true,
		Message: "Update command sent to agent",
	}, nil
}

func (s *server) GetUptimeReports(ctx context.Context, req *pb.UptimeRequest) (*pb.UptimeResponse, error) {
	val, ok := s.uptimeReports.Load(req.AgentId)
	if !ok {
		return &pb.UptimeResponse{Reports: []*pb.UptimeReport{}}, nil
	}
	reports := val.([]*pb.UptimeReport)

	// Apply limit
	if req.Limit > 0 && int(req.Limit) < len(reports) {
		reports = reports[:req.Limit]
	}

	return &pb.UptimeResponse{Reports: reports}, nil
}

func (s *server) GetAnalytics(ctx context.Context, req *pb.AnalyticsRequest) (*pb.AnalyticsResponse, error) {
	if s.clickhouse != nil {
		return s.clickhouse.GetAnalytics(ctx, req.TimeWindow, req.AgentId)
	}

	// Fallback to in-memory if ClickHouse not available
	s.analytics.RLock()
	defer s.analytics.RUnlock()

	// Determine how many data points to return based on time window
	maxPoints := 24 // default for 24h
	switch req.TimeWindow {
	case "5m":
		maxPoints = 5 // 1-minute buckets
	case "15m":
		maxPoints = 15 // 1-minute buckets
	case "30m":
		maxPoints = 30 // 1-minute buckets
	case "1h":
		maxPoints = 12 // 5-minute buckets
	case "3h":
		maxPoints = 36 // 5-minute buckets
	case "6h":
		maxPoints = 72 // 5-minute buckets
	case "12h":
		maxPoints = 24 // 30-minute buckets
	case "24h":
		maxPoints = 24 // hourly buckets
	case "2d":
		maxPoints = 48 // hourly buckets
	case "7d":
		maxPoints = 168 // hourly buckets
	case "30d":
		maxPoints = 720 // hourly buckets
	}

	// Filter RequestHistory based on time window
	requestHistory := s.analytics.RequestHistory
	if len(requestHistory) > maxPoints {
		requestHistory = requestHistory[len(requestHistory)-maxPoints:]
	}

	// Convert Status Codes
	var statusDist []*pb.StatusCount
	for k, v := range s.analytics.StatusCodes {
		statusDist = append(statusDist, &pb.StatusCount{Code: k, Count: v})
	}

	// Convert Top Endpoints
	var topEndpoints []*pb.EndpointStat
	for k, v := range s.analytics.EndpointStats {
		avgLat := 0.0
		if v.Requests > 0 {
			avgLat = v.Latency / float64(v.Requests)
		}
		topEndpoints = append(topEndpoints, &pb.EndpointStat{
			Uri:      k,
			Requests: v.Requests,
			Errors:   v.Errors,
			P95:      float32(avgLat * 1.5), // Approximation for MVP
			Traffic:  "1.2 MB",              // Mock for now
		})
	}

	// Return
	return &pb.AnalyticsResponse{
		RequestRate:        requestHistory,
		StatusDistribution: statusDist,
		TopEndpoints:       topEndpoints,
		LatencyTrend:       []*pb.LatencyPercentiles{}, // Todo
	}, nil
}

// ... startRecommendationConsumer ...

func (s *server) GetRecommendations(ctx context.Context, req *pb.RecommendationRequest) (*pb.RecommendationResponse, error) {
	s.recMu.RLock()
	defer s.recMu.RUnlock()

	// Create a copy to return
	recs := make([]*pb.Recommendation, len(s.recommendations))
	copy(recs, s.recommendations)

	// In future, filter by agent_id if needed

	return &pb.RecommendationResponse{Recommendations: recs}, nil
}

func (s *server) getAgentClient(agentID string) (pb.AgentServiceClient, *grpc.ClientConn, error) {
	val, ok := s.sessions.Load(agentID)
	if !ok {
		return nil, nil, fmt.Errorf("agent %s not found", agentID)
	}
	session := val.(*AgentSession)

	if session.ip == "" {
		return nil, nil, fmt.Errorf("agent %s has no IP", agentID)
	}

	// Dial agent on port 50052
	target := fmt.Sprintf("%s:50052", session.ip)
	conn, err := grpc.Dial(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to agent %s: %v", agentID, err)
	}

	return pb.NewAgentServiceClient(conn), conn, nil
}

func (s *server) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.GetConfig(ctx, req)
}

func (s *server) UpdateConfig(ctx context.Context, req *pb.ConfigUpdate) (*pb.ConfigUpdateResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.UpdateConfig(ctx, req)
}

func (s *server) ValidateConfig(ctx context.Context, req *pb.ConfigValidation) (*pb.ValidationResult, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ValidateConfig(ctx, req)
}

func (s *server) ReloadNginx(ctx context.Context, req *pb.ReloadRequest) (*pb.ReloadResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ReloadNginx(ctx, req)
}

func (s *server) RestartNginx(ctx context.Context, req *pb.RestartRequest) (*pb.RestartResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.RestartNginx(ctx, req)
}

func (s *server) StopNginx(ctx context.Context, req *pb.StopRequest) (*pb.StopResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.StopNginx(ctx, req)
}

func (s *server) ListCertificates(ctx context.Context, req *pb.CertListRequest) (*pb.CertListResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ListCertificates(ctx, req)
}

func (s *server) startUptimeCrawler() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			s.sessions.Range(func(key, value interface{}) bool {
				session := value.(*AgentSession)
				agentID := key.(string)

				// Skip offline agents for uptime checks?
				// Currently just mocking, but logically we can't check if offline.
				if session.status == "offline" {
					return true
				}

				status := "UP"
				latency := 10.5 // mock latency
				var errStr string

				// In a real crawler, we'd do:
				// start := time.Now()
				// resp, err := http.Get(fmt.Sprintf("http://%s", session.hostname))
				// latency = float64(time.Since(start).Milliseconds())
				// if err != nil { status = "DOWN"; errStr = err.Error() }

				report := &pb.UptimeReport{
					Timestamp: time.Now().Unix(),
					Status:    status,
					LatencyMs: float32(latency),
					CheckType: "HTTP",
					Target:    session.hostname,
					Error:     errStr,
				}

				// Store report
				var reports []*pb.UptimeReport
				if val, ok := s.uptimeReports.Load(agentID); ok {
					reports = val.([]*pb.UptimeReport)
				}
				reports = append([]*pb.UptimeReport{report}, reports...)
				if len(reports) > 50 {
					reports = reports[:50]
				}
				s.uptimeReports.Store(agentID, reports)

				return true
			})
		}
	}()
}

func (s *server) startRecommendationConsumer() {
	go func() {
		brokers := os.Getenv("KAFKA_BROKERS")
		if brokers == "" {
			brokers = "redpanda:9092"
		}
		r := kafka.NewReader(kafka.ReaderConfig{
			Brokers:  []string{brokers},
			Topic:    "optimization-recommendations",
			GroupID:  "gateway-recommendation-consumer",
			MinBytes: 10e3, // 10KB
			MaxBytes: 10e6, // 10MB
		})

		log.Printf("Started consuming recommendations from Kafka (%s)", brokers)

		for {
			m, err := r.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading recommendation: %v", err)
				time.Sleep(5 * time.Second) // backoff
				continue
			}

			var rec pb.Recommendation
			if err := json.Unmarshal(m.Value, &rec); err != nil {
				log.Printf("Error unmarshalling recommendation: %v", err)
				continue
			}

			s.recMu.Lock()
			// Insert at beginning (newest first)
			s.recommendations = append([]*pb.Recommendation{&rec}, s.recommendations...)
			// Limit to 50
			if len(s.recommendations) > 50 {
				s.recommendations = s.recommendations[:50]
			}
			s.recMu.Unlock()

			log.Printf("Received recommendation: %s", rec.Title)
		}
	}()
}

func (srv *server) startBackgroundPruning() {
	go func() {
		// Prune more frequently (every 12 hours) to keep it clean
		ticker := time.NewTicker(12 * time.Hour)
		defer ticker.Stop()

		// Retention is now 10 days for offline agents
		retentionPeriod := 10 * 24 * time.Hour

		prune := func() {
			ids, err := srv.db.PruneStaleAgents(retentionPeriod)
			if err != nil {
				log.Printf("Failed to prune stale agents: %v", err)
				return
			}
			if len(ids) > 0 {
				log.Printf("Pruned %d stale agents (offline > 10 days): %v", len(ids), ids)

				// Cleanup ClickHouse data for these agents
				if srv.clickhouse != nil {
					for _, id := range ids {
						if err := srv.clickhouse.DeleteAgentData(id); err != nil {
							log.Printf("Failed to cleanup ClickHouse data for pruned agent %s: %v", id, err)
						} else {
							log.Printf("Cleaned up ClickHouse analytics for pruned agent %s", id)
						}
					}
				}
			}
		}

		// Run once at startup
		prune()

		for range ticker.C {
			prune()
		}
	}()
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	// Connect to DB
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "postgres://admin:password@localhost:5432/nginx_manager?sslmode=disable"
	}

	db, err := NewDB(dsn)
	if err != nil {
		log.Printf("Failed to connect to DB (%s): %v. Trying fallback...", dsn, err)
		// Check fallback for local dev
		dsnFallback := "postgres://admin:password@postgres:5432/nginx_manager?sslmode=disable"
		db, err = NewDB(dsnFallback)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
	}
	log.Println("Connected to PostgreSQL database")

	// Connect to ClickHouse
	chAddr := os.Getenv("CLICKHOUSE_ADDR")
	if chAddr == "" {
		chAddr = "localhost:9000"
	}
	chDB, err := NewClickHouseDB(chAddr)
	if err != nil {
		log.Printf("Failed to connect to ClickHouse (%s): %v. Trying fallback...", chAddr, err)
		chDB, err = NewClickHouseDB("clickhouse:9000")
		if err != nil {
			log.Printf("Failed to connect to ClickHouse: %v. Analytics will be in-memory only.", err)
		} else {
			log.Println("Connected to ClickHouse database")
		}
	} else {
		log.Println("Connected to ClickHouse database")
	}

	// Kafka configuration
	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "redpanda:9092"
	}
	os.Setenv("KAFKA_BROKERS", kafkaBrokers) // Set for consumer usage

	s := grpc.NewServer()
	// Register services
	srv := &server{
		recommendations: []*pb.Recommendation{},
		db:              db,
		clickhouse:      chDB,
		analytics: &AnalyticsCache{
			StatusCodes:    make(map[string]int64),
			EndpointStats:  make(map[string]*EndpointStats),
			RequestHistory: []*pb.TimeSeriesPoint{},
		},
	}

	// Load agents from DB
	if err := srv.db.LoadAgents(&srv.sessions); err != nil {
		log.Printf("Failed to load agents from DB: %v", err)
	} else {
		// Count loaded agents
		count := 0
		srv.sessions.Range(func(k, v interface{}) bool {
			count++
			return true
		})
		log.Printf("Loaded %d agents from database", count)
	}

	srv.startUptimeCrawler()
	srv.startRecommendationConsumer()
	srv.startBackgroundPruning()

	pb.RegisterCommanderServer(s, srv)
	pb.RegisterAgentServiceServer(s, srv)
	log.Printf("Gateway listening on :50051")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
