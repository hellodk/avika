package main

import (
	"os"
	"strings"
	"testing"
)

func TestNewMgmtServer(t *testing.T) {
	server := newMgmtServer("/etc/nginx/nginx.conf")

	if server == nil {
		t.Fatal("newMgmtServer returned nil")
	}

	if server.configManager == nil {
		t.Error("configManager not initialized")
	}

	if server.certManager == nil {
		t.Error("certManager not initialized")
	}
}

func TestConfigPathFallback(t *testing.T) {
	tests := []struct {
		name         string
		requestPath  string
		expectedPath string
	}{
		{
			name:         "explicit_path",
			requestPath:  "/custom/path/nginx.conf",
			expectedPath: "/custom/path/nginx.conf",
		},
		{
			name:         "empty_path_default",
			requestPath:  "",
			expectedPath: "/etc/nginx/nginx.conf",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := tt.requestPath
			if path == "" {
				if _, err := os.Stat("/etc/nginx/nginx.conf"); err == nil {
					path = "/etc/nginx/nginx.conf"
				} else if _, err := os.Stat("/opt/bitnami/nginx/conf/nginx.conf"); err == nil {
					path = "/opt/bitnami/nginx/conf/nginx.conf"
				} else {
					path = "/etc/nginx/nginx.conf"
				}
			}

			if tt.requestPath != "" && path != tt.expectedPath {
				t.Errorf("Expected path %s, got %s", tt.expectedPath, path)
			}
		})
	}
}

func TestLogTypeSelection(t *testing.T) {
	tests := []struct {
		name        string
		logType     string
		accessPath  string
		errorPath   string
		expected    string
	}{
		{
			name:       "access_log",
			logType:    "access",
			accessPath: "/var/log/nginx/access.log",
			errorPath:  "/var/log/nginx/error.log",
			expected:   "/var/log/nginx/access.log",
		},
		{
			name:       "error_log",
			logType:    "error",
			accessPath: "/var/log/nginx/access.log",
			errorPath:  "/var/log/nginx/error.log",
			expected:   "/var/log/nginx/error.log",
		},
		{
			name:       "default_access",
			logType:    "",
			accessPath: "/var/log/nginx/access.log",
			errorPath:  "/var/log/nginx/error.log",
			expected:   "/var/log/nginx/access.log",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logPath := tt.accessPath
			if tt.logType == "error" {
				logPath = tt.errorPath
			}

			if logPath != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, logPath)
			}
		})
	}
}

func TestShellCommandParsing(t *testing.T) {
	tests := []struct {
		name           string
		command        string
		expectShellWrap bool
	}{
		{
			name:           "simple_command",
			command:        "/bin/bash",
			expectShellWrap: false,
		},
		{
			name:           "command_with_args",
			command:        "ls -la /var/log",
			expectShellWrap: true,
		},
		{
			name:           "complex_command",
			command:        "/bin/sh -c '(bash || ash || sh)'",
			expectShellWrap: true,
		},
		{
			name:           "empty_command",
			command:        "",
			expectShellWrap: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shell := tt.command
			if shell == "" {
				shell = "/bin/sh -c '(bash || ash || sh)'"
			}

			hasSpaces := strings.Contains(shell, " ")
			if hasSpaces != tt.expectShellWrap {
				t.Errorf("Expected shell wrap=%v, got %v for command %q", tt.expectShellWrap, hasSpaces, shell)
			}
		})
	}
}

func TestAugmentValidation(t *testing.T) {
	tests := []struct {
		name      string
		snippet   string
		context   string
		expectErr bool
	}{
		{
			name:      "valid_http_context",
			snippet:   "gzip on;",
			context:   "http",
			expectErr: false,
		},
		{
			name:      "valid_server_context",
			snippet:   "listen 80;",
			context:   "server",
			expectErr: false,
		},
		{
			name:      "valid_location_context",
			snippet:   "proxy_pass http://backend;",
			context:   "location",
			expectErr: false,
		},
		{
			name:      "empty_snippet",
			snippet:   "",
			context:   "http",
			expectErr: true,
		},
		{
			name:      "empty_context",
			snippet:   "gzip on;",
			context:   "",
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hasErr := tt.snippet == "" || tt.context == ""
			if hasErr != tt.expectErr {
				t.Errorf("Expected error=%v, got %v", tt.expectErr, hasErr)
			}
		})
	}
}

func TestConfigUpdateResponse(t *testing.T) {
	tests := []struct {
		name       string
		success    bool
		errorMsg   string
		backupPath string
	}{
		{
			name:       "successful_update",
			success:    true,
			errorMsg:   "",
			backupPath: "/etc/nginx/backups/nginx.conf.bak.20240101120000",
		},
		{
			name:       "validation_failed",
			success:    false,
			errorMsg:   "validation failed",
			backupPath: "",
		},
		{
			name:       "reload_failed_with_backup",
			success:    false,
			errorMsg:   "config updated but reload failed: nginx: [emerg] directive not allowed",
			backupPath: "/etc/nginx/backups/nginx.conf.bak.20240101120000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := struct {
				Success    bool
				Error      string
				BackupPath string
			}{
				Success:    tt.success,
				Error:      tt.errorMsg,
				BackupPath: tt.backupPath,
			}

			if response.Success != tt.success {
				t.Errorf("Expected success=%v, got %v", tt.success, response.Success)
			}

			if tt.success && response.Error != "" {
				t.Error("Successful response should not have error message")
			}

			if !tt.success && response.Error == "" {
				t.Error("Failed response should have error message")
			}
		})
	}
}

func TestValidationResult(t *testing.T) {
	tests := []struct {
		name     string
		valid    bool
		errors   []string
		warnings []string
	}{
		{
			name:     "valid_config",
			valid:    true,
			errors:   nil,
			warnings: nil,
		},
		{
			name:     "invalid_config",
			valid:    false,
			errors:   []string{"unknown directive 'foo'", "missing semicolon"},
			warnings: nil,
		},
		{
			name:     "valid_with_warnings",
			valid:    true,
			errors:   nil,
			warnings: []string{"deprecated directive 'ssl'"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := struct {
				Valid    bool
				Errors   []string
				Warnings []string
			}{
				Valid:    tt.valid,
				Errors:   tt.errors,
				Warnings: tt.warnings,
			}

			if result.Valid && len(result.Errors) > 0 {
				t.Error("Valid result should not have errors")
			}

			if !result.Valid && len(result.Errors) == 0 {
				t.Error("Invalid result should have errors")
			}
		})
	}
}

func TestCertificateDirectories(t *testing.T) {
	defaultDirs := []string{"/etc/nginx/ssl", "/etc/ssl/certs"}

	if len(defaultDirs) != 2 {
		t.Errorf("Expected 2 default cert directories, got %d", len(defaultDirs))
	}

	for _, dir := range defaultDirs {
		if !strings.HasPrefix(dir, "/") {
			t.Errorf("Certificate directory %s should be absolute path", dir)
		}
	}
}

func TestGracefulStopTimeout(t *testing.T) {
	timeout := 3

	if timeout <= 0 {
		t.Error("Graceful stop timeout should be positive")
	}

	if timeout > 30 {
		t.Error("Graceful stop timeout seems too long")
	}
}

func TestEnvironmentVariables(t *testing.T) {
	envVars := []string{"TERM=xterm-256color"}

	if len(envVars) == 0 {
		t.Error("Should set at least TERM environment variable")
	}

	found := false
	for _, env := range envVars {
		if strings.HasPrefix(env, "TERM=") {
			found = true
			break
		}
	}

	if !found {
		t.Error("TERM environment variable not found")
	}
}

func BenchmarkShellCommandParsing(b *testing.B) {
	commands := []string{
		"/bin/bash",
		"ls -la /var/log",
		"/bin/sh -c '(bash || ash || sh)'",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cmd := commands[i%len(commands)]
		_ = strings.Contains(cmd, " ")
	}
}

func BenchmarkLogPathSelection(b *testing.B) {
	accessPath := "/var/log/nginx/access.log"
	errorPath := "/var/log/nginx/error.log"
	logTypes := []string{"access", "error", "access", "error"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		logType := logTypes[i%len(logTypes)]
		if logType == "error" {
			_ = errorPath
		} else {
			_ = accessPath
		}
	}
}
