package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type AlertEngine struct {
	db         *DB
	clickhouse *ClickHouseDB
	config     *config.Config
	stopChan   chan struct{}
}

func NewAlertEngine(db *DB, ch *ClickHouseDB, cfg *config.Config) *AlertEngine {
	return &AlertEngine{
		db:         db,
		clickhouse: ch,
		config:     cfg,
		stopChan:   make(chan struct{}),
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

func (e *AlertEngine) evaluateRule(rule *pb.AlertRule) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Query ClickHouse for the aggregate metric
	val, err := e.clickhouse.QueryMetricAverage(ctx, rule.MetricType, int(rule.WindowSec))
	if err != nil {
		log.Printf("AlertEngine: Failed to query metric for rule %s: %v", rule.Name, err)
		return
	}

	// Compare
	triggered := false
	threshold := float64(rule.Threshold)
	if rule.Comparison == "gt" && val > threshold {
		triggered = true
	} else if rule.Comparison == "lt" && val < threshold {
		triggered = true
	}

	if triggered {
		log.Printf("ALERT TRIGGERED: Rule [%s] Metric [%s] Value [%.2f] Threshold [%s %.2f]",
			rule.Name, rule.MetricType, val, rule.Comparison, rule.Threshold)

		e.sendNotifications(rule, val)
	}
}

func (e *AlertEngine) sendNotifications(rule *pb.AlertRule, value float64) {
	if rule.Recipients == "" {
		return
	}

	emails := strings.Split(rule.Recipients, ",")
	subject := fmt.Sprintf("[ALERT] %s triggered", rule.Name)
	body := fmt.Sprintf("Alert Rule '%s' has been triggered.\n\nMetric: %s\nCurrent Value: %.2f\nThreshold: %s %.2f\nTime: %s",
		rule.Name, rule.MetricType, value, rule.Comparison, rule.Threshold, time.Now().Format(time.RFC1123))

	for _, email := range emails {
		email = strings.TrimSpace(email)
		if email == "" {
			continue
		}

		if strings.Contains(email, "@") {
			// Send Email
			err := SendReportEmail(e.config, []string{email}, subject, body, nil, "")
			if err != nil {
				log.Printf("AlertEngine: Failed to send alert email to %s: %v", email, err)
			}
		} else {
			// Todo: Handle Webhooks
			log.Printf("AlertEngine: Notification to %s (webhook not yet implemented)", email)
		}
	}
}
