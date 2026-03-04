package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	lru "github.com/hashicorp/golang-lru/v2"
)

// LLMClient abstracts different LLM providers
type LLMClient interface {
	Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error)
	GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error)
	GetProviderName() string
	GetModelName() string
	HealthCheck(ctx context.Context) error
}

// LLMConfig holds configuration for LLM providers
type LLMConfig struct {
	Provider         string  `json:"provider"`           // openai, anthropic, ollama, azure
	APIKey           string  `json:"api_key"`
	Model            string  `json:"model"`
	BaseURL          string  `json:"base_url"`           // For Ollama or Azure
	MaxTokens        int     `json:"max_tokens"`
	Temperature      float32 `json:"temperature"`
	TimeoutSeconds   int     `json:"timeout_seconds"`
	RetryAttempts    int     `json:"retry_attempts"`
	RateLimitRPM     int     `json:"rate_limit_rpm"`     // Requests per minute
	FallbackProvider string  `json:"fallback_provider"`
	EnableCaching    bool    `json:"enable_caching"`
	CacheTTLMinutes  int     `json:"cache_ttl_minutes"`
}

// AnalysisRequest contains data for error analysis
type AnalysisRequest struct {
	ErrorPatterns  []*ErrorPattern
	SystemMetrics  *SystemMetricsSnapshot
	RecentLogs     []ErrorLogSummary
	NginxConfig    string
	TimeWindow     string
	ContextData    map[string]interface{}
}

// ErrorLogSummary is a simplified log entry for LLM context
type ErrorLogSummary struct {
	Timestamp      string
	Method         string
	URI            string
	Status         int
	Latency        float32
	UpstreamStatus string
}

// SystemMetricsSnapshot holds point-in-time system metrics
type SystemMetricsSnapshot struct {
	CPUUsage          float64
	MemoryUsage       float64
	ActiveConnections int64
	UpstreamP95       float64
}

// AnalysisResponse contains LLM-generated analysis
type AnalysisResponse struct {
	RootCauseAnalysis  string   `json:"root_cause_analysis"`
	ImpactAssessment   string   `json:"impact_assessment"`
	RecommendedActions []string `json:"recommended_actions"`
	ConfigSuggestions  string   `json:"config_suggestions"`
	Confidence         float32  `json:"confidence"`
	TokensUsed         int      `json:"tokens_used"`
	ProcessingTimeMs   int64    `json:"processing_time_ms"`
	ModelUsed          string   `json:"model_used"`
}

// RecommendationRequest contains data for generating recommendations
type RecommendationRequest struct {
	ErrorPatterns   []*ErrorPattern
	TrafficPatterns *TrafficPatterns
	CurrentConfig   string
	MaxTokens       int
	Temperature     float32
}

// TrafficPatterns holds traffic analysis data
type TrafficPatterns struct {
	PeakRPS    float64
	AvgRPS     float64
	UniqueIPs  int64
	BotPercent float64
}

// RecommendationResponse contains LLM-generated recommendations
type RecommendationResponse struct {
	Recommendations []AIRecommendation `json:"recommendations"`
	Confidence      float32            `json:"confidence"`
	TokensUsed      int                `json:"tokens_used"`
	ProcessingTimeMs int64             `json:"processing_time_ms"`
}

// AIRecommendation represents a single recommendation
type AIRecommendation struct {
	ID                  string   `json:"id"`
	Title               string   `json:"title"`
	Description         string   `json:"description"`
	Category            string   `json:"category"` // performance, security, reliability, cost
	Impact              string   `json:"impact"`   // high, medium, low
	Problem             string   `json:"problem"`
	Solution            string   `json:"solution"`
	CurrentConfig       string   `json:"current_config"`
	SuggestedConfig     string   `json:"suggested_config"`
	AffectedDirectives  []string `json:"affected_directives"`
	EstimatedImprovement string  `json:"estimated_improvement"`
	Risks               []string `json:"risks"`
	Confidence          float32  `json:"confidence"`
	BasedOnErrors       []string `json:"based_on_errors"`
	Status              string   `json:"status"` // pending, applied, dismissed
}

// LoadLLMConfig loads LLM configuration from environment variables (deprecated: use LoadLLMConfigFromConfig)
func LoadLLMConfig() *LLMConfig {
	return &LLMConfig{
		Provider:         getEnvString("LLM_PROVIDER", "openai"),
		APIKey:           getEnvString("LLM_API_KEY", ""),
		Model:            getEnvString("LLM_MODEL", "gpt-4-turbo"),
		BaseURL:          getEnvString("LLM_BASE_URL", ""),
		MaxTokens:        getEnvInt("LLM_MAX_TOKENS", 2000),
		Temperature:      float32(getEnvFloat("LLM_TEMPERATURE", 0.3)),
		TimeoutSeconds:   getEnvInt("LLM_TIMEOUT_SECONDS", 60),
		RetryAttempts:    getEnvInt("LLM_RETRY_ATTEMPTS", 3),
		RateLimitRPM:     getEnvInt("LLM_RATE_LIMIT_RPM", 60),
		FallbackProvider: getEnvString("LLM_FALLBACK_PROVIDER", ""),
		EnableCaching:    getEnvString("LLM_ENABLE_CACHING", "true") == "true",
		CacheTTLMinutes:  getEnvInt("LLM_CACHE_TTL_MINUTES", 60),
	}
}

// LoadLLMConfigFromConfig converts config.LLMConfig to the internal LLMConfig
// This allows LLM settings to be specified in the gateway config file (YAML)
func LoadLLMConfigFromConfig(cfg *config.LLMConfig) *LLMConfig {
	if cfg == nil {
		return LoadLLMConfig()
	}
	return &LLMConfig{
		Provider:         cfg.Provider,
		APIKey:           cfg.APIKey,
		Model:            cfg.Model,
		BaseURL:          cfg.BaseURL,
		MaxTokens:        cfg.MaxTokens,
		Temperature:      cfg.Temperature,
		TimeoutSeconds:   cfg.TimeoutSeconds,
		RetryAttempts:    cfg.RetryAttempts,
		RateLimitRPM:     cfg.RateLimitRPM,
		FallbackProvider: cfg.FallbackProvider,
		EnableCaching:    cfg.EnableCaching,
		CacheTTLMinutes:  cfg.CacheTTLMinutes,
	}
}

func getEnvString(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func getEnvFloat(key string, defaultVal float64) float64 {
	if v := os.Getenv(key); v != "" {
		var f float64
		fmt.Sscanf(v, "%f", &f)
		return f
	}
	return defaultVal
}

// openAICompatibleProviders are local/self-hosted providers that use OpenAI-compatible API; no API key required.
var openAICompatibleProviders = map[string]string{
	"lmstudio":   "http://localhost:1234/v1",
	"llamacpp":   "http://localhost:8080/v1",
	"llama.cpp":  "http://localhost:8080/v1",
	"vllm":       "http://localhost:8000/v1",
	"vllm_metal": "http://localhost:8000/v1",
	"vllm-metal": "http://localhost:8000/v1",
}

// NewLLMClient creates an LLM client based on configuration
func NewLLMClient(config *LLMConfig) (LLMClient, error) {
	providerLower := strings.ToLower(config.Provider)
	_, isOpenAICompatible := openAICompatibleProviders[providerLower]
	if config.APIKey == "" && config.Provider != "ollama" && !isOpenAICompatible {
		log.Printf("LLM: No API key configured, using mock client")
		return NewMockLLMClient(), nil
	}

	var client LLMClient
	var err error

	switch providerLower {
	case "openai":
		client, err = NewOpenAIClient(config)
	case "anthropic", "claude":
		client, err = NewClaudeClient(config)
	case "ollama":
		client, err = NewOllamaClient(config)
	case "lmstudio", "llamacpp", "llama.cpp", "vllm", "vllm_metal", "vllm-metal":
		cfg := *config
		if cfg.BaseURL == "" {
			cfg.BaseURL = openAICompatibleProviders[providerLower]
		}
		client, err = NewOpenAIClient(&cfg)
	default:
		return nil, fmt.Errorf("unsupported LLM provider: %s", config.Provider)
	}

	if err != nil {
		return nil, err
	}

	// Wrap with caching if enabled
	if config.EnableCaching {
		client = NewCachedLLMClient(client, config.CacheTTLMinutes)
	}

	return client, nil
}

// OpenAIClient implements LLMClient for OpenAI
type OpenAIClient struct {
	apiKey     string
	model      string
	baseURL    string
	maxTokens  int
	temperature float32
	httpClient *http.Client
}

// NewOpenAIClient creates a new OpenAI client
func NewOpenAIClient(config *LLMConfig) (*OpenAIClient, error) {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	return &OpenAIClient{
		apiKey:     config.APIKey,
		model:      config.Model,
		baseURL:    baseURL,
		maxTokens:  config.MaxTokens,
		temperature: config.Temperature,
		httpClient: &http.Client{
			Timeout: time.Duration(config.TimeoutSeconds) * time.Second,
		},
	}, nil
}

func (c *OpenAIClient) GetProviderName() string { return "openai" }
func (c *OpenAIClient) GetModelName() string    { return c.model }

func (c *OpenAIClient) HealthCheck(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/models", nil)
	if err != nil {
		return err
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("OpenAI health check failed: %d", resp.StatusCode)
	}
	return nil
}

func (c *OpenAIClient) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	start := time.Now()

	prompt, err := renderAnalysisPrompt(req)
	if err != nil {
		return nil, fmt.Errorf("failed to render prompt: %w", err)
	}

	messages := []map[string]string{
		{"role": "system", "content": "You are an expert NGINX performance engineer. Analyze errors and provide actionable recommendations in JSON format."},
		{"role": "user", "content": prompt},
	}

	body := map[string]interface{}{
		"model":       c.model,
		"messages":    messages,
		"max_tokens":  c.maxTokens,
		"temperature": c.temperature,
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from OpenAI")
	}

	// Parse the JSON response from the model
	content := openAIResp.Choices[0].Message.Content
	analysisResp := &AnalysisResponse{
		TokensUsed:       openAIResp.Usage.TotalTokens,
		ProcessingTimeMs: time.Since(start).Milliseconds(),
		ModelUsed:        c.model,
	}

	// Try to parse as JSON, fall back to raw text if needed
	if err := parseAnalysisJSON(content, analysisResp); err != nil {
		analysisResp.RootCauseAnalysis = content
		analysisResp.Confidence = 0.5
	}

	return analysisResp, nil
}

func (c *OpenAIClient) GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	start := time.Now()

	prompt, err := renderRecommendationPrompt(req)
	if err != nil {
		return nil, fmt.Errorf("failed to render prompt: %w", err)
	}

	messages := []map[string]string{
		{"role": "system", "content": "You are an NGINX optimization expert. Generate specific, actionable tuning recommendations in JSON format."},
		{"role": "user", "content": prompt},
	}

	body := map[string]interface{}{
		"model":       c.model,
		"messages":    messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from OpenAI")
	}

	content := openAIResp.Choices[0].Message.Content
	recResp := &RecommendationResponse{
		TokensUsed:       openAIResp.Usage.TotalTokens,
		ProcessingTimeMs: time.Since(start).Milliseconds(),
	}

	if err := parseRecommendationJSON(content, recResp); err != nil {
		return nil, fmt.Errorf("failed to parse recommendations: %w", err)
	}

	return recResp, nil
}

// ClaudeClient implements LLMClient for Anthropic Claude
type ClaudeClient struct {
	apiKey     string
	model      string
	maxTokens  int
	temperature float32
	httpClient *http.Client
}

// NewClaudeClient creates a new Claude client
func NewClaudeClient(config *LLMConfig) (*ClaudeClient, error) {
	model := config.Model
	if model == "" {
		model = "claude-3-sonnet-20240229"
	}

	return &ClaudeClient{
		apiKey:     config.APIKey,
		model:      model,
		maxTokens:  config.MaxTokens,
		temperature: config.Temperature,
		httpClient: &http.Client{
			Timeout: time.Duration(config.TimeoutSeconds) * time.Second,
		},
	}, nil
}

func (c *ClaudeClient) GetProviderName() string { return "anthropic" }
func (c *ClaudeClient) GetModelName() string    { return c.model }

func (c *ClaudeClient) HealthCheck(ctx context.Context) error {
	return nil // Claude doesn't have a direct health endpoint
}

func (c *ClaudeClient) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	start := time.Now()

	prompt, err := renderAnalysisPrompt(req)
	if err != nil {
		return nil, err
	}

	body := map[string]interface{}{
		"model":      c.model,
		"max_tokens": c.maxTokens,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"system": "You are an expert NGINX performance engineer. Analyze errors and provide actionable recommendations in JSON format.",
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Claude API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var claudeResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &claudeResp); err != nil {
		return nil, err
	}

	if len(claudeResp.Content) == 0 {
		return nil, fmt.Errorf("no response from Claude")
	}

	analysisResp := &AnalysisResponse{
		TokensUsed:       claudeResp.Usage.InputTokens + claudeResp.Usage.OutputTokens,
		ProcessingTimeMs: time.Since(start).Milliseconds(),
		ModelUsed:        c.model,
	}

	if err := parseAnalysisJSON(claudeResp.Content[0].Text, analysisResp); err != nil {
		analysisResp.RootCauseAnalysis = claudeResp.Content[0].Text
		analysisResp.Confidence = 0.5
	}

	return analysisResp, nil
}

func (c *ClaudeClient) GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	start := time.Now()

	prompt, err := renderRecommendationPrompt(req)
	if err != nil {
		return nil, err
	}

	body := map[string]interface{}{
		"model":      c.model,
		"max_tokens": req.MaxTokens,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"system": "You are an NGINX optimization expert. Generate specific, actionable tuning recommendations in JSON format.",
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Claude API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var claudeResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &claudeResp); err != nil {
		return nil, err
	}

	recResp := &RecommendationResponse{
		TokensUsed:       claudeResp.Usage.InputTokens + claudeResp.Usage.OutputTokens,
		ProcessingTimeMs: time.Since(start).Milliseconds(),
	}

	if len(claudeResp.Content) > 0 {
		if err := parseRecommendationJSON(claudeResp.Content[0].Text, recResp); err != nil {
			return nil, err
		}
	}

	return recResp, nil
}

// OllamaClient implements LLMClient for local Ollama
type OllamaClient struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

// NewOllamaClient creates a new Ollama client
func NewOllamaClient(config *LLMConfig) (*OllamaClient, error) {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	model := config.Model
	if model == "" {
		model = "llama2"
	}

	return &OllamaClient{
		baseURL: baseURL,
		model:   model,
		httpClient: &http.Client{
			Timeout: time.Duration(config.TimeoutSeconds) * time.Second,
		},
	}, nil
}

func (c *OllamaClient) GetProviderName() string { return "ollama" }
func (c *OllamaClient) GetModelName() string    { return c.model }

func (c *OllamaClient) HealthCheck(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/tags", nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Ollama health check failed: %d", resp.StatusCode)
	}
	return nil
}

func (c *OllamaClient) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	start := time.Now()

	prompt, err := renderAnalysisPrompt(req)
	if err != nil {
		return nil, err
	}

	fullPrompt := "You are an expert NGINX performance engineer. Analyze errors and provide actionable recommendations in JSON format.\n\n" + prompt

	body := map[string]interface{}{
		"model":  c.model,
		"prompt": fullPrompt,
		"stream": false,
		"format": "json",
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var ollamaResp struct {
		Response string `json:"response"`
	}

	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, err
	}

	analysisResp := &AnalysisResponse{
		ProcessingTimeMs: time.Since(start).Milliseconds(),
		ModelUsed:        c.model,
	}

	if err := parseAnalysisJSON(ollamaResp.Response, analysisResp); err != nil {
		analysisResp.RootCauseAnalysis = ollamaResp.Response
		analysisResp.Confidence = 0.5
	}

	return analysisResp, nil
}

func (c *OllamaClient) GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	start := time.Now()

	prompt, err := renderRecommendationPrompt(req)
	if err != nil {
		return nil, err
	}

	fullPrompt := "You are an NGINX optimization expert. Generate specific, actionable tuning recommendations in JSON format.\n\n" + prompt

	body := map[string]interface{}{
		"model":  c.model,
		"prompt": fullPrompt,
		"stream": false,
		"format": "json",
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var ollamaResp struct {
		Response string `json:"response"`
	}

	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, err
	}

	recResp := &RecommendationResponse{
		ProcessingTimeMs: time.Since(start).Milliseconds(),
	}

	if err := parseRecommendationJSON(ollamaResp.Response, recResp); err != nil {
		return nil, err
	}

	return recResp, nil
}

// MockLLMClient provides rule-based responses when no LLM is configured
type MockLLMClient struct{}

func NewMockLLMClient() *MockLLMClient {
	return &MockLLMClient{}
}

func (c *MockLLMClient) GetProviderName() string { return "mock" }
func (c *MockLLMClient) GetModelName() string    { return "rule-based" }
func (c *MockLLMClient) HealthCheck(ctx context.Context) error { return nil }

func (c *MockLLMClient) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	// Generate rule-based analysis
	analysis := generateRuleBasedAnalysis(req)
	return analysis, nil
}

func (c *MockLLMClient) GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	// Generate rule-based recommendations
	recs := generateRuleBasedRecommendations(req)
	return recs, nil
}

// CachedLLMClient wraps an LLM client with caching
type CachedLLMClient struct {
	client    LLMClient
	cache     *lru.Cache[string, interface{}]
	ttl       time.Duration
	mu        sync.RWMutex
	timestamps map[string]time.Time
}

func NewCachedLLMClient(client LLMClient, ttlMinutes int) *CachedLLMClient {
	cache, _ := lru.New[string, interface{}](1000)
	return &CachedLLMClient{
		client:     client,
		cache:      cache,
		ttl:        time.Duration(ttlMinutes) * time.Minute,
		timestamps: make(map[string]time.Time),
	}
}

func (c *CachedLLMClient) GetProviderName() string { return c.client.GetProviderName() }
func (c *CachedLLMClient) GetModelName() string    { return c.client.GetModelName() }
func (c *CachedLLMClient) HealthCheck(ctx context.Context) error { return c.client.HealthCheck(ctx) }

func (c *CachedLLMClient) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	key := c.computeKey("analyze", req)

	c.mu.RLock()
	if cached, ok := c.cache.Get(key); ok {
		if ts, exists := c.timestamps[key]; exists && time.Since(ts) < c.ttl {
			c.mu.RUnlock()
			return cached.(*AnalysisResponse), nil
		}
	}
	c.mu.RUnlock()

	resp, err := c.client.Analyze(ctx, req)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.cache.Add(key, resp)
	c.timestamps[key] = time.Now()
	c.mu.Unlock()

	return resp, nil
}

func (c *CachedLLMClient) GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error) {
	key := c.computeKey("recommend", req)

	c.mu.RLock()
	if cached, ok := c.cache.Get(key); ok {
		if ts, exists := c.timestamps[key]; exists && time.Since(ts) < c.ttl {
			c.mu.RUnlock()
			return cached.(*RecommendationResponse), nil
		}
	}
	c.mu.RUnlock()

	resp, err := c.client.GenerateRecommendation(ctx, req)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.cache.Add(key, resp)
	c.timestamps[key] = time.Now()
	c.mu.Unlock()

	return resp, nil
}

func (c *CachedLLMClient) computeKey(prefix string, data interface{}) string {
	jsonData, _ := json.Marshal(data)
	hash := fmt.Sprintf("%x", sha256.Sum256(jsonData))
	return prefix + ":" + hash[:16]
}

// Prompt templates
const analysisPromptTemplate = `## Error Context
{{- if .ErrorPatterns}}
{{range .ErrorPatterns}}
- Status {{.StatusCode}} ({{.Category}}): {{.OccurrenceCount}} occurrences
  URI Pattern: {{.URIPattern}}
  Severity: {{.Severity}}
  Avg Latency: {{printf "%.2f" .AvgLatency}}ms
{{end}}
{{- end}}

## System Metrics
{{- if .SystemMetrics}}
- CPU Usage: {{printf "%.1f" .SystemMetrics.CPUUsage}}%
- Memory Usage: {{printf "%.1f" .SystemMetrics.MemoryUsage}}%
- Active Connections: {{.SystemMetrics.ActiveConnections}}
- Upstream P95 Latency: {{printf "%.2f" .SystemMetrics.UpstreamP95}}ms
{{- end}}

## Sample Error Logs
{{- range .RecentLogs}}
- {{.Timestamp}}: {{.Method}} {{.URI}} -> {{.Status}} ({{printf "%.2f" .Latency}}ms) upstream: {{.UpstreamStatus}}
{{- end}}

{{- if .NginxConfig}}
## Current NGINX Configuration
{{.NginxConfig}}
{{- end}}

## Analysis Tasks
1. Root Cause Analysis: Identify the most likely cause(s) of these errors
2. Impact Assessment: Estimate user impact and severity
3. Recommended Actions: List specific steps to resolve
4. NGINX Configuration Changes: Suggest specific directives to tune

Respond in JSON format:
{
  "root_cause": "explanation",
  "impact": "high|medium|low",
  "impact_details": "description",
  "actions": ["action1", "action2"],
  "config_suggestions": "nginx config snippet",
  "confidence": 0.0-1.0
}`

const recommendationPromptTemplate = `## Error Patterns (Recent)
{{- range .ErrorPatterns}}
- {{.Category}}: {{.OccurrenceCount}} occurrences
  Top URIs: {{.URIPattern}}
  Avg Latency: {{printf "%.2f" .AvgLatency}}ms
{{- end}}

## Traffic Patterns
{{- if .TrafficPatterns}}
- Peak RPS: {{printf "%.1f" .TrafficPatterns.PeakRPS}}
- Avg RPS: {{printf "%.1f" .TrafficPatterns.AvgRPS}}
- Unique IPs: {{.TrafficPatterns.UniqueIPs}}
- Bot Traffic: {{printf "%.1f" .TrafficPatterns.BotPercent}}%
{{- end}}

{{- if .CurrentConfig}}
## Current Configuration
{{.CurrentConfig}}
{{- end}}

Generate NGINX tuning recommendations in JSON:
{
  "recommendations": [
    {
      "title": "short title",
      "category": "performance|security|reliability",
      "impact": "high|medium|low",
      "problem": "what's happening",
      "solution": "what to do",
      "config": "nginx config snippet",
      "improvement": "expected result",
      "risks": ["potential side effects"]
    }
  ]
}`

func renderAnalysisPrompt(req *AnalysisRequest) (string, error) {
	tmpl, err := template.New("analysis").Parse(analysisPromptTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

func renderRecommendationPrompt(req *RecommendationRequest) (string, error) {
	tmpl, err := template.New("recommendation").Parse(recommendationPromptTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

func parseAnalysisJSON(content string, resp *AnalysisResponse) error {
	// Try to extract JSON from the response
	content = extractJSON(content)

	var parsed struct {
		RootCause         string   `json:"root_cause"`
		Impact            string   `json:"impact"`
		ImpactDetails     string   `json:"impact_details"`
		Actions           []string `json:"actions"`
		ConfigSuggestions string   `json:"config_suggestions"`
		Confidence        float32  `json:"confidence"`
	}

	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return err
	}

	resp.RootCauseAnalysis = parsed.RootCause
	resp.ImpactAssessment = fmt.Sprintf("%s: %s", parsed.Impact, parsed.ImpactDetails)
	resp.RecommendedActions = parsed.Actions
	resp.ConfigSuggestions = parsed.ConfigSuggestions
	resp.Confidence = parsed.Confidence

	return nil
}

func parseRecommendationJSON(content string, resp *RecommendationResponse) error {
	content = extractJSON(content)

	var parsed struct {
		Recommendations []struct {
			Title       string   `json:"title"`
			Category    string   `json:"category"`
			Impact      string   `json:"impact"`
			Problem     string   `json:"problem"`
			Solution    string   `json:"solution"`
			Config      string   `json:"config"`
			Improvement string   `json:"improvement"`
			Risks       []string `json:"risks"`
		} `json:"recommendations"`
	}

	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return err
	}

	for i, r := range parsed.Recommendations {
		resp.Recommendations = append(resp.Recommendations, AIRecommendation{
			ID:                   fmt.Sprintf("rec-%d", i+1),
			Title:                r.Title,
			Category:             r.Category,
			Impact:               r.Impact,
			Problem:              r.Problem,
			Solution:             r.Solution,
			SuggestedConfig:      r.Config,
			EstimatedImprovement: r.Improvement,
			Risks:                r.Risks,
			Status:               "pending",
		})
	}

	return nil
}

func extractJSON(content string) string {
	// Find JSON object in the response
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")

	if start >= 0 && end > start {
		return content[start : end+1]
	}
	return content
}

// Rule-based fallback functions
func generateRuleBasedAnalysis(req *AnalysisRequest) *AnalysisResponse {
	resp := &AnalysisResponse{
		Confidence: 0.7,
		ModelUsed:  "rule-based",
	}

	// Analyze patterns and generate insights
	var causes []string
	var actions []string

	for _, p := range req.ErrorPatterns {
		switch p.Category {
		case "client_closed":
			causes = append(causes, "Slow backend responses causing clients to timeout")
			actions = append(actions, "Review proxy_read_timeout and upstream response times")
		case "bad_gateway":
			causes = append(causes, "Upstream server unavailability")
			actions = append(actions, "Check upstream health and enable proxy_next_upstream")
		case "gateway_timeout":
			causes = append(causes, "Backend response time exceeds timeout limits")
			actions = append(actions, "Increase proxy_read_timeout or optimize backend")
		case "service_unavailable":
			causes = append(causes, "Server overload or maintenance mode")
			actions = append(actions, "Scale horizontally or review rate limiting")
		}
	}

	if len(causes) > 0 {
		resp.RootCauseAnalysis = strings.Join(causes, "; ")
	} else {
		resp.RootCauseAnalysis = "Multiple error patterns detected - review individual patterns"
	}

	resp.RecommendedActions = actions
	resp.ImpactAssessment = "medium: Affects subset of traffic"

	return resp
}

func generateRuleBasedRecommendations(req *RecommendationRequest) *RecommendationResponse {
	resp := &RecommendationResponse{
		Confidence: 0.7,
	}

	for _, p := range req.ErrorPatterns {
		switch p.Category {
		case "client_closed":
			resp.Recommendations = append(resp.Recommendations, AIRecommendation{
				ID:       "rec-499",
				Title:    "Reduce 499 Errors with Timeout Tuning",
				Category: "performance",
				Impact:   "high",
				Problem:  fmt.Sprintf("%.0f%% of errors are 499 (client closed)", float64(p.OccurrenceCount)),
				Solution: "Increase proxy timeouts and enable keepalive",
				SuggestedConfig: `proxy_connect_timeout 60s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

upstream backend {
    keepalive 32;
    keepalive_timeout 60s;
}`,
				EstimatedImprovement: "50-70% reduction in 499 errors",
				Status:               "pending",
			})
		case "bad_gateway":
			resp.Recommendations = append(resp.Recommendations, AIRecommendation{
				ID:       "rec-502",
				Title:    "Enable Upstream Health Checks",
				Category: "reliability",
				Impact:   "critical",
				Problem:  "502 errors indicate upstream failures",
				Solution: "Configure failover and health checks",
				SuggestedConfig: `upstream backend {
    server backend1:8080 max_fails=3 fail_timeout=30s;
    server backend2:8080 max_fails=3 fail_timeout=30s;
}

proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 3;`,
				EstimatedImprovement: "Near-zero 502 errors with healthy upstreams",
				Status:               "pending",
			})
		}
	}

	return resp
}
