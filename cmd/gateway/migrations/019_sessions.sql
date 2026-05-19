-- Migration 019: Persistent session storage
--
-- The auth manager previously stored session tokens in an in-memory map.
-- Tokens were lost on every pod restart, silently invalidating all browser
-- sessions even though cookies remained in the browser.
--
-- This table backs the in-memory cache: when a token is not found in memory
-- (after a restart), the auth manager falls through to the database. The
-- in-memory cache stays as a fast-path read.

CREATE TABLE IF NOT EXISTS sessions (
    token               TEXT PRIMARY KEY,
    username            VARCHAR(100) NOT NULL,
    role                VARCHAR(50)  NOT NULL,
    expires_at          TIMESTAMP    NOT NULL,
    require_pass_change BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup of expired tokens.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Index for revoking all sessions for a user (e.g., on password change).
CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions (username);
