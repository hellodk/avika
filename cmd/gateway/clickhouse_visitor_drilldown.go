package main

import (
	"context"
	"fmt"
	"log"
)

// VisitorDrillDownResponse is the unified response for visitor drill-downs.
type VisitorDrillDownResponse struct {
	Level    int                     `json:"level"`
	Category string                  `json:"category"` // "devices", "browsers", "os"
	Groups   []VisitorGroupStat      `json:"groups,omitempty"`   // Level 1: top-level groups
	Details  []VisitorDetailStat     `json:"details,omitempty"`  // Level 2: breakdown within group
	URLs     []VisitorURLStat        `json:"urls,omitempty"`     // Level 3: URLs for a specific detail
}

type VisitorGroupStat struct {
	Name       string  `json:"name"`
	Count      int64   `json:"count"`
	Visitors   int64   `json:"visitors"`
	Percentage float64 `json:"percentage"`
}

type VisitorDetailStat struct {
	Name       string  `json:"name"`
	Version    string  `json:"version,omitempty"`
	Count      int64   `json:"count"`
	Visitors   int64   `json:"visitors"`
	Percentage float64 `json:"percentage"`
	AvgLatency float64 `json:"avg_latency_ms"`
}

type VisitorURLStat struct {
	URI        string  `json:"uri"`
	Count      int64   `json:"count"`
	AvgLatency float64 `json:"avg_latency_ms"`
	Bandwidth  int64   `json:"bandwidth"`
}

// GetVisitorDrillDown returns drill-down data for devices, browsers, or OS.
//
// Levels:
//   - L1 (no group): Top-level breakdown (e.g., all device types, all browser families)
//   - L2 (group set): Versions/models within a group (e.g., Chrome → 125, 124, 123)
//   - L3 (group + version): Top URLs accessed by that browser/device/OS version
func (db *ClickHouseDB) GetVisitorDrillDown(ctx context.Context, window, category, group, version string) (*VisitorDrillDownResponse, error) {
	startTime := resolveStartTime(window)
	where := "WHERE timestamp >= ? AND status > 0"
	args := []interface{}{startTime}

	var colFamily, colVersion string
	switch category {
	case "devices":
		colFamily = "device_type"
		colVersion = "device_type" // devices don't have versions, but we can drill by OS
	case "browsers":
		colFamily = "browser_family"
		colVersion = "browser_version"
	case "os":
		colFamily = "os_family"
		colVersion = "os_version"
	default:
		return nil, fmt.Errorf("unknown category: %s (expected: devices, browsers, os)", category)
	}

	if version != "" && group != "" {
		return db.visitorLevel3(ctx, where, args, colFamily, colVersion, group, version, category)
	}
	if group != "" {
		return db.visitorLevel2(ctx, where, args, colFamily, colVersion, group, category)
	}
	return db.visitorLevel1(ctx, where, args, colFamily, category)
}

// Level 1: Top-level groups (e.g., all device types or browser families)
func (db *ClickHouseDB) visitorLevel1(ctx context.Context, where string, args []interface{}, col, category string) (*VisitorDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT %s, count() AS cnt, uniq(cityHash64(remote_addr, user_agent)) AS visitors
		FROM nginx_analytics.access_logs
		%s AND %s != '' AND %s != 'Unknown'
		GROUP BY %s ORDER BY cnt DESC LIMIT 20
	`, col, where, col, col, col)

	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("visitor L1 query failed: %w", err)
	}
	defer rows.Close()

	var total int64
	var groups []VisitorGroupStat
	for rows.Next() {
		var g VisitorGroupStat
		var cnt, vis uint64
		if err := rows.Scan(&g.Name, &cnt, &vis); err != nil {
			log.Printf("Visitor drilldown L1 scan error: %v", err)
			continue
		}
		g.Count = int64(cnt)
		g.Visitors = int64(vis)
		total += g.Count
		groups = append(groups, g)
	}
	for i := range groups {
		if total > 0 {
			groups[i].Percentage = float64(groups[i].Count) / float64(total) * 100
		}
	}
	return &VisitorDrillDownResponse{Level: 1, Category: category, Groups: groups}, nil
}

// Level 2: Versions within a group (e.g., Chrome → 125.0, 124.0)
func (db *ClickHouseDB) visitorLevel2(ctx context.Context, where string, args []interface{}, colFamily, colVersion, group, category string) (*VisitorDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT %s, count() AS cnt, uniq(cityHash64(remote_addr, user_agent)) AS visitors,
		       avg(request_time) * 1000 AS avg_latency
		FROM nginx_analytics.access_logs
		%s AND %s = ?
		GROUP BY %s ORDER BY cnt DESC LIMIT 20
	`, colVersion, where, colFamily, colVersion)

	queryArgs := append(args, group)
	rows, err := db.conn.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("visitor L2 query failed: %w", err)
	}
	defer rows.Close()

	var total int64
	var details []VisitorDetailStat
	for rows.Next() {
		var d VisitorDetailStat
		var cnt, vis uint64
		if err := rows.Scan(&d.Version, &cnt, &vis, &d.AvgLatency); err != nil {
			log.Printf("Visitor drilldown L2 scan error: %v", err)
			continue
		}
		d.Name = group
		d.Count = int64(cnt)
		d.Visitors = int64(vis)
		total += d.Count
		details = append(details, d)
	}
	for i := range details {
		if total > 0 {
			details[i].Percentage = float64(details[i].Count) / float64(total) * 100
		}
	}
	return &VisitorDrillDownResponse{Level: 2, Category: category, Details: details}, nil
}

// Level 3: Top URLs for a specific browser/device/OS version
func (db *ClickHouseDB) visitorLevel3(ctx context.Context, where string, args []interface{}, colFamily, colVersion, group, version, category string) (*VisitorDrillDownResponse, error) {
	query := fmt.Sprintf(`
		SELECT request_uri, count() AS cnt, avg(request_time) * 1000 AS avg_latency,
		       sum(body_bytes_sent) AS bandwidth
		FROM nginx_analytics.access_logs
		%s AND %s = ? AND %s = ?
		GROUP BY request_uri ORDER BY cnt DESC LIMIT 30
	`, where, colFamily, colVersion)

	queryArgs := append(args, group, version)
	rows, err := db.conn.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("visitor L3 query failed: %w", err)
	}
	defer rows.Close()

	var urls []VisitorURLStat
	for rows.Next() {
		var u VisitorURLStat
		var cnt, bw uint64
		if err := rows.Scan(&u.URI, &cnt, &u.AvgLatency, &bw); err != nil {
			log.Printf("Visitor drilldown L3 scan error: %v", err)
			continue
		}
		u.Count = int64(cnt)
		u.Bandwidth = int64(bw)
		urls = append(urls, u)
	}
	return &VisitorDrillDownResponse{Level: 3, Category: category, URLs: urls}, nil
}
