package metrics

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// AdvancedCollector collects metrics from Advanced NGINX API
type AdvancedCollector struct {
	apiURL              string
	client              *http.Client
	LastDetectedVersion string
}

func NewAdvancedCollector(baseURL string) *AdvancedCollector {
	return &AdvancedCollector{
		apiURL: baseURL,
		client: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// AdvancedMetrics is a partial mapping of the Advanced NGINX API response
type AdvancedMetrics struct {
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

func (c *AdvancedCollector) Collect() (*pb.NginxMetrics, error) {
	// Advanced NGINX usually has multiple endpoints. For simplicity, we assume a single JSON bundle
	// or we scrape key endpoints. Commercial managers scrape /api/N/...

	// Try to get the root API versions
	resp, err := c.client.Get(c.apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("advanced api returned %s", resp.Status)
	}

	// Try to get version from root response
	body, _ := io.ReadAll(resp.Body)
	var rootData struct {
		Nginx struct {
			Version string `json:"version"`
		} `json:"nginx"`
	}
	if json.Unmarshal(body, &rootData) == nil && rootData.Nginx.Version != "" {
		c.LastDetectedVersion = rootData.Nginx.Version
	}

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

func (c *AdvancedCollector) fetchSegment(path string) ([]byte, error) {
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
