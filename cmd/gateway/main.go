package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
	pb "github.com/user/nginx-manager/api/proto"

	"google.golang.org/grpc"
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
	version        string
	instancesCount int
	uptime         string
	ip             string
	stream         pb.Commander_ConnectServer
	logChans       map[string]chan *pb.LogEntry // subscription_id -> channel
	mu             sync.Mutex
	lastActive     time.Time
	status         string // "online" or "offline"
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

		switch payload := msg.Payload.(type) {
		case *pb.AgentMessage_Heartbeat:
			// ... (existing heartbeat logic) ...
			hb := payload.Heartbeat
			agentID := msg.AgentId

			// Determine version to display (prefer NGINX version if available)
			displayVersion := hb.Version
			if len(hb.Instances) > 0 && hb.Instances[0].Version != "unknown" && hb.Instances[0].Version != "" {
				displayVersion = hb.Instances[0].Version
			}

			// Register/Update session
			val, loaded := s.sessions.Load(agentID)
			if !loaded {
				currentSession = &AgentSession{
					id:             agentID,
					hostname:       hb.Hostname,
					version:        displayVersion,
					instancesCount: len(hb.Instances),
					uptime:         fmt.Sprintf("%.1fs", hb.Uptime),
					stream:         stream,
					logChans:       make(map[string]chan *pb.LogEntry),
					status:         "online",
					lastActive:     time.Now(),
				}
				s.sessions.Store(agentID, currentSession)
				log.Printf("Registered agent %s (%s)", agentID, hb.Hostname)
			} else {
				// Reconnecting - update existing session
				currentSession = val.(*AgentSession)
				currentSession.mu.Lock()
				currentSession.stream = stream
				currentSession.status = "online"
				currentSession.mu.Unlock()
			}

			// Extract IP
			ip := "unknown"
			if p, ok := peer.FromContext(stream.Context()); ok {
				ip = p.Addr.String()
				// Clean up port if present
				if host, _, err := net.SplitHostPort(ip); err == nil {
					ip = host
				}
				// Handle local docker internal IP mapping if needed, but raw IP is usually fine
			}

			// Update fields
			currentSession.lastActive = time.Now()
			currentSession.version = displayVersion
			currentSession.instancesCount = len(hb.Instances)
			currentSession.uptime = fmt.Sprintf("%.1fs", hb.Uptime)
			currentSession.hostname = hb.Hostname
			currentSession.ip = ip

			// Persist to DB
			if err := s.db.UpsertAgent(currentSession); err != nil {
				log.Printf("Failed to persist agent heartbeat: %v", err)
			}

			// Log heartbeat occasionally
			if time.Now().Unix()%60 == 0 {
				log.Printf("Heartbeat from %s (v%s) | NGINX Instances: %d",
					hb.Hostname, hb.Version, len(hb.Instances))
			}

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
			Status:         status,
			InstancesCount: int32(session.instancesCount),
			Uptime:         session.uptime,
			Ip:             session.ip,
			LastSeen:       session.lastActive.Unix(),
		})
		return true
	})

	return &pb.ListAgentsResponse{Agents: agents}, nil
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
		return s.clickhouse.GetAnalytics(ctx, req.TimeWindow)
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
		r := kafka.NewReader(kafka.ReaderConfig{
			Brokers:  []string{"redpanda:9092"},
			Topic:    "optimization-recommendations",
			GroupID:  "gateway-recommendation-consumer",
			MinBytes: 10e3, // 10KB
			MaxBytes: 10e6, // 10MB
		})

		log.Println("Started consuming recommendations from Kafka")

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

	pb.RegisterCommanderServer(s, srv)
	pb.RegisterAgentServiceServer(s, srv)
	log.Printf("Gateway listening on :50051")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
