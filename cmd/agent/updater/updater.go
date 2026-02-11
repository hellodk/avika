package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type Manifest struct {
	Version     string            `json:"version"`
	ReleaseDate string            `json:"release_date"`
	Binaries    map[string]Binary `json:"binaries"`
}

type Binary struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
}

type Updater struct {
	ServerURL      string
	CurrentVersion string
	IsContainer    bool
}

func New(serverURL, currentVersion string) *Updater {
	// Detect if running in container
	isContainer := false
	if _, err := os.Stat("/.dockerenv"); err == nil {
		isContainer = true
	}
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		isContainer = true
	}

	return &Updater{
		ServerURL:      serverURL,
		CurrentVersion: currentVersion,
		IsContainer:    isContainer,
	}
}

func (u *Updater) Run(interval time.Duration) {
	log.Printf("🔄 Self-update poller started (Interval: %v, Server: %s)", interval, u.ServerURL)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		u.CheckAndApply("")
	}
}

func (u *Updater) CheckAndApply(overrideURL string) {
	manifest, err := u.fetchManifest(overrideURL)
	if err != nil {
		log.Printf("⚠️  Update check failed: %v", err)
		return
	}

	if manifest.Version == u.CurrentVersion {
		return
	}

	log.Printf("✨ New version found: %s (Current: %s). Starting update...", manifest.Version, u.CurrentVersion)

	archKey := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	binaryInfo, ok := manifest.Binaries[archKey]
	if !ok {
		log.Printf("❌ No binary found in manifest for architecture: %s", archKey)
		return
	}

	if err := u.applyUpdate(binaryInfo); err != nil {
		log.Printf("❌ Update failed: %v", err)
		return
	}
}

func (u *Updater) fetchManifest(overrideURL string) (*Manifest, error) {
	serverURL := u.ServerURL
	if overrideURL != "" {
		serverURL = overrideURL
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(serverURL + "/version.json")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned status: %s", resp.Status)
	}

	var m Manifest
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return nil, err
	}

	// If using an override URL, we should also rewrite binary URLs in the manifest
	// if they point to localhost (as they likely do in dev).
	if overrideURL != "" {
		for k, b := range m.Binaries {
			if strings.Contains(b.URL, "localhost") {
				m.Binaries[k] = Binary{
					URL:    strings.Replace(b.URL, "localhost", getHost(overrideURL), 1),
					SHA256: b.SHA256,
				}
			}
		}
	}

	return &m, nil
}

func getHost(url string) string {
	// Simple helper to extract host:port from URL
	parts := strings.Split(url, "//")
	if len(parts) < 2 {
		return url
	}
	end := strings.Index(parts[1], "/")
	if end == -1 {
		return parts[1]
	}
	return parts[1][:end]
}

func (u *Updater) applyUpdate(b Binary) error {
	// 1. Download to temp file
	tmpFile, err := os.CreateTemp("", "agent-update-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile.Name())

	log.Printf("💾 Downloading update from %s...", b.URL)
	resp, err := http.Get(b.URL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(tmpFile, hasher)

	if _, err := io.Copy(multiWriter, resp.Body); err != nil {
		return err
	}
	tmpFile.Close()

	// 2. Verify SHA256
	downloadedHash := hex.EncodeToString(hasher.Sum(nil))
	if downloadedHash != b.SHA256 {
		return fmt.Errorf("checksum mismatch! Expected %s, got %s", b.SHA256, downloadedHash)
	}
	log.Println("✅ Checksum verified")

	// 3. Make executable
	if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
		return err
	}

	// 4. Overwrite current binary
	selfPath, err := os.Executable()
	if err != nil {
		return err
	}

	log.Printf("🚀 Swapping binary at %s", selfPath)

	// Try direct rename first (works in containers and when agent has write permissions)
	if err := os.Rename(tmpFile.Name(), selfPath); err != nil {
		log.Printf("⚠️  Direct rename failed: %v. Trying fallback methods...", err)

		// Fallback 1: Try copy (for cross-filesystem)
		if err := copyFile(tmpFile.Name(), selfPath); err != nil {
			log.Printf("⚠️  Direct copy failed: %v. Trying sudo method...", err)

			// Fallback 2: Use sudo for privileged binary replacement
			cmd := exec.Command("sudo", "cp", tmpFile.Name(), selfPath)
			if output, err := cmd.CombinedOutput(); err != nil {
				return fmt.Errorf("failed to replace binary (all methods failed). Last error: %w, output: %s", err, string(output))
			}
			log.Println("✅ Binary replaced using sudo")

			// Ensure it's executable
			cmd = exec.Command("sudo", "chmod", "755", selfPath)
			if err := cmd.Run(); err != nil {
				log.Printf("⚠️  Failed to chmod: %v", err)
			}
		} else {
			log.Println("✅ Binary replaced using copy")
		}
	} else {
		log.Println("✅ Binary replaced using rename")
	}

	// 5. Restart or Exit
	if u.IsContainer {
		log.Println("🐳 Container detected. Exiting for pod restart...")
		os.Exit(100) // Special exit code for "Updated"
	} else {
		log.Println("🖥️  Standalone host detected. Attempting service restart...")
		// Try systemd restart if available, otherwise just exit and let manager (like supervisord) handle it
		cmd := exec.Command("sudo", "systemctl", "restart", "avika-agent")
		if err := cmd.Start(); err != nil {
			log.Printf("Warning: Failed to trigger systemctl restart: %v. Exiting manually.", err)
			os.Exit(0)
		}
	}

	return nil
}

func copyFile(src, dst string) error {
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	d, err := os.OpenFile(dst, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}
