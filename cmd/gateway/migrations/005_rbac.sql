-- Migration: 005_rbac.sql
-- Description: Add RBAC extensions to users table and audit logging

-- Extend users table for RBAC and external auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_provider VARCHAR(50) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);
CREATE INDEX IF NOT EXISTS idx_users_identity_provider ON users(identity_provider);
CREATE INDEX IF NOT EXISTS idx_users_is_superadmin ON users(is_superadmin);

-- Make the initial admin user a superadmin
UPDATE users SET is_superadmin = TRUE WHERE username = 'admin';

-- Audit logs table for tracking RBAC-sensitive actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Enrollment tokens for environment-based agent registration
CREATE TABLE IF NOT EXISTS enrollment_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    expires_at TIMESTAMP,
    max_uses INT,
    use_count INT DEFAULT 0,
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_env ON enrollment_tokens(environment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_tokens_hash ON enrollment_tokens(token_hash);

-- View for easy user access lookup
CREATE OR REPLACE VIEW user_project_access AS
SELECT DISTINCT
    tm.username,
    p.id as project_id,
    p.name as project_name,
    p.slug as project_slug,
    tpa.permission,
    t.id as team_id,
    t.name as team_name
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
JOIN team_project_access tpa ON t.id = tpa.team_id
JOIN projects p ON tpa.project_id = p.id;

-- View for server access (which servers a user can see)
CREATE OR REPLACE VIEW user_server_access AS
SELECT DISTINCT
    tm.username,
    sa.agent_id,
    e.id as environment_id,
    e.name as environment_name,
    p.id as project_id,
    p.name as project_name,
    tpa.permission
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
JOIN team_project_access tpa ON t.id = tpa.team_id
JOIN projects p ON tpa.project_id = p.id
JOIN environments e ON e.project_id = p.id
JOIN server_assignments sa ON sa.environment_id = e.id;
