package metrics

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// VtsResponse represents the JSON structure from nginx-module-vts
type VtsResponse struct {
	NginxVersion string `json:"nginxVersion"`
	Connections  struct {
		Active   int64 `json:"active"`
		Accepted int64 `json:"accepted"`
		Handled  int64 `json:"handled"`
		Requests int64 `json:"requests"`
		Reading  int64 `json:"reading"`
		Writing  int64 `json:"writing"`
		Waiting  int64 `json:"waiting"`
	} `json:"connections"`
	ServerZones map[string]struct {
		RequestCounter int64 `json:"requestCounter"`
		Responses      struct {
			OneXx   int64 `json:"1xx"`
			TwoXx   int64 `json:"2xx"`
			ThreeXx int64 `json:"3xx"`
			FourXx  int64 `json:"4xx"`
			FiveXx  int64 `json:"5xx"`
		} `json:"responses"`
		InBytes  int64 `json:"inBytes"`
		OutBytes int64 `json:"outBytes"`
	} `json:"serverZones"`
}

type VtsCollector struct {
	vtsURL string
	client *http.Client
}

func NewVtsCollector(url string) *VtsCollector {
	return &VtsCollector{
		vtsURL: url,
		client: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

func (c *VtsCollector) Collect() (*pb.NginxMetrics, error) {
	resp, err := c.client.Get(c.vtsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vts status returned %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var vts VtsResponse
	if err := json.Unmarshal(body, &vts); err != nil {
		return nil, err
	}

	metrics := &pb.NginxMetrics{
		ActiveConnections:   vts.Connections.Active,
		AcceptedConnections: vts.Connections.Accepted,
		HandledConnections:  vts.Connections.Handled,
		TotalRequests:       vts.Connections.Requests,
		Reading:             vts.Connections.Reading,
		Writing:             vts.Connections.Writing,
		Waiting:             vts.Connections.Waiting,
		HttpStatus:          &pb.HttpStatusMetrics{},
	}

	// Aggregate HTTP statuses from all zones
	for _, zone := range vts.ServerZones {
		metrics.HttpStatus.Status_2XxCount += zone.Responses.TwoXx
		metrics.HttpStatus.Status_3XxCount += zone.Responses.ThreeXx
		metrics.HttpStatus.Status_4XxCount += zone.Responses.FourXx
		metrics.HttpStatus.Status_5XxCount += zone.Responses.FiveXx
	}

	return metrics, nil
}
