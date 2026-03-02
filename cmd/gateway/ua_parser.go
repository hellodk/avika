package main

import (
	"net/url"
	"regexp"
	"strings"
	"sync"

	"github.com/ua-parser/uap-go/uaparser"
)

// UAParser handles user-agent string parsing with caching
type UAParser struct {
	parser *uaparser.Parser
	cache  sync.Map // thread-safe cache for parsed results
}

// ParsedUA contains the parsed user-agent information
type ParsedUA struct {
	BrowserFamily  string
	BrowserVersion string
	OSFamily       string
	OSVersion      string
	DeviceType     string // desktop, mobile, tablet, bot
	IsBot          bool
}

// Common bot patterns for detection
var botPatterns = regexp.MustCompile(`(?i)(bot|crawler|spider|scraper|curl|wget|python|java|go-http|libwww|apache|http|fetch|headless|phantom|selenium|puppeteer|playwright|ahrefsbot|googlebot|bingbot|yandexbot|baiduspider|facebookexternalhit|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|applebot|duckduckbot|semrushbot|dotbot|petalbot|mj12bot|bytespider|claudebot|gptbot|chatgpt|anthropic)`)

// NewUAParser creates a new user-agent parser
func NewUAParser() (*UAParser, error) {
	parser := uaparser.NewFromSaved()
	return &UAParser{
		parser: parser,
	}, nil
}

// Parse parses a user-agent string and returns structured information
func (p *UAParser) Parse(userAgent string) *ParsedUA {
	if userAgent == "" {
		return &ParsedUA{
			BrowserFamily: "Unknown",
			OSFamily:      "Unknown",
			DeviceType:    "unknown",
			IsBot:         false,
		}
	}

	// Check cache first
	if cached, ok := p.cache.Load(userAgent); ok {
		return cached.(*ParsedUA)
	}

	// Parse the user-agent
	client := p.parser.Parse(userAgent)

	result := &ParsedUA{
		BrowserFamily:  client.UserAgent.Family,
		BrowserVersion: client.UserAgent.ToVersionString(),
		OSFamily:       client.Os.Family,
		OSVersion:      client.Os.ToVersionString(),
		DeviceType:     detectDeviceType(client, userAgent),
		IsBot:          isBot(client, userAgent),
	}

	// Normalize empty values
	if result.BrowserFamily == "" {
		result.BrowserFamily = "Unknown"
	}
	if result.OSFamily == "" {
		result.OSFamily = "Unknown"
	}
	if result.DeviceType == "" {
		result.DeviceType = "unknown"
	}

	// Store in cache
	p.cache.Store(userAgent, result)

	return result
}

// detectDeviceType determines the device type from parsed UA
func detectDeviceType(client *uaparser.Client, userAgent string) string {
	// Check if it's a bot first
	if isBot(client, userAgent) {
		return "bot"
	}

	device := strings.ToLower(client.Device.Family)
	os := strings.ToLower(client.Os.Family)

	// Check for mobile devices
	if strings.Contains(device, "iphone") ||
		strings.Contains(device, "android") ||
		strings.Contains(os, "android") ||
		strings.Contains(os, "ios") ||
		strings.Contains(device, "mobile") {
		// Distinguish tablet from phone
		if strings.Contains(device, "ipad") ||
			strings.Contains(device, "tablet") ||
			strings.Contains(userAgent, "Tablet") {
			return "tablet"
		}
		return "mobile"
	}

	// Check for tablets specifically
	if strings.Contains(device, "ipad") ||
		strings.Contains(device, "tablet") ||
		strings.Contains(device, "kindle") {
		return "tablet"
	}

	// Check for TV/gaming devices
	if strings.Contains(device, "smart-tv") ||
		strings.Contains(device, "playstation") ||
		strings.Contains(device, "xbox") ||
		strings.Contains(device, "nintendo") {
		return "tv"
	}

	// Default to desktop
	return "desktop"
}

// isBot determines if the user-agent is a bot/crawler
func isBot(client *uaparser.Client, userAgent string) bool {
	// Check device family
	device := strings.ToLower(client.Device.Family)
	if strings.Contains(device, "spider") || strings.Contains(device, "bot") {
		return true
	}

	// Check browser family
	browser := strings.ToLower(client.UserAgent.Family)
	if strings.Contains(browser, "bot") || strings.Contains(browser, "crawler") {
		return true
	}

	// Check against common bot patterns
	if botPatterns.MatchString(userAgent) {
		return true
	}

	// Check for empty or suspicious patterns
	if len(userAgent) < 10 {
		return true
	}

	return false
}

// ExtractReferrerDomain extracts the domain from a referrer URL
func ExtractReferrerDomain(referer string) string {
	if referer == "" || referer == "-" {
		return ""
	}

	// Parse the URL
	u, err := url.Parse(referer)
	if err != nil {
		return ""
	}

	host := u.Hostname()
	if host == "" {
		return ""
	}

	// Remove www. prefix for cleaner grouping
	host = strings.TrimPrefix(host, "www.")

	return host
}

// IsStaticFile determines if the request URI is for a static file
func IsStaticFile(uri string) bool {
	staticExtensions := []string{
		".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
		".woff", ".woff2", ".ttf", ".eot", ".otf",
		".mp4", ".webm", ".mp3", ".wav", ".ogg",
		".pdf", ".zip", ".gz", ".tar", ".rar",
		".xml", ".json", ".txt", ".csv",
		".swf", ".flv",
	}

	lowerURI := strings.ToLower(uri)

	// Remove query string for extension check
	if idx := strings.Index(lowerURI, "?"); idx != -1 {
		lowerURI = lowerURI[:idx]
	}

	for _, ext := range staticExtensions {
		if strings.HasSuffix(lowerURI, ext) {
			return true
		}
	}

	return false
}
