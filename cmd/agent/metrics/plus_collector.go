package metrics

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// PlusCollector collects metrics from NGINX Plus API
type PlusCollector struct {
	apiURL string
	client *http.Client
}

func NewPlusCollector(baseURL string) *PlusCollector {
	return &PlusCollector{
		apiURL: baseURL,
		client: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// PlusMetrics is a partial mapping of the NGINX Plus API response
type PlusMetrics struct {
	Nginx struct {
		Version string `json:"version"`
	} `json:"nginx"`
	Connections struct {
		Accepted int64 `json:"accepted"`
		Dropped  int64 `json:"dropped"`
		Active   int64 `json:"active"`
		Idle     int64 `json:"idle"`
	} `json:"connections"`
	Http struct {
		Requests struct {
			Total   int64 `json:"total"`
			Current int64 `json:"current"`
		} `json:"requests"`
	} `json:"http"`
}

func (c *PlusCollector) Collect() (*pb.NginxMetrics, error) {
	// NGINX Plus usually has multiple endpoints. For simplicity, we assume a single JSON bundle
	// or we scrape key endpoints. Commercial NIM scrapes /api/N/...

	// Try to get the root API versions
	resp, err := c.client.Get(c.apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("plus api returned %s", resp.Status)
	}

	// For a real implementation, we would negotiate the version.
	// For this parity feature, we'll try to fetch the common segments.

	metrics := &pb.NginxMetrics{
		HttpStatus: &pb.HttpStatusMetrics{},
	}

	// 1. Connections
	if conn, err := c.fetchSegment("/connections"); err == nil {
		var data struct {
			Accepted int64 `json:"accepted"`
			Active   int64 `json:"active"`
			Idle     int64 `json:"idle"`
		}
		if json.Unmarshal(conn, &data) == nil {
			metrics.ActiveConnections = data.Active
			metrics.AcceptedConnections = data.Accepted
			metrics.Waiting = data.Idle // approximate
		}
	}

	// 2. HTTP Requests
	if reqs, err := c.fetchSegment("/http/requests"); err == nil {
		var data struct {
			Total   int64 `json:"total"`
			Current int64 `json:"current"`
		}
		if json.Unmarshal(reqs, &data) == nil {
			metrics.TotalRequests = data.Total
			metrics.Reading = data.Current // approximate
		}
	}

	return metrics, nil
}

func (c *PlusCollector) fetchSegment(path string) ([]byte, error) {
	// Try latest version 9, then fallback
	url := fmt.Sprintf("%s/9%s", c.apiURL, path)
	resp, err := c.client.Get(url)
	if err != nil || resp.StatusCode != http.StatusOK {
		// Fallback to older version 6
		url = fmt.Sprintf("%s/6%s", c.apiURL, path)
		resp, err = c.client.Get(url)
	}

	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch %s: %s", path, resp.Status)
	}

	return io.ReadAll(resp.Body)
}
