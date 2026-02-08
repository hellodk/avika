package config

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const (
	BackupDir  = "/var/lib/nginx-manager/backups"
	NginxDir   = "/etc/nginx"
	MaxBackups = 10
)

// BackupNginxConfig creates a timestamped backup of the NGINX configuration.
func BackupNginxConfig(reason string) error {
	timestamp := time.Now().Format("20060102150405")
	backupPath := filepath.Join(BackupDir, fmt.Sprintf("%s_%s", timestamp, reason))

	log.Printf("Creating NGINX config backup at %s (reason: %s)", backupPath, reason)

	if err := os.MkdirAll(backupPath, 0755); err != nil {
		return fmt.Errorf("failed to create backup directory: %w", err)
	}

	// Helper to copy directory
	err := copyDir(NginxDir, backupPath)
	if err != nil {
		return fmt.Errorf("failed to copy nginx config: %w", err)
	}

	return EnforceRetention()
}

func EnforceRetention() error {
	entries, err := os.ReadDir(BackupDir)
	if err != nil {
		return fmt.Errorf("failed to read backup directory: %w", err)
	}

	var backups []os.DirEntry
	for _, entry := range entries {
		if entry.IsDir() {
			backups = append(backups, entry)
		}
	}

	if len(backups) <= MaxBackups {
		return nil
	}

	// Sort by name (which starts with timestamp)
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Name() < backups[j].Name()
	})

	// Remove oldest ones
	toRemove := len(backups) - MaxBackups
	for i := 0; i < toRemove; i++ {
		path := filepath.Join(BackupDir, backups[i].Name())
		log.Printf("Removing old backup: %s", path)
		if err := os.RemoveAll(path); err != nil {
			log.Printf("Warning: failed to remove old backup %s: %v", path, err)
		}
	}

	return nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}

		// It's a file
		return copyFile(path, target)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}

	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	return os.Chmod(dst, info.Mode())
}
