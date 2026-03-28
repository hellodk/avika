package main

import (
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

func (db *DB) GetVersion() string {
	var version string
	err := db.conn.QueryRow("SHOW server_version").Scan(&version)
	if err != nil {
		return "unknown"
	}
	return version
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
	// Backup before deleting
	insertQuery := `
	INSERT INTO historical_agents (agent_id, hostname, ip)
	SELECT agent_id, hostname, ip FROM agents WHERE agent_id = $1
	ON CONFLICT (agent_id) DO NOTHING;
	`
	_, _ = db.conn.Exec(insertQuery, agentID)

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

	// Backup before deleting
	insertQuery := `
	INSERT INTO historical_agents (agent_id, hostname, ip)
	SELECT agent_id, hostname, ip FROM agents WHERE status = 'offline' AND last_seen < $1
	ON CONFLICT (agent_id) DO NOTHING;
	`
	_, _ = db.conn.Exec(insertQuery, threshold)

	query := `DELETE FROM agents WHERE status = 'offline' AND last_seen < $1`
	_, err = db.conn.Exec(query, threshold)
	if err != nil {
		return nil, err
	}
	return ids, nil
}

// MarkStaleAgentsOffline updates the status of online agents to 'offline' if they haven't been seen recently.
func (db *DB) MarkStaleAgentsOffline(maxAge time.Duration) (int64, error) {
	threshold := time.Now().Add(-maxAge).Unix()
	query := `UPDATE agents SET status = 'offline' WHERE status = 'online' AND last_seen < $1`
	res, err := db.conn.Exec(query, threshold)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
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

// GetAgentCounts returns total agent count and count of online agents (for reports).
func (db *DB) GetAgentCounts() (total, online int, err error) {
	err = db.conn.QueryRow("SELECT count(*), COALESCE(sum(CASE WHEN status = 'online' THEN 1 ELSE 0 END), 0) FROM agents").Scan(&total, &online)
	return total, online, err
}

// ListAgents returns all agents from the database as AgentInfo (for reports, insights, or callers that need a list from DB).
func (db *DB) ListAgents() ([]*pb.AgentInfo, error) {
	rows, err := db.conn.Query("SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version, psk_authenticated FROM agents")
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
func (db *DB) GetUserInfo(username string) (*middleware.UserInfo, error) {
	var user middleware.UserInfo
	err := db.conn.QueryRow(
		"SELECT username, COALESCE(email, ''), role FROM users WHERE username = $1",
		username,
	).Scan(&user.Username, &user.Email, &user.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// CreateUser creates a new user for OIDC provisioning
func (db *DB) CreateUser(username, email, role string) error {
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
	_, err := db.conn.Exec(query, username, email, passwordHash, role)
	return err
}

// UpdateUserEmail updates a user's email address
func (db *DB) UpdateUserEmail(username, email string) error {
	query := `UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`
	_, err := db.conn.Exec(query, email, username)
	return err
}

// AddUserToTeamByName adds a user to a team by team name
func (db *DB) AddUserToTeamByName(username, teamName string) error {
	// Find team by name
	var teamID string
	err := db.conn.QueryRow("SELECT id FROM teams WHERE name = $1 OR slug = $1", teamName).Scan(&teamID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("team not found: %s", teamName)
	}
	if err != nil {
		return err
	}

	// Add member with default "member" role
	query := `
	INSERT INTO team_members (team_id, username, role, joined_at)
	VALUES ($1, $2, 'member', CURRENT_TIMESTAMP)
	ON CONFLICT (team_id, username) DO NOTHING;
	`
	_, err = db.conn.Exec(query, teamID, username)
	return err
}

// RemoveUserFromAllTeams removes a user from all teams
func (db *DB) RemoveUserFromAllTeams(username string) error {
	query := `DELETE FROM team_members WHERE username = $1`
	_, err := db.conn.Exec(query, username)
	return err
}

// GetTeamByName gets a team by name (implements middleware.TeamMapper)
func (db *DB) GetTeamByName(name string) (*middleware.TeamInfo, error) {
	var team middleware.TeamInfo
	err := db.conn.QueryRow("SELECT id, name FROM teams WHERE name = $1 OR slug = $1", name).Scan(&team.ID, &team.Name)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
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
func (db *DB) UpsertWAFPolicy(policy *WAFPolicy) error {
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
	_, err := db.conn.Exec(query, policy.ID, policy.Name, policy.Description, policy.Rules, policy.Enabled)
	return err
}

// ListWAFPolicies returns all WAF policies
func (db *DB) ListWAFPolicies() ([]WAFPolicy, error) {
	rows, err := db.conn.Query("SELECT id, name, description, rules, enabled, created_at, updated_at FROM waf_policies ORDER BY created_at DESC")
	if err != nil {
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
func (db *DB) GetWAFPolicy(id string) (*WAFPolicy, error) {
	var p WAFPolicy
	err := db.conn.QueryRow("SELECT id, name, description, rules, enabled, created_at, updated_at FROM waf_policies WHERE id = $1", id).
		Scan(&p.ID, &p.Name, &p.Description, &p.Rules, &p.Enabled, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
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
func (db *DB) UpsertStagedConfig(cfg *StagedConfig) error {
	query := `
	INSERT INTO staged_configs (target_id, target_type, content, config_path, created_by, description, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
	ON CONFLICT (target_id, config_path) DO UPDATE SET
		content = EXCLUDED.content,
		created_by = EXCLUDED.created_by,
		description = EXCLUDED.description,
		created_at = CURRENT_TIMESTAMP;
	`
	_, err := db.conn.Exec(query, cfg.TargetID, cfg.TargetType, cfg.Content, cfg.ConfigPath, cfg.CreatedBy, cfg.Description)
	return err
}

// GetStagedConfig retrieves a staged config
func (db *DB) GetStagedConfig(targetID, configPath string) (*StagedConfig, error) {
	var c StagedConfig
	err := db.conn.QueryRow("SELECT target_id, target_type, content, config_path, created_by, description, created_at FROM staged_configs WHERE target_id = $1 AND config_path = $2", targetID, configPath).
		Scan(&c.TargetID, &c.TargetType, &c.Content, &c.ConfigPath, &c.CreatedBy, &c.Description, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &c, err
}

// DeleteStagedConfig removes a staged config after apply/discard
func (db *DB) DeleteStagedConfig(targetID, configPath string) error {
	_, err := db.conn.Exec("DELETE FROM staged_configs WHERE target_id = $1 AND config_path = $2", targetID, configPath)
	return err
}
