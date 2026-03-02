-- Migration: 006_agent_groups.sql
-- Description: Add agent groups for operational grouping within environments

-- ============================================================================
-- AGENT GROUPS TABLE
-- Groups provide operational grouping of agents within an environment
-- Agents in the same group are expected to have identical configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    golden_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
    expected_config_hash VARCHAR(64),
    drift_check_enabled BOOLEAN DEFAULT true,
    drift_check_interval_seconds INTEGER DEFAULT 300,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(environment_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_agent_groups_environment ON agent_groups(environment_id);
CREATE INDEX IF NOT EXISTS idx_agent_groups_slug ON agent_groups(slug);

-- Add group_id to server_assignments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'server_assignments' AND column_name = 'group_id') THEN
        ALTER TABLE server_assignments ADD COLUMN group_id UUID REFERENCES agent_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_server_assignments_group ON server_assignments(group_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_agent_groups_updated_at ON agent_groups;
CREATE TRIGGER update_agent_groups_updated_at
    BEFORE UPDATE ON agent_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
