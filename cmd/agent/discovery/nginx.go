package discovery

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"github.com/shirou/gopsutil/v3/process"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type Discoverer struct{}

func NewDiscoverer() *Discoverer {
	return &Discoverer{}
}

// Scan finds all running NGINX processes
func (d *Discoverer) Scan(ctx context.Context) ([]*pb.NginxInstance, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, fmt.Errorf("failed to list processes: %w", err)
	}

	var instances []*pb.NginxInstance
	seenPids := make(map[int32]bool)

	for _, p := range procs {
		name, err := p.Name()
		if err != nil {
			continue
		}

		if strings.Contains(strings.ToLower(name), "nginx") {
			// Get Detailed info
			pid := p.Pid
			if seenPids[pid] {
				continue
			}
			seenPids[pid] = true

			cmdline, _ := p.Cmdline()

			// Simple heuristic: If it has kids or specific cmdline flags, might be master.
			// Ideally we group workers under master. For MVP, just list all.

			// Attempt to find version from binary
			version := "unknown"
			exe, err := p.Exe()
			if err == nil {
				version = getNginxVersion(exe)
			} else {
				// Fallback: try "nginx" in PATH
				v := getNginxVersion("nginx")
				if v != "unknown" {
					version = v
				}
			}

			instances = append(instances, &pb.NginxInstance{
				Pid:      fmt.Sprintf("%d", pid),
				Version:  version,
				ConfPath: parseConfPath(cmdline),
				Status:   "RUNNING",
			})
		}
	}
	return instances, nil
}

func getNginxVersion(exePath string) string {
	// Run nginx -v
	cmd := exec.Command(exePath, "-v")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "unknown"
	}
	// Output format: "nginx version: nginx/1.18.0 (Ubuntu)" or similar
	output := string(out)

	// Regex to capture version
	re := regexp.MustCompile(`nginx/([0-9.]+)`)
	matches := re.FindStringSubmatch(output)
	if len(matches) > 1 {
		return matches[1]
	}
	return "unknown"
}

func parseConfPath(cmdline string) string {
	// Parse from command line first
	parts := strings.Split(cmdline, " ")
	for i, part := range parts {
		if part == "-c" && i+1 < len(parts) {
			return parts[i+1]
		}
	}

	// Common Kubernetes ConfigMap mount paths
	k8sPaths := []string{
		"/etc/nginx/conf.d/nginx.conf",
		"/etc/nginx/nginx.conf",
		"/usr/local/nginx/conf/nginx.conf",
		"/opt/nginx/conf/nginx.conf",
	}

	// Check if running in K8s (simple check for service account)
	if _, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount"); err == nil {
		// Try K8s-specific paths first
		for _, path := range k8sPaths {
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}

	// Default fallback
	return "/etc/nginx/nginx.conf"
}
