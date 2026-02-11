package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"
)

type ClickHouseDB struct {
	conn driver.Conn
}

func NewClickHouseDB(addr string) (*ClickHouseDB, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: "nginx_analytics",
			Username: "default",
			Password: "",
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		DialTimeout:     5 * time.Second,
		MaxOpenConns:    5,
		MaxIdleConns:    5,
		ConnMaxLifetime: time.Hour,
	})

	if err != nil {
		return nil, err
	}

	if err := conn.Ping(context.Background()); err != nil {
		if exception, ok := err.(*clickhouse.Exception); ok {
			return nil, fmt.Errorf("exception [%d] %s \n%s", exception.Code, exception.Message, exception.StackTrace)
		}
		return nil, err
	}

	db := &ClickHouseDB{conn: conn}
	if err := db.migrate(); err != nil {
		log.Printf("Warning: ClickHouse migration failed: %v", err)
	}

	return db, nil
}

func (db *ClickHouseDB) migrate() error {
	ctx := context.Background()
	queries := []string{
		`CREATE TABLE IF NOT EXISTS gateway_metrics (
			timestamp DateTime64(3),
			gateway_id String,
			eps Float32,
			active_connections UInt32,
			cpu_usage Float32,
			memory_mb Float32,
			goroutines UInt32,
			db_latency_ms Float32
		) ENGINE = MergeTree() ORDER BY (timestamp, gateway_id)`,
		`ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS cpu_user Float32`,
		`ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS cpu_system Float32`,
		`ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS cpu_iowait Float32`,
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
	// For production, this should be batched. For MVP, single insert.
	// Note: We use async insert if possible, or just raw exec.

	ctx := context.Background()

	// Map timestamp
	ts := time.Unix(entry.Timestamp, 0)
	if entry.Timestamp == 0 {
		ts = time.Now()
	}

	err := db.conn.Exec(ctx, `
		INSERT INTO access_logs (
			timestamp, instance_id, remote_addr, request_method,
			request_uri, status, body_bytes_sent, request_time,
			request_id, upstream_addr, upstream_status, 
			upstream_connect_time, upstream_header_time, upstream_response_time,
			user_agent, referer
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?,
			?, ?, ?,
			?, ?
		)
	`,
		ts,
		agentID,
		entry.RemoteAddr,
		entry.RequestMethod,
		entry.RequestUri,
		uint16(entry.Status),
		uint64(entry.BodyBytesSent),
		float32(entry.RequestTime),
		entry.RequestId,
		entry.UpstreamAddr,
		entry.UpstreamStatus,
		float32(entry.UpstreamConnectTime),
		float32(entry.UpstreamHeaderTime),
		float32(entry.UpstreamResponseTime),
		entry.UserAgent,
		entry.Referer,
	)

	return err
}

func (db *ClickHouseDB) GetAnalytics(ctx context.Context, window string, agentID string) (*pb.AnalyticsResponse, error) {
	// ... (duration logic) ...
	duration := 24 * time.Hour
	switch window {
	case "1h":
		duration = 1 * time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	}

	startTime := time.Now().UTC().Add(-duration)
	resp := &pb.AnalyticsResponse{}

	// Determine bucket size
	bucketSize := "toStartOfHour"
	if duration <= 6*time.Hour {
		bucketSize = "toStartOfMinute"
	}

	// Filter clause
	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	// 1. Request Rate
	queryTimeSeries := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			count(*) as requests,
			countIf(status >= 400) as errors
		FROM access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

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

	// 2. Status Distribution
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			toString(status) as code,
			count(*) as count
		FROM access_logs
		%s
		GROUP BY code
	`, whereClause), args...)
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

	// 3. Top Endpoints
	rows, err = db.conn.Query(ctx, fmt.Sprintf(`
		SELECT
			request_uri,
			count(*) as requests,
			countIf(status >= 400) as errors,
			quantile(0.95)(request_time) as p95
		FROM access_logs
		%s
		GROUP BY request_uri
		ORDER BY requests DESC
		LIMIT 10
	`, whereClause), args...)
	if err == nil {
		for rows.Next() {
			var uri string
			var reqs, errs uint64
			var p95 float64
			if err := rows.Scan(&uri, &reqs, &errs, &p95); err == nil {
				if math.IsNaN(p95) {
					p95 = 0
				}
				resp.TopEndpoints = append(resp.TopEndpoints, &pb.EndpointStat{
					Uri:      uri,
					Requests: int64(reqs),
					Errors:   int64(errs),
					P95:      float32(p95 * 1000),
					Traffic:  "0 KB", // Not tracking bytes yet in this query
				})
			}
		}
		rows.Close()
	}

	// 4. Latency Trend
	queryLatency := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			quantile(0.50)(request_time) as p50,
			quantile(0.95)(request_time) as p95,
			quantile(0.99)(request_time) as p99
		FROM access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

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
	prevStartTime := startTime.Add(-duration)
	var currReqs, prevReqs uint64
	var currErrors, prevErrors uint64
	var currBytes, prevBytes uint64
	var currLat, prevLat float64

	db.conn.QueryRow(ctx, fmt.Sprintf(`
		SELECT 
			count(*), 
			countIf(status >= 400), 
			sum(body_bytes_sent), 
			avg(request_time) 
		FROM access_logs %s`, whereClause), args...).Scan(&currReqs, &currErrors, &currBytes, &currLat)

	// Deltas need a slightly different filter
	prevWhereClause := "WHERE timestamp >= ? AND timestamp < ?"
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
		FROM access_logs %s`, prevWhereClause), prevArgs...).Scan(&prevReqs, &prevErrors, &prevBytes, &prevLat)

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
		FROM access_logs
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

	// 7. Server Distribution (Only if no specific agent filter)
	if agentID == "" || agentID == "all" {
		rows, err = db.conn.Query(ctx, fmt.Sprintf(`
			SELECT
				instance_id,
				count(*) as requests,
				countIf(status >= 400) as errors,
				sum(body_bytes_sent) as traffic
			FROM access_logs
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

	// 8. System Metrics History
	querySys := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			avg(cpu_usage),
			avg(memory_usage),
			avg(network_rx_rate),
			avg(network_tx_rate),
			avg(cpu_user),
			avg(cpu_system),
			avg(cpu_iowait)
		FROM system_metrics
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

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

	// 9. NGINX Connections History
	queryConn := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			avg(active_connections),
			avg(waiting),
			avg(requests_per_second)
		FROM nginx_metrics
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

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

	// 10a. Time Series for Status Codes
	queryStatusTS := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			countIf(status >= 200 AND status < 300) as code_2xx,
			countIf(status >= 300 AND status < 400) as code_3xx,
			countIf(status >= 400 AND status < 500) as code_4xx,
			countIf(status >= 500) as code_5xx
		FROM access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

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
		FROM access_logs %s`, where24h), args24h...)

	if err := row24h.Scan(
		&resp.HttpStatusMetrics.TotalStatus_200_24H,
		&resp.HttpStatusMetrics.TotalStatus_404_24H,
		&resp.HttpStatusMetrics.TotalStatus_503,
	); err != nil {
		log.Printf("GetAnalytics: 24h totals query failed: %v", err)
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
		FROM access_logs
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

	// 13. Gateway Metrics (Only if no specific agent filter)
	if agentID == "" || agentID == "all" {
		queryGW := fmt.Sprintf(`
			SELECT
				formatDateTime(%s(timestamp), '%%H:%%i') as time,
				avg(eps),
				avg(active_connections),
				avg(cpu_usage),
				avg(memory_mb),
				avg(goroutines),
				avg(db_latency_ms)
			FROM gateway_metrics
			WHERE timestamp >= ?
			GROUP BY time
			ORDER BY time
		`, bucketSize)

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
	}

	log.Printf("GetAnalytics: generated %d insights, %d recent logs, %d gateway points", len(resp.Insights), len(resp.RecentRequests), len(resp.GatewayMetrics))

	return resp, nil
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
