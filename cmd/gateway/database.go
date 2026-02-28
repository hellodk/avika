package main

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"github.com/avika-ai/avika/cmd/gateway/migrations"
)

type DB struct {
	conn *sql.DB
}

func NewDB(dsn string) (*DB, error) {
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping db: %w", err)
	}

	db := &DB{conn: conn}
	
	// Run embedded SQL migrations
	runner := migrations.NewRunner(conn)
	if err := runner.Run(); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}
	
	// Log current schema version
	if version, err := runner.GetCurrentVersion(); err == nil {
		log.Printf("Database schema version: %s", version)
	}

	return db, nil
}

// migrate is deprecated - migrations are now handled by embedded SQL files in migrations/
// This function is kept for backwards compatibility but does nothing
func (db *DB) migrate() error {
	// Migrations are now handled by migrations.Runner
	// See cmd/gateway/migrations/*.sql for schema definitions
	return nil
}

// GetSetting retrieves a setting value by key
func (db *DB) GetSetting(key string) (string, error) {
	var value string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = $1", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetSetting stores or updates a setting value
func (db *DB) SetSetting(key, value string) error {
	query := `
	INSERT INTO settings (key, value, updated_at)
	VALUES ($1, $2, CURRENT_TIMESTAMP)
	ON CONFLICT (key) DO UPDATE SET
		value = EXCLUDED.value,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.Exec(query, key, value)
	return err
}

// UserRecord represents a user in the database
type UserRecord struct {
	Username     string
	PasswordHash string
	Role         string
}

// GetUser retrieves a user by username
func (db *DB) GetUser(username string) (*UserRecord, error) {
	var user UserRecord
	err := db.conn.QueryRow(
		"SELECT username, password_hash, role FROM users WHERE username = $1",
		username,
	).Scan(&user.Username, &user.PasswordHash, &user.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpsertUser creates or updates a user
func (db *DB) UpsertUser(username, passwordHash, role string) error {
	query := `
	INSERT INTO users (username, password_hash, role, created_at, updated_at)
	VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (username) DO UPDATE SET
		password_hash = EXCLUDED.password_hash,
		role = EXCLUDED.role,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.Exec(query, username, passwordHash, role)
	return err
}

// UpdateUserPassword updates a user's password
func (db *DB) UpdateUserPassword(username, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`
	_, err := db.conn.Exec(query, passwordHash, username)
	return err
}

// ListUsers returns all users
func (db *DB) ListUsers() ([]*UserRecord, error) {
	rows, err := db.conn.Query("SELECT username, password_hash, role FROM users")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*UserRecord
	for rows.Next() {
		var user UserRecord
		if err := rows.Scan(&user.Username, &user.PasswordHash, &user.Role); err != nil {
			continue
		}
		users = append(users, &user)
	}
	return users, nil
}

func (db *DB) UpsertAgent(session *AgentSession) error {
	// We use ip as the unique identifier for a node to prevent duplicates.
	// If an agent reconnects with a new agent_id but same ip, we update the record.
	query := `
	INSERT INTO agents (agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version, psk_authenticated)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (agent_id) DO UPDATE SET
		hostname = EXCLUDED.hostname,
		version = EXCLUDED.version,
		instances_count = EXCLUDED.instances_count,
		uptime = EXCLUDED.uptime,
		ip = EXCLUDED.ip,
		status = EXCLUDED.status,
		last_seen = EXCLUDED.last_seen,
		is_pod = EXCLUDED.is_pod,
		pod_ip = EXCLUDED.pod_ip,
		agent_version = EXCLUDED.agent_version,
		psk_authenticated = EXCLUDED.psk_authenticated;
	`
	_, err := db.conn.Exec(query,
		session.id,
		session.hostname,
		session.version,
		session.instancesCount,
		session.uptime,
		session.ip,
		session.status,
		session.lastActive.Unix(),
		session.isPod,
		session.podIP,
		session.agentVersion,
		session.pskAuthenticated,
	)
	return err
}

func (db *DB) UpdateAgentStatus(agentID string, status string, lastSeen int64) error {
	query := `UPDATE agents SET status = $1, last_seen = $2 WHERE agent_id = $3`
	_, err := db.conn.Exec(query, status, lastSeen, agentID)
	return err
}

func (db *DB) RemoveAgent(agentID string) error {
	query := `DELETE FROM agents WHERE agent_id = $1`
	_, err := db.conn.Exec(query, agentID)
	return err
}

func (db *DB) LoadAgents(sessions *sync.Map) error {
	rows, err := db.conn.Query("SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version, psk_authenticated FROM agents")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, hostname, version, uptime, ip, status, podIP, agentVersion string
		var instancesCount int
		var lastSeen int64
		var isPod, pskAuthenticated bool

		if err := rows.Scan(&id, &hostname, &version, &instancesCount, &uptime, &ip, &status, &lastSeen, &isPod, &podIP, &agentVersion, &pskAuthenticated); err != nil {
			log.Printf("Failed to scan agent row: %v", err)
			continue
		}

		session := &AgentSession{
			id:               id,
			hostname:         hostname,
			version:          version,
			instancesCount:   instancesCount,
			uptime:           uptime,
			ip:               ip,
			status:           status,
			lastActive:       time.Unix(lastSeen, 0),
			isPod:            isPod,
			podIP:            podIP,
			agentVersion:     agentVersion,
			pskAuthenticated: pskAuthenticated,
			logChans:         make(map[string]chan *pb.LogEntry),
		}
		sessions.Store(id, session)
	}
	return nil
}

func (db *DB) PruneStaleAgents(maxAge time.Duration) ([]string, error) {
	threshold := time.Now().Add(-maxAge).Unix()

	// Get IDs before deleting for cascaded cleanup in ClickHouse
	var ids []string
	rows, err := db.conn.Query("SELECT agent_id FROM agents WHERE status = 'offline' AND last_seen < $1", threshold)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
			}
		}
	}

	query := `DELETE FROM agents WHERE status = 'offline' AND last_seen < $1`
	_, err = db.conn.Exec(query, threshold)
	if err != nil {
		return nil, err
	}
	return ids, nil
}

func (db *DB) UpsertAlertRule(rule *pb.AlertRule) error {
	query := `
	INSERT INTO alert_rules (id, name, metric_type, threshold, comparison, window_sec, enabled, recipients)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (id) DO UPDATE SET
		name = EXCLUDED.name,
		metric_type = EXCLUDED.metric_type,
		threshold = EXCLUDED.threshold,
		comparison = EXCLUDED.comparison,
		window_sec = EXCLUDED.window_sec,
		enabled = EXCLUDED.enabled,
		recipients = EXCLUDED.recipients;
	`
	_, err := db.conn.Exec(query,
		rule.Id,
		rule.Name,
		rule.MetricType,
		rule.Threshold,
		rule.Comparison,
		rule.WindowSec,
		rule.Enabled,
		rule.Recipients,
	)
	return err
}

func (db *DB) DeleteAlertRule(id string) error {
	query := `DELETE FROM alert_rules WHERE id = $1`
	_, err := db.conn.Exec(query, id)
	return err
}

func (db *DB) ListAlertRules() ([]*pb.AlertRule, error) {
	rows, err := db.conn.Query("SELECT id, name, metric_type, threshold, comparison, window_sec, enabled, recipients FROM alert_rules")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []*pb.AlertRule
	for rows.Next() {
		rule := &pb.AlertRule{}
		if err := rows.Scan(&rule.Id, &rule.Name, &rule.MetricType, &rule.Threshold, &rule.Comparison, &rule.WindowSec, &rule.Enabled, &rule.Recipients); err != nil {
			log.Printf("Failed to scan alert rule row: %v", err)
			continue
		}
		rules = append(rules, rule)
	}
	return rules, nil
}
