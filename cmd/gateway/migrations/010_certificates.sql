-- Migration: 010_certificates.sql
-- Description: Add tables for enhanced certificate management

-- ============================================================================
-- CERTIFICATE INVENTORY TABLE
-- Central inventory of all SSL certificates
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificate_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL,
    environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
    cert_type VARCHAR(50), -- 'letsencrypt', 'commercial', 'self_signed', 'internal'
    issuer VARCHAR(255),
    serial_number VARCHAR(255),
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    not_before TIMESTAMP WITH TIME ZONE,
    san_domains TEXT[] DEFAULT '{}',
    cert_content_hash VARCHAR(64),
    key_content_hash VARCHAR(64),
    cert_content TEXT, -- PEM content (encrypted or plaintext based on config)
    chain_content TEXT, -- Intermediate certs
    auto_renew BOOLEAN DEFAULT false,
    acme_config JSONB DEFAULT '{}', -- ACME/Let's Encrypt config
    last_renewed TIMESTAMP WITH TIME ZONE,
    renewal_errors TEXT,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_inventory_domain ON certificate_inventory(domain);
CREATE INDEX IF NOT EXISTS idx_cert_inventory_expiry ON certificate_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_cert_inventory_environment ON certificate_inventory(environment_id);
CREATE INDEX IF NOT EXISTS idx_cert_inventory_type ON certificate_inventory(cert_type);

-- ============================================================================
-- CERTIFICATE DEPLOYMENTS TABLE
-- Tracks certificate deployment to agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificate_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificate_inventory(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    cert_path TEXT NOT NULL,
    key_path TEXT NOT NULL,
    chain_path TEXT,
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deployed_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    deployed_content_hash VARCHAR(64), -- Hash of deployed content for drift detection
    status VARCHAR(50) DEFAULT 'deployed', -- 'deployed', 'pending', 'failed', 'removed'
    error TEXT,
    UNIQUE(certificate_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_deployments_agent ON certificate_deployments(agent_id);
CREATE INDEX IF NOT EXISTS idx_cert_deployments_cert ON certificate_deployments(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_deployments_status ON certificate_deployments(status);

-- ============================================================================
-- ENVIRONMENT COMPARISONS TABLE
-- Stores environment comparison results
-- ============================================================================
CREATE TABLE IF NOT EXISTS environment_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    target_environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    compare_types TEXT[] NOT NULL,
    group_mapping JSONB DEFAULT '{}', -- source_group_id -> target_group_id
    result JSONB NOT NULL,
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_env_comparisons_source ON environment_comparisons(source_environment_id);
CREATE INDEX IF NOT EXISTS idx_env_comparisons_target ON environment_comparisons(target_environment_id);
CREATE INDEX IF NOT EXISTS idx_env_comparisons_created ON environment_comparisons(created_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_cert_inventory_updated_at ON certificate_inventory;
CREATE TRIGGER update_cert_inventory_updated_at
    BEFORE UPDATE ON certificate_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
