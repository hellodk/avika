-- Migration: 002_seed_users
-- Description: Create default users for Avika Gateway
-- Created: 2026-02-17

-- ============================================================================
-- DEFAULT USERS
-- These users are created only if they don't exist
-- Password hashes are SHA-256
-- ============================================================================

-- Default admin user (password: admin)
-- SHA-256 hash of "admin": 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'admin', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Superuser (password: superuser)
-- SHA-256 hash of "superuser": 382132701c4733c3402706cfdd3c8fc7f41f80a88dce5428d145259a41c5f12f
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('superuser', '382132701c4733c3402706cfdd3c8fc7f41f80a88dce5428d145259a41c5f12f', 'superuser', TRUE)
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- DEFAULT SETTINGS
-- ============================================================================

-- Mark that initial setup has been completed
INSERT INTO settings (key, value, description)
VALUES ('init_completed', 'true', 'Indicates initial database setup has been completed')
ON CONFLICT (key) DO NOTHING;

-- Application version tracking
INSERT INTO settings (key, value, description)
VALUES ('schema_version', '002', 'Current database schema version')
ON CONFLICT (key) DO UPDATE SET value = '002', updated_at = CURRENT_TIMESTAMP;
