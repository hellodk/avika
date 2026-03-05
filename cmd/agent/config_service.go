package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/avika-ai/avika/cmd/agent/updater"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/protobuf/types/known/emptypb"
)

type agentConfigServer struct {
	pb.UnimplementedAgentConfigServiceServer
}

var (
	agentLabelsMu sync.RWMutex

	updaterLoopMu     sync.Mutex
	updaterLoopCancel context.CancelFunc
	updaterParentCtx  context.Context
)

func (s *agentConfigServer) GetAgentConfig(ctx context.Context, _ *emptypb.Empty) (*pb.AgentConfigResponse, error) {
	return currentAgentConfigResponse(), nil
}

func (s *agentConfigServer) UpdateAgentConfig(ctx context.Context, req *pb.AgentConfigUpdate) (*pb.AgentConfigUpdateResponse, error) {
	if req == nil {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: "request is required"}, nil
	}
	if len(req.Updates) == 0 {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: "updates are required"}, nil
	}

	changed, requiresRestart, err := applyAgentUpdates(req.Updates, req.HotReload)
	if err != nil {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: err.Error()}, nil
	}

	if req.Persist {
		if err := persistAgentConfigUpdates(*configFile, req.Updates); err != nil {
			return &pb.AgentConfigUpdateResponse{
				Success:         false,
				Error:           err.Error(),
				Message:         "failed to persist config to file",
				RequiresRestart: requiresRestart,
			}, nil
		}
	}

	msg := "config updated"
	if len(changed) > 0 {
		msg = "updated: " + strings.Join(changed, ", ")
	}
	if requiresRestart {
		msg += " (restart required for some changes)"
	}

	return &pb.AgentConfigUpdateResponse{
		Success:         true,
		Message:         msg,
		RequiresRestart: requiresRestart,
	}, nil
}

func (s *agentConfigServer) TestConnection(ctx context.Context, req *pb.ConnectionTestRequest) (*pb.ConnectionTestResponse, error) {
	if req == nil {
		return &pb.ConnectionTestResponse{Success: false, Message: "request is required"}, nil
	}

	testType := strings.TrimSpace(strings.ToLower(req.TestType))
	endpoint := strings.TrimSpace(req.Endpoint)

	switch testType {
	case "gateway":
		return testTCP(ctx, firstOr(endpoint, firstGatewayAddress()))
	case "nginx_status":
		return testHTTP(ctx, firstOr(endpoint, *nginxStatusURL))
	case "update_server":
		return testUpdateServer(ctx, firstOr(endpoint, effectiveUpdateServerFromConfig()))
	default:
		return &pb.ConnectionTestResponse{
			Success: false,
			Message: "unsupported test_type (expected: gateway, nginx_status, update_server)",
		}, nil
	}
}

func (s *agentConfigServer) ListConfigBackups(ctx context.Context, _ *emptypb.Empty) (*pb.ListConfigBackupsResponse, error) {
	path := strings.TrimSpace(*configFile)
	if path == "" {
		return &pb.ListConfigBackupsResponse{Backups: nil}, nil
	}
	dir := filepath.Join(filepath.Dir(path), agentConfigBackupDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return &pb.ListConfigBackupsResponse{Backups: nil}, nil
	}
	var backups []*pb.ConfigBackupEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".bak") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		backups = append(backups, &pb.ConfigBackupEntry{
			Name:      e.Name(),
			CreatedAt: info.ModTime().Unix(),
		})
	}
	sort.Slice(backups, func(i, j int) bool { return backups[i].CreatedAt > backups[j].CreatedAt })
	return &pb.ListConfigBackupsResponse{Backups: backups}, nil
}

func (s *agentConfigServer) RestoreConfigBackup(ctx context.Context, req *pb.RestoreConfigBackupRequest) (*pb.AgentConfigUpdateResponse, error) {
	if req == nil || strings.TrimSpace(req.BackupName) == "" {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: "backup_name is required"}, nil
	}
	path := strings.TrimSpace(*configFile)
	if path == "" {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: "config file path is empty"}, nil
	}
	backupDir := filepath.Join(filepath.Dir(path), agentConfigBackupDir)
	name := filepath.Base(req.BackupName)
	if name != req.BackupName || !strings.HasSuffix(name, ".bak") {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: "invalid backup_name"}, nil
	}
	backupPath := filepath.Join(backupDir, name)
	if err := copyFileContents(backupPath, path); err != nil {
		return &pb.AgentConfigUpdateResponse{Success: false, Error: fmt.Sprintf("restore failed: %v", err)}, nil
	}
	return &pb.AgentConfigUpdateResponse{
		Success:         true,
		Message:         "config restored from backup; agent restart required for changes to take effect",
		RequiresRestart: true,
	}, nil
}

func currentAgentConfigResponse() *pb.AgentConfigResponse {
	labels := make(map[string]string)
	agentLabelsMu.RLock()
	for k, v := range agentLabels {
		labels[k] = v
	}
	agentLabelsMu.RUnlock()

	return &pb.AgentConfigResponse{
		GatewayAddress:  getGatewayAddressString(),
		AgentId:         *agentID,
		Labels:          labels,
		HealthPort:      int32(*healthPort),
		MgmtPort:        int32(*mgmtPort),
		NginxConfigPath: *nginxConfigPath,
		NginxStatusUrl:  *nginxStatusURL,
		AccessLogPath:   *accessLogPath,
		ErrorLogPath:    *errorLogPath,
		LogFormat:       *logFormat,
		BufferDir:       *bufferDir,
		UpdateServer:    effectiveUpdateServerFromConfig(),
		UpdateInterval:  (*updateInterval).String(),
		LogLevel:        *logLevel,
		LogFile:         *logFile,
		ConfigFilePath:  *configFile,
	}
}

func applyAgentUpdates(updates map[string]string, hotReload bool) (changed []string, requiresRestart bool, err error) {
	changedSet := map[string]struct{}{}
	addChanged := func(name string) {
		changedSet[name] = struct{}{}
	}

	for rawKey, rawVal := range updates {
		key := strings.TrimSpace(rawKey)
		val := strings.TrimSpace(rawVal)
		if key == "" {
			continue
		}

		// Labels: LABEL_* keys
		if strings.HasPrefix(key, "LABEL_") {
			labelKey := strings.TrimPrefix(key, "LABEL_")
			if labelKey == "" {
				continue
			}
			agentLabelsMu.Lock()
			if val == "" {
				delete(agentLabels, labelKey)
			} else {
				agentLabels[labelKey] = val
			}
			agentLabelsMu.Unlock()
			addChanged(key)
			continue
		}

		switch strings.ToUpper(key) {
		case "GATEWAYS", "GATEWAY_SERVER":
			*gatewayAddr = val
			addChanged("GATEWAYS")
			requiresRestart = true
		case "AGENT_ID":
			*agentID = val
			addChanged("AGENT_ID")
			requiresRestart = true
		case "HEALTH_PORT":
			i, convErr := strconv.Atoi(val)
			if convErr != nil {
				return nil, false, fmt.Errorf("invalid HEALTH_PORT: %w", convErr)
			}
			*healthPort = i
			addChanged("HEALTH_PORT")
			requiresRestart = true
		case "MGMT_PORT":
			i, convErr := strconv.Atoi(val)
			if convErr != nil {
				return nil, false, fmt.Errorf("invalid MGMT_PORT: %w", convErr)
			}
			*mgmtPort = i
			addChanged("MGMT_PORT")
			requiresRestart = true
		case "NGINX_CONFIG_PATH":
			*nginxConfigPath = val
			addChanged("NGINX_CONFIG_PATH")
			requiresRestart = true
		case "NGINX_STATUS_URL":
			*nginxStatusURL = val
			addChanged("NGINX_STATUS_URL")
			requiresRestart = true
		case "ACCESS_LOG_PATH":
			*accessLogPath = val
			addChanged("ACCESS_LOG_PATH")
			requiresRestart = true
		case "ERROR_LOG_PATH":
			*errorLogPath = val
			addChanged("ERROR_LOG_PATH")
			requiresRestart = true
		case "LOG_FORMAT":
			*logFormat = val
			addChanged("LOG_FORMAT")
			requiresRestart = true
		case "BUFFER_DIR":
			*bufferDir = val
			addChanged("BUFFER_DIR")
			requiresRestart = true
		case "UPDATE_SERVER":
			*updateServer = val
			addChanged("UPDATE_SERVER")
			if hotReload {
				restartUpdaterLoopIfRunning()
			} else {
				requiresRestart = true
			}
		case "UPDATE_INTERVAL":
			d, convErr := time.ParseDuration(val)
			if convErr != nil {
				return nil, false, fmt.Errorf("invalid UPDATE_INTERVAL: %w", convErr)
			}
			*updateInterval = d
			addChanged("UPDATE_INTERVAL")
			if hotReload {
				restartUpdaterLoopIfRunning()
			} else {
				requiresRestart = true
			}
		case "LOG_LEVEL":
			*logLevel = val
			addChanged("LOG_LEVEL")
			requiresRestart = true
		case "LOG_FILE":
			*logFile = val
			addChanged("LOG_FILE")
			requiresRestart = true
		default:
			return nil, false, fmt.Errorf("unsupported config key: %s", key)
		}
	}

	if len(changedSet) > 0 {
		changed = make([]string, 0, len(changedSet))
		for k := range changedSet {
			changed = append(changed, k)
		}
		sort.Strings(changed)
	}

	return changed, requiresRestart, nil
}

const agentConfigBackupKeep = 5
const agentConfigBackupDir = ".avika-agent-backups"

func persistAgentConfigUpdates(path string, updates map[string]string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("config file path is empty")
	}

	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create config directory: %w", err)
		}
	}

	// Backup existing file to a dedicated dir (keep last N)
	if _, err := os.Stat(path); err == nil {
		backupDir := filepath.Join(dir, agentConfigBackupDir)
		if err := os.MkdirAll(backupDir, 0755); err != nil {
			return fmt.Errorf("failed to create backup directory: %w", err)
		}
		base := filepath.Base(path)
		ts := time.Now().UTC().Format("20060102T150405Z")
		backupPath := filepath.Join(backupDir, base+"."+ts+".bak")
		if err := copyFileContents(path, backupPath); err != nil {
			return fmt.Errorf("failed to backup config: %w", err)
		}
		pruneAgentConfigBackups(backupDir, agentConfigBackupKeep)
	}

	orig, _ := os.ReadFile(path)
	lines := strings.Split(string(orig), "\n")
	if len(lines) == 1 && lines[0] == "" {
		lines = []string{}
	}

	seen := map[string]bool{}
	out := make([]string, 0, len(lines)+len(updates)+4)

	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "#") {
			out = append(out, line)
			continue
		}

		parts := strings.SplitN(trim, "=", 2)
		if len(parts) != 2 {
			out = append(out, line)
			continue
		}

		key := strings.TrimSpace(parts[0])
		if val, ok := updates[key]; ok {
			out = append(out, fmt.Sprintf("%s=%s", key, formatConfigValue(val)))
			seen[key] = true
			continue
		}

		out = append(out, line)
	}

	// Append missing keys
	if len(out) > 0 && strings.TrimSpace(out[len(out)-1]) != "" {
		out = append(out, "")
	}

	for k, v := range updates {
		if !seen[k] {
			out = append(out, fmt.Sprintf("%s=%s", k, formatConfigValue(v)))
		}
	}

	content := strings.Join(out, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}

	return os.WriteFile(path, []byte(content), 0644)
}

func formatConfigValue(val string) string {
	v := strings.TrimSpace(val)
	if v == "" {
		return "\"\""
	}
	// Quote if contains spaces or comment markers
	if strings.ContainsAny(v, " \t#") || strings.Contains(v, "\"") {
		v = strings.ReplaceAll(v, "\"", "\\\"")
		return "\"" + v + "\""
	}
	return v
}

func copyFileContents(src, dst string) error {
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	d, err := os.OpenFile(dst, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}

// pruneAgentConfigBackups keeps only the latest keepN backup files in backupDir (by name, which includes timestamp).
func pruneAgentConfigBackups(backupDir string, keepN int) {
	if keepN <= 0 {
		return
	}
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".bak") {
			names = append(names, e.Name())
		}
	}
	if len(names) <= keepN {
		return
	}
	sort.Strings(names) // oldest first (timestamp in name)
	for i := 0; i < len(names)-keepN; i++ {
		_ = os.Remove(filepath.Join(backupDir, names[i]))
	}
}

func firstGatewayAddress() string {
	addrs := getGatewayAddresses()
	if len(addrs) == 0 {
		return ""
	}
	return addrs[0]
}

func getGatewayAddressString() string {
	addrs := getGatewayAddresses()
	if len(addrs) == 0 {
		return strings.TrimSpace(*gatewayAddr)
	}
	return strings.Join(addrs, ",")
}

func currentAgentConfigLegacy() *pb.AgentConfig {
	addrs := getGatewayAddresses()
	updateIntervalSeconds := int64((*updateInterval).Seconds())
	if updateIntervalSeconds <= 0 {
		updateIntervalSeconds = int64((168 * time.Hour).Seconds())
	}

	return &pb.AgentConfig{
		AgentId:                  *agentID,
		GatewayAddresses:         addrs,
		MultiGatewayMode:         len(addrs) > 1,
		NginxStatusUrl:           *nginxStatusURL,
		AccessLogPath:            *accessLogPath,
		ErrorLogPath:             *errorLogPath,
		NginxConfigPath:          *nginxConfigPath,
		LogFormat:                *logFormat,
		HealthPort:               int32(*healthPort),
		MgmtPort:                 int32(*mgmtPort),
		LogLevel:                 *logLevel,
		BufferDir:                *bufferDir,
		UpdateServer:             effectiveUpdateServerFromConfig(),
		UpdateIntervalSeconds:    updateIntervalSeconds,
		MetricsIntervalSeconds:   0,
		HeartbeatIntervalSeconds: 0,
		EnableVtsMetrics:         false,
		EnableLogStreaming:       true,
		AutoApplyConfig:          false,
	}
}

func legacyConfigToUpdates(cfg *pb.AgentConfig) map[string]string {
	if cfg == nil {
		return map[string]string{}
	}
	out := map[string]string{}
	if len(cfg.GatewayAddresses) > 0 {
		out["GATEWAYS"] = strings.Join(cfg.GatewayAddresses, ",")
	}
	if cfg.AgentId != "" {
		out["AGENT_ID"] = cfg.AgentId
	}
	if cfg.HealthPort > 0 {
		out["HEALTH_PORT"] = strconv.Itoa(int(cfg.HealthPort))
	}
	if cfg.MgmtPort > 0 {
		out["MGMT_PORT"] = strconv.Itoa(int(cfg.MgmtPort))
	}
	if cfg.NginxConfigPath != "" {
		out["NGINX_CONFIG_PATH"] = cfg.NginxConfigPath
	}
	if cfg.NginxStatusUrl != "" {
		out["NGINX_STATUS_URL"] = cfg.NginxStatusUrl
	}
	if cfg.AccessLogPath != "" {
		out["ACCESS_LOG_PATH"] = cfg.AccessLogPath
	}
	if cfg.ErrorLogPath != "" {
		out["ERROR_LOG_PATH"] = cfg.ErrorLogPath
	}
	if cfg.LogFormat != "" {
		out["LOG_FORMAT"] = cfg.LogFormat
	}
	if cfg.BufferDir != "" {
		out["BUFFER_DIR"] = cfg.BufferDir
	}
	if cfg.UpdateServer != "" {
		out["UPDATE_SERVER"] = cfg.UpdateServer
	}
	if cfg.UpdateIntervalSeconds > 0 {
		out["UPDATE_INTERVAL"] = (time.Duration(cfg.UpdateIntervalSeconds) * time.Second).String()
	}
	if cfg.LogLevel != "" {
		out["LOG_LEVEL"] = cfg.LogLevel
	}
	return out
}

func applyLegacyAgentConfig(cfg *pb.AgentConfig, hotReload bool) (changed []string, requiresRestart bool, err error) {
	return applyAgentUpdates(legacyConfigToUpdates(cfg), hotReload)
}

func effectiveUpdateServerFromConfig() string {
	effective := *updateServer
	if strings.ToLower(strings.TrimSpace(effective)) == "disabled" {
		return ""
	}
	if effective == "" && *gatewayAddr != "" {
		return deriveUpdateServerFromGateway(*gatewayAddr)
	}
	return effective
}

func firstOr(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func testTCP(ctx context.Context, addr string) (*pb.ConnectionTestResponse, error) {
	if addr == "" {
		return &pb.ConnectionTestResponse{Success: false, Message: "no address configured"}, nil
	}
	start := time.Now()
	d := net.Dialer{Timeout: 3 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	lat := time.Since(start).Milliseconds()
	if err != nil {
		return &pb.ConnectionTestResponse{
			Success:   false,
			Message:   err.Error(),
			LatencyMs: lat,
			Details:   map[string]string{"address": addr},
		}, nil
	}
	_ = conn.Close()
	return &pb.ConnectionTestResponse{
		Success:   true,
		Message:   "tcp connection ok",
		LatencyMs: lat,
		Details:   map[string]string{"address": addr},
	}, nil
}

func testHTTP(ctx context.Context, url string) (*pb.ConnectionTestResponse, error) {
	if url == "" {
		return &pb.ConnectionTestResponse{Success: false, Message: "no url configured"}, nil
	}
	start := time.Now()
	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := client.Do(req)
	lat := time.Since(start).Milliseconds()
	if err != nil {
		return &pb.ConnectionTestResponse{
			Success:   false,
			Message:   err.Error(),
			LatencyMs: lat,
			Details:   map[string]string{"url": url},
		}, nil
	}
	defer resp.Body.Close()

	ok := resp.StatusCode >= 200 && resp.StatusCode < 300
	msg := "http ok"
	if !ok {
		msg = "http status: " + resp.Status
	}
	return &pb.ConnectionTestResponse{
		Success:   ok,
		Message:   msg,
		LatencyMs: lat,
		Details:   map[string]string{"url": url, "status": resp.Status},
	}, nil
}

func testUpdateServer(ctx context.Context, base string) (*pb.ConnectionTestResponse, error) {
	if base == "" {
		return &pb.ConnectionTestResponse{Success: false, Message: "no update server configured"}, nil
	}
	url := strings.TrimRight(base, "/")
	if !strings.HasSuffix(url, "/version.json") {
		url = url + "/version.json"
	}
	return testHTTP(ctx, url)
}

func startUpdaterLoop(parent context.Context, u *updater.Updater, interval time.Duration) {
	updaterLoopMu.Lock()
	updaterParentCtx = parent
	if updaterLoopCancel != nil {
		updaterLoopCancel()
		updaterLoopCancel = nil
	}
	loopCtx, cancel := context.WithCancel(parent)
	updaterLoopCancel = cancel
	updaterLoopMu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-loopCtx.Done():
				return
			case <-ticker.C:
				u.CheckAndApply("")
			}
		}
	}()
}

func restartUpdaterLoopIfRunning() {
	updaterLoopMu.Lock()
	cancel := updaterLoopCancel
	updaterLoopMu.Unlock()

	if cancel == nil || globalUpdater == nil {
		return
	}

	startUpdaterLoop(updaterParentCtxOrBackground(), globalUpdater, *updateInterval)
}

func updaterParentCtxOrBackground() context.Context {
	updaterLoopMu.Lock()
	defer updaterLoopMu.Unlock()
	if updaterParentCtx != nil {
		return updaterParentCtx
	}
	return context.Background()
}
