package main

import (
	"context"
	"fmt"
	"math"
	"time"
)

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

	whereClause := "WHERE timestamp >= ? AND timestamp <= ?"
	args := []interface{}{startTime, endTime}

	if entityType == "agent" && entityID != "" && entityID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, entityID)
	}

	if sloType == "availability" {
		query := fmt.Sprintf(`
			SELECT count(*) as total, countIf(status >= 500) as errors
			FROM nginx_analytics.access_logs %s
		`, whereClause)

		var total, errors uint64
		err := db.conn.QueryRow(ctx, query, args...).Scan(&total, &errors)
		if err != nil {
			return 0, err
		}
		if total == 0 {
			return 100.0, nil // No traffic = 100% available
		}
		return (1.0 - (float64(errors) / float64(total))) * 100.0, nil
	} else if sloType == "latency" {
		query := fmt.Sprintf(`
			SELECT quantile(0.99)(request_time) as p99
			FROM nginx_analytics.access_logs %s
		`, whereClause)

		var p99 float64
		err := db.conn.QueryRow(ctx, query, args...).Scan(&p99)
		if err != nil {
			return 0, err
		}
		if math.IsNaN(p99) {
			return 0, nil
		}
		// Convert to ms
		return p99 * 1000.0, nil
	}

	return 0, fmt.Errorf("unknown slo type: %s", sloType)
}
