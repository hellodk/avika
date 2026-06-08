package main

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/codes"
)

type SLOTarget struct {
	ID          string    `json:"id"`
	EntityType  string    `json:"entity_type"` // global, group, agent
	EntityID    string    `json:"entity_id"`
	SLOType     string    `json:"slo_type"` // availability, latency, success_rate, availability_no_4xx, latency_p95, latency_p50
	TargetValue float64   `json:"target_value"`
	TimeWindow  string    `json:"time_window"` // 7d, 30d
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpsertSLOTarget creates or updates an SLO target
func (db *DB) UpsertSLOTarget(ctx context.Context, target *SLOTarget) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "slo_targets")
	defer span.End()
	query := `
	INSERT INTO slo_targets (entity_type, entity_id, slo_type, target_value, time_window, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (entity_type, entity_id, slo_type, time_window) DO UPDATE SET
		target_value = EXCLUDED.target_value,
		updated_at = CURRENT_TIMESTAMP
	RETURNING id, created_at, updated_at;
	`
	err := db.conn.QueryRowContext(ctx, query, target.EntityType, target.EntityID, target.SLOType, target.TargetValue, target.TimeWindow).
		Scan(&target.ID, &target.CreatedAt, &target.UpdatedAt)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// ListSLOTargets returns all SLO targets
func (db *DB) ListSLOTargets(ctx context.Context) ([]SLOTarget, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "slo_targets")
	defer span.End()
	query := `SELECT id, entity_type, entity_id, slo_type, target_value, time_window, created_at, updated_at FROM slo_targets ORDER BY created_at DESC;`
	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	defer rows.Close()

	var targets []SLOTarget
	for rows.Next() {
		var t SLOTarget
		if err := rows.Scan(&t.ID, &t.EntityType, &t.EntityID, &t.SLOType, &t.TargetValue, &t.TimeWindow, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		targets = append(targets, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration: %w", err)
	}
	return targets, nil
}

// DeleteSLOTarget removes an SLO target
func (db *DB) DeleteSLOTarget(ctx context.Context, id string) error {
	ctx, span := db.dbSpan(ctx, "DELETE", "slo_targets")
	defer span.End()
	_, err := db.conn.ExecContext(ctx, "DELETE FROM slo_targets WHERE id = $1", id)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}
