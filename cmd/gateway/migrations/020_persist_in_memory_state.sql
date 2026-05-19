-- Migration 020: Persist in-memory state to survive pod restarts
--
-- Three in-memory stores were lost on pod restart:
-- 1. users.require_pass_change (security: forced password-change bypass after restart)
-- 2. oidc_states (mid-flow OIDC logins failed after restart — CSRF state gone)
-- 3. alert_rules.last_fired_at (cooldown reset → alert spam after restart)

-- 1. Force-password-change flag per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_pass_change BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. OIDC CSRF state persistence (TTL enforced on load, cleaned up every 5 min)
CREATE TABLE IF NOT EXISTS oidc_states (
    state        TEXT        PRIMARY KEY,
    redirect_uri TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oidc_states_created_at ON oidc_states (created_at);

-- 3. Alert cooldown persistence
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ;
