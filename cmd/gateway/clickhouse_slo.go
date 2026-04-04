package main

import (
	"context"
	"fmt"
	"math"
	"time"
)

func accessLogWhere(entityType, entityID string, startTime, endTime time.Time) (whereClause string, args []interface{}) {
	whereClause = "WHERE timestamp >= ? AND timestamp <= ?"
	args = []interface{}{startTime, endTime}
	if entityType == "agent" && entityID != "" && entityID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, entityID)
	}
	return whereClause, args
}

// GetSLI calculates the Service Level Indicator for a given entity, type, and window
func (db *ClickHouseDB) GetSLI(ctx context.Context, entityType, entityID, sloType, window string) (float64, error) {
	var duration time.Duration
	switch window {
	case "7d":
		duration = 7 * 24 * time.Hour
	case "30d":
		duration = 30 * 24 * time.Hour
	default:
		duration = 30 * 24 * time.Hour
	}

	endTime := time.Now().UTC()
	startTime := endTime.Add(-duration)
	whereClause, args := accessLogWhere(entityType, entityID, startTime, endTime)

	switch sloType {
	case "availability":
		query := fmt.Sprintf(`
			SELECT count(*) AS total, countIf(status >= 500) AS errors
			FROM nginx_analytics.access_logs %s
		`, whereClause)

		var total, errors uint64
		if err := db.conn.QueryRow(ctx, query, args...).Scan(&total, &errors); err != nil {
			return 0, err
		}
		if total == 0 {
			return 100.0, nil
		}
		return (1.0 - (float64(errors) / float64(total))) * 100.0, nil

	case "success_rate":
		query := fmt.Sprintf(`
			SELECT count(*) AS total, countIf(status >= 200 AND status < 300) AS ok
			FROM nginx_analytics.access_logs %s
		`, whereClause)

		var total, ok uint64
		if err := db.conn.QueryRow(ctx, query, args...).Scan(&total, &ok); err != nil {
			return 0, err
		}
		if total == 0 {
			return 100.0, nil
		}
		return (float64(ok) / float64(total)) * 100.0, nil

	case "availability_no_4xx":
		query := fmt.Sprintf(`
			SELECT count(*) AS total, countIf(status < 400) AS ok
			FROM nginx_analytics.access_logs %s
		`, whereClause)

		var total, ok uint64
		if err := db.conn.QueryRow(ctx, query, args...).Scan(&total, &ok); err != nil {
			return 0, err
		}
		if total == 0 {
			return 100.0, nil
		}
		return (float64(ok) / float64(total)) * 100.0, nil

	case "latency":
		return db.getLatencyQuantileMS(ctx, whereClause, args, 0.99)
	case "latency_p95":
		return db.getLatencyQuantileMS(ctx, whereClause, args, 0.95)
	case "latency_p50":
		return db.getLatencyQuantileMS(ctx, whereClause, args, 0.50)
	default:
		return 0, fmt.Errorf("unknown slo type: %s", sloType)
	}
}

func (db *ClickHouseDB) getLatencyQuantileMS(ctx context.Context, whereClause string, args []interface{}, q float64) (float64, error) {
	query := fmt.Sprintf(`
		SELECT quantile(%g)(request_time) AS pq
		FROM nginx_analytics.access_logs %s
	`, q, whereClause)

	var pq float64
	if err := db.conn.QueryRow(ctx, query, args...).Scan(&pq); err != nil {
		return 0, err
	}
	if math.IsNaN(pq) {
		return 0, nil
	}
	return pq * 1000.0, nil
}
