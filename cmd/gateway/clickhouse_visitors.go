package main

import (
	"context"
	"log"
	"time"
)

// VisitorStats contains aggregated visitor statistics
type VisitorStats struct {
	UniqueVisitors uint64  `json:"unique_visitors"`
	TotalHits      uint64  `json:"total_hits"`
	TotalBandwidth uint64  `json:"total_bandwidth"`
	BotTraffic     float64 `json:"bot_traffic_percent"`
	HumanTraffic   float64 `json:"human_traffic_percent"`
	BotHits        uint64  `json:"bot_hits"`
	HumanHits      uint64  `json:"human_hits"`
}

// BrowserStat represents browser usage statistics
type BrowserStat struct {
	Browser    string  `json:"browser"`
	Version    string  `json:"version"`
	Hits       uint64  `json:"hits"`
	Visitors   uint64  `json:"visitors"`
	Percentage float64 `json:"percentage"`
}

// OSStat represents operating system usage statistics
type OSStat struct {
	OS         string  `json:"os"`
	Version    string  `json:"version"`
	Hits       uint64  `json:"hits"`
	Visitors   uint64  `json:"visitors"`
	Percentage float64 `json:"percentage"`
}

// ReferrerStat represents referrer domain statistics
type ReferrerStat struct {
	Domain     string  `json:"domain"`
	Hits       uint64  `json:"hits"`
	Visitors   uint64  `json:"visitors"`
	Percentage float64 `json:"percentage"`
}

// NotFoundStat represents 404 error statistics
type NotFoundStat struct {
	URI      string `json:"uri"`
	Hits     uint64 `json:"hits"`
	LastSeen int64  `json:"last_seen"`
}

// HourlyDistribution represents traffic distribution by hour
type HourlyDistribution struct {
	Hour      int    `json:"hour"`
	Hits      uint64 `json:"hits"`
	Visitors  uint64 `json:"visitors"`
	Bandwidth uint64 `json:"bandwidth"`
}

// DeviceStats represents device type distribution
type DeviceStats struct {
	DeviceType string  `json:"device_type"`
	Hits       uint64  `json:"hits"`
	Visitors   uint64  `json:"visitors"`
	Percentage float64 `json:"percentage"`
}

// StaticFileStat represents static file statistics
type StaticFileStat struct {
	URI       string `json:"uri"`
	Hits      uint64 `json:"hits"`
	Bandwidth uint64 `json:"bandwidth"`
}

// VisitorAnalyticsResponse contains the full visitor analytics data
type VisitorAnalyticsResponse struct {
	Summary        VisitorStats         `json:"summary"`
	Browsers       []BrowserStat        `json:"browsers"`
	OperatingSystems []OSStat           `json:"operating_systems"`
	Referrers      []ReferrerStat       `json:"referrers"`
	NotFound       []NotFoundStat       `json:"not_found"`
	HourlyStats    []HourlyDistribution `json:"hourly_stats"`
	DeviceTypes    []DeviceStats        `json:"device_types"`
	StaticFiles    []StaticFileStat     `json:"static_files"`
}

// GetVisitorAnalytics returns comprehensive visitor analytics
func (db *ClickHouseDB) GetVisitorAnalytics(ctx context.Context, timeWindow string, agentID string) (*VisitorAnalyticsResponse, error) {
	startTime := getStartTime(timeWindow)
	
	resp := &VisitorAnalyticsResponse{}
	
	// Get summary stats
	summary, err := db.getVisitorSummary(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: summary failed: %v", err)
	} else {
		resp.Summary = *summary
	}
	
	// Get browser stats
	browsers, err := db.getBrowserStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: browsers failed: %v", err)
	} else {
		resp.Browsers = browsers
	}
	
	// Get OS stats
	osStats, err := db.getOSStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: os failed: %v", err)
	} else {
		resp.OperatingSystems = osStats
	}
	
	// Get referrer stats
	referrers, err := db.getReferrerStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: referrers failed: %v", err)
	} else {
		resp.Referrers = referrers
	}
	
	// Get 404 stats
	notFound, err := db.getNotFoundStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: notfound failed: %v", err)
	} else {
		resp.NotFound = notFound
	}
	
	// Get hourly distribution
	hourly, err := db.getHourlyDistribution(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: hourly failed: %v", err)
	} else {
		resp.HourlyStats = hourly
	}
	
	// Get device type stats
	devices, err := db.getDeviceStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: devices failed: %v", err)
	} else {
		resp.DeviceTypes = devices
	}
	
	// Get static file stats
	staticFiles, err := db.getStaticFileStats(ctx, startTime, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics: static files failed: %v", err)
	} else {
		resp.StaticFiles = staticFiles
	}
	
	return resp, nil
}

func (db *ClickHouseDB) getVisitorSummary(ctx context.Context, startTime time.Time, agentID string) (*VisitorStats, error) {
	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		uniq(cityHash64(remote_addr, user_agent)) as unique_visitors,
		count(*) as total_hits,
		sum(body_bytes_sent) as total_bandwidth,
		countIf(is_bot = 1) as bot_hits,
		countIf(is_bot = 0) as human_hits
	FROM nginx_analytics.access_logs ` + whereClause
	
	var stats VisitorStats
	row := db.conn.QueryRow(ctx, query, args...)
	if err := row.Scan(&stats.UniqueVisitors, &stats.TotalHits, &stats.TotalBandwidth, 
		&stats.BotHits, &stats.HumanHits); err != nil {
		return nil, err
	}
	
	if stats.TotalHits > 0 {
		stats.BotTraffic = float64(stats.BotHits) / float64(stats.TotalHits) * 100
		stats.HumanTraffic = float64(stats.HumanHits) / float64(stats.TotalHits) * 100
	}
	
	return &stats, nil
}

func (db *ClickHouseDB) getBrowserStats(ctx context.Context, startTime time.Time, agentID string) ([]BrowserStat, error) {
	whereClause := "WHERE timestamp >= ? AND browser_family != '' AND browser_family != 'Unknown'"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		browser_family,
		browser_version,
		count(*) as hits,
		uniq(cityHash64(remote_addr, user_agent)) as visitors
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY browser_family, browser_version
	ORDER BY hits DESC
	LIMIT 20`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []BrowserStat
	var totalHits uint64
	
	for rows.Next() {
		var s BrowserStat
		if err := rows.Scan(&s.Browser, &s.Version, &s.Hits, &s.Visitors); err != nil {
			continue
		}
		totalHits += s.Hits
		stats = append(stats, s)
	}
	
	// Calculate percentages
	for i := range stats {
		if totalHits > 0 {
			stats[i].Percentage = float64(stats[i].Hits) / float64(totalHits) * 100
		}
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getOSStats(ctx context.Context, startTime time.Time, agentID string) ([]OSStat, error) {
	whereClause := "WHERE timestamp >= ? AND os_family != '' AND os_family != 'Unknown'"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		os_family,
		os_version,
		count(*) as hits,
		uniq(cityHash64(remote_addr, user_agent)) as visitors
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY os_family, os_version
	ORDER BY hits DESC
	LIMIT 20`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []OSStat
	var totalHits uint64
	
	for rows.Next() {
		var s OSStat
		if err := rows.Scan(&s.OS, &s.Version, &s.Hits, &s.Visitors); err != nil {
			continue
		}
		totalHits += s.Hits
		stats = append(stats, s)
	}
	
	// Calculate percentages
	for i := range stats {
		if totalHits > 0 {
			stats[i].Percentage = float64(stats[i].Hits) / float64(totalHits) * 100
		}
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getReferrerStats(ctx context.Context, startTime time.Time, agentID string) ([]ReferrerStat, error) {
	whereClause := "WHERE timestamp >= ? AND referer != ''"
	args := []interface{}{startTime}

	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	query := `SELECT 
		referer AS domain,
		count(*) as hits,
		uniq(cityHash64(remote_addr, user_agent)) as visitors
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY referer
	ORDER BY hits DESC
	LIMIT 20`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []ReferrerStat
	var totalHits uint64
	
	for rows.Next() {
		var s ReferrerStat
		if err := rows.Scan(&s.Domain, &s.Hits, &s.Visitors); err != nil {
			continue
		}
		totalHits += s.Hits
		stats = append(stats, s)
	}
	
	// Calculate percentages
	for i := range stats {
		if totalHits > 0 {
			stats[i].Percentage = float64(stats[i].Hits) / float64(totalHits) * 100
		}
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getNotFoundStats(ctx context.Context, startTime time.Time, agentID string) ([]NotFoundStat, error) {
	whereClause := "WHERE timestamp >= ? AND status = 404"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		request_uri,
		count(*) as hits,
		max(toUnixTimestamp(timestamp)) as last_seen
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY request_uri
	ORDER BY hits DESC
	LIMIT 50`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []NotFoundStat
	for rows.Next() {
		var s NotFoundStat
		if err := rows.Scan(&s.URI, &s.Hits, &s.LastSeen); err != nil {
			continue
		}
		stats = append(stats, s)
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getHourlyDistribution(ctx context.Context, startTime time.Time, agentID string) ([]HourlyDistribution, error) {
	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		toHour(timestamp) as hour,
		count(*) as hits,
		uniq(cityHash64(remote_addr, user_agent)) as visitors,
		sum(body_bytes_sent) as bandwidth
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY hour
	ORDER BY hour`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	// Initialize all 24 hours with zero values
	hourlyMap := make(map[int]*HourlyDistribution)
	for h := 0; h < 24; h++ {
		hourlyMap[h] = &HourlyDistribution{Hour: h}
	}
	
	for rows.Next() {
		var hour int
		var hits, visitors, bandwidth uint64
		if err := rows.Scan(&hour, &hits, &visitors, &bandwidth); err != nil {
			continue
		}
		if hd, ok := hourlyMap[hour]; ok {
			hd.Hits = hits
			hd.Visitors = visitors
			hd.Bandwidth = bandwidth
		}
	}
	
	// Convert map to sorted slice
	var stats []HourlyDistribution
	for h := 0; h < 24; h++ {
		stats = append(stats, *hourlyMap[h])
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getDeviceStats(ctx context.Context, startTime time.Time, agentID string) ([]DeviceStats, error) {
	whereClause := "WHERE timestamp >= ? AND device_type != ''"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		device_type,
		count(*) as hits,
		uniq(cityHash64(remote_addr, user_agent)) as visitors
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY device_type
	ORDER BY hits DESC`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []DeviceStats
	var totalHits uint64
	
	for rows.Next() {
		var s DeviceStats
		if err := rows.Scan(&s.DeviceType, &s.Hits, &s.Visitors); err != nil {
			continue
		}
		totalHits += s.Hits
		stats = append(stats, s)
	}
	
	// Calculate percentages
	for i := range stats {
		if totalHits > 0 {
			stats[i].Percentage = float64(stats[i].Hits) / float64(totalHits) * 100
		}
	}
	
	return stats, nil
}

func (db *ClickHouseDB) getStaticFileStats(ctx context.Context, startTime time.Time, agentID string) ([]StaticFileStat, error) {
	whereClause := `WHERE timestamp >= ? AND (
		request_uri LIKE '%.js' OR request_uri LIKE '%.css' OR 
		request_uri LIKE '%.png' OR request_uri LIKE '%.jpg' OR 
		request_uri LIKE '%.jpeg' OR request_uri LIKE '%.gif' OR 
		request_uri LIKE '%.svg' OR request_uri LIKE '%.ico' OR
		request_uri LIKE '%.woff%' OR request_uri LIKE '%.ttf' OR
		request_uri LIKE '%.pdf' OR request_uri LIKE '%.json'
	)`
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		request_uri,
		count(*) as hits,
		sum(body_bytes_sent) as bandwidth
	FROM nginx_analytics.access_logs 
	` + whereClause + `
	GROUP BY request_uri
	ORDER BY hits DESC
	LIMIT 50`
	
	rows, err := db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var stats []StaticFileStat
	for rows.Next() {
		var s StaticFileStat
		if err := rows.Scan(&s.URI, &s.Hits, &s.Bandwidth); err != nil {
			continue
		}
		stats = append(stats, s)
	}
	
	return stats, nil
}

// GetBotTraffic returns bot vs human traffic breakdown
func (db *ClickHouseDB) GetBotTraffic(ctx context.Context, timeWindow string, agentID string) (map[string]interface{}, error) {
	startTime := getStartTime(timeWindow)
	
	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}
	
	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}
	
	query := `SELECT 
		countIf(is_bot = 1) as bot_hits,
		countIf(is_bot = 0) as human_hits,
		sumIf(body_bytes_sent, is_bot = 1) as bot_bandwidth,
		sumIf(body_bytes_sent, is_bot = 0) as human_bandwidth
	FROM nginx_analytics.access_logs ` + whereClause
	
	var botHits, humanHits, botBandwidth, humanBandwidth uint64
	row := db.conn.QueryRow(ctx, query, args...)
	if err := row.Scan(&botHits, &humanHits, &botBandwidth, &humanBandwidth); err != nil {
		return nil, err
	}
	
	totalHits := botHits + humanHits
	totalBandwidth := botBandwidth + humanBandwidth
	
	result := map[string]interface{}{
		"bot_hits":         botHits,
		"human_hits":       humanHits,
		"bot_bandwidth":    botBandwidth,
		"human_bandwidth":  humanBandwidth,
		"total_hits":       totalHits,
		"total_bandwidth":  totalBandwidth,
		"bot_percent":      0.0,
		"human_percent":    0.0,
	}
	
	if totalHits > 0 {
		result["bot_percent"] = float64(botHits) / float64(totalHits) * 100
		result["human_percent"] = float64(humanHits) / float64(totalHits) * 100
	}
	
	return result, nil
}

// Helper function to parse time window string
func getStartTime(timeWindow string) time.Time {
	now := time.Now()
	
	switch timeWindow {
	case "5m":
		return now.Add(-5 * time.Minute)
	case "15m":
		return now.Add(-15 * time.Minute)
	case "30m":
		return now.Add(-30 * time.Minute)
	case "1h":
		return now.Add(-1 * time.Hour)
	case "3h":
		return now.Add(-3 * time.Hour)
	case "6h":
		return now.Add(-6 * time.Hour)
	case "12h":
		return now.Add(-12 * time.Hour)
	case "24h":
		return now.Add(-24 * time.Hour)
	case "2d":
		return now.Add(-48 * time.Hour)
	case "7d":
		return now.Add(-7 * 24 * time.Hour)
	case "30d":
		return now.Add(-30 * 24 * time.Hour)
	default:
		return now.Add(-24 * time.Hour)
	}
}
