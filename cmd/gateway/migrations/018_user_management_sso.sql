-- Migration 018: User management improvements + SSO configuration table
--
-- Adds:
-- 1. sso_config table for runtime SSO/LDAP/SAML configuration (hybrid with env vars)
-- 2. Index on users.is_active for fast deactivated-user filtering

-- ============================================================================
-- SSO Configuration (hybrid approach: non-sensitive config in DB, secrets in env)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sso_config (
    provider    VARCHAR(20) PRIMARY KEY,          -- 'oidc', 'ldap', 'saml'
    config      JSONB NOT NULL DEFAULT '{}',      -- non-sensitive settings (URLs, mappings, scopes)
    is_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by  VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    CONSTRAINT valid_provider CHECK (provider IN ('oidc', 'ldap', 'saml'))
);

-- Seed default rows so GET always returns a record
INSERT INTO sso_config (provider, config, is_enabled) VALUES
    ('oidc', '{}', false),
    ('ldap', '{}', false),
    ('saml', '{}', false)
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- Index on users.is_active for the user management list endpoint
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
