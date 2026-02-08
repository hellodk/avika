package metrics

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	pb "github.com/user/nginx-manager/api/proto"
)

// NginxCollector collects metrics from NGINX stub_status
type NginxCollector struct {
	stubStatusURL string
	client        *http.Client
}

func NewNginxCollector(url string) *NginxCollector {
	if url == "" {
		url = "http://127.0.0.1/nginx_status"
	}
	return &NginxCollector{
		stubStatusURL: url,
		client: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// Collect scrapes the stub_status page and returns metrics
func (c *NginxCollector) Collect() (*pb.NginxMetrics, error) {
	resp, err := c.client.Get(c.stubStatusURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch stub_status: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stub_status returned %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read body: %v", err)
	}

	return parseStubStatus(string(body))
}

// parseStubStatus parses the standard NGINX stub_status output
// Example:
// Active connections: 291
// server accepts handled requests
//
//	16630948 16630948 31070465
//
// Reading: 6 Writing: 179 Waiting: 106
func parseStubStatus(body string) (*pb.NginxMetrics, error) {
	metrics := &pb.NginxMetrics{}

	lines := strings.Split(body, "\n")
	if len(lines) < 3 {
		return nil, fmt.Errorf("invalid stub_status format")
	}

	// Line 1: Active connections
	if match := regexp.MustCompile(`Active connections:\s+(\d+)`).FindStringSubmatch(lines[0]); len(match) > 1 {
		metrics.ActiveConnections, _ = strconv.ParseInt(match[1], 10, 64)
	}

	// Line 3: accepts handled requests
	// 16630948 16630948 31070465
	fields := strings.Fields(lines[2])
	if len(fields) >= 3 {
		metrics.AcceptedConnections, _ = strconv.ParseInt(fields[0], 10, 64)
		metrics.HandledConnections, _ = strconv.ParseInt(fields[1], 10, 64)
		metrics.TotalRequests, _ = strconv.ParseInt(fields[2], 10, 64)
	}

	// Line 4: Reading: 6 Writing: 179 Waiting: 106
	if len(lines) >= 4 {
		line4 := lines[3]
		if match := regexp.MustCompile(`Reading:\s+(\d+)`).FindStringSubmatch(line4); len(match) > 1 {
			metrics.Reading, _ = strconv.ParseInt(match[1], 10, 64)
		}
		if match := regexp.MustCompile(`Writing:\s+(\d+)`).FindStringSubmatch(line4); len(match) > 1 {
			metrics.Writing, _ = strconv.ParseInt(match[1], 10, 64)
		}
		if match := regexp.MustCompile(`Waiting:\s+(\d+)`).FindStringSubmatch(line4); len(match) > 1 {
			metrics.Waiting, _ = strconv.ParseInt(match[1], 10, 64)
		}
	}

	return metrics, nil
}
