package main

import (
	"testing"
)

func TestUAParser_Parse(t *testing.T) {
	parser, err := NewUAParser()
	if err != nil {
		t.Fatalf("Failed to create UAParser: %v", err)
	}

	tests := []struct {
		name           string
		userAgent      string
		expectedBrowser string
		expectedOS      string
		expectedDevice  string
		expectedIsBot   bool
	}{
		{
			name:           "Chrome on Windows",
			userAgent:      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			expectedBrowser: "Chrome",
			expectedOS:      "Windows",
			expectedDevice:  "desktop",
			expectedIsBot:   false,
		},
		{
			name:           "Safari on macOS",
			userAgent:      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
			expectedBrowser: "Safari",
			expectedOS:      "Mac OS X",
			expectedDevice:  "desktop",
			expectedIsBot:   false,
		},
		{
			name:           "iPhone Safari",
			userAgent:      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
			expectedBrowser: "Mobile Safari",
			expectedOS:      "iOS",
			expectedDevice:  "mobile",
			expectedIsBot:   false,
		},
		{
			name:           "Googlebot",
			userAgent:      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			expectedBrowser: "Googlebot",
			expectedOS:      "Other",
			expectedDevice:  "bot",
			expectedIsBot:   true,
		},
		{
			name:           "Bingbot",
			userAgent:      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
			expectedBrowser: "bingbot",
			expectedOS:      "Other",
			expectedDevice:  "bot",
			expectedIsBot:   true,
		},
		{
			name:           "curl",
			userAgent:      "curl/7.88.1",
			expectedBrowser: "curl",
			expectedOS:      "Other",
			expectedDevice:  "bot",
			expectedIsBot:   true,
		},
		{
			name:           "Python requests",
			userAgent:      "python-requests/2.28.1",
			expectedBrowser: "Python Requests",
			expectedOS:      "Other",
			expectedDevice:  "bot",
			expectedIsBot:   true,
		},
		{
			name:           "Firefox on Linux",
			userAgent:      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
			expectedBrowser: "Firefox",
			expectedOS:      "Linux",
			expectedDevice:  "desktop",
			expectedIsBot:   false,
		},
		{
			name:           "Android Chrome",
			userAgent:      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
			expectedBrowser: "Chrome Mobile",
			expectedOS:      "Android",
			expectedDevice:  "mobile",
			expectedIsBot:   false,
		},
		{
			name:           "iPad Safari",
			userAgent:      "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
			expectedBrowser: "Mobile Safari",
			expectedOS:      "iOS",
			expectedDevice:  "tablet",
			expectedIsBot:   false,
		},
		{
			name:           "Empty user agent",
			userAgent:      "",
			expectedBrowser: "Unknown",
			expectedOS:      "Unknown",
			expectedDevice:  "unknown",
			expectedIsBot:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parser.Parse(tt.userAgent)

			if result.BrowserFamily != tt.expectedBrowser {
				t.Errorf("Browser: got %s, want %s", result.BrowserFamily, tt.expectedBrowser)
			}
			if result.OSFamily != tt.expectedOS {
				t.Errorf("OS: got %s, want %s", result.OSFamily, tt.expectedOS)
			}
			if result.DeviceType != tt.expectedDevice {
				t.Errorf("Device: got %s, want %s", result.DeviceType, tt.expectedDevice)
			}
			if result.IsBot != tt.expectedIsBot {
				t.Errorf("IsBot: got %v, want %v", result.IsBot, tt.expectedIsBot)
			}
		})
	}
}

func TestUAParser_Cache(t *testing.T) {
	parser, err := NewUAParser()
	if err != nil {
		t.Fatalf("Failed to create UAParser: %v", err)
	}

	userAgent := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

	// First parse
	result1 := parser.Parse(userAgent)

	// Second parse (should hit cache)
	result2 := parser.Parse(userAgent)

	// Results should be identical (same pointer from cache)
	if result1 != result2 {
		t.Error("Cache miss: expected same pointer for repeated parse")
	}
}

func TestExtractReferrerDomain(t *testing.T) {
	tests := []struct {
		name     string
		referer  string
		expected string
	}{
		{
			name:     "Full URL with www",
			referer:  "https://www.google.com/search?q=test",
			expected: "google.com",
		},
		{
			name:     "Full URL without www",
			referer:  "https://reddit.com/r/programming",
			expected: "reddit.com",
		},
		{
			name:     "HTTP URL",
			referer:  "http://example.org/page",
			expected: "example.org",
		},
		{
			name:     "Empty string",
			referer:  "",
			expected: "",
		},
		{
			name:     "Dash (nginx default)",
			referer:  "-",
			expected: "",
		},
		{
			name:     "Subdomain",
			referer:  "https://blog.example.com/article",
			expected: "blog.example.com",
		},
		{
			name:     "Invalid URL",
			referer:  "not-a-url",
			expected: "",
		},
		{
			name:     "URL with port",
			referer:  "https://localhost:3000/page",
			expected: "localhost",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractReferrerDomain(tt.referer)
			if result != tt.expected {
				t.Errorf("got %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestIsStaticFile(t *testing.T) {
	tests := []struct {
		uri      string
		expected bool
	}{
		{"/static/app.js", true},
		{"/static/styles.css", true},
		{"/images/logo.png", true},
		{"/images/photo.jpg", true},
		{"/images/icon.svg", true},
		{"/fonts/roboto.woff2", true},
		{"/downloads/file.pdf", true},
		{"/api/users", false},
		{"/login", false},
		{"/dashboard", false},
		{"/api/config.json", true}, // .json is considered static
		{"/app.js?v=123", true},    // query string should be stripped
	}

	for _, tt := range tests {
		t.Run(tt.uri, func(t *testing.T) {
			result := IsStaticFile(tt.uri)
			if result != tt.expected {
				t.Errorf("IsStaticFile(%q) = %v, want %v", tt.uri, result, tt.expected)
			}
		})
	}
}

func BenchmarkUAParser_Parse(b *testing.B) {
	parser, _ := NewUAParser()
	userAgent := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.Parse(userAgent)
	}
}

func BenchmarkUAParser_ParseVaried(b *testing.B) {
	parser, _ := NewUAParser()
	userAgents := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.Parse(userAgents[i%len(userAgents)])
	}
}

func BenchmarkExtractReferrerDomain(b *testing.B) {
	referer := "https://www.google.com/search?q=test&oq=test"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ExtractReferrerDomain(referer)
	}
}
