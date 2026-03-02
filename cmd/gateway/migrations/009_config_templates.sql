-- Migration: 009_config_templates.sql
-- Description: Add tables for configuration templates and batch updates

-- ============================================================================
-- CONFIG TEMPLATES TABLE
-- Reusable configuration templates with variable substitution
-- ============================================================================
CREATE TABLE IF NOT EXISTS config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
    group_id UUID REFERENCES agent_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL, -- 'nginx_main_conf', 'server_block', 'location_block', 'upstream_block', 'ssl_params'
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- Array of variable definitions
    defaults JSONB DEFAULT '{}', -- Default values for variables
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure template is scoped to at most one level
    CONSTRAINT config_templates_single_scope CHECK (
        (CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN environment_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN group_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
    )
);

CREATE INDEX IF NOT EXISTS idx_config_templates_project ON config_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_config_templates_environment ON config_templates(environment_id);
CREATE INDEX IF NOT EXISTS idx_config_templates_group ON config_templates(group_id);
CREATE INDEX IF NOT EXISTS idx_config_templates_type ON config_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_config_templates_active ON config_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- AGENT CONFIG ASSIGNMENTS TABLE
-- Tracks which templates are applied to which agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_config_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES config_templates(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    applied_content_hash VARCHAR(64),
    rendered_variables JSONB DEFAULT '{}', -- Variables used when applied
    status VARCHAR(50) DEFAULT 'applied', -- 'applied', 'pending', 'failed', 'drifted'
    UNIQUE(agent_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_assignments_agent ON agent_config_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_assignments_template ON agent_config_assignments(template_id);

-- ============================================================================
-- BATCH CONFIG UPDATES TABLE
-- Tracks batch configuration update operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch_config_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'partial_failure', 'failed', 'cancelled', 'rolled_back'
    strategy VARCHAR(50) NOT NULL, -- 'parallel', 'rolling', 'canary'
    target_type VARCHAR(50) NOT NULL, -- 'agents', 'group', 'environment'
    target_id TEXT NOT NULL, -- Comma-separated agent IDs, group UUID, or environment UUID
    template_id UUID REFERENCES config_templates(id) ON DELETE SET NULL,
    raw_content TEXT, -- Direct content if not using template
    source_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL, -- Copy from specific agent
    variables JSONB DEFAULT '{}',
    total_agents INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    current_batch INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    batch_size INTEGER DEFAULT 1,
    pause_between_batches_seconds INTEGER DEFAULT 30,
    canary_percentage INTEGER,
    canary_duration_seconds INTEGER,
    rollback_on_fail BOOLEAN DEFAULT true,
    results JSONB DEFAULT '[]', -- Array of agent results
    error TEXT,
    description TEXT,
    requested_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_batch_updates_status ON batch_config_updates(status);
CREATE INDEX IF NOT EXISTS idx_batch_updates_started ON batch_config_updates(started_at DESC);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_config_templates_updated_at ON config_templates;
CREATE TRIGGER update_config_templates_updated_at
    BEFORE UPDATE ON config_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
