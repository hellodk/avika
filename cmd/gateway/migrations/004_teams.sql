-- Migration: 004_teams.sql
-- Description: Add teams and team membership tables for RBAC

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- Team membership table
CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, username),
    CONSTRAINT valid_team_role CHECK (role IN ('admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_username ON team_members(username);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- Team-Project access table (defines which teams can access which projects)
CREATE TABLE IF NOT EXISTS team_project_access (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    granted_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, project_id),
    CONSTRAINT valid_permission CHECK (permission IN ('read', 'write', 'operate', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_team_project_access_project ON team_project_access(project_id);
CREATE INDEX IF NOT EXISTS idx_team_project_access_team ON team_project_access(team_id);

-- Trigger for updated_at on teams
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
