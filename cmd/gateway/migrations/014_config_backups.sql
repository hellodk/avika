-- Migration: Add Config Backups table
-- Description: Stores snapshots of agent configurations and certificates for point-in-time restoration

CREATE TABLE IF NOT EXISTS config_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    backup_type VARCHAR(20) NOT NULL, -- 'full', 'nginx_conf', 'certificates'
    nginx_conf TEXT,
    certificates JSONB,  -- Array of serialized certificates
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    triggered_by VARCHAR(100),
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_backups_agent ON config_backups(agent_id, created_at DESC);
