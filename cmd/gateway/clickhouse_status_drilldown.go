package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

// StatusDrillDownResponse is the unified response for all 4 levels.
// Only the relevant field is populated based on the drill-down depth.
type StatusDrillDownResponse struct {
	Level   int                   `json:"level"`
	Classes []StatusClassStat     `json:"classes,omitempty"`  // Level 1
	Codes   []DrillDownCodeStat      `json:"codes,omitempty"`    // Level 2
	URIs    []StatusURIStat       `json:"uris,omitempty"`     // Level 3
	Traces  []StatusTraceStat     `json:"traces,omitempty"`   // Level 4
}

type StatusClassStat struct {
	Class      string  `json:"class"`       // "2xx", "3xx", "4xx", "5xx"
	Count      int64   `json:"count"`
	Percentage float64 `json:"percentage"`
	TopCode    int     `json:"top_code"`    // most frequent code in class
	TopCodePct float64 `json:"top_code_pct"`
}

type DrillDownCodeStat struct {
	Code       int     `json:"code"`
	Count      int64   `json:"count"`
	Percentage float64 `json:"percentage"`
	TopURI     string  `json:"top_uri"`
	AvgLatency float64 `json:"avg_latency_ms"`
}

type StatusURIStat struct {
	URI        string  `json:"uri"`
	Count      int64   `json:"count"`
	AvgLatency float64 `json:"avg_latency_ms"`
	P95Latency float64 `json:"p95_latency_ms"`
	LastSeen   string  `json:"last_seen"`
	Bandwidth  int64   `json:"bandwidth"`
}

type StatusTraceStat struct {
	Timestamp   string  `json:"timestamp"`
	RequestID   string  `json:"request_id"`
	ClientIP    string  `json:"client_ip"`
	Country     string  `json:"country"`
	UserAgent   string  `json:"user_agent"`
	Latency     float64 `json:"latency_ms"`
	Upstream    string  `json:"upstream"`
	BodyBytes   int64   `json:"body_bytes"`
}

// GetStatusDrillDown returns data for the requested drill-down level.
func (db *ClickHouseDB) GetStatusDrillDown(ctx context.Context, window string, class string, code int, uri string, agentFilter []string, agentID string) (*StatusDrillDownResponse, error) {
	startTime := resolveStartTime(window)
	where, args := buildBaseWhere(startTime, agentFilter, agentID)

	if uri != "" && code > 0 {
		return db.statusLevel4(ctx, where, args, code, uri)
	}
	if code > 0 {
		return db.statusLevel3(ctx, where, args, code)
	}
	if class != "" {
		return db.statusLevel2(ctx, where, args, class)
	}
	return db.statusLevel1(ctx, where, args)
}

// ── Level 1: Status class overview ───────────────────────────────────────────

func (db *ClickHouseDB) statusLevel1(ctx context.Context, where string, args []interface{}) (*StatusDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT
			multiIf(status >= 200 AND status < 300, '2xx',
			        status >= 300 AND status < 400, '3xx',
			        status >= 400 AND status < 500, '4xx',
			        '5xx') AS class,
			count() AS cnt
		FROM nginx_analytics.access_logs
		%s AND status >= 200
		GROUP BY class
		ORDER BY class
	`, where)

	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("status level 1 query failed: %w", err)
	}
	defer rows.Close()

	var total int64
	var classes []StatusClassStat
	for rows.Next() {
		var s StatusClassStat
		if err := rows.Scan(&s.Class, &s.Count); err != nil {
			continue
		}
		total += s.Count
		classes = append(classes, s)
	}

	// Calculate percentages and get top code per class
	for i := range classes {
		if total > 0 {
			classes[i].Percentage = float64(classes[i].Count) / float64(total) * 100
		}
		topCode, topPct := db.getTopCodeInClass(ctx, where, args, classes[i].Class)
		classes[i].TopCode = topCode
		classes[i].TopCodePct = topPct
	}

	return &StatusDrillDownResponse{Level: 1, Classes: classes}, nil
}

func (db *ClickHouseDB) getTopCodeInClass(ctx context.Context, where string, args []interface{}, class string) (int, float64) {
	low, high := classRange(class)
	query := fmt.Sprintf(`
		SELECT status, count() AS cnt
		FROM nginx_analytics.access_logs
		%s AND status >= %d AND status < %d
		GROUP BY status
		ORDER BY cnt DESC
		LIMIT 1
	`, where, low, high)

	var code uint16
	var cnt uint64
	if err := db.conn.QueryRow(ctx, query, args...).Scan(&code, &cnt); err != nil {
		return 0, 0
	}

	// Get total for class
	totalQuery := fmt.Sprintf(`
		SELECT count() FROM nginx_analytics.access_logs
		%s AND status >= %d AND status < %d
	`, where, low, high)
	var total uint64
	db.conn.QueryRow(ctx, totalQuery, args...).Scan(&total)

	pct := 0.0
	if total > 0 {
		pct = float64(cnt) / float64(total) * 100
	}
	return int(code), pct
}

// ── Level 2: Individual codes within class ───────────────────────────────────

func (db *ClickHouseDB) statusLevel2(ctx context.Context, where string, args []interface{}, class string) (*StatusDrillDownResponse, error) {
	low, high := classRange(class)
	query := fmt.Sprintf(`
		SELECT
			status,
			count() AS cnt,
			avg(request_time) * 1000 AS avg_latency
		FROM nginx_analytics.access_logs
		%s AND status >= %d AND status < %d
		GROUP BY status
		ORDER BY cnt DESC
	`, where, low, high)

	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("status level 2 query failed: %w", err)
	}
	defer rows.Close()

	var total int64
	var codes []DrillDownCodeStat
	for rows.Next() {
		var s DrillDownCodeStat
		var code uint16
		if err := rows.Scan(&code, &s.Count, &s.AvgLatency); err != nil {
			continue
		}
		s.Code = int(code)
		total += s.Count
		codes = append(codes, s)
	}

	// Percentages and top URI per code
	for i := range codes {
		if total > 0 {
			codes[i].Percentage = float64(codes[i].Count) / float64(total) * 100
		}
		codes[i].TopURI = db.getTopURIForCode(ctx, where, args, codes[i].Code)
	}

	return &StatusDrillDownResponse{Level: 2, Codes: codes}, nil
}

func (db *ClickHouseDB) getTopURIForCode(ctx context.Context, where string, args []interface{}, code int) string {
	query := fmt.Sprintf(`
		SELECT request_uri FROM nginx_analytics.access_logs
		%s AND status = %d
		GROUP BY request_uri
		ORDER BY count() DESC
		LIMIT 1
	`, where, code)
	var uri string
	db.conn.QueryRow(ctx, query, args...).Scan(&uri)
	return uri
}

// ── Level 3: URLs returning a specific code ──────────────────────────────────

func (db *ClickHouseDB) statusLevel3(ctx context.Context, where string, args []interface{}, code int) (*StatusDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT
			request_uri,
			count() AS cnt,
			avg(request_time) * 1000 AS avg_latency,
			quantile(0.95)(request_time) * 1000 AS p95_latency,
			formatDateTime(max(toDateTime(timestamp)), '%%Y-%%m-%%d %%H:%%i:%%S') AS last_seen,
			sum(body_bytes_sent) AS bandwidth
		FROM nginx_analytics.access_logs
		%s AND status = %d
		GROUP BY request_uri
		ORDER BY cnt DESC
		LIMIT 50
	`, where, code)

	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("status level 3 query failed: %w", err)
	}
	defer rows.Close()

	var uris []StatusURIStat
	for rows.Next() {
		var s StatusURIStat
		if err := rows.Scan(&s.URI, &s.Count, &s.AvgLatency, &s.P95Latency, &s.LastSeen, &s.Bandwidth); err != nil {
			log.Printf("Status drilldown L3 scan error: %v", err)
			continue
		}
		uris = append(uris, s)
	}

	return &StatusDrillDownResponse{Level: 3, URIs: uris}, nil
}

// ── Level 4: Individual requests for a URL + code ────────────────────────────

func (db *ClickHouseDB) statusLevel4(ctx context.Context, where string, args []interface{}, code int, uri string) (*StatusDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT
			formatDateTime(toDateTime(timestamp), '%%Y-%%m-%%d %%H:%%i:%%S') AS ts,
			request_id,
			client_ip,
			country,
			user_agent,
			request_time * 1000 AS latency,
			upstream_addr,
			body_bytes_sent
		FROM nginx_analytics.access_logs
		%s AND status = %d AND request_uri = ?
		ORDER BY timestamp DESC
		LIMIT 50
	`, where, code)

	args = append(args, uri)
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("status level 4 query failed: %w", err)
	}
	defer rows.Close()

	var traces []StatusTraceStat
	for rows.Next() {
		var t StatusTraceStat
		if err := rows.Scan(&t.Timestamp, &t.RequestID, &t.ClientIP, &t.Country, &t.UserAgent, &t.Latency, &t.Upstream, &t.BodyBytes); err != nil {
			log.Printf("Status drilldown L4 scan error: %v", err)
			continue
		}
		traces = append(traces, t)
	}

	return &StatusDrillDownResponse{Level: 4, Traces: traces}, nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func classRange(class string) (int, int) {
	switch class {
	case "2xx":
		return 200, 300
	case "3xx":
		return 300, 400
	case "4xx":
		return 400, 500
	case "5xx":
		return 500, 600
	default:
		return 200, 600
	}
}

func resolveStartTime(window string) time.Time {
	d := 24 * time.Hour
	switch window {
	case "5m":
		d = 5 * time.Minute
	case "15m":
		d = 15 * time.Minute
	case "30m":
		d = 30 * time.Minute
	case "1h":
		d = time.Hour
	case "3h":
		d = 3 * time.Hour
	case "6h":
		d = 6 * time.Hour
	case "12h":
		d = 12 * time.Hour
	case "24h":
		d = 24 * time.Hour
	case "7d":
		d = 7 * 24 * time.Hour
	case "30d":
		d = 30 * 24 * time.Hour
	}
	return time.Now().UTC().Add(-d)
}

func buildBaseWhere(startTime time.Time, agentFilter []string, agentID string) (string, []interface{}) {
	where := "WHERE timestamp >= ? AND status > 0"
	args := []interface{}{startTime}

	if len(agentFilter) > 0 {
		placeholders := make([]string, len(agentFilter))
		for i, id := range agentFilter {
			placeholders[i] = "?"
			args = append(args, id)
		}
		where += fmt.Sprintf(" AND instance_id IN (%s)", strings.Join(placeholders, ","))
	} else if agentID != "" && agentID != "all" {
		where += " AND instance_id = ?"
		args = append(args, agentID)
	}

	return where, args
}
