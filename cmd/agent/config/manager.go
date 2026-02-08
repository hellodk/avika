package config

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
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
	content, err := ioutil.ReadFile(m.configPath)
	if err != nil {
		return "", fmt.Errorf("failed to read config: %w", err)
	}

	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(m.backupDir, fmt.Sprintf("nginx.conf.%s", timestamp))

	if err := ioutil.WriteFile(backupPath, content, 0644); err != nil {
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

	if err := ioutil.WriteFile(m.configPath, []byte(content), 0644); err != nil {
		return backupPath, fmt.Errorf("failed to write config: %w", err)
	}

	return backupPath, nil
}

// Reload sends SIGHUP to NGINX to reload configuration
func (m *Manager) Reload() error {
	// First test the config
	cmd := exec.Command("nginx", "-t")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("config test failed: %s", string(output))
	}

	// Reload NGINX
	cmd = exec.Command("nginx", "-s", "reload")
	output, err = cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("reload failed: %s", string(output))
	}

	return nil
}

// Rollback restores the most recent backup
func (m *Manager) Rollback() error {
	// Find most recent backup
	files, err := ioutil.ReadDir(m.backupDir)
	if err != nil || len(files) == 0 {
		return fmt.Errorf("no backups found")
	}

	// Get the latest backup (files are sorted by name, which includes timestamp)
	latestBackup := files[len(files)-1]
	backupPath := filepath.Join(m.backupDir, latestBackup.Name())

	content, err := ioutil.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("failed to read backup: %w", err)
	}

	if err := ioutil.WriteFile(m.configPath, content, 0644); err != nil {
		return fmt.Errorf("failed to restore config: %w", err)
	}

	return m.Reload()
}
