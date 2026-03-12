package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type AlertEngine struct {
	db         *DB
	clickhouse *ClickHouseDB
	config     *config.Config
	stopChan   chan struct{}

	// Cooldown tracking: ruleID -> last fired timestamp
	lastFired   map[string]time.Time
	lastFiredMu sync.RWMutex
}

func NewAlertEngine(db *DB, ch *ClickHouseDB, cfg *config.Config) *AlertEngine {
	return &AlertEngine{
		db:         db,
		clickhouse: ch,
		config:     cfg,
		stopChan:   make(chan struct{}),
		lastFired:  make(map[string]time.Time),
	}
}

func (e *AlertEngine) Start() {
	ticker := time.NewTicker(1 * time.Minute)
	log.Printf("Starting Alert Engine (evaluation interval: 1m)")

	go func() {
		for {
			select {
			case <-ticker.C:
				e.evaluateRules()
			case <-e.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func (e *AlertEngine) Stop() {
	close(e.stopChan)
}

func (e *AlertEngine) evaluateRules() {
	rules, err := e.db.ListAlertRules()
	if err != nil {
		log.Printf("AlertEngine: Failed to list rules: %v", err)
		return
	}

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}

		go e.evaluateRule(rule)
	}
}

// AlertCondition represents a single condition in a composite rule.
type AlertCondition struct {
	MetricType string  `json:"metric_type"`
	Threshold  float64 `json:"threshold"`
	Comparison string  `json:"comparison"` // "gt", "lt", etc.
	WindowSec  int     `json:"window_sec"`
}

// CompositeRule defines a multi-condition rule with logical operators.
type CompositeRule struct {
	Operator   string           `json:"operator"` // "AND", "OR"
	Conditions []AlertCondition `json:"conditions"`
}

func (e *AlertEngine) evaluateRule(rule *pb.AlertRule) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var val float64
	var err error

	if rule.MetricType == "config_drift" {
		// Count total drifted agents from latest drift reports
		val, err = e.queryDriftedAgentCount(ctx)
		if err != nil {
			log.Printf("AlertEngine: Failed to query drift count for rule %s: %v", rule.Name, err)
			return
		}
	} else {
		// Query ClickHouse for the aggregate metric
		val, err = e.clickhouse.QueryMetricAverage(ctx, rule.MetricType, int(rule.WindowSec))
		if err != nil {
			log.Printf("AlertEngine: Failed to query metric for rule %s: %v", rule.Name, err)
			return
		}
	}

	// Compare using the rule's comparison type
	triggered := evaluateComparison(rule.Comparison, val, float64(rule.Threshold))

	// Rate-of-change comparisons: compare current window vs previous window
	if !triggered && isRateComparison(rule.Comparison) {
		triggered, err = e.evaluateRateOfChange(ctx, rule, val)
		if err != nil {
			log.Printf("AlertEngine: Rate-of-change error for rule %s: %v", rule.Name, err)
			return
		}
	}

	// Composite Rules: evaluate multi-condition logic if present
	if rule.Conditions != "" {
		triggered, err = e.evaluateCompositeRule(ctx, rule)
		if err != nil {
			log.Printf("AlertEngine: Composite rule error for rule %s: %v", rule.Name, err)
			return
		}
	}

	if triggered {
		// Check cooldown
		cooldown := time.Duration(rule.CooldownSec) * time.Second
		if cooldown <= 0 {
			cooldown = 5 * time.Minute // default cooldown
		}
		if e.isInCooldown(rule.Id, cooldown) {
			log.Printf("AlertEngine: Rule [%s] triggered but in cooldown (last fired < %v ago)", rule.Name, cooldown)
			return
		}

		severity := rule.Severity
		if severity == "" {
			severity = "warning"
		}

		log.Printf("ALERT TRIGGERED [%s]: Rule [%s] Metric [%s] Value [%.2f] Threshold [%s %.2f]",
			strings.ToUpper(severity), rule.Name, rule.MetricType, val, rule.Comparison, rule.Threshold)

		e.recordFired(rule.Id)
		e.sendNotifications(rule, val)
	}
}

// evaluateComparison checks a simple threshold comparison.
func evaluateComparison(comparison string, val, threshold float64) bool {
	switch comparison {
	case "gt":
		return val > threshold
	case "lt":
		return val < threshold
	case "eq":
		return val == threshold
	case "gte":
		return val >= threshold
	case "lte":
		return val <= threshold
	default:
		return false
	}
}

// isRateComparison returns true if the comparison is a rate-of-change type.
func isRateComparison(comparison string) bool {
	return comparison == "rate_increase" || comparison == "rate_decrease"
}

// evaluateRateOfChange compares the current window average with the previous window
// and checks if the percentage change exceeds the threshold.
func (e *AlertEngine) evaluateRateOfChange(ctx context.Context, rule *pb.AlertRule, currentVal float64) (bool, error) {
	window := int(rule.WindowSec)
	if window <= 0 {
		window = 300
	}

	// Query the previous window (shifted by window duration)
	prevVal, err := e.clickhouse.QueryMetricAverageOffset(ctx, rule.MetricType, window, window)
	if err != nil {
		return false, fmt.Errorf("failed to query previous window: %w", err)
	}

	if prevVal == 0 {
		return false, nil // Cannot compute rate with zero base
	}

	// Calculate percentage change
	pctChange := ((currentVal - prevVal) / prevVal) * 100
	threshold := float64(rule.Threshold)

	switch rule.Comparison {
	case "rate_increase":
		return pctChange >= threshold, nil
	case "rate_decrease":
		return pctChange <= -threshold, nil
	default:
		return false, nil
	}
}
// evaluateCompositeRule parses and evaluates a multi-condition rule.
func (e *AlertEngine) evaluateCompositeRule(ctx context.Context, rule *pb.AlertRule) (bool, error) {
	var comp CompositeRule
	if err := json.Unmarshal([]byte(rule.Conditions), &comp); err != nil {
		return false, fmt.Errorf("invalid composite rule JSON: %w", err)
	}

	if len(comp.Conditions) == 0 {
		return false, nil
	}

	results := make([]bool, len(comp.Conditions))
	for i, cond := range comp.Conditions {
		// Query value for this condition
		var val float64
		var err error
		if cond.MetricType == "config_drift" {
			val, err = e.queryDriftedAgentCount(ctx)
		} else {
			window := cond.WindowSec
			if window <= 0 {
				window = int(rule.WindowSec)
			}
			val, err = e.clickhouse.QueryMetricAverage(ctx, cond.MetricType, window)
		}

		if err != nil {
			return false, fmt.Errorf("failed to query metric %s for condition %d: %w", cond.MetricType, i, err)
		}

		results[i] = evaluateComparison(cond.Comparison, val, cond.Threshold)
	}

	// Apply logical operator
	if strings.ToUpper(comp.Operator) == "OR" {
		for _, r := range results {
			if r {
				return true, nil
			}
		}
		return false, nil
	}

	// Default AND
	for _, r := range results {
		if !r {
			return false, nil
		}
	}
	return true, nil
}

// isInCooldown checks if a rule has fired recently within the cooldown period.
func (e *AlertEngine) isInCooldown(ruleID string, cooldown time.Duration) bool {
	e.lastFiredMu.RLock()
	lastTime, exists := e.lastFired[ruleID]
	e.lastFiredMu.RUnlock()

	if !exists {
		return false
	}
	return time.Since(lastTime) < cooldown
}

// recordFired records the current time as the last-fired time for a rule.
func (e *AlertEngine) recordFired(ruleID string) {
	e.lastFiredMu.Lock()
	e.lastFired[ruleID] = time.Now()
	e.lastFiredMu.Unlock()
}

// queryDriftedAgentCount counts total drifted agents from the most recent drift report per group.
func (e *AlertEngine) queryDriftedAgentCount(ctx context.Context) (float64, error) {
	query := `
		SELECT COALESCE(SUM(drifted_count), 0)
		FROM (
			SELECT DISTINCT ON (target_id) drifted_count
			FROM drift_reports
			WHERE report_type = 'group'
			  AND expires_at > NOW()
			ORDER BY target_id, created_at DESC
		) latest
	`

	var count float64
	err := e.db.conn.QueryRowContext(ctx, query).Scan(&count)
	if err != nil && err != sql.ErrNoRows {
		return 0, fmt.Errorf("failed to query drift count: %w", err)
	}
	return count, nil
}

// SeverityColor returns the notification color for a given severity level.
func SeverityColor(severity string) string {
	switch strings.ToLower(severity) {
	case "critical":
		return "#dc2626" // red
	case "warning":
		return "#f59e0b" // amber
	case "info":
		return "#3b82f6" // blue
	default:
		return "#f44336" // red fallback
	}
}

func (e *AlertEngine) sendNotifications(rule *pb.AlertRule, value float64) {
	if rule.Recipients == "" {
		return
	}

	severity := rule.Severity
	if severity == "" {
		severity = "warning"
	}
	color := SeverityColor(severity)

	emails := strings.Split(rule.Recipients, ",")
	subject := fmt.Sprintf("[%s] %s triggered", strings.ToUpper(severity), rule.Name)
	body := fmt.Sprintf("Alert Rule '%s' has been triggered.\n\nSeverity: %s\nMetric: %s\nCurrent Value: %.2f\nThreshold: %s %.2f\nTime: %s",
		rule.Name, strings.ToUpper(severity), rule.MetricType, value, rule.Comparison, rule.Threshold, time.Now().Format(time.RFC1123))

	for _, email := range emails {
		email = strings.TrimSpace(email)
		if email == "" {
			continue
		}

		if strings.HasPrefix(email, "http") {
			// Handle Webhooks
			var err error
			if strings.Contains(email, "hooks.slack.com") {
				err = SendSlackNotification(context.Background(), email, subject, body, color)
			} else if strings.Contains(email, "webhook.office.com") || strings.Contains(email, "office365.com/webhook") {
				err = SendTeamsNotification(context.Background(), email, subject, body, strings.TrimPrefix(color, "#"))
			} else if strings.Contains(email, "events.pagerduty.com") {
				pdSeverity := "warning"
				if severity == "critical" {
					pdSeverity = "critical"
				} else if severity == "info" {
					pdSeverity = "info"
				}
				err = SendPagerDutyEvent(context.Background(), email, subject, "Avika Alerts", pdSeverity)
			} else if strings.Contains(email, "api.opsgenie.com") {
				err = SendOpsGenieAlert(context.Background(), email, subject, body, severity)
			} else {
				err = e.sendGenericWebhook(context.Background(), email, subject, body)
			}

			if err != nil {
				log.Printf("AlertEngine: Failed to send webhook to %s: %v", email, err)
			} else {
				log.Printf("AlertEngine: Notification sent via webhook to %s", email)
			}
		} else if strings.Contains(email, "@") {
			// Send Email
			err := SendReportEmail(e.config, []string{email}, subject, body, nil, "")
			if err != nil {
				log.Printf("AlertEngine: Failed to send alert email to %s: %v", email, err)
			}
		} else {
			log.Printf("AlertEngine: UNKNOWN notification recipient type: %s", email)
		}
	}
}

func (e *AlertEngine) sendGenericWebhook(ctx context.Context, url, subject, body string) error {
	payload := map[string]string{
		"subject":   subject,
		"message":   body,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

