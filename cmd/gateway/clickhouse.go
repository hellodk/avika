package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	pb "github.com/user/nginx-manager/api/proto"
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

	return &ClickHouseDB{conn: conn}, nil
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
			user_agent, referer
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?,
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
		"", // User Agent not in proto yet
		"", // Referer not in proto yet
	)

	return err
}

func (db *ClickHouseDB) GetAnalytics(ctx context.Context, window string) (*pb.AnalyticsResponse, error) {
	// Determine time window
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

	startTime := time.Now().Add(-duration)

	resp := &pb.AnalyticsResponse{}

	// 1. Request Rate (Requests & Errors per bucket)
	// We'll bucket by minute for < 6h, hour for >= 6h
	bucketSize := "toStartOfHour"
	if duration <= 6*time.Hour {
		bucketSize = "toStartOfMinute"
	}

	queryTimeSeries := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			count(*) as requests,
			countIf(status >= 400) as errors
		FROM access_logs
		WHERE timestamp >= ?
		GROUP BY time
		ORDER BY time
	`, bucketSize)

	rows, err := db.conn.Query(ctx, queryTimeSeries, startTime)
	if err != nil {
		log.Printf("Error querying time series: %v", err)
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
			}
		}
		rows.Close()
	}

	// 2. Status Distribution
	rows, err = db.conn.Query(ctx, `
		SELECT
			toString(status) as code,
			count(*) as count
		FROM access_logs
		WHERE timestamp >= ?
		GROUP BY code
	`, startTime)
	if err != nil {
		log.Printf("Error querying status dist: %v", err)
	} else {
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
	rows, err = db.conn.Query(ctx, `
		SELECT
			request_uri,
			count(*) as requests,
			countIf(status >= 400) as errors,
			quantile(0.95)(request_time) as p95
		FROM access_logs
		WHERE timestamp >= ?
		GROUP BY request_uri
		ORDER BY requests DESC
		LIMIT 10
	`, startTime)
	if err != nil {
		log.Printf("Error querying top endpoints: %v", err)
	} else {
		for rows.Next() {
			var uri string
			var reqs, errs uint64
			var p95 float64
			if err := rows.Scan(&uri, &reqs, &errs, &p95); err == nil {
				resp.TopEndpoints = append(resp.TopEndpoints, &pb.EndpointStat{
					Uri:      uri,
					Requests: int64(reqs),
					Errors:   int64(errs),
					P95:      float32(p95 * 1000), // Convert s to ms? No, request_time is s, but FE expects ms maybe?
					// Gateway previously sent float64(entry.RequestTime).
					// If request_time is seconds (standard nginx), then p95 is seconds.
					// Let's assume frontend handles it or convert to ms if needed.
					// Actually, previous code: `Latency: float64 // Sum of latency`.
					// Let's check `agent.proto`. `float request_time = 9;`
					// Standard NGINX request_time is seconds with milliseconds resolution (1.234).
					// Let's multiply by 1000 to send ms to frontend if frontend expects ms integers in badges.
					Traffic: "0 KB", // Not tracking bytes yet in this query
				})
			}
		}
		rows.Close()
	}

	// 4. Latency Trend
	// Calculating percentiles over time
	queryLatency := fmt.Sprintf(`
		SELECT
			formatDateTime(%s(timestamp), '%%H:%%i') as time,
			quantile(0.50)(request_time) as p50,
			quantile(0.95)(request_time) as p95,
			quantile(0.99)(request_time) as p99
		FROM access_logs
		WHERE timestamp >= ?
		GROUP BY time
		ORDER BY time
	`, bucketSize)

	rows, err = db.conn.Query(ctx, queryLatency, startTime)
	if err != nil {
		log.Printf("Error querying latency trend: %v", err)
	} else {
		for rows.Next() {
			var timeStr string
			var p50, p95, p99 float64
			if err := rows.Scan(&timeStr, &p50, &p95, &p99); err == nil {
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

	return resp, nil
}
