-- Migration: 016_historical_agents_fix
-- Description: Re-create historical_agents table because 015 had a DROP TABLE in it that was executed simultaneously by the custom migration runner.

CREATE TABLE IF NOT EXISTS historical_agents (
    agent_id TEXT PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    ip VARCHAR(45),
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
