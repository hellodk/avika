-- Migration: 016_slo_targets.sql

CREATE TABLE IF NOT EXISTS slo_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'global', 'group', 'agent'
    entity_id VARCHAR(255) NOT NULL,
    slo_type VARCHAR(50) NOT NULL, -- availability, latency, success_rate, availability_no_4xx, latency_p95, latency_p50
    target_value DOUBLE PRECISION NOT NULL,
    time_window VARCHAR(50) NOT NULL DEFAULT '30d',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id, slo_type, time_window)
);

CREATE INDEX IF NOT EXISTS idx_slo_targets_entity ON slo_targets(entity_type, entity_id);
