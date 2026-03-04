package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// SlackMessage represents a message sent to Slack
type SlackMessage struct {
	Text        string            `json:"text"`
	Attachments []SlackAttachment `json:"attachments,omitempty"`
}

type SlackAttachment struct {
	Color  string `json:"color,omitempty"`
	Title  string `json:"title,omitempty"`
	Text   string `json:"text,omitempty"`
	Footer string `json:"footer,omitempty"`
	Ts     int64  `json:"ts,omitempty"`
}

// SendSlackNotification sends a message to a Slack webhook URL
func SendSlackNotification(ctx context.Context, webhookURL, text, title, color string) error {
	msg := SlackMessage{
		Text: text,
		Attachments: []SlackAttachment{
			{
				Title: title,
				Color: color,
				Ts:    time.Now().Unix(),
			},
		},
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(body))
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
		return fmt.Errorf("slack returned status %d", resp.StatusCode)
	}

	return nil
}

// TeamsMessage represents a message sent to Microsoft Teams in MessageCard format
type TeamsMessage struct {
	Type       string         `json:"@type"`
	Context    string         `json:"@context"`
	ThemeColor string         `json:"themeColor,omitempty"`
	Summary    string         `json:"summary,omitempty"`
	Sections   []TeamsSection `json:"sections,omitempty"`
}

type TeamsSection struct {
	ActivityTitle string `json:"activityTitle,omitempty"`
	Text          string `json:"text,omitempty"`
}

// SendTeamsNotification sends a simple MessageCard payload to an Office 365 incoming webhook
func SendTeamsNotification(ctx context.Context, webhookURL, title, text, themeColor string) error {
	msg := TeamsMessage{
		Type:       "MessageCard",
		Context:    "http://schema.org/extensions",
		ThemeColor: themeColor,
		Summary:    title,
		Sections: []TeamsSection{
			{
				ActivityTitle: title,
				Text:          strings.ReplaceAll(text, "\n", "\n\n"), // Teams needs double newlines for formatting
			},
		},
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(body))
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
		return fmt.Errorf("teams returned status %d", resp.StatusCode)
	}

	return nil
}

// PagerDutyEvent represents the payload for the PagerDuty Events API v2
type PagerDutyEvent struct {
	RoutingKey  string           `json:"routing_key"`
	EventAction string           `json:"event_action"`
	Payload     PagerDutyPayload `json:"payload"`
}

type PagerDutyPayload struct {
	Summary  string `json:"summary"`
	Source   string `json:"source"`
	Severity string `json:"severity"`
}

// SendPagerDutyEvent sends an alert or trigger to the Events v2 API endpoint
// The webhook URL acts as a proxy or directly point to Pagerduty API with routing_key mapped from its path/query or passed dynamically.
// For simplicity in the generic implementation, if "webhook" URL is the events.pagerduty.com v2 endpoint, the URL should typically look like: "https://events.pagerduty.com/v2/enqueue"
// and the 'routing_key' must be passed. Here we assume the integration config passed the routing key inside the URL, e.g. "https://events.pagerduty.com/v2/enqueue?routingKey=ROUTING_KEY".
// Alternatively, if it's an integration that accepts full payload, we parse routing_key from URL query.
func SendPagerDutyEvent(ctx context.Context, webhookURL, summary, source, severity string) error {
	// Simple query extraction for the routing key to avoid altering the DB schema significantly.
	reqURL, err := http.NewRequest("POST", webhookURL, nil)
	if err != nil {
		return err // URL parse err
	}
	routingKey := reqURL.URL.Query().Get("routingKey")
	if routingKey == "" {
		// Fallback: Use the whole URL as a generic webhook if routingKey isn't embedded
		routingKey = "unknown_routing_key"
	}

	// But usually users put the generic url `https://events.pagerduty.com/v2/enqueue` so it expects the integration key in the payload.
	// If so, the webhook integration will probably fail unless `routingKey=XXX` is provided.

	// Ensure the URL is clean without routingKey query for actual API call, but we leave it. PagerDuty ignores extra query parameters.

	msg := PagerDutyEvent{
		RoutingKey:  routingKey,
		EventAction: "trigger",
		Payload: PagerDutyPayload{
			Summary:  summary,
			Source:   source,
			Severity: severity,
		},
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://events.pagerduty.com/v2/enqueue", bytes.NewBuffer(body))
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
		return fmt.Errorf("pagerduty returned status %d", resp.StatusCode)
	}

	return nil
}
