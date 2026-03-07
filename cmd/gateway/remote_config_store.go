package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

type LLMConfigRow struct {
	Provider         string
	APIKey           string
	Model            string
	BaseURL          string
	MaxTokens        int
	Temperature      float32
	TimeoutSeconds   int
	RetryAttempts    int
	RateLimitRPM     int
	FallbackProvider string
	EnableCaching    bool
	CacheTTLMinutes  int
	Enabled          bool
}

type IntegrationConfigRow struct {
	Type       string                 `json:"type"`
	Config     map[string]interface{} `json:"config"`
	IsEnabled  bool                   `json:"is_enabled"`
	UpdatedAt  *time.Time             `json:"updated_at,omitempty"`
	LastTested *time.Time             `json:"last_tested_at,omitempty"`
	TestResult map[string]interface{} `json:"test_result,omitempty"`
}

const (
	plainPrefix = "plain:"
	encPrefixV1 = "enc:v1:"
)

func (db *DB) GetActiveLLMClientConfig(ctx context.Context) (*LLMConfig, error) {
	row := db.conn.QueryRowContext(ctx, `
		SELECT provider, api_key_encrypted, COALESCE(model,''), COALESCE(base_url,''),
		       COALESCE(max_tokens,4096), COALESCE(temperature,0.7), COALESCE(timeout_seconds,30),
		       COALESCE(retry_attempts,2), COALESCE(rate_limit_rpm,60), COALESCE(fallback_provider,''),
		       COALESCE(enable_caching,true), COALESCE(cache_ttl_minutes,60), COALESCE(is_active,true)
		FROM llm_config
		WHERE is_active = true
		ORDER BY updated_at DESC
		LIMIT 1
	`)

	var provider, apiKeyEnc, model, baseURL, fallback string
	var maxTokens, timeoutSec, retryAttempts, rateLimitRPM, cacheTTL int
	var temp float64
	var enableCaching, enabled bool

	err := row.Scan(&provider, &apiKeyEnc, &model, &baseURL, &maxTokens, &temp, &timeoutSec, &retryAttempts, &rateLimitRPM, &fallback, &enableCaching, &cacheTTL, &enabled)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	apiKey, err := decryptConfigSecret(apiKeyEnc)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt llm api key: %w", err)
	}

	return &LLMConfig{
		Provider:         provider,
		APIKey:           apiKey,
		Model:            model,
		BaseURL:          baseURL,
		MaxTokens:        maxTokens,
		Temperature:      float32(temp),
		TimeoutSeconds:   timeoutSec,
		RetryAttempts:    retryAttempts,
		RateLimitRPM:     rateLimitRPM,
		FallbackProvider: fallback,
		EnableCaching:    enableCaching,
		CacheTTLMinutes:  cacheTTL,
	}, nil
}

func (db *DB) UpsertActiveLLMConfig(ctx context.Context, in *LLMConfigRow) error {
	if in == nil {
		return fmt.Errorf("llm config is required")
	}
	if strings.TrimSpace(in.Provider) == "" {
		return fmt.Errorf("provider is required")
	}

	apiKeyEnc, err := encryptConfigSecret(in.APIKey)
	if err != nil {
		return err
	}

	// Make all existing rows inactive to ensure single active config.
	if _, err := db.conn.ExecContext(ctx, `UPDATE llm_config SET is_active = false WHERE is_active = true`); err != nil {
		return err
	}

	_, err = db.conn.ExecContext(ctx, `
		INSERT INTO llm_config (
			provider, api_key_encrypted, model, base_url, max_tokens, temperature,
			timeout_seconds, retry_attempts, rate_limit_rpm, fallback_provider,
			enable_caching, cache_ttl_minutes, is_active, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW(), NOW()
		)
	`, in.Provider, apiKeyEnc, nullIfEmptyText(in.Model), nullIfEmptyText(in.BaseURL), defaultInt(in.MaxTokens, 4096),
		defaultFloat32(in.Temperature, 0.7), defaultInt(in.TimeoutSeconds, 30), defaultInt(in.RetryAttempts, 2),
		defaultInt(in.RateLimitRPM, 60), nullIfEmptyText(in.FallbackProvider), in.EnableCaching, defaultInt(in.CacheTTLMinutes, 60),
		in.Enabled,
	)
	return err
}

func (db *DB) ListIntegrations(ctx context.Context) ([]IntegrationConfigRow, error) {
	rows, err := db.conn.QueryContext(ctx, `
		SELECT type, config, is_enabled, updated_at, last_tested_at, test_result
		FROM integration_config
		ORDER BY type ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []IntegrationConfigRow
	for rows.Next() {
		var t string
		var cfgBytes, testBytes []byte
		var enabled bool
		var updatedAt, lastTested sql.NullTime

		if err := rows.Scan(&t, &cfgBytes, &enabled, &updatedAt, &lastTested, &testBytes); err != nil {
			continue
		}

		var cfg map[string]interface{}
		_ = json.Unmarshal(cfgBytes, &cfg)
		if cfg == nil {
			cfg = map[string]interface{}{}
		}

		var test map[string]interface{}
		_ = json.Unmarshal(testBytes, &test)

		row := IntegrationConfigRow{
			Type:      t,
			Config:    cfg,
			IsEnabled: enabled,
		}
		if updatedAt.Valid {
			row.UpdatedAt = &updatedAt.Time
		}
		if lastTested.Valid {
			row.LastTested = &lastTested.Time
		}
		if test != nil {
			row.TestResult = test
		}

		out = append(out, row)
	}
	return out, nil
}

func (db *DB) GetIntegration(ctx context.Context, t string) (*IntegrationConfigRow, error) {
	t = strings.TrimSpace(strings.ToLower(t))
	if t == "" {
		return nil, fmt.Errorf("type is required")
	}

	row := db.conn.QueryRowContext(ctx, `
		SELECT type, config, is_enabled, updated_at, last_tested_at, test_result
		FROM integration_config
		WHERE type = $1
	`, t)

	var typ string
	var cfgBytes, testBytes []byte
	var enabled bool
	var updatedAt, lastTested sql.NullTime
	err := row.Scan(&typ, &cfgBytes, &enabled, &updatedAt, &lastTested, &testBytes)
	if err == sql.ErrNoRows {
		return &IntegrationConfigRow{Type: t, Config: map[string]interface{}{}, IsEnabled: false}, nil
	}
	if err != nil {
		return nil, err
	}

	var cfg map[string]interface{}
	_ = json.Unmarshal(cfgBytes, &cfg)
	if cfg == nil {
		cfg = map[string]interface{}{}
	}

	var test map[string]interface{}
	_ = json.Unmarshal(testBytes, &test)

	out := &IntegrationConfigRow{Type: typ, Config: cfg, IsEnabled: enabled}
	if updatedAt.Valid {
		out.UpdatedAt = &updatedAt.Time
	}
	if lastTested.Valid {
		out.LastTested = &lastTested.Time
	}
	if test != nil {
		out.TestResult = test
	}
	return out, nil
}

func (db *DB) UpsertIntegration(ctx context.Context, row *IntegrationConfigRow) error {
	if row == nil {
		return fmt.Errorf("integration is required")
	}
	t := strings.TrimSpace(strings.ToLower(row.Type))
	if t == "" {
		return fmt.Errorf("type is required")
	}
	if row.Config == nil {
		row.Config = map[string]interface{}{}
	}
	b, _ := json.Marshal(row.Config)

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO integration_config(type, config, is_enabled, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (type) DO UPDATE SET
		  config = EXCLUDED.config,
		  is_enabled = EXCLUDED.is_enabled,
		  updated_at = NOW()
	`, t, b, row.IsEnabled)
	return err
}

func (db *DB) SetIntegrationTestResult(ctx context.Context, t string, success bool, details map[string]interface{}) error {
	t = strings.TrimSpace(strings.ToLower(t))
	if t == "" {
		return fmt.Errorf("type is required")
	}
	if details == nil {
		details = map[string]interface{}{}
	}
	details["success"] = success
	details["tested_at"] = time.Now().UTC().Format(time.RFC3339)
	b, _ := json.Marshal(details)

	_, err := db.conn.ExecContext(ctx, `
		UPDATE integration_config
		SET last_tested_at = NOW(), test_result = $2, updated_at = NOW()
		WHERE type = $1
	`, t, b)
	return err
}

func (db *DB) UpsertAgentConfigCache(ctx context.Context, agentID string, cfg *pb.GetAgentConfigResponse) error {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return fmt.Errorf("agent_id is required")
	}
	if cfg == nil {
		cfg = &pb.GetAgentConfigResponse{}
	}
	b, _ := json.Marshal(cfg)
	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO agent_config_cache(agent_id, config, last_synced_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (agent_id) DO UPDATE SET
		  config = EXCLUDED.config,
		  last_synced_at = NOW()
	`, agentID, b)
	return err
}

func encryptConfigSecret(secret string) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return plainPrefix, nil
	}
	key, hasKey, err := getConfigEncryptionKey()
	if err != nil {
		return "", err
	}
	if !hasKey {
		return plainPrefix + secret, nil
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(secret), nil)
	payload := append(nonce, ciphertext...)
	return encPrefixV1 + base64.StdEncoding.EncodeToString(payload), nil
}

func decryptConfigSecret(enc string) (string, error) {
	enc = strings.TrimSpace(enc)
	if enc == "" || enc == plainPrefix {
		return "", nil
	}
	if strings.HasPrefix(enc, plainPrefix) {
		return strings.TrimPrefix(enc, plainPrefix), nil
	}
	if !strings.HasPrefix(enc, encPrefixV1) {
		return "", fmt.Errorf("unknown secret encoding")
	}

	key, hasKey, err := getConfigEncryptionKey()
	if err != nil {
		return "", err
	}
	if !hasKey {
		return "", errors.New("encrypted secret present but CONFIG_ENCRYPTION_KEY is not set")
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(enc, encPrefixV1))
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("invalid encrypted payload")
	}
	nonce := raw[:gcm.NonceSize()]
	ciphertext := raw[gcm.NonceSize():]

	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func getConfigEncryptionKey() ([]byte, bool, error) {
	// Expected: base64-encoded 32 bytes (AES-256).
	val := strings.TrimSpace(os.Getenv("CONFIG_ENCRYPTION_KEY"))
	if val == "" {
		return nil, false, nil
	}
	b, err := base64.StdEncoding.DecodeString(val)
	if err != nil {
		return nil, false, fmt.Errorf("CONFIG_ENCRYPTION_KEY must be base64: %w", err)
	}
	if len(b) != 32 {
		return nil, false, fmt.Errorf("CONFIG_ENCRYPTION_KEY must decode to 32 bytes (got %d)", len(b))
	}
	return b, true, nil
}

func nullIfEmptyText(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func defaultInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func defaultFloat32(v, def float32) float32 {
	if v == 0 {
		return def
	}
	return v
}

var _ = errors.New
