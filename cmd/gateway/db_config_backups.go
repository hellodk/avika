package main

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/codes"
)

type ConfigBackup struct {
	ID               int       `json:"id"`
	AgentID          string    `json:"agent_id"`
	BackupType       string    `json:"backup_type"`
	ConfigContent    string    `json:"config_content,omitempty"`
	CertificatesJSON []byte    `json:"certificates_json,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

// ListConfigBackups returns a list of recent config backups for an agent, excluding the heavy content fields.
func (db *DB) ListConfigBackups(ctx context.Context, agentID string, limit int) ([]ConfigBackup, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "config_backups")
	defer span.End()
	query := `
		SELECT id, agent_id, backup_type, created_at
		FROM config_backups
		WHERE agent_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`
	rows, err := db.conn.QueryContext(ctx, query, agentID, limit)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	defer rows.Close()

	var backups []ConfigBackup
	for rows.Next() {
		var b ConfigBackup
		if err := rows.Scan(&b.ID, &b.AgentID, &b.BackupType, &b.CreatedAt); err != nil {
			return nil, err
		}
		backups = append(backups, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration: %w", err)
	}
	return backups, nil
}

// GetConfigBackup fetches a complete config backup including its content.
func (db *DB) GetConfigBackup(ctx context.Context, id int) (*ConfigBackup, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "config_backups")
	defer span.End()
	query := `
		SELECT id, agent_id, backup_type, config_content, certificates_json, created_at
		FROM config_backups
		WHERE id = $1
	`
	var b ConfigBackup
	err := db.conn.QueryRowContext(ctx, query, id).Scan(
		&b.ID, &b.AgentID, &b.BackupType, &b.ConfigContent, &b.CertificatesJSON, &b.CreatedAt,
	)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &b, nil
}
