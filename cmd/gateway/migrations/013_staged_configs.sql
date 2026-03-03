-- Migration: Add Staged Configs table
-- Description: Stores configuration changes before they are applied to NGINX instances

CREATE TABLE IF NOT EXISTS staged_configs (
    target_id VARCHAR(100) NOT NULL, -- agent_id or environment_id
    target_type VARCHAR(20) NOT NULL, -- 'agent' or 'environment'
    config_path TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (target_id, config_path)
);

CREATE INDEX IF NOT EXISTS idx_staged_configs_target ON staged_configs(target_id, target_type);
