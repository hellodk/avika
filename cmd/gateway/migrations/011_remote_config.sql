-- Migration: 011_remote_config
-- Description: Persisted remote configuration (LLM + integrations + agent config cache)
-- Created: 2026-03-03

-- ============================================================================
-- LLM CONFIGURATION
-- Stores LLM provider configuration for AI features
-- ============================================================================
CREATE TABLE IF NOT EXISTS llm_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL DEFAULT 'mock', -- openai, anthropic, ollama, azure, mock
    api_key_encrypted TEXT,
    model VARCHAR(100),
    base_url TEXT,
    max_tokens INTEGER DEFAULT 4096,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    timeout_seconds INTEGER DEFAULT 30,
    retry_attempts INTEGER DEFAULT 2,
    rate_limit_rpm INTEGER DEFAULT 60,
    fallback_provider VARCHAR(50),
    enable_caching BOOLEAN DEFAULT true,
    cache_ttl_minutes INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_config_active ON llm_config(is_active);

-- ============================================================================
-- AGENT CONFIG CACHE
-- Cache of agent runtime config for UI display (source of truth remains agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_config_cache (
    agent_id TEXT PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INTEGRATION CONFIGURATION
-- Generic JSON-based configuration store for external integrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS integration_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL UNIQUE, -- smtp, slack, pagerduty, webhook, grafana, etc.
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    test_result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_config_enabled ON integration_config(is_enabled);

