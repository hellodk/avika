package main

import (
	"time"
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
func (db *DB) UpsertSLOTarget(target *SLOTarget) error {
	query := `
	INSERT INTO slo_targets (entity_type, entity_id, slo_type, target_value, time_window, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (entity_type, entity_id, slo_type, time_window) DO UPDATE SET
		target_value = EXCLUDED.target_value,
		updated_at = CURRENT_TIMESTAMP
	RETURNING id, created_at, updated_at;
	`
	return db.conn.QueryRow(query, target.EntityType, target.EntityID, target.SLOType, target.TargetValue, target.TimeWindow).
		Scan(&target.ID, &target.CreatedAt, &target.UpdatedAt)
}

// ListSLOTargets returns all SLO targets
func (db *DB) ListSLOTargets() ([]SLOTarget, error) {
	query := `SELECT id, entity_type, entity_id, slo_type, target_value, time_window, created_at, updated_at FROM slo_targets ORDER BY created_at DESC;`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []SLOTarget
	for rows.Next() {
		var t SLOTarget
		if err := rows.Scan(&t.ID, &t.EntityType, &t.EntityID, &t.SLOType, &t.TargetValue, &t.TimeWindow, &t.CreatedAt, &t.UpdatedAt); err != nil {
			continue
		}
		targets = append(targets, t)
	}
	return targets, nil
}

// DeleteSLOTarget removes an SLO target
func (db *DB) DeleteSLOTarget(id string) error {
	_, err := db.conn.Exec("DELETE FROM slo_targets WHERE id = $1", id)
	return err
}
