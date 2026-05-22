package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
	"github.com/avika-ai/avika/cmd/gateway/migrations"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	_ "github.com/lib/pq"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type DB struct {
	conn   *sql.DB
	tracer trace.Tracer
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
	db.tracer = otel.Tracer("avika.database")

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

func (db *DB) GetVersion() string {
	var version string
	err := db.conn.QueryRow("SHOW server_version").Scan(&version)
	if err != nil {
		return "unknown"
	}
	return version
}

// dbSpan creates a child span for a database operation using OTel semantic conventions.
func (db *DB) dbSpan(ctx context.Context, op, table string) (context.Context, trace.Span) {
	attrs := []attribute.KeyValue{
		attribute.String("db.system", "postgresql"),
		attribute.String("db.name", "avika"),
		attribute.String("db.operation", op),
	}
	if table != "" {
		attrs = append(attrs, attribute.String("db.sql.table", table))
	}
	return db.tracer.Start(ctx, op+" "+table,
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(attrs...),
	)
}

// GetSetting retrieves a setting value by key
func (db *DB) GetSetting(ctx context.Context, key string) (string, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "settings")
	defer span.End()
	var value string
	err := db.conn.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = $1", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return "", err
	}
	return value, nil
}

// SetSetting stores or updates a setting value
func (db *DB) SetSetting(ctx context.Context, key, value string) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "settings")
	defer span.End()
	query := `
	INSERT INTO settings (key, value, updated_at)
	VALUES ($1, $2, CURRENT_TIMESTAMP)
	ON CONFLICT (key) DO UPDATE SET
		value = EXCLUDED.value,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.ExecContext(ctx, query, key, value)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// UserRecord represents a user in the database
type UserRecord struct {
	Username     string
	PasswordHash string
	Role         string
}

// GetUser retrieves a user by username
func (db *DB) GetUser(ctx context.Context, username string) (*UserRecord, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "users")
	defer span.End()
	var user UserRecord
	err := db.conn.QueryRowContext(ctx,
		"SELECT username, password_hash, role FROM users WHERE username = $1 AND COALESCE(is_active, true) = true",
		username,
	).Scan(&user.Username, &user.PasswordHash, &user.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &user, nil
}

// UpsertUser creates or updates a user
func (db *DB) UpsertUser(ctx context.Context, username, passwordHash, role string) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "users")
	defer span.End()
	query := `
	INSERT INTO users (username, password_hash, role, created_at, updated_at)
	VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (username) DO UPDATE SET
		password_hash = EXCLUDED.password_hash,
		role = EXCLUDED.role,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.ExecContext(ctx, query, username, passwordHash, role)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// UpdateUserPassword updates a user's password
func (db *DB) UpdateUserPassword(ctx context.Context, username, passwordHash string) error {
	ctx, span := db.dbSpan(ctx, "UPDATE", "users")
	defer span.End()
	query := `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`
	_, err := db.conn.ExecContext(ctx, query, passwordHash, username)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// GetUserPassChangeRequired returns whether the user must change their password on next login.
func (db *DB) GetUserPassChangeRequired(ctx context.Context, username string) (bool, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "users")
	defer span.End()
	var required bool
	err := db.conn.QueryRowContext(ctx,
		`SELECT COALESCE(require_pass_change, FALSE) FROM users WHERE username = $1`,
		username,
	).Scan(&required)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return false, err
	}
	return required, nil
}

// ClearUserPassChangeRequired clears the force-password-change flag for a user.
func (db *DB) ClearUserPassChangeRequired(ctx context.Context, username string) error {
	ctx, span := db.dbSpan(ctx, "UPDATE", "users")
	defer span.End()
	_, err := db.conn.ExecContext(ctx, `UPDATE users SET require_pass_change = FALSE, updated_at = CURRENT_TIMESTAMP WHERE username = $1`, username)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// LoadAlertCooldowns returns all non-null last_fired_at values keyed by rule ID.
// Used by AlertEngine at startup to restore cooldowns and prevent alert spam after restart.
func (db *DB) LoadAlertCooldowns(ctx context.Context) (map[string]time.Time, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "alert_rules")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, `SELECT id, last_fired_at FROM alert_rules WHERE last_fired_at IS NOT NULL`)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]time.Time)
	for rows.Next() {
		var id string
		var t time.Time
		if err := rows.Scan(&id, &t); err != nil {
			continue
		}
		result[id] = t
	}
	return result, nil
}

// UpdateAlertLastFired sets last_fired_at for the given alert rule.
func (db *DB) UpdateAlertLastFired(ctx context.Context, ruleID string, t time.Time) error {
	ctx, span := db.dbSpan(ctx, "UPDATE", "alert_rules")
	defer span.End()
	_, err := db.conn.ExecContext(ctx, `UPDATE alert_rules SET last_fired_at = $1 WHERE id = $2`, t, ruleID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// ListUsers returns all users
func (db *DB) ListUsers(ctx context.Context) ([]*UserRecord, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "users")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, "SELECT username, password_hash, role FROM users")
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
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

func (db *DB) UpsertAgent(ctx context.Context, session *AgentSession) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "agents")
	defer span.End()
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
	_, err := db.conn.ExecContext(ctx, query,
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
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (db *DB) UpdateAgentStatus(ctx context.Context, agentID string, status string, lastSeen int64) error {
	ctx, span := db.dbSpan(ctx, "UPDATE", "agents")
	defer span.End()
	query := `UPDATE agents SET status = $1, last_seen = $2 WHERE agent_id = $3`
	_, err := db.conn.ExecContext(ctx, query, status, lastSeen, agentID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (db *DB) RemoveAgent(ctx context.Context, agentID string) error {
	ctx, span := db.dbSpan(ctx, "DELETE", "agents")
	defer span.End()
	// Backup before deleting
	insertQuery := `
	INSERT INTO historical_agents (agent_id, hostname, ip)
	SELECT agent_id, hostname, ip FROM agents WHERE agent_id = $1
	ON CONFLICT (agent_id) DO NOTHING;
	`
	_, _ = db.conn.ExecContext(ctx, insertQuery, agentID)

	query := `DELETE FROM agents WHERE agent_id = $1`
	_, err := db.conn.ExecContext(ctx, query, agentID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (db *DB) LoadAgents(ctx context.Context, sessions *sync.Map) error {
	ctx, span := db.dbSpan(ctx, "SELECT", "agents")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, "SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version, psk_authenticated FROM agents")
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
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

func (db *DB) PruneStaleAgents(ctx context.Context, maxAge time.Duration) ([]string, error) {
	ctx, span := db.dbSpan(ctx, "DELETE", "agents")
	defer span.End()
	threshold := time.Now().Add(-maxAge).Unix()

	// Get IDs before deleting for cascaded cleanup in ClickHouse
	var ids []string
	rows, err := db.conn.QueryContext(ctx, "SELECT agent_id FROM agents WHERE status = 'offline' AND last_seen < $1", threshold)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
			}
		}
	}

	// Backup before deleting
	insertQuery := `
	INSERT INTO historical_agents (agent_id, hostname, ip)
	SELECT agent_id, hostname, ip FROM agents WHERE status = 'offline' AND last_seen < $1
	ON CONFLICT (agent_id) DO NOTHING;
	`
	_, _ = db.conn.ExecContext(ctx, insertQuery, threshold)

	query := `DELETE FROM agents WHERE status = 'offline' AND last_seen < $1`
	_, err = db.conn.ExecContext(ctx, query, threshold)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return ids, nil
}

// MarkStaleAgentsOffline updates the status of online agents to 'offline' if they haven't been seen recently.
func (db *DB) MarkStaleAgentsOffline(ctx context.Context, maxAge time.Duration) (int64, error) {
	ctx, span := db.dbSpan(ctx, "UPDATE", "agents")
	defer span.End()
	threshold := time.Now().Add(-maxAge).Unix()
	query := `UPDATE agents SET status = 'offline' WHERE status = 'online' AND last_seen < $1`
	res, err := db.conn.ExecContext(ctx, query, threshold)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return 0, err
	}
	return res.RowsAffected()
}

func (db *DB) UpsertAlertRule(ctx context.Context, rule *pb.AlertRule) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "alert_rules")
	defer span.End()
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
	_, err := db.conn.ExecContext(ctx, query,
		rule.Id,
		rule.Name,
		rule.MetricType,
		rule.Threshold,
		rule.Comparison,
		rule.WindowSec,
		rule.Enabled,
		rule.Recipients,
	)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (db *DB) DeleteAlertRule(ctx context.Context, id string) error {
	ctx, span := db.dbSpan(ctx, "DELETE", "alert_rules")
	defer span.End()
	query := `DELETE FROM alert_rules WHERE id = $1`
	_, err := db.conn.ExecContext(ctx, query, id)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (db *DB) ListAlertRules(ctx context.Context) ([]*pb.AlertRule, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "alert_rules")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, "SELECT id, name, metric_type, threshold, comparison, window_sec, enabled, recipients FROM alert_rules")
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
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

// GetAgentCounts returns total agent count and count of online agents (for reports).
func (db *DB) GetAgentCounts(ctx context.Context) (total, online int, err error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "agents")
	defer span.End()
	err = db.conn.QueryRowContext(ctx, "SELECT count(*), COALESCE(sum(CASE WHEN status = 'online' THEN 1 ELSE 0 END), 0) FROM agents").Scan(&total, &online)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return total, online, err
}

// ListAgents returns all agents from the database as AgentInfo (for reports, insights, or callers that need a list from DB).
func (db *DB) ListAgents(ctx context.Context) ([]*pb.AgentInfo, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "agents")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, "SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version, psk_authenticated FROM agents")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*pb.AgentInfo
	for rows.Next() {
		var id, hostname, version, uptime, ip, status, podIP, agentVersion string
		var instancesCount int
		var lastSeen int64
		var isPod, pskAuthenticated bool

		if err := rows.Scan(&id, &hostname, &version, &instancesCount, &uptime, &ip, &status, &lastSeen, &isPod, &podIP, &agentVersion, &pskAuthenticated); err != nil {
			log.Printf("Failed to scan agent row: %v", err)
			continue
		}

		list = append(list, &pb.AgentInfo{
			AgentId:          id,
			Hostname:         hostname,
			Version:          version,
			Status:           status,
			InstancesCount:   int32(instancesCount),
			Uptime:           uptime,
			Ip:               ip,
			LastSeen:         lastSeen,
			IsPod:            isPod,
			PodIp:            podIP,
			AgentVersion:     agentVersion,
			PskAuthenticated: pskAuthenticated,
		})
	}
	return list, nil
}

// ============================================================================
// OIDC Integration Methods (implements middleware.UserProvisioner and middleware.TeamMapper)
// ============================================================================

// GetUserInfo retrieves user info for OIDC provisioning (implements middleware.UserProvisioner)
func (db *DB) GetUserInfo(ctx context.Context, username string) (*middleware.UserInfo, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "users")
	defer span.End()
	var user middleware.UserInfo
	err := db.conn.QueryRowContext(ctx,
		"SELECT username, COALESCE(email, ''), role FROM users WHERE username = $1",
		username,
	).Scan(&user.Username, &user.Email, &user.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &user, nil
}

// CreateUser creates a new user for OIDC provisioning
func (db *DB) CreateUser(ctx context.Context, username, email, role string) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "users")
	defer span.End()
	// Generate a random password for OIDC users (they won't use it)
	randomPassword := make([]byte, 32)
	if _, err := rand.Read(randomPassword); err != nil {
		return fmt.Errorf("generate random password: %w", err)
	}
	passwordHash := fmt.Sprintf("%x", sha256.Sum256(randomPassword))

	query := `
	INSERT INTO users (username, email, password_hash, role, created_at, updated_at)
	VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (username) DO UPDATE SET
		email = EXCLUDED.email,
		role = EXCLUDED.role,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.ExecContext(ctx, query, username, email, passwordHash, role)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// UpdateUserEmail updates a user's email address
func (db *DB) UpdateUserEmail(ctx context.Context, username, email string) error {
	ctx, span := db.dbSpan(ctx, "UPDATE", "users")
	defer span.End()
	query := `UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`
	_, err := db.conn.ExecContext(ctx, query, email, username)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// AddUserToTeamByName adds a user to a team by team name
func (db *DB) AddUserToTeamByName(ctx context.Context, username, teamName string) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "team_members")
	defer span.End()
	// Find team by name
	var teamID string
	err := db.conn.QueryRowContext(ctx, "SELECT id FROM teams WHERE name = $1 OR slug = $1", teamName).Scan(&teamID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("team not found: %s", teamName)
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	// Add member with default "member" role
	query := `
	INSERT INTO team_members (team_id, username, role, joined_at)
	VALUES ($1, $2, 'member', CURRENT_TIMESTAMP)
	ON CONFLICT (team_id, username) DO NOTHING;
	`
	_, err = db.conn.ExecContext(ctx, query, teamID, username)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// RemoveUserFromAllTeams removes a user from all teams
func (db *DB) RemoveUserFromAllTeams(ctx context.Context, username string) error {
	ctx, span := db.dbSpan(ctx, "DELETE", "team_members")
	defer span.End()
	query := `DELETE FROM team_members WHERE username = $1`
	_, err := db.conn.ExecContext(ctx, query, username)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// GetTeamByName gets a team by name (implements middleware.TeamMapper)
func (db *DB) GetTeamByName(ctx context.Context, name string) (*middleware.TeamInfo, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "teams")
	defer span.End()
	var team middleware.TeamInfo
	err := db.conn.QueryRowContext(ctx, "SELECT id, name FROM teams WHERE name = $1 OR slug = $1", name).Scan(&team.ID, &team.Name)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &team, nil
}

// WAFPolicy represents a Security Engine rule set
type WAFPolicy struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Rules       string    `json:"rules"` // The ModSec rules text
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpsertWAFPolicy creates or updates a WAF policy
func (db *DB) UpsertWAFPolicy(ctx context.Context, policy *WAFPolicy) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "waf_policies")
	defer span.End()
	query := `
	INSERT INTO waf_policies (id, name, description, rules, enabled, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT (id) DO UPDATE SET
		name = EXCLUDED.name,
		description = EXCLUDED.description,
		rules = EXCLUDED.rules,
		enabled = EXCLUDED.enabled,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.ExecContext(ctx, query, policy.ID, policy.Name, policy.Description, policy.Rules, policy.Enabled)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// ListWAFPolicies returns all WAF policies
func (db *DB) ListWAFPolicies(ctx context.Context) ([]WAFPolicy, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "waf_policies")
	defer span.End()
	rows, err := db.conn.QueryContext(ctx, "SELECT id, name, description, rules, enabled, created_at, updated_at FROM waf_policies ORDER BY created_at DESC")
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	defer rows.Close()

	var policies []WAFPolicy
	for rows.Next() {
		var p WAFPolicy
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Rules, &p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		policies = append(policies, p)
	}
	return policies, nil
}

// GetWAFPolicy returns a single WAF policy
func (db *DB) GetWAFPolicy(ctx context.Context, id string) (*WAFPolicy, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "waf_policies")
	defer span.End()
	var p WAFPolicy
	err := db.conn.QueryRowContext(ctx, "SELECT id, name, description, rules, enabled, created_at, updated_at FROM waf_policies WHERE id = $1", id).
		Scan(&p.ID, &p.Name, &p.Description, &p.Rules, &p.Enabled, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &p, nil
}

// StagedConfig represents a configuration change waiting for approval/apply
type StagedConfig struct {
	ID          string    `json:"id"`
	TargetID    string    `json:"target_id"`   // AgentID or EnvironmentID
	TargetType  string    `json:"target_type"` // "agent" or "environment"
	Content     string    `json:"content"`
	ConfigPath  string    `json:"config_path"`
	CreatedBy   string    `json:"created_by"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// UpsertStagedConfig creates or updates a staged config
func (db *DB) UpsertStagedConfig(ctx context.Context, cfg *StagedConfig) error {
	ctx, span := db.dbSpan(ctx, "INSERT", "staged_configs")
	defer span.End()
	query := `
	INSERT INTO staged_configs (target_id, target_type, content, config_path, created_by, description, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
	ON CONFLICT (target_id, config_path) DO UPDATE SET
		content = EXCLUDED.content,
		created_by = EXCLUDED.created_by,
		description = EXCLUDED.description,
		created_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.ExecContext(ctx, query, cfg.TargetID, cfg.TargetType, cfg.Content, cfg.ConfigPath, cfg.CreatedBy, cfg.Description)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

// GetStagedConfig retrieves a staged config
func (db *DB) GetStagedConfig(ctx context.Context, targetID, configPath string) (*StagedConfig, error) {
	ctx, span := db.dbSpan(ctx, "SELECT", "staged_configs")
	defer span.End()
	var c StagedConfig
	err := db.conn.QueryRowContext(ctx, "SELECT target_id, target_type, content, config_path, created_by, description, created_at FROM staged_configs WHERE target_id = $1 AND config_path = $2", targetID, configPath).
		Scan(&c.TargetID, &c.TargetType, &c.Content, &c.ConfigPath, &c.CreatedBy, &c.Description, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	return &c, nil
}

// DeleteStagedConfig removes a staged config after apply/discard
func (db *DB) DeleteStagedConfig(ctx context.Context, targetID, configPath string) error {
	ctx, span := db.dbSpan(ctx, "DELETE", "staged_configs")
	defer span.End()
	_, err := db.conn.ExecContext(ctx, "DELETE FROM staged_configs WHERE target_id = $1 AND config_path = $2", targetID, configPath)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}
