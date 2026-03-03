-- Migration: Add WAF Policies table
-- Description: Stores ModSecurity rules and policies for fleet-wide distribution

CREATE TABLE IF NOT EXISTS waf_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rules TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index on name for quick lookups
CREATE INDEX IF NOT EXISTS idx_waf_policies_name ON waf_policies(name);
