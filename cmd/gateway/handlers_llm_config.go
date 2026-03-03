package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

type llmConfigHTTP struct {
	Provider         string  `json:"provider"`
	APIKey           string  `json:"api_key,omitempty"` // write-only
	APIKeySet        bool    `json:"api_key_set"`
	Model            string  `json:"model"`
	BaseURL          string  `json:"base_url"`
	MaxTokens        int     `json:"max_tokens"`
	Temperature      float32 `json:"temperature"`
	TimeoutSeconds   int     `json:"timeout_seconds"`
	RetryAttempts    int     `json:"retry_attempts"`
	RateLimitRPM     int     `json:"rate_limit_rpm"`
	FallbackProvider string  `json:"fallback_provider"`
	EnableCaching    bool    `json:"enable_caching"`
	CacheTTLMinutes  int     `json:"cache_ttl_minutes"`
	Enabled          bool    `json:"enabled"`
}

// GET /api/llm/config
func (srv *server) handleGetLLMConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var cfg *LLMConfig
	if srv.db != nil {
		dbCfg, err := srv.db.GetActiveLLMClientConfig(ctx)
		if err == nil && dbCfg != nil {
			cfg = dbCfg
		}
	}
	if cfg == nil {
		cfg = LoadLLMConfigFromConfig(&srv.config.LLM)
	}

	out := llmConfigHTTP{
		Provider:         cfg.Provider,
		APIKeySet:        strings.TrimSpace(cfg.APIKey) != "",
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
		Enabled:          cfg.Provider != "mock",
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// PUT /api/llm/config
func (srv *server) handlePutLLMConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// Enforce superadmin only
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var body llmConfigHTTP
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Provider) == "" {
		http.Error(w, `{"error":"provider is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	apiKey := strings.TrimSpace(body.APIKey)
	if apiKey == "" && srv.db != nil {
		// Keep existing key if not provided.
		existing, err := srv.db.GetActiveLLMClientConfig(ctx)
		if err == nil && existing != nil {
			apiKey = existing.APIKey
		}
	}

	row := &LLMConfigRow{
		Provider:         strings.TrimSpace(body.Provider),
		APIKey:           apiKey,
		Model:            strings.TrimSpace(body.Model),
		BaseURL:          strings.TrimSpace(body.BaseURL),
		MaxTokens:        body.MaxTokens,
		Temperature:      body.Temperature,
		TimeoutSeconds:   body.TimeoutSeconds,
		RetryAttempts:    body.RetryAttempts,
		RateLimitRPM:     body.RateLimitRPM,
		FallbackProvider: strings.TrimSpace(body.FallbackProvider),
		EnableCaching:    body.EnableCaching,
		CacheTTLMinutes:  body.CacheTTLMinutes,
		Enabled:          true,
	}

	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}
	if err := srv.db.UpsertActiveLLMConfig(ctx, row); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Rebuild LLM client and apply.
	newClient, err := NewLLMClient(&LLMConfig{
		Provider:         row.Provider,
		APIKey:           row.APIKey,
		Model:            row.Model,
		BaseURL:          row.BaseURL,
		MaxTokens:        defaultInt(row.MaxTokens, 4096),
		Temperature:      defaultFloat32(row.Temperature, 0.7),
		TimeoutSeconds:   defaultInt(row.TimeoutSeconds, 30),
		RetryAttempts:    defaultInt(row.RetryAttempts, 2),
		RateLimitRPM:     defaultInt(row.RateLimitRPM, 60),
		FallbackProvider: row.FallbackProvider,
		EnableCaching:    row.EnableCaching,
		CacheTTLMinutes:  defaultInt(row.CacheTTLMinutes, 60),
	})
	if err == nil && srv.errorAnalysisAPI != nil && newClient != nil {
		srv.errorAnalysisAPI.SetLLMClient(newClient)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"provider": row.Provider,
		"model":    row.Model,
	})
}

// POST /api/llm/test
func (srv *server) handleTestLLM(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var cfg *LLMConfig
	if srv.db != nil {
		dbCfg, err := srv.db.GetActiveLLMClientConfig(ctx)
		if err == nil && dbCfg != nil {
			cfg = dbCfg
		}
	}
	if cfg == nil {
		cfg = LoadLLMConfigFromConfig(&srv.config.LLM)
	}

	client, err := NewLLMClient(cfg)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadRequest)
		return
	}

	hErr := client.HealthCheck(ctx)

	resp := map[string]interface{}{
		"provider": client.GetProviderName(),
		"model":    client.GetModelName(),
		"success":  hErr == nil,
	}
	if hErr != nil {
		resp["error"] = hErr.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
