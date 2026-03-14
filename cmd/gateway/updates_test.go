package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// TestUpdatesVersionJSON ensures GET /updates/version.json returns 200 and valid JSON (deploy-agent.sh flow).
func TestUpdatesVersionJSON(t *testing.T) {
	dir := t.TempDir()
	ensureUpdatesDir(dir)

	handler := updatesHandlerForDir(dir)
	req := httptest.NewRequest("GET", "http://test/updates/version.json", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /updates/version.json: expected 200, got %d", w.Code)
	}
	var out struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(w.Body).Decode(&out); err != nil {
		t.Fatalf("GET /updates/version.json: invalid JSON: %v", err)
	}
	if out.Version == "" {
		t.Error("GET /updates/version.json: version field empty")
	}
}

// TestUpdatesBinaryServed ensures GET /updates/bin/agent-linux-amd64 returns 200 when file exists.
func TestUpdatesBinaryServed(t *testing.T) {
	dir := t.TempDir()
	binDir := filepath.Join(dir, "bin")
	_ = os.MkdirAll(binDir, 0755)
	fakeBinary := filepath.Join(binDir, "agent-linux-amd64")
	_ = os.WriteFile(fakeBinary, []byte("fake-binary"), 0755)
	_ = os.WriteFile(fakeBinary+".sha256", []byte("abc123"), 0644)
	_ = os.WriteFile(filepath.Join(dir, "version.json"), []byte(`{"version":"1.0.0"}`), 0644)

	handler := updatesHandlerForDir(dir)
	req := httptest.NewRequest("GET", "http://test/updates/bin/agent-linux-amd64", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /updates/bin/agent-linux-amd64: expected 200, got %d", w.Code)
	}
	if w.Body.String() != "fake-binary" {
		t.Errorf("GET /updates/bin/agent-linux-amd64: body mismatch")
	}
}
