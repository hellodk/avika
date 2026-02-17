-- Migration: 001_init_schema
-- Description: Initialize core database schema for Avika Gateway
-- Created: 2026-02-17

-- ============================================================================
-- AGENTS TABLE
-- Stores information about registered NGINX agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    hostname TEXT,
    version TEXT,
    instances_count INT DEFAULT 0,
    uptime TEXT,
    ip TEXT,
    status TEXT DEFAULT 'unknown',
    last_seen BIGINT,
    is_pod BOOLEAN DEFAULT FALSE,
    pod_ip TEXT,
    agent_version TEXT,
    psk_authenticated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add columns if they don't exist (for upgrades from older versions)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'is_pod') THEN
        ALTER TABLE agents ADD COLUMN is_pod BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'pod_ip') THEN
        ALTER TABLE agents ADD COLUMN pod_ip TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'agent_version') THEN
        ALTER TABLE agents ADD COLUMN agent_version TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'psk_authenticated') THEN
        ALTER TABLE agents ADD COLUMN psk_authenticated BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);

-- ============================================================================
-- ALERT RULES TABLE
-- Stores alerting configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    threshold FLOAT NOT NULL,
    comparison TEXT NOT NULL,
    window_sec INT DEFAULT 60,
    enabled BOOLEAN DEFAULT TRUE,
    recipients TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SETTINGS TABLE
-- Key-value store for application settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- USERS TABLE
-- Stores user accounts for authentication
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',
    email TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add columns if they don't exist (for upgrades from older versions)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
        ALTER TABLE users ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
    END IF;
END $$;

-- Create index for active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- SCHEMA MIGRATIONS TABLE
-- Tracks which migrations have been applied
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
