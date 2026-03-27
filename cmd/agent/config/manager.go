package config

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"time"
)

type Manager struct {
	configPath string
	backupDir  string
}

func NewManager(configPath string) *Manager {
	backupDir := filepath.Join(filepath.Dir(configPath), ".nginx-backups")
	os.MkdirAll(backupDir, 0755)

	return &Manager{
		configPath: configPath,
		backupDir:  backupDir,
	}
}

// Backup creates a timestamped backup of the current config
func (m *Manager) Backup() (string, error) {
	content, err := os.ReadFile(m.configPath)
	if err != nil {
		return "", fmt.Errorf("failed to read config: %w", err)
	}

	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(m.backupDir, fmt.Sprintf("nginx.conf.%s", timestamp))

	if err := os.WriteFile(backupPath, content, 0644); err != nil {
		return "", fmt.Errorf("failed to write backup: %w", err)
	}

	return backupPath, nil
}

// Update writes new config content to the file
func (m *Manager) Update(content string, createBackup bool) (string, error) {
	var backupPath string
	var err error

	if createBackup {
		backupPath, err = m.Backup()
		if err != nil {
			return "", fmt.Errorf("backup failed: %w", err)
		}
	}

	if err := os.WriteFile(m.configPath, []byte(content), 0644); err != nil {
		return backupPath, fmt.Errorf("failed to write config: %w", err)
	}

	return backupPath, nil
}

// runCommand executes a command with sudo if not already root
func (m *Manager) runCommand(name string, arg ...string) ([]byte, error) {
	if os.Geteuid() == 0 {
		// Already root, no sudo needed
		return exec.Command(name, arg...).CombinedOutput()
	}
	// Not root, try sudo -n
	args := append([]string{"-n", name}, arg...)
	return exec.Command("sudo", args...).CombinedOutput()
}

// hasSystemd returns true if systemctl is available
func (m *Manager) hasSystemd() bool {
	_, err := exec.LookPath("systemctl")
	return err == nil
}

// Reload reloads the NGINX configuration
func (m *Manager) Reload() error {
	// First test the config
	output, err := m.runCommand("nginx", "-t")
	if err != nil {
		return fmt.Errorf("config test failed: %s", string(output))
	}

	// Prefer systemctl reload if available
	if m.hasSystemd() {
		output, err = m.runCommand("systemctl", "reload", "nginx")
	} else {
		// Fallback for containers/non-systemd environments
		output, err = m.runCommand("nginx", "-s", "reload")
	}

	if err != nil {
		return fmt.Errorf("reload failed: %s", string(output))
	}

	return nil
}

// TestConfig runs nginx -t to validate the current config without applying changes.
func (m *Manager) TestConfig() error {
	output, err := m.runCommand("nginx", "-t")
	if err != nil {
		return fmt.Errorf("config test failed: %s", string(output))
	}
	return nil
}

// Restart restarts the NGINX service. Runs nginx -t first; if config is invalid, returns error and does not restart.
func (m *Manager) Restart() error {
	if err := m.TestConfig(); err != nil {
		return err
	}
	if m.hasSystemd() {
		output, err := m.runCommand("systemctl", "restart", "nginx")
		if err != nil {
			return fmt.Errorf("restart failed: %s", string(output))
		}
		return nil
	}
	return fmt.Errorf("restart failed: systemctl not found")
}

// Stop stops the NGINX service
func (m *Manager) Stop() error {
	if m.hasSystemd() {
		output, err := m.runCommand("systemctl", "stop", "nginx")
		if err != nil {
			return fmt.Errorf("stop failed: %s", string(output))
		}
		return nil
	}
	// Note: We don't want to stop the containerized NGINX process directly via -s quit
	// as that's usually handled by the orchestrator/container manager.
	return fmt.Errorf("stop failed: systemctl not found")
}

// Rollback restores the most recent backup
func (m *Manager) Rollback() error {
	// Find most recent backup
	entries, err := os.ReadDir(m.backupDir)
	if err != nil || len(entries) == 0 {
		return fmt.Errorf("no backups found")
	}

	// Sort by name (which includes timestamp) to get latest
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})
	latestBackup := entries[len(entries)-1]
	backupPath := filepath.Join(m.backupDir, latestBackup.Name())

	content, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("failed to read backup: %w", err)
	}

	if err := os.WriteFile(m.configPath, content, 0644); err != nil {
		return fmt.Errorf("failed to restore config: %w", err)
	}

	return m.Reload()
}

// UpdateSnippet injects a configuration snippet into the main config file
// This is a naive implementation: it appends to the end of the file or specific block
func (m *Manager) UpdateSnippet(snippet string, context string) (string, error) {
	// 1. Create Backup
	backupPath, err := m.Backup()
	if err != nil {
		return "", fmt.Errorf("backup failed: %w", err)
	}

	content, err := os.ReadFile(m.configPath)
	if err != nil {
		return backupPath, fmt.Errorf("failed to read config: %w", err)
	}
	configStr := string(content)

	// 2. Construct new content (Very simple append strategy)
	// In a real world, we'd use the AST parser to insert intelligently.
	// Here we just append to the end if it's http/events, or replace if we find a marker.

	// Check if already exists to avoid duplicates (idempotency)
	// For this MVP, we assume we just append.

	newContent := configStr + fmt.Sprintf("\n# AI-Tuned Configuration (%s)\n%s\n", time.Now().Format("2006-01-02"), snippet)

	// 3. Write
	if err := os.WriteFile(m.configPath, []byte(newContent), 0644); err != nil {
		return backupPath, fmt.Errorf("failed to write config: %w", err)
	}

	return backupPath, nil
}
