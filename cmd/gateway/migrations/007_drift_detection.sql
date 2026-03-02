-- Migration: 007_drift_detection.sql
-- Description: Add tables for configuration drift detection

-- ============================================================================
-- CONFIG SNAPSHOTS TABLE
-- Stores configuration hashes for drift detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    snapshot_type VARCHAR(50) NOT NULL, -- 'nginx_main_conf', 'nginx_site_config', 'ssl_cert', 'maintenance_page'
    file_path TEXT,
    content_hash VARCHAR(64) NOT NULL,
    content TEXT, -- Optionally store full content for diff
    file_size BIGINT,
    file_modified_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_snapshots_agent ON config_snapshots(agent_id);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_type ON config_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_captured ON config_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_agent_type ON config_snapshots(agent_id, snapshot_type);

-- ============================================================================
-- DRIFT REPORTS TABLE
-- Stores drift detection results
-- ============================================================================
CREATE TABLE IF NOT EXISTS drift_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL, -- 'group', 'environment', 'cross_environment'
    target_id UUID NOT NULL, -- group_id, environment_id
    check_type VARCHAR(50) NOT NULL, -- 'nginx_main_conf', 'ssl_certs', etc.
    baseline_type VARCHAR(50) NOT NULL, -- 'golden_agent', 'majority', 'template'
    baseline_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
    baseline_hash VARCHAR(64),
    total_agents INTEGER DEFAULT 0,
    in_sync_count INTEGER DEFAULT 0,
    drifted_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    items JSONB DEFAULT '[]', -- Array of drift items
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_drift_reports_target ON drift_reports(target_id);
CREATE INDEX IF NOT EXISTS idx_drift_reports_type ON drift_reports(report_type, check_type);
CREATE INDEX IF NOT EXISTS idx_drift_reports_created ON drift_reports(created_at DESC);

-- ============================================================================
-- AGENT CONFIG OVERRIDES TABLE
-- Stores intentional configuration differences for specific agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_config_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    override_type VARCHAR(50) NOT NULL, -- 'append', 'replace', 'variable', 'exclude'
    target_context VARCHAR(100), -- 'http', 'server:example.com', 'location:/api'
    content TEXT NOT NULL,
    reason TEXT, -- Documentation for why this override exists
    exclude_from_drift BOOLEAN DEFAULT true, -- Don't flag as drift
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_overrides_agent ON agent_config_overrides(agent_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_agent_overrides_updated_at ON agent_config_overrides;
CREATE TRIGGER update_agent_overrides_updated_at
    BEFORE UPDATE ON agent_config_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cleanup job: Delete expired drift reports (to be run periodically)
-- This can be called via: SELECT cleanup_expired_drift_reports();
CREATE OR REPLACE FUNCTION cleanup_expired_drift_reports()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM drift_reports WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
