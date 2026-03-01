package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"github.com/avika-ai/avika/cmd/gateway/geo"
)

type ClickHouseDB struct {
	conn      driver.Conn
	logChan   chan logBatchItem
	spanChan  chan spanBatchItem
	sysChan   chan sysBatchItem
	nginxChan chan nginxBatchItem
	gwChan    chan gwBatchItem
	geoLookup *geo.GeoIPLookup
}

type logBatchItem struct {
	entry       *pb.LogEntry
	agentID     string
	clientIP    string
	country     string
	countryCode string
	city        string
	region      string
	latitude    float64
	longitude   float64
	timezone    string
	isp         string
}

type spanBatchItem struct {
	traceID string
	spanID  string
	parent  string
	name    string
	start   time.Time
	end     time.Time
	attrs   map[string]string
	agentID string
}

type sysBatchItem struct {
	entry   *pb.SystemMetrics
	agentID string
}

type nginxBatchItem struct {
	entry   *pb.NginxMetrics
	agentID string
}

type gwBatchItem struct {
	metrics *gatewayMetrics
}

// ClickHouse buffer configuration (configurable via environment)
var (
	// Buffer channel sizes
	logBufferSize     = getEnvInt("CH_LOG_BUFFER_SIZE", 100000)
	spanBufferSize    = getEnvInt("CH_SPAN_BUFFER_SIZE", 200000)
	sysBufferSize     = getEnvInt("CH_SYS_BUFFER_SIZE", 10000)
	nginxBufferSize   = getEnvInt("CH_NGINX_BUFFER_SIZE", 10000)
	gwBufferSize      = getEnvInt("CH_GW_BUFFER_SIZE", 1000)

	// Batch flush sizes
	logBatchSize  = getEnvInt("CH_LOG_BATCH_SIZE", 10000)
	spanBatchSize = getEnvInt("CH_SPAN_BATCH_SIZE", 20000)

	// Connection pool
	maxOpenConns = getEnvInt("CH_MAX_OPEN_CONNS", 20)
	maxIdleConns = getEnvInt("CH_MAX_IDLE_CONNS", 20)
)

func getEnvInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return defaultVal
}

// formatBytes converts bytes to human-readable string (accepts any integer type)
func formatBytes[T int64 | uint64](b T) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	val := float64(b)
	div, exp := float64(unit), 0
	for n := val / div; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", val/div, "KMGTPE"[exp])
}

func NewClickHouseDB(addr, username, password string) (*ClickHouseDB, error) {
	// Log configuration for debugging
	log.Printf("ClickHouse config: buffers(log=%d, span=%d, sys=%d, nginx=%d, gw=%d) batches(log=%d, span=%d) conns(open=%d, idle=%d)",
		logBufferSize, spanBufferSize, sysBufferSize, nginxBufferSize, gwBufferSize,
		logBatchSize, spanBatchSize, maxOpenConns, maxIdleConns)
	
	// Debug: log connection parameters (password masked)
	pwMask := "***"
	if len(password) > 0 {
		pwMask = password[:3] + "***" + password[len(password)-3:]
	}
	log.Printf("ClickHouse connecting to: %s user=%s password=%s", addr, username, pwMask)

	// Use defaults if not provided
	if username == "" {
		username = "default"
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: "default",
			Username: username,
			Password: password,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		DialTimeout:     10 * time.Second,
		MaxOpenConns:    maxOpenConns,
		MaxIdleConns:    maxIdleConns,
		ConnMaxLifetime: time.Hour,
	})

	if err != nil {
		return nil, err
	}

	db := &ClickHouseDB{
		conn:      conn,
		logChan:   make(chan logBatchItem, logBufferSize),
		spanChan:  make(chan spanBatchItem, spanBufferSize),
		sysChan:   make(chan sysBatchItem, sysBufferSize),
		nginxChan: make(chan nginxBatchItem, nginxBufferSize),
		gwChan:    make(chan gwBatchItem, gwBufferSize),
		geoLookup: geo.NewGeoIPLookup(),
	}

	log.Printf("GeoIP lookup initialized with well-known IP database")

	if err := db.migrate(); err != nil {
		log.Printf("Warning: ClickHouse migration failed: %v", err)
	}

	// Start background flushers
	go db.runLogFlusher()
	go db.runSpanFlusher()
	go db.runSysFlusher()
	go db.runNginxFlusher()
	go db.runGwFlusher()

	return db, nil
}

func (db *ClickHouseDB) migrate() error {
	ctx := context.Background()
	queries := []string{
		"CREATE DATABASE IF NOT EXISTS nginx_analytics",
		`CREATE TABLE IF NOT EXISTS nginx_analytics.gateway_metrics (
			timestamp DateTime64(3),
			gateway_id String,
			eps Float32,
			active_connections UInt32,
			cpu_usage Float32,
			memory_mb Float32,
			goroutines UInt32,
			db_latency_ms Float32,
			labels Map(String, String)
		) ENGINE = MergeTree() ORDER BY (timestamp, gateway_id)`,
		`CREATE TABLE IF NOT EXISTS nginx_analytics.access_logs (
			timestamp DateTime64(3),
			instance_id String,
			remote_addr String,
			request_method String,
			request_uri String,
			status UInt16,
			body_bytes_sent UInt64,
			request_time Float32,
			request_id String,
			upstream_addr String,
			upstream_status String,
			upstream_connect_time Float32,
			upstream_header_time Float32,
			upstream_response_time Float32,
			user_agent String,
			referer String,
			labels Map(String, String)
		) ENGINE = MergeTree() ORDER BY (timestamp, instance_id)`,
		`CREATE TABLE IF NOT EXISTS nginx_analytics.system_metrics (
			timestamp DateTime64(3),
			instance_id String,
			cpu_usage Float32,
			memory_usage Float32,
			memory_total UInt64,
			memory_used UInt64,
			network_rx_bytes UInt64,
			network_tx_bytes UInt64,
			network_rx_rate Float32,
			network_tx_rate Float32,
			cpu_user Float32,
			cpu_system Float32,
			cpu_iowait Float32,
			labels Map(String, String)
		) ENGINE = MergeTree() ORDER BY (timestamp, instance_id)`,
		`CREATE TABLE IF NOT EXISTS nginx_analytics.nginx_metrics (
			timestamp DateTime64(3),
			instance_id String,
			active_connections UInt32,
			accepted_connections UInt64,
			handled_connections UInt64,
			total_requests UInt64,
			reading UInt32,
			writing UInt32,
			waiting UInt32,
			requests_per_second Float64,
			labels Map(String, String)
		) ENGINE = MergeTree() ORDER BY (timestamp, instance_id)`,
		`CREATE TABLE IF NOT EXISTS nginx_analytics.spans (
			trace_id String,
			span_id String,
			parent_span_id String,
			name String,
			start_time DateTime64(9),
			end_time DateTime64(9),
			attributes Map(String, String),
			instance_id String
		) ENGINE = MergeTree() ORDER BY (instance_id, trace_id, start_time)`,
		"ALTER TABLE nginx_analytics.gateway_metrics ADD COLUMN IF NOT EXISTS labels Map(String, String)",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS labels Map(String, String)",
		"ALTER TABLE nginx_analytics.system_metrics ADD COLUMN IF NOT EXISTS labels Map(String, String)",
		"ALTER TABLE nginx_analytics.nginx_metrics ADD COLUMN IF NOT EXISTS labels Map(String, String)",
		// Phase 5: Geo columns for access_logs
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS client_ip String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS country String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS country_code String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS city String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS region String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS latitude Float64 DEFAULT 0",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS longitude Float64 DEFAULT 0",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS timezone String DEFAULT ''",
		"ALTER TABLE nginx_analytics.access_logs ADD COLUMN IF NOT EXISTS isp String DEFAULT ''",
		// Phase 6: Materialized view for geo aggregation (hourly)
		`CREATE TABLE IF NOT EXISTS nginx_analytics.geo_requests_hourly (
			hour DateTime,
			country String,
			country_code String,
			city String,
			latitude Float64,
			longitude Float64,
			request_count UInt64,
			error_count UInt64,
			total_bytes UInt64,
			avg_latency Float64
		) ENGINE = SummingMergeTree()
		ORDER BY (hour, country_code, city)
		TTL hour + INTERVAL 90 DAY`,
		// Phase 7: Retention Policies (using toDateTime() for DateTime64 compatibility)
		"ALTER TABLE nginx_analytics.access_logs MODIFY TTL toDateTime(timestamp) + INTERVAL 7 DAY",
		"ALTER TABLE nginx_analytics.spans MODIFY TTL toDateTime(start_time) + INTERVAL 7 DAY",
		"ALTER TABLE nginx_analytics.system_metrics MODIFY TTL toDateTime(timestamp) + INTERVAL 30 DAY",
		"ALTER TABLE nginx_analytics.nginx_metrics MODIFY TTL toDateTime(timestamp) + INTERVAL 30 DAY",
		"ALTER TABLE nginx_analytics.gateway_metrics MODIFY TTL toDateTime(timestamp) + INTERVAL 30 DAY",
	}

	for _, q := range queries {
		if err := db.conn.Exec(ctx, q); err != nil {
			// ClickHouse might return error if column exists even with IF NOT EXISTS in some versions,
			// though recent ones handle it well. We log and continue.
			log.Printf("ClickHouse migration query failed [%s]: %v", q, err)
		}
	}
	return nil
}

func (db *ClickHouseDB) InsertAccessLog(entry *pb.LogEntry, agentID string) error {
	// Extract client IP from X-Forwarded-For or remote_addr
	clientIP := geo.ExtractClientIP(entry.XForwardedFor, entry.RemoteAddr)
	
	// Perform geo lookup
	item := logBatchItem{
		entry:   entry,
		agentID: agentID,
		clientIP: clientIP,
	}
	
	if db.geoLookup != nil && clientIP != "" {
		loc := db.geoLookup.Lookup(clientIP)
		if loc != nil {
			item.country = loc.Country
			item.countryCode = loc.CountryCode
			item.city = loc.City
			item.region = loc.Region
			item.latitude = loc.Latitude
			item.longitude = loc.Longitude
			item.timezone = loc.Timezone
			item.isp = loc.ISP
		}
	}
	
	select {
	case db.logChan <- item:
		return nil
	default:
		return fmt.Errorf("access log queue full, dropping record")
	}
}

func (db *ClickHouseDB) InsertSpans(entry *pb.LogEntry, agentID string, requestTime time.Time) error {
	// Root Span (Request)
	traceID := entry.RequestId
	if traceID == "" {
		traceID = uuid.New().String()
	}
	rootSpanID := uuid.New().String()

	// Calculate times
	duration := time.Duration(float64(entry.RequestTime) * float64(time.Second))
	endTime := requestTime
	startTime := endTime.Add(-duration)

	// Root Attributes
	rootAttrs := map[string]string{
		"uri":      entry.RequestUri,
		"method":   entry.RequestMethod,
		"status":   fmt.Sprintf("%d", entry.Status),
		"agent_id": agentID,
		"client":   entry.RemoteAddr,
	}

	// Push Root Span
	select {
	case db.spanChan <- spanBatchItem{
		traceID: traceID,
		spanID:  rootSpanID,
		parent:  "",
		name:    "request",
		start:   startTime,
		end:     endTime,
		attrs:   rootAttrs,
		agentID: agentID,
	}:
	default:
		// Drop span if queue full
	}

	// Upstream Span
	if entry.UpstreamAddr != "" && entry.UpstreamResponseTime > 0 {
		upstreamSpanID := uuid.New().String()
		upstreamDuration := time.Duration(float64(entry.UpstreamResponseTime) * float64(time.Second))
		upstreamEnd := endTime
		upstreamStart := upstreamEnd.Add(-upstreamDuration)

		upstreamAttrs := map[string]string{
			"upstream_addr":   entry.UpstreamAddr,
			"upstream_status": entry.UpstreamStatus,
		}

		select {
		case db.spanChan <- spanBatchItem{
			traceID: traceID,
			spanID:  upstreamSpanID,
			parent:  rootSpanID,
			name:    "upstream",
			start:   upstreamStart,
			end:     upstreamEnd,
			attrs:   upstreamAttrs,
			agentID: agentID,
		}:
		default:
		}

		// Connect Span (Child of Upstream)
		if entry.UpstreamConnectTime > 0 {
			connectSpanID := uuid.New().String()
			connectDuration := time.Duration(float64(entry.UpstreamConnectTime) * float64(time.Second))
			connectStart := upstreamStart
			connectEnd := connectStart.Add(connectDuration)

			select {
			case db.spanChan <- spanBatchItem{
				traceID: traceID,
				spanID:  connectSpanID,
				parent:  upstreamSpanID,
				name:    "upstream_connect",
				start:   connectStart,
				end:     connectEnd,
				attrs:   upstreamAttrs,
				agentID: agentID,
			}:
			default:
			}
		}
	}

	return nil
}

func (db *ClickHouseDB) GetAnalytics(ctx context.Context, window string, agentID string) (*pb.AnalyticsResponse, error) {
	return db.GetAnalyticsWithAgentFilter(ctx, window, agentID, nil, 0, 0, "UTC")
}

// GetAnalyticsFiltered returns analytics filtered by a list of agent IDs
// This is used for project/environment filtering where multiple agents belong to the same scope
func (db *ClickHouseDB) GetAnalyticsFiltered(ctx context.Context, window string, agentFilter []string) (*pb.AnalyticsResponse, error) {
	return db.GetAnalyticsWithAgentFilter(ctx, window, "", agentFilter, 0, 0, "UTC")
}

// GetAnalyticsWithTimeRange supports both relative time windows and absolute time ranges (backward compatible wrapper)
func (db *ClickHouseDB) GetAnalyticsWithTimeRange(ctx context.Context, window string, agentID string, fromTs, toTs int64, clientTimezone string) (*pb.AnalyticsResponse, error) {
	return db.GetAnalyticsWithAgentFilter(ctx, window, agentID, nil, fromTs, toTs, clientTimezone)
}

// GetAnalyticsWithAgentFilter supports filtering by single agent ID or multiple agent IDs (for project/environment filtering)
func (db *ClickHouseDB) GetAnalyticsWithAgentFilter(ctx context.Context, window string, agentID string, agentFilter []string, fromTs, toTs int64, clientTimezone string) (*pb.AnalyticsResponse, error) {
	var startTime, endTime time.Time
	var duration time.Duration

	// Determine time range - absolute takes precedence
	if fromTs > 0 && toTs > 0 {
		// Absolute time range (timestamps in milliseconds)
		startTime = time.UnixMilli(fromTs).UTC()
		endTime = time.UnixMilli(toTs).UTC()
		duration = endTime.Sub(startTime)
		log.Printf("GetAnalytics: Using absolute time range: %v to %v (duration: %v)", startTime, endTime, duration)
	} else {
		// Relative time window
		duration = 24 * time.Hour
		switch window {
		case "5m":
			duration = 5 * time.Minute
		case "15m":
			duration = 15 * time.Minute
		case "30m":
			duration = 30 * time.Minute
		case "1h":
			duration = 1 * time.Hour
		case "3h":
			duration = 3 * time.Hour
		case "6h":
			duration = 6 * time.Hour
		case "12h":
			duration = 12 * time.Hour
		case "24h":
			duration = 24 * time.Hour
		case "2d":
			duration = 2 * 24 * time.Hour
		case "3d":
			duration = 3 * 24 * time.Hour
		case "7d":
			duration = 7 * 24 * time.Hour
		case "30d":
			duration = 30 * 24 * time.Hour
		}
		endTime = time.Now().UTC()
		startTime = endTime.Add(-duration)
	}

	resp := &pb.AnalyticsResponse{}

	// Determine bucket size and time format based on duration
	// Include date context when range spans multiple days or crosses midnight
	bucketSize := "toStartOfHour"
	timeFormat := "%Y-%m-%d %H:%i" // Default: full datetime for clarity

	if duration <= 1*time.Hour {
		bucketSize = "toStartOfMinute"
		timeFormat = "%H:%i" // Just time for very short ranges
	} else if duration <= 3*time.Hour {
		bucketSize = "toStartOfFiveMinutes"
		timeFormat = "%H:%i"
	} else if duration <= 6*time.Hour {
		bucketSize = "toStartOfFifteenMinutes"
		timeFormat = "%H:%i"
	} else if duration <= 12*time.Hour {
		bucketSize = "toStartOfHour"
		// Add date if range might cross midnight
		if startTime.Day() != endTime.Day() {
			timeFormat = "%m-%d %H:%i"
		} else {
			timeFormat = "%H:%i"
		}
	} else if duration <= 24*time.Hour {
		bucketSize = "toStartOfHour"
		// Always show date for 24h as it crosses midnight
		timeFormat = "%m-%d %H:%i"
	} else if duration <= 7*24*time.Hour {
		bucketSize = "toStartOfHour"
		timeFormat = "%m-%d %H:00" // Date + hour for multi-day
	} else {
		bucketSize = "toStartOfDay"
		timeFormat = "%Y-%m-%d" // Full date for long ranges
	}

	// Filter clause - use both start and end time for absolute ranges
	var whereClause string
	var args []interface{}
	if fromTs > 0 && toTs > 0 {
		whereClause = "WHERE timestamp >= ? AND timestamp <= ?"
		args = []interface{}{startTime, endTime}
	} else {
		whereClause = "WHERE timestamp >= ?"
		args = []interface{}{startTime}
	}

	// Agent filtering - supports single agent ID or multiple agent IDs (for project/environment filtering)
	if len(agentFilter) > 0 {
		// Multiple agents - use IN clause
		placeholders := make([]string, len(agentFilter))
		for i, id := range agentFilter {
			placeholders[i] = "?"
			args = append(args, id)
		}
		whereClause += fmt.Sprintf(" AND instance_id IN (%s)", strings.Join(placeholders, ","))
	} else if agentID != "" && agentID != "all" {
		// Single agent
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	// 1. Request Rate with dynamic time format
	queryTimeSeries := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			count(*) as requests,
			countIf(status >= 400) as errors
		FROM nginx_analytics.access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat, whereClause)

	rows, err := db.conn.Query(ctx, queryTimeSeries, args...)
	if err != nil {
		log.Printf("GetAnalytics: Request Rate query failed: %v", err)
	} else {
		for rows.Next() {
			var timeStr string
			var reqs, errs uint64
			if err := rows.Scan(&timeStr, &reqs, &errs); err == nil {
				resp.RequestRate = append(resp.RequestRate, &pb.TimeSeriesPoint{
					Time:     timeStr,
					Requests: int64(reqs),
					Errors:   int64(errs),
				})
			} else {
				log.Printf("GetAnalytics: Request Rate scan failed: %v", err)
			}
		}
		rows.Close()
	}

	// 2. Status Distribution (filter out invalid status codes like 0)
	statusWhereClause := whereClause
	if statusWhereClause == "" {
		statusWhereClause = "WHERE status > 0"
	} else {
		statusWhereClause = statusWhereClause + " AND status > 0"
	}
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			toString(status) as code,
			count(*) as count
		FROM nginx_analytics.access_logs
		%s
		GROUP BY code
	`, statusWhereClause), args...)
	if err == nil {
		for rows.Next() {
			var code string
			var count uint64
			if err := rows.Scan(&code, &count); err == nil {
				resp.StatusDistribution = append(resp.StatusDistribution, &pb.StatusCount{
					Code:  code,
					Count: int64(count),
				})
			}
		}
		rows.Close()
	}

	// 3. Top Endpoints with traffic calculation
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			request_uri,
			count(*) as requests,
			countIf(status >= 400) as errors,
			quantile(0.95)(request_time) as p95,
			sum(body_bytes_sent) as bytes
		FROM nginx_analytics.access_logs
		%s
		GROUP BY request_uri
		ORDER BY requests DESC
		LIMIT 10
	`, whereClause), args...)
	if err == nil {
		for rows.Next() {
			var uri string
			var reqs, errs, bytes uint64
			var p95 float64
			if err := rows.Scan(&uri, &reqs, &errs, &p95, &bytes); err == nil {
				if math.IsNaN(p95) {
					p95 = 0
				}
				// Format traffic as human-readable
				traffic := formatBytes(bytes)
				resp.TopEndpoints = append(resp.TopEndpoints, &pb.EndpointStat{
					Uri:      uri,
					Requests: int64(reqs),
					Errors:   int64(errs),
					P95:      float32(p95 * 1000),
					Traffic:  traffic,
				})
			}
		}
		rows.Close()
	}

	// 4. Latency Trend with dynamic time format
	queryLatency := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			quantile(0.50)(request_time) as p50,
			quantile(0.95)(request_time) as p95,
			quantile(0.99)(request_time) as p99
		FROM nginx_analytics.access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat, whereClause)

	rows, err = db.conn.Query(ctx, queryLatency, args...)
	if err == nil {
		for rows.Next() {
			var timeStr string
			var p50, p95, p99 float64
			if err := rows.Scan(&timeStr, &p50, &p95, &p99); err == nil {
				if math.IsNaN(p50) {
					p50 = 0
				}
				if math.IsNaN(p95) {
					p95 = 0
				}
				if math.IsNaN(p99) {
					p99 = 0
				}
				resp.LatencyTrend = append(resp.LatencyTrend, &pb.LatencyPercentiles{
					Time: timeStr,
					P50:  float32(p50 * 1000),
					P95:  float32(p95 * 1000),
					P99:  float32(p99 * 1000),
				})
			}
		}
		rows.Close()
	}

	// 5. Summary KPIs & Deltas
	// Filter out invalid status codes (0) for accurate metrics
	prevStartTime := startTime.Add(-duration)
	var currReqs, prevReqs uint64
	var currErrors, prevErrors uint64
	var currBytes, prevBytes uint64
	var currLat, prevLat float64

	// Add status > 0 filter to exclude invalid log entries
	currStatsWhereClause := whereClause
	if currStatsWhereClause == "" {
		currStatsWhereClause = "WHERE status > 0"
	} else {
		currStatsWhereClause = currStatsWhereClause + " AND status > 0"
	}

	db.conn.QueryRow(ctx, fmt.Sprintf(`
		SELECT 
			count(*), 
			countIf(status >= 400), 
			sum(body_bytes_sent), 
			avg(request_time) 
		FROM nginx_analytics.access_logs %s`, currStatsWhereClause), args...).Scan(&currReqs, &currErrors, &currBytes, &currLat)

	// Deltas need a slightly different filter
	prevWhereClause := "WHERE timestamp >= ? AND timestamp < ? AND status > 0"
	prevArgs := []interface{}{prevStartTime, startTime}
	if agentID != "" && agentID != "all" {
		prevWhereClause += " AND instance_id = ?"
		prevArgs = append(prevArgs, agentID)
	}

	db.conn.QueryRow(ctx, fmt.Sprintf(`
		SELECT 
			count(*), 
			countIf(status >= 400), 
			sum(body_bytes_sent), 
			avg(request_time) 
		FROM nginx_analytics.access_logs %s`, prevWhereClause), prevArgs...).Scan(&prevReqs, &prevErrors, &prevBytes, &prevLat)

	currErrRate := 0.0
	if currReqs > 0 {
		currErrRate = (float64(currErrors) / float64(currReqs)) * 100
	}
	prevErrRate := 0.0
	if prevReqs > 0 {
		prevErrRate = (float64(prevErrors) / float64(prevReqs)) * 100
	}
	if math.IsNaN(currLat) {
		currLat = 0
	}
	if math.IsNaN(prevLat) {
		prevLat = 0
	}

	resp.Summary = &pb.AnalyticsSummary{
		TotalRequests:  int64(currReqs),
		ErrorRate:      float32(currErrRate),
		AvgLatency:     float32(currLat * 1000),
		TotalBandwidth: currBytes,
		RequestsDelta:  float32(currReqs) - float32(prevReqs),
		LatencyDelta:   float32((currLat - prevLat) * 1000),
		ErrorRateDelta: float32(currErrRate - prevErrRate),
	}

	// 6. Latency Distribution
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT 
			multiIf(request_time < 0.05, '0-50ms', 
					request_time < 0.1, '50-100ms', 
					request_time < 0.2, '100-200ms', 
					request_time < 0.5, '200-500ms', '500ms+') as label,
			count(*) as count
		FROM nginx_analytics.access_logs
		%s
		GROUP BY label
	`, whereClause), args...)
	if err == nil {
		for rows.Next() {
			var label string
			var count int64
			if err := rows.Scan(&label, &count); err == nil {
				resp.LatencyDistribution = append(resp.LatencyDistribution, &pb.LatencyBucket{
					Bucket: label,
					Count:  count,
				})
			}
		}
		rows.Close()
	}

	// 7. Server Distribution (Show when viewing all agents or filtering by project/environment)
	if agentID == "" || agentID == "all" || len(agentFilter) > 0 {
		rows, err = db.conn.Query(ctx, fmt.Sprintf(`
			SELECT
				instance_id,
				count(*) as requests,
				countIf(status >= 400) as errors,
				sum(body_bytes_sent) as traffic
			FROM nginx_analytics.access_logs
			%s
			GROUP BY instance_id
			ORDER BY requests DESC
		`, whereClause), args...)
		if err == nil {
			for rows.Next() {
				var id string
				var reqs, errs, traffic uint64
				if err := rows.Scan(&id, &reqs, &errs, &traffic); err == nil {
					errRate := 0.0
					if reqs > 0 {
						errRate = (float64(errs) / float64(reqs)) * 100
					}
					resp.ServerDistribution = append(resp.ServerDistribution, &pb.ServerStat{
						Hostname:  id,
						Requests:  int64(reqs),
						ErrorRate: float32(errRate),
						Traffic:   traffic,
					})
				}
			}
			rows.Close()
		}
	}

	// 8. System Metrics History with dynamic time format
	querySys := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			avg(cpu_usage),
			avg(memory_usage),
			avg(network_rx_rate),
			avg(network_tx_rate),
			avg(cpu_user),
			avg(cpu_system),
			avg(cpu_iowait)
		FROM nginx_analytics.system_metrics
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat, whereClause)

	rows, err = db.conn.Query(ctx, querySys, args...)
	if err != nil {
		log.Printf("GetAnalytics: System metrics query failed: %v", err)
	} else {
		for rows.Next() {
			var t string
			var cpu, mem, rx, tx, user, system, iowait float64
			if err := rows.Scan(&t, &cpu, &mem, &rx, &tx, &user, &system, &iowait); err == nil {
				resp.SystemMetrics = append(resp.SystemMetrics, &pb.SystemMetricPoint{
					Time:          t,
					CpuUsage:      float32(cpu),
					MemoryUsage:   float32(mem),
					NetworkRxRate: float32(rx),
					NetworkTxRate: float32(tx),
					CpuUser:       float32(user),
					CpuSystem:     float32(system),
					CpuIowait:     float32(iowait),
				})
			} else {
				log.Printf("GetAnalytics: System metrics scan failed: %v", err)
			}
		}
		rows.Close()
	}

	// 9. NGINX Connections History with dynamic time format
	queryConn := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			avg(active_connections),
			avg(waiting),
			avg(requests_per_second)
		FROM nginx_analytics.nginx_metrics
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat, whereClause)

	rows, err = db.conn.Query(ctx, queryConn, args...)
	if err != nil {
		log.Printf("GetAnalytics: Connections history query failed: %v", err)
	} else {
		for rows.Next() {
			var t string
			var active, waiting, rps float64
			if err := rows.Scan(&t, &active, &waiting, &rps); err == nil {
				resp.ConnectionsHistory = append(resp.ConnectionsHistory, &pb.NginxMetricPoint{
					Time:     t,
					Active:   int64(active),
					Requests: int64(rps),
				})
			} else {
				log.Printf("GetAnalytics: Connections history scan failed: %v", err)
			}
		}
		rows.Close()
	}

	// 10. HTTP Status Aggregations (Detailed)
	resp.HttpStatusMetrics = &pb.HttpStatusMetricsResponse{}

	// 10a. Time Series for Status Codes with dynamic time format
	queryStatusTS := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			countIf(status >= 200 AND status < 300) as code_2xx,
			countIf(status >= 300 AND status < 400) as code_3xx,
			countIf(status >= 400 AND status < 500) as code_4xx,
			countIf(status >= 500) as code_5xx
		FROM nginx_analytics.access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat, whereClause)

	rows, err = db.conn.Query(ctx, queryStatusTS, args...)
	if err != nil {
		log.Printf("GetAnalytics: Status time series query failed: %v", err)
	} else {
		for rows.Next() {
			var t string
			var c2xx, c3xx, c4xx, c5xx uint64
			if err := rows.Scan(&t, &c2xx, &c3xx, &c4xx, &c5xx); err == nil {
				resp.HttpStatusMetrics.Status_2Xx_5Min = append(resp.HttpStatusMetrics.Status_2Xx_5Min, &pb.TimeSeriesPoint{Time: t, Requests: int64(c2xx)})
				resp.HttpStatusMetrics.Status_3Xx = append(resp.HttpStatusMetrics.Status_3Xx, &pb.TimeSeriesPoint{Time: t, Requests: int64(c3xx)})
				resp.HttpStatusMetrics.Status_4Xx_5Min = append(resp.HttpStatusMetrics.Status_4Xx_5Min, &pb.TimeSeriesPoint{Time: t, Requests: int64(c4xx)})
				resp.HttpStatusMetrics.Status_5Xx = append(resp.HttpStatusMetrics.Status_5Xx, &pb.TimeSeriesPoint{Time: t, Requests: int64(c5xx)})
			}
		}
		rows.Close()
	}

	// 10b. 24h Totals
	// We need a separate where clause for 24h fixed window
	where24h := "WHERE timestamp >= now() - INTERVAL 24 HOUR"
	args24h := []interface{}{}
	if agentID != "" && agentID != "all" {
		where24h += " AND instance_id = ?"
		args24h = append(args24h, agentID)
	}

	row24h := db.conn.QueryRow(ctx, fmt.Sprintf(`
		SELECT 
			countIf(status = 200),
			countIf(status = 404),
			countIf(status = 503)
		FROM nginx_analytics.access_logs %s`, where24h), args24h...)

	var t200, t404, t503 uint64
	if err := row24h.Scan(&t200, &t404, &t503); err != nil {
		log.Printf("GetAnalytics: 24h totals query failed: %v", err)
	} else {
		resp.HttpStatusMetrics.TotalStatus_200_24H = int64(t200)
		resp.HttpStatusMetrics.TotalStatus_404_24H = int64(t404)
		resp.HttpStatusMetrics.TotalStatus_503 = int64(t503)
	}

	// 11. Generate Actionable Insights (Decision Hub)
	if resp.Summary != nil {
		// Latency Insight
		if resp.Summary.AvgLatency > 200 {
			resp.Insights = append(resp.Insights, &pb.Insight{
				Type:    "warning",
				Title:   "High Latency Detected",
				Message: fmt.Sprintf("Average latency is %.2fms, which is above the 200ms threshold.", resp.Summary.AvgLatency),
			})
		}

		// Error Rate Insight
		if resp.Summary.ErrorRate > 5.0 {
			resp.Insights = append(resp.Insights, &pb.Insight{
				Type:    "critical",
				Title:   "Spike in Error Rate",
				Message: fmt.Sprintf("Error rate has climbed to %.2f%%. Check upstream health.", resp.Summary.ErrorRate),
			})
		}
	}

	// System Resource Insights
	if len(resp.SystemMetrics) > 0 {
		lastPoint := resp.SystemMetrics[len(resp.SystemMetrics)-1]
		if lastPoint.CpuUsage > 80 {
			resp.Insights = append(resp.Insights, &pb.Insight{
				Type:    "critical",
				Title:   "CPU Exhaustion",
				Message: fmt.Sprintf("CPU usage is currently at %.1f%% on selected node(s).", lastPoint.CpuUsage),
			})
		}
		if lastPoint.MemoryUsage > 85 {
			resp.Insights = append(resp.Insights, &pb.Insight{
				Type:    "warning",
				Title:   "High Memory Pressure",
				Message: fmt.Sprintf("Memory usage is at %.1f%%. Consider scaling up.", lastPoint.MemoryUsage),
			})
		}
	}

	// Info insight if everything is looking good
	if len(resp.Insights) == 0 {
		resp.Insights = append(resp.Insights, &pb.Insight{
			Type:    "info",
			Title:   "Systems Healthy",
			Message: "All metrics are within normal operational parameters.",
		})
	}

	// 12. Recent Requests (for detailed log view)
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			toUnixTimestamp(timestamp),
			remote_addr,
			request_method,
			request_uri,
			status,
			body_bytes_sent,
			request_time,
			upstream_addr,
			upstream_status
		FROM nginx_analytics.access_logs
		%s
		ORDER BY timestamp DESC
		LIMIT 50
	`, whereClause), args...)
	if err != nil {
		log.Printf("GetAnalytics: Recent requests query failed: %v", err)
	} else {
		for rows.Next() {
			var ts uint32
			var addr, method, uri, upstream, upStatus string
			var status uint16
			var bytes uint64
			var rt float32

			if err := rows.Scan(&ts, &addr, &method, &uri, &status, &bytes, &rt, &upstream, &upStatus); err == nil {
				resp.RecentRequests = append(resp.RecentRequests, &pb.LogEntry{
					Timestamp:      int64(ts),
					RemoteAddr:     addr,
					RequestMethod:  method,
					RequestUri:     uri,
					Status:         int32(status),
					BodyBytesSent:  int64(bytes),
					RequestTime:    float32(rt),
					UpstreamAddr:   upstream,
					UpstreamStatus: upStatus,
					LogType:        "access",
				})
			} else {
				log.Printf("GetAnalytics: Recent requests scan failed: %v", err)
			}
		}
		rows.Close()
	}

	// 13. Gateway Metrics - Always show regardless of agent filter
	// Gateway metrics are system-wide and not per-agent
	queryGW := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			avg(eps),
			avg(active_connections),
			avg(cpu_usage),
			avg(memory_mb),
			avg(goroutines),
			avg(db_latency_ms)
		FROM nginx_analytics.gateway_metrics
		WHERE timestamp >= ?
		GROUP BY time
		ORDER BY time
	`, bucketSize, timeFormat)

	rows, err = db.conn.Query(ctx, queryGW, startTime)
	if err == nil {
		for rows.Next() {
			var t string
			var eps, cpu, mem, dbLat, conns, goro float64
			if err := rows.Scan(&t, &eps, &conns, &cpu, &mem, &goro, &dbLat); err == nil {
				resp.GatewayMetrics = append(resp.GatewayMetrics, &pb.GatewayMetricPoint{
					Time:              t,
					Eps:               float32(eps),
					ActiveConnections: int32(conns),
					CpuUsage:          float32(cpu),
					MemoryMb:          float32(mem),
					Goroutines:        int32(goro),
					DbLatency:         float32(dbLat),
				})
			}
		}
		rows.Close()
	}

	log.Printf("GetAnalytics: generated %d insights, %d recent logs, %d gateway points", len(resp.Insights), len(resp.RecentRequests), len(resp.GatewayMetrics))

	return resp, nil
}

func (db *ClickHouseDB) GetReportData(ctx context.Context, start, end time.Time, agentIDs []string) (*pb.ReportResponse, error) {
	resp := &pb.ReportResponse{
		GeneratedAt: time.Now().Unix(),
		Summary:     &pb.ReportSummary{},
	}

	whereClause := "WHERE timestamp >= ? AND timestamp <= ?"
	args := []interface{}{start, end}

	if len(agentIDs) > 0 {
		whereClause += " AND instance_id IN (?)"
		args = append(args, agentIDs)
	}

	// 1. Summary Stats
	row := db.conn.QueryRow(ctx, fmt.Sprintf(`
		SELECT 
			count(*), 
			countIf(status >= 400), 
			sum(body_bytes_sent), 
			avg(request_time),
			uniq(remote_addr)
		FROM nginx_analytics.access_logs %s`, whereClause), args...)

	var reqs, errs, bytes, visitors uint64
	var lat float64
	if err := row.Scan(&reqs, &errs, &bytes, &lat, &visitors); err != nil {
		log.Printf("Report: Summary query failed: %v", err)
	} else {
		errRate := 0.0
		if reqs > 0 {
			errRate = (float64(errs) / float64(reqs)) * 100
		}
		if math.IsNaN(lat) {
			lat = 0
		}

		resp.Summary = &pb.ReportSummary{
			TotalRequests:  int64(reqs),
			ErrorRate:      float32(errRate),
			TotalBandwidth: bytes,
			AvgLatency:     float32(lat * 1000),
			UniqueVisitors: int64(visitors),
		}
	}

	// 2. Traffic Trend (Daily or Hourly based on range)
	// If range > 2 days, group by day. Else group by hour.
	bucketSize := "toStartOfHour"
	format := "%H:00"
	if end.Sub(start) > 48*time.Hour {
		bucketSize = "toStartOfDay"
		format = "%Y-%m-%d"
	}

	queryTrend := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%s') as time,
			count(*) as requests,
			countIf(status >= 400) as errors
		FROM nginx_analytics.access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, format, whereClause)

	rows, err := db.conn.Query(ctx, queryTrend, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t string
			var r, e uint64
			if err := rows.Scan(&t, &r, &e); err == nil {
				resp.TrafficTrend = append(resp.TrafficTrend, &pb.TimeSeriesPoint{
					Time:     t,
					Requests: int64(r),
					Errors:   int64(e),
				})
			}
		}
	}

	// 3. Top URIs
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			request_uri,
			count(*) as requests,
			countIf(status >= 400) as errors,
			quantile(0.95)(request_time) as p95
		FROM nginx_analytics.access_logs
		%s
		GROUP BY request_uri
		ORDER BY requests DESC
		LIMIT 10
	`, whereClause), args...)

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var uri string
			var r, e uint64
			var p float64
			if err := rows.Scan(&uri, &r, &e, &p); err == nil {
				if math.IsNaN(p) {
					p = 0
				}
				resp.TopUris = append(resp.TopUris, &pb.EndpointStat{
					Uri:      uri,
					Requests: int64(r),
					Errors:   int64(e),
					P95:      float32(p * 1000),
				})
			}
		}
	}

	// 4. Top Servers
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			instance_id,
			count(*) as requests,
			countIf(status >= 400) as errors,
			sum(body_bytes_sent) as traffic
		FROM nginx_analytics.access_logs
		%s
		GROUP BY instance_id
		ORDER BY requests DESC
		LIMIT 10
	`, whereClause), args...)

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			var r, e, tr uint64
			if err := rows.Scan(&id, &r, &e, &tr); err == nil {
				errRate := 0.0
				if r > 0 {
					errRate = (float64(e) / float64(r)) * 100
				}
				resp.TopServers = append(resp.TopServers, &pb.ServerStat{
					Hostname:  id,
					Requests:  int64(r),
					ErrorRate: float32(errRate),
					Traffic:   tr,
				})
			}
		}
	}

	return resp, nil
}

func (db *ClickHouseDB) GetTraces(ctx context.Context, req *pb.TraceRequest) (*pb.TraceList, error) {
	return db.GetTracesWithFilter(ctx, req, nil)
}

// GetTracesWithFilter supports filtering by multiple agent IDs (for project/environment filtering)
func (db *ClickHouseDB) GetTracesWithFilter(ctx context.Context, req *pb.TraceRequest, agentFilter []string) (*pb.TraceList, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}

	duration := 1 * time.Hour
	switch req.TimeWindow {
	case "5m":
		duration = 5 * time.Minute
	case "15m":
		duration = 15 * time.Minute
	case "1h":
		duration = 1 * time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	}
	startTime := time.Now().UTC().Add(-duration)

	query := `
		SELECT trace_id, span_id, start_time, end_time, attributes
		FROM nginx_analytics.spans
		WHERE name = 'request' AND start_time >= ?
	`
	args := []interface{}{startTime}

	// Agent filtering - supports multiple agent IDs (for project/environment filtering)
	if len(agentFilter) > 0 {
		placeholders := make([]string, len(agentFilter))
		for i, id := range agentFilter {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += fmt.Sprintf(" AND instance_id IN (%s)", strings.Join(placeholders, ","))
	} else if req.AgentId != "" && req.AgentId != "all" {
		query += " AND instance_id = ?"
		args = append(args, req.AgentId)
	}

	if req.StatusFilter != "" {
		if req.StatusFilter == "5xx" {
			query += " AND attributes['status'] >= '500'"
		} else if req.StatusFilter == "4xx" {
			query += " AND attributes['status'] >= '400' AND attributes['status'] < '500'"
		} else {
			query += " AND attributes['status'] = ?"
			args = append(args, req.StatusFilter)
		}
	}

	if req.MethodFilter != "" {
		query += " AND attributes['method'] = ?"
		args = append(args, req.MethodFilter)
	}

	if req.UriFilter != "" {
		query += " AND attributes['uri'] LIKE ?"
		args = append(args, "%"+req.UriFilter+"%")
	}

	query += " ORDER BY start_time DESC LIMIT ?"
	args = append(args, limit)

	// Query for root spans (name='request')
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var traces []*pb.Trace
	for rows.Next() {
		var traceID, spanID string
		var start, end time.Time
		var attrs map[string]string

		if err := rows.Scan(&traceID, &spanID, &start, &end, &attrs); err != nil {
			log.Printf("Error scanning trace row: %v", err)
			continue
		}

		// Reconstruct root span
		rootSpan := &pb.Span{
			TraceId:    traceID,
			SpanId:     spanID,
			Name:       "request",
			StartTime:  start.UnixNano(),
			EndTime:    end.UnixNano(),
			Attributes: attrs,
		}

		traces = append(traces, &pb.Trace{
			RequestId: traceID,
			Spans:     []*pb.Span{rootSpan},
		})
	}

	return &pb.TraceList{Traces: traces}, nil
}

func (db *ClickHouseDB) GetTraceDetails(ctx context.Context, agentID string, traceID string) (*pb.Trace, error) {
	rows, err := db.conn.Query(ctx, `
		SELECT span_id, parent_span_id, name, start_time, end_time, attributes
		FROM nginx_analytics.spans
		WHERE instance_id = ? AND trace_id = ?
		ORDER BY start_time ASC
	`, agentID, traceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var spans []*pb.Span
	// var rootSpan *pb.Span // Unused for now

	for rows.Next() {
		var spanID, parentID, name string
		var start, end time.Time
		var attrs map[string]string

		if err := rows.Scan(&spanID, &parentID, &name, &start, &end, &attrs); err != nil {
			return nil, err
		}

		span := &pb.Span{
			TraceId:      traceID,
			SpanId:       spanID,
			ParentSpanId: parentID,
			Name:         name,
			StartTime:    start.UnixNano(),
			EndTime:      end.UnixNano(),
			Attributes:   attrs,
		}
		spans = append(spans, span)

		// 		if name == "request" {
		// 			rootSpan = span
		// 		}
	}

	trace := &pb.Trace{
		RequestId: traceID,
		Spans:     spans,
	}

	// Try to populate legacy RootEntry if possible/needed, but frontend should use Spans now.

	return trace, nil
}

func (db *ClickHouseDB) DeleteAgentData(agentID string) error {
	ctx := context.Background()
	tables := []string{
		"access_logs",
		"error_logs",
		"system_metrics",
		"nginx_metrics",
	}

	for _, table := range tables {
		// ClickHouse DELETE is an asynchronous mutation (ALTER TABLE ... DELETE)
		query := fmt.Sprintf("ALTER TABLE %s DELETE WHERE instance_id = ?", table)
		if err := db.conn.Exec(ctx, query, agentID); err != nil {
			return fmt.Errorf("failed to delete from %s: %w", table, err)
		}
	}

	return nil
}

func (db *ClickHouseDB) QueryMetricAverage(ctx context.Context, metricType string, windowSec int) (float64, error) {
	var query string
	var table string
	var column string

	switch metricType {
	case "cpu":
		table = "nginx_analytics.system_metrics"
		column = "cpu_usage"
	case "memory":
		table = "nginx_analytics.system_metrics"
		column = "memory_usage"
	case "rps":
		table = "nginx_analytics.nginx_metrics"
		column = "requests_per_second"
	case "error_rate":
		// Special case for error rate
		query = fmt.Sprintf(`
			SELECT if(count(*) > 0, (countIf(status >= 400) / count(*)) * 100, 0)
			FROM nginx_analytics.access_logs
			WHERE timestamp >= now() - INTERVAL %d SECOND
		`, windowSec)
	default:
		return 0, fmt.Errorf("unknown metric type: %s", metricType)
	}

	if query == "" {
		query = fmt.Sprintf(`
			SELECT avg(%s)
			FROM %s
			WHERE timestamp >= now() - INTERVAL %d SECOND
		`, column, table, windowSec)
	}

	var avg float64
	err := db.conn.QueryRow(ctx, query).Scan(&avg)
	if err != nil {
		// Log and return 0 if no data
		return 0, nil
	}

	return avg, nil
}
func (db *ClickHouseDB) runLogFlusher() {
	flushInterval := getEnvInt("CH_FLUSH_INTERVAL_MS", 100)
	ticker := time.NewTicker(time.Duration(flushInterval) * time.Millisecond)
	batch := make([]logBatchItem, 0, logBatchSize)

	for {
		select {
		case item := <-db.logChan:
			batch = append(batch, item)
			if len(batch) >= logBatchSize {
				db.flushLogs(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				db.flushLogs(batch)
				batch = batch[:0]
			}
		}
	}
}

func (db *ClickHouseDB) flushLogs(batch []logBatchItem) {
	ctx := context.Background()
	b, err := db.conn.PrepareBatch(ctx, `INSERT INTO nginx_analytics.access_logs (
		timestamp, instance_id, remote_addr, request_method,
		request_uri, status, body_bytes_sent, request_time,
		request_id, upstream_addr, upstream_status, user_agent, referer,
		client_ip, country, country_code, city, region, latitude, longitude, timezone, isp
	)`)
	if err != nil {
		log.Printf("FlushLogs: PrepareBatch failed: %v", err)
		return
	}

	for _, item := range batch {
		ts := time.Unix(item.entry.Timestamp, 0)
		if item.entry.Timestamp == 0 {
			ts = time.Now()
		}
		b.Append(ts, item.agentID, item.entry.RemoteAddr, item.entry.RequestMethod,
			item.entry.RequestUri, uint16(item.entry.Status), uint64(item.entry.BodyBytesSent),
			float32(item.entry.RequestTime), item.entry.RequestId, item.entry.UpstreamAddr,
			item.entry.UpstreamStatus, item.entry.UserAgent, item.entry.Referer,
			item.clientIP, item.country, item.countryCode, item.city, item.region,
			item.latitude, item.longitude, item.timezone, item.isp)
	}

	if err := b.Send(); err != nil {
		log.Printf("FlushLogs: Send failed: %v", err)
	}
}

func (db *ClickHouseDB) runSpanFlusher() {
	flushInterval := getEnvInt("CH_FLUSH_INTERVAL_MS", 100)
	ticker := time.NewTicker(time.Duration(flushInterval) * time.Millisecond)
	batch := make([]spanBatchItem, 0, spanBatchSize)

	for {
		select {
		case item := <-db.spanChan:
			batch = append(batch, item)
			if len(batch) >= spanBatchSize {
				db.flushSpans(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				db.flushSpans(batch)
				batch = batch[:0]
			}
		}
	}
}

func (db *ClickHouseDB) flushSpans(batch []spanBatchItem) {
	ctx := context.Background()
	b, err := db.conn.PrepareBatch(ctx, `INSERT INTO nginx_analytics.spans (
		trace_id, span_id, parent_span_id, name, start_time, end_time, attributes, instance_id
	)`)
	if err != nil {
		return
	}

	for _, s := range batch {
		b.Append(s.traceID, s.spanID, s.parent, s.name, s.start, s.end, s.attrs, s.agentID)
	}
	b.Send()
}

func (db *ClickHouseDB) runSysFlusher() {
	ticker := time.NewTicker(5 * time.Second)
	batch := make([]sysBatchItem, 0, 100)
	for {
		select {
		case item := <-db.sysChan:
			batch = append(batch, item)
			if len(batch) >= 100 {
				db.flushSys(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				db.flushSys(batch)
				batch = batch[:0]
			}
		}
	}
}

func (db *ClickHouseDB) flushSys(batch []sysBatchItem) {
	ctx := context.Background()
	b, err := db.conn.PrepareBatch(ctx, "INSERT INTO nginx_analytics.system_metrics (timestamp, instance_id, cpu_usage, memory_usage, memory_total, memory_used, network_rx_bytes, network_tx_bytes, network_rx_rate, network_tx_rate, cpu_user, cpu_system, cpu_iowait)")
	if err != nil {
		log.Printf("Failed to prepare system metrics batch: %v", err)
		return
	}
	for _, item := range batch {
		b.Append(
			time.Now(),
			item.agentID,
			float32(item.entry.CpuUsagePercent),
			float32(item.entry.MemoryUsagePercent),
			uint64(item.entry.MemoryTotalBytes),
			uint64(item.entry.MemoryUsedBytes),
			uint64(item.entry.NetworkRxBytes),
			uint64(item.entry.NetworkTxBytes),
			float32(item.entry.NetworkRxRate),
			float32(item.entry.NetworkTxRate),
			float32(item.entry.CpuUserPercent),
			float32(item.entry.CpuSystemPercent),
			float32(item.entry.CpuIowaitPercent),
		)
	}
	if err := b.Send(); err != nil {
		log.Printf("Failed to send system metrics batch: %v", err)
	}
}

func (db *ClickHouseDB) runNginxFlusher() {
	ticker := time.NewTicker(5 * time.Second)
	batch := make([]nginxBatchItem, 0, 100)
	for {
		select {
		case item := <-db.nginxChan:
			batch = append(batch, item)
			if len(batch) >= 100 {
				db.flushNginx(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				db.flushNginx(batch)
				batch = batch[:0]
			}
		}
	}
}

func (db *ClickHouseDB) flushNginx(batch []nginxBatchItem) {
	ctx := context.Background()
	b, err := db.conn.PrepareBatch(ctx, "INSERT INTO nginx_analytics.nginx_metrics (timestamp, instance_id, active_connections, accepted_connections, handled_connections, total_requests, reading, writing, waiting, requests_per_second)")
	if err != nil {
		log.Printf("Failed to prepare nginx metrics batch: %v", err)
		return
	}
	for _, item := range batch {
		// Calculate requests per second based on active connections as a rough estimate
		rps := float64(0)
		if item.entry.ActiveConnections > 0 {
			rps = float64(item.entry.TotalRequests) / 60.0 // Rough estimate per minute
		}
		b.Append(
			time.Now(),
			item.agentID,
			uint32(item.entry.ActiveConnections),
			uint64(item.entry.AcceptedConnections),
			uint64(item.entry.HandledConnections),
			uint64(item.entry.TotalRequests),
			uint32(item.entry.Reading),
			uint32(item.entry.Writing),
			uint32(item.entry.Waiting),
			rps,
		)
	}
	if err := b.Send(); err != nil {
		log.Printf("Failed to send nginx metrics batch: %v", err)
	}
}
func (db *ClickHouseDB) runGwFlusher() {
	ticker := time.NewTicker(5 * time.Second)
	batch := make([]gwBatchItem, 0, 100)
	for {
		select {
		case item := <-db.gwChan:
			batch = append(batch, item)
			if len(batch) >= 100 {
				db.flushGw(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				db.flushGw(batch)
				batch = batch[:0]
			}
		}
	}
}

func (db *ClickHouseDB) flushGw(batch []gwBatchItem) {
	ctx := context.Background()
	b, err := db.conn.PrepareBatch(ctx, `INSERT INTO nginx_analytics.gateway_metrics (
		timestamp, gateway_id, eps, active_connections,
		cpu_usage, memory_mb, goroutines, db_latency_ms
	)`)
	if err != nil {
		return
	}
	for _, item := range batch {
		b.Append(time.Now(), item.metrics.gatewayID, item.metrics.metrics.Eps,
			uint32(item.metrics.metrics.ActiveConnections), item.metrics.metrics.CpuUsage,
			item.metrics.metrics.MemoryMb, uint32(item.metrics.metrics.Goroutines),
			item.metrics.metrics.DbLatency)
	}
	b.Send()
}

// GeoDataResponse represents geo analytics data
type GeoDataResponse struct {
	Locations       []GeoLocation       `json:"locations"`
	CountryStats    []CountryStat       `json:"country_stats"`
	CityStats       []CityStat          `json:"city_stats"`
	RecentRequests  []GeoRequest        `json:"recent_requests"`
	TotalCountries  uint64              `json:"total_countries"`
	TotalCities     uint64              `json:"total_cities"`
	TotalRequests   uint64              `json:"total_requests"`
	TopCountryCode  string              `json:"top_country_code"`
}

type GeoLocation struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Requests    uint64  `json:"requests"`
	Errors      uint64  `json:"errors"`
	AvgLatency  float64 `json:"avg_latency"`
}

type CountryStat struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	Requests    uint64  `json:"requests"`
	Errors      uint64  `json:"errors"`
	Bandwidth   uint64  `json:"bandwidth"`
	ErrorRate   float64 `json:"error_rate"`
}

type CityStat struct {
	City        string  `json:"city"`
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Requests    uint64  `json:"requests"`
}

type GeoRequest struct {
	Timestamp   uint32  `json:"timestamp"`
	ClientIP    string  `json:"client_ip"`
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Method      string  `json:"method"`
	URI         string  `json:"uri"`
	Status      uint16  `json:"status"`
}

// GetGeoData retrieves geo analytics data
func (db *ClickHouseDB) GetGeoData(ctx context.Context, window string) (*GeoDataResponse, error) {
	duration := 24 * time.Hour
	switch window {
	case "1h":
		duration = time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "12h":
		duration = 12 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	}

	startTime := time.Now().Add(-duration)
	resp := &GeoDataResponse{
		Locations:      []GeoLocation{},
		CountryStats:   []CountryStat{},
		CityStats:      []CityStat{},
		RecentRequests: []GeoRequest{},
	}

	// 1. Get unique locations with aggregated stats
	queryLocations := `
		SELECT
			country,
			country_code,
			city,
			latitude,
			longitude,
			count(*) as requests,
			countIf(status >= 400) as errors,
			avg(request_time) * 1000 as avg_latency
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND latitude != 0
		GROUP BY country, country_code, city, latitude, longitude
		ORDER BY requests DESC
		LIMIT 100
	`
	rows, err := db.conn.Query(ctx, queryLocations, startTime)
	if err != nil {
		log.Printf("GetGeoData: locations query failed: %v", err)
	} else {
		for rows.Next() {
			var loc GeoLocation
			if err := rows.Scan(&loc.Country, &loc.CountryCode, &loc.City,
				&loc.Latitude, &loc.Longitude, &loc.Requests, &loc.Errors, &loc.AvgLatency); err == nil {
				resp.Locations = append(resp.Locations, loc)
			}
		}
		rows.Close()
	}

	// 2. Get country-level stats
	queryCountries := `
		SELECT
			country,
			country_code,
			count(*) as requests,
			countIf(status >= 400) as errors,
			sum(body_bytes_sent) as bandwidth
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != ''
		GROUP BY country, country_code
		ORDER BY requests DESC
		LIMIT 50
	`
	rows, err = db.conn.Query(ctx, queryCountries, startTime)
	if err != nil {
		log.Printf("GetGeoData: countries query failed: %v", err)
	} else {
		for rows.Next() {
			var stat CountryStat
			if err := rows.Scan(&stat.Country, &stat.CountryCode, &stat.Requests,
				&stat.Errors, &stat.Bandwidth); err == nil {
				if stat.Requests > 0 {
					stat.ErrorRate = float64(stat.Errors) / float64(stat.Requests) * 100
				}
				resp.CountryStats = append(resp.CountryStats, stat)
			}
		}
		rows.Close()
	}

	// 3. Get city-level stats
	queryCities := `
		SELECT
			city,
			country,
			country_code,
			any(latitude) as lat,
			any(longitude) as lon,
			count(*) as requests
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND city != '' AND city != 'Unknown'
		GROUP BY city, country, country_code
		ORDER BY requests DESC
		LIMIT 100
	`
	rows, err = db.conn.Query(ctx, queryCities, startTime)
	if err != nil {
		log.Printf("GetGeoData: cities query failed: %v", err)
	} else {
		for rows.Next() {
			var stat CityStat
			if err := rows.Scan(&stat.City, &stat.Country, &stat.CountryCode,
				&stat.Latitude, &stat.Longitude, &stat.Requests); err == nil {
				resp.CityStats = append(resp.CityStats, stat)
			}
		}
		rows.Close()
	}

	// 4. Get recent geo-located requests
	queryRecent := `
		SELECT
			toUnixTimestamp(timestamp),
			client_ip,
			country,
			country_code,
			city,
			latitude,
			longitude,
			request_method,
			request_uri,
			status
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND latitude != 0
		ORDER BY timestamp DESC
		LIMIT 50
	`
	rows, err = db.conn.Query(ctx, queryRecent, startTime)
	if err != nil {
		log.Printf("GetGeoData: recent requests query failed: %v", err)
	} else {
		for rows.Next() {
			var req GeoRequest
			if err := rows.Scan(&req.Timestamp, &req.ClientIP, &req.Country, &req.CountryCode,
				&req.City, &req.Latitude, &req.Longitude, &req.Method, &req.URI, &req.Status); err == nil {
				resp.RecentRequests = append(resp.RecentRequests, req)
			}
		}
		rows.Close()
	}

	// 5. Get summary stats
	querySummary := `
		SELECT
			uniqExact(country_code) as countries,
			uniqExact(city) as cities,
			count(*) as total
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != ''
	`
	var countries, cities, total uint64
	db.conn.QueryRow(ctx, querySummary, startTime).Scan(&countries, &cities, &total)
	resp.TotalCountries = countries
	resp.TotalCities = cities
	resp.TotalRequests = total

	// Get top country
	if len(resp.CountryStats) > 0 {
		resp.TopCountryCode = resp.CountryStats[0].CountryCode
	}

	return resp, nil
}

// GetGeoDataFiltered returns geo data filtered by a list of agent IDs (for RBAC)
// If agentFilter is nil or empty, returns all data (for superadmins)
func (db *ClickHouseDB) GetGeoDataFiltered(ctx context.Context, window string, agentFilter []string) (*GeoDataResponse, error) {
	// If no filter, use the unfiltered version
	if len(agentFilter) == 0 {
		return db.GetGeoData(ctx, window)
	}

	duration := 24 * time.Hour
	switch window {
	case "1h":
		duration = time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "12h":
		duration = 12 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	}

	startTime := time.Now().Add(-duration)
	resp := &GeoDataResponse{
		Locations:      []GeoLocation{},
		CountryStats:   []CountryStat{},
		CityStats:      []CityStat{},
		RecentRequests: []GeoRequest{},
	}

	// Build agent filter clause
	agentPlaceholders := make([]string, len(agentFilter))
	agentArgs := make([]interface{}, len(agentFilter)+1)
	agentArgs[0] = startTime
	for i, id := range agentFilter {
		agentPlaceholders[i] = "?"
		agentArgs[i+1] = id
	}
	agentClause := fmt.Sprintf("instance_id IN (%s)", strings.Join(agentPlaceholders, ","))

	// 1. Get unique locations with aggregated stats
	queryLocations := fmt.Sprintf(`
		SELECT
			country,
			country_code,
			city,
			latitude,
			longitude,
			count(*) as requests,
			countIf(status >= 400) as errors,
			avg(request_time) * 1000 as avg_latency
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND latitude != 0 AND %s
		GROUP BY country, country_code, city, latitude, longitude
		ORDER BY requests DESC
		LIMIT 100
	`, agentClause)
	rows, err := db.conn.Query(ctx, queryLocations, agentArgs...)
	if err != nil {
		log.Printf("GetGeoDataFiltered: locations query failed: %v", err)
	} else {
		for rows.Next() {
			var loc GeoLocation
			if err := rows.Scan(&loc.Country, &loc.CountryCode, &loc.City,
				&loc.Latitude, &loc.Longitude, &loc.Requests, &loc.Errors, &loc.AvgLatency); err == nil {
				resp.Locations = append(resp.Locations, loc)
			}
		}
		rows.Close()
	}

	// 2. Get country-level stats
	queryCountries := fmt.Sprintf(`
		SELECT
			country,
			country_code,
			count(*) as requests,
			countIf(status >= 400) as errors,
			sum(body_bytes_sent) as bandwidth
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND %s
		GROUP BY country, country_code
		ORDER BY requests DESC
		LIMIT 50
	`, agentClause)
	rows, err = db.conn.Query(ctx, queryCountries, agentArgs...)
	if err != nil {
		log.Printf("GetGeoDataFiltered: countries query failed: %v", err)
	} else {
		for rows.Next() {
			var stat CountryStat
			if err := rows.Scan(&stat.Country, &stat.CountryCode, &stat.Requests,
				&stat.Errors, &stat.Bandwidth); err == nil {
				if stat.Requests > 0 {
					stat.ErrorRate = float64(stat.Errors) / float64(stat.Requests) * 100
				}
				resp.CountryStats = append(resp.CountryStats, stat)
			}
		}
		rows.Close()
	}

	// 3. Get city-level stats
	queryCities := fmt.Sprintf(`
		SELECT
			city,
			country,
			country_code,
			any(latitude) as lat,
			any(longitude) as lon,
			count(*) as requests
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND city != '' AND city != 'Unknown' AND %s
		GROUP BY city, country, country_code
		ORDER BY requests DESC
		LIMIT 100
	`, agentClause)
	rows, err = db.conn.Query(ctx, queryCities, agentArgs...)
	if err != nil {
		log.Printf("GetGeoDataFiltered: cities query failed: %v", err)
	} else {
		for rows.Next() {
			var stat CityStat
			if err := rows.Scan(&stat.City, &stat.Country, &stat.CountryCode,
				&stat.Latitude, &stat.Longitude, &stat.Requests); err == nil {
				resp.CityStats = append(resp.CityStats, stat)
			}
		}
		rows.Close()
	}

	// 4. Get recent geo-located requests
	queryRecent := fmt.Sprintf(`
		SELECT
			toUnixTimestamp(timestamp),
			client_ip,
			country,
			country_code,
			city,
			latitude,
			longitude,
			request_method,
			request_uri,
			status
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND latitude != 0 AND %s
		ORDER BY timestamp DESC
		LIMIT 50
	`, agentClause)
	rows, err = db.conn.Query(ctx, queryRecent, agentArgs...)
	if err != nil {
		log.Printf("GetGeoDataFiltered: recent requests query failed: %v", err)
	} else {
		for rows.Next() {
			var req GeoRequest
			if err := rows.Scan(&req.Timestamp, &req.ClientIP, &req.Country, &req.CountryCode,
				&req.City, &req.Latitude, &req.Longitude, &req.Method, &req.URI, &req.Status); err == nil {
				resp.RecentRequests = append(resp.RecentRequests, req)
			}
		}
		rows.Close()
	}

	// 5. Get summary stats
	querySummary := fmt.Sprintf(`
		SELECT
			uniqExact(country_code) as countries,
			uniqExact(city) as cities,
			count(*) as total
		FROM nginx_analytics.access_logs
		WHERE timestamp >= ? AND country != '' AND %s
	`, agentClause)
	var countries, cities, total uint64
	db.conn.QueryRow(ctx, querySummary, agentArgs...).Scan(&countries, &cities, &total)
	resp.TotalCountries = countries
	resp.TotalCities = cities
	resp.TotalRequests = total

	// Get top country
	if len(resp.CountryStats) > 0 {
		resp.TopCountryCode = resp.CountryStats[0].CountryCode
	}

	return resp, nil
}
