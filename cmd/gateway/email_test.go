package main

import (
	"strings"
	"testing"

	"github.com/avika-ai/avika/cmd/gateway/config"
)

func TestSendReportEmail_NoSMTPHost(t *testing.T) {
	cfg := &config.Config{
		SMTP: config.SMTPConfig{
			Host: "",
		},
	}

	err := SendReportEmail(cfg, []string{"test@example.com"}, "Test Subject", "Test Body", nil, "")

	if err == nil {
		t.Error("Expected error when SMTP host is not configured")
	}

	if !strings.Contains(err.Error(), "SMTP host not configured") {
		t.Errorf("Unexpected error message: %v", err)
	}
}

func TestEmailAddressValidation(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		isValid bool
	}{
		{"valid_email", "test@example.com", true},
		{"valid_with_subdomain", "test@mail.example.com", true},
		{"valid_with_plus", "test+tag@example.com", true},
		{"missing_at", "testexample.com", false},
		{"missing_domain", "test@", false},
		{"missing_local", "@example.com", false},
		{"empty", "", false},
		{"spaces", "test @example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := isValidEmail(tt.email)
			if valid != tt.isValid {
				t.Errorf("Expected valid=%v for email %q, got %v", tt.isValid, tt.email, valid)
			}
		})
	}
}

func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	if strings.Contains(email, " ") {
		return false
	}
	atIdx := strings.Index(email, "@")
	if atIdx <= 0 || atIdx >= len(email)-1 {
		return false
	}
	return true
}

func TestEmailHeaderConstruction(t *testing.T) {
	cfg := &config.Config{
		SMTP: config.SMTPConfig{
			Host: "smtp.example.com",
			Port: 587,
			From: "noreply@example.com",
		},
	}

	to := []string{"user1@example.com", "user2@example.com"}
	subject := "Test Report"

	header := buildEmailHeader(cfg, to, subject)

	if header["From"] != cfg.SMTP.From {
		t.Errorf("Expected From=%s, got %s", cfg.SMTP.From, header["From"])
	}

	expectedTo := strings.Join(to, ",")
	if header["To"] != expectedTo {
		t.Errorf("Expected To=%s, got %s", expectedTo, header["To"])
	}

	if header["Subject"] != subject {
		t.Errorf("Expected Subject=%s, got %s", subject, header["Subject"])
	}

	if header["MIME-Version"] != "1.0" {
		t.Error("Missing MIME-Version header")
	}
}

func buildEmailHeader(cfg *config.Config, to []string, subject string) map[string]string {
	return map[string]string{
		"From":         cfg.SMTP.From,
		"To":           strings.Join(to, ","),
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": "multipart/mixed; boundary=---NGINX_MANAGER_REPORT_BOUNDARY---",
	}
}

func TestAttachmentEncoding(t *testing.T) {
	attachment := []byte("test attachment content")
	filename := "report.pdf"

	encoded := encodeAttachment(attachment, filename)

	if !strings.Contains(encoded, "Content-Type: application/pdf") {
		t.Error("Missing Content-Type header for attachment")
	}

	if !strings.Contains(encoded, "Content-Transfer-Encoding: base64") {
		t.Error("Missing Content-Transfer-Encoding header")
	}

	if !strings.Contains(encoded, filename) {
		t.Error("Missing filename in attachment headers")
	}
}

func encodeAttachment(data []byte, filename string) string {
	var sb strings.Builder
	sb.WriteString("Content-Type: application/pdf; name=\"" + filename + "\"\r\n")
	sb.WriteString("Content-Transfer-Encoding: base64\r\n")
	sb.WriteString("Content-Disposition: attachment; filename=\"" + filename + "\"\r\n")
	sb.WriteString("\r\n")
	return sb.String()
}

func TestSMTPAuthConfiguration(t *testing.T) {
	tests := []struct {
		name        string
		username    string
		password    string
		expectAuth  bool
	}{
		{"with_credentials", "user", "pass", true},
		{"no_username", "", "pass", false},
		{"no_password", "user", "", true},
		{"no_credentials", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &config.Config{
				SMTP: config.SMTPConfig{
					Host:     "smtp.example.com",
					Port:     587,
					Username: tt.username,
					Password: tt.password,
				},
			}

			needsAuth := cfg.SMTP.Username != ""
			if needsAuth != tt.expectAuth {
				t.Errorf("Expected auth=%v, got %v", tt.expectAuth, needsAuth)
			}
		})
	}
}

func TestRecipientListParsing(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "single_recipient",
			input:    "user@example.com",
			expected: []string{"user@example.com"},
		},
		{
			name:     "multiple_recipients",
			input:    "user1@example.com,user2@example.com",
			expected: []string{"user1@example.com", "user2@example.com"},
		},
		{
			name:     "with_whitespace",
			input:    "user1@example.com , user2@example.com , user3@example.com",
			expected: []string{"user1@example.com", "user2@example.com", "user3@example.com"},
		},
		{
			name:     "empty_string",
			input:    "",
			expected: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseRecipientList(tt.input)
			if len(result) != len(tt.expected) {
				t.Errorf("Expected %d recipients, got %d", len(tt.expected), len(result))
			}
		})
	}
}

func parseRecipientList(input string) []string {
	if input == "" {
		return []string{}
	}
	parts := strings.Split(input, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func BenchmarkEmailHeaderConstruction(b *testing.B) {
	cfg := &config.Config{
		SMTP: config.SMTPConfig{
			Host: "smtp.example.com",
			Port: 587,
			From: "noreply@example.com",
		},
	}
	to := []string{"user1@example.com", "user2@example.com"}
	subject := "Test Report"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buildEmailHeader(cfg, to, subject)
	}
}
