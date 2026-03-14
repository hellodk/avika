-- +migrate Up
CREATE TABLE IF NOT EXISTS historical_agents (
    agent_id TEXT PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    ip VARCHAR(45),
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- +migrate Down
DROP TABLE IF EXISTS historical_agents;
