package main

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
	pb "github.com/user/nginx-manager/internal/common/proto/agent"
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
	if err := db.migrate(); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	return db, nil
}

func (db *DB) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS agents (
			agent_id TEXT PRIMARY KEY,
			hostname TEXT,
			version TEXT,
			instances_count INT,
			uptime TEXT,
			ip TEXT,
			status TEXT,
			last_seen BIGINT,
			is_pod BOOLEAN DEFAULT FALSE,
			pod_ip TEXT
		);`,
		// Migration for existing tables
		`ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_pod BOOLEAN DEFAULT FALSE;`,
		`ALTER TABLE agents ADD COLUMN IF NOT EXISTS pod_ip TEXT;`,
		`ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_version TEXT;`,
		// Deduplicate existing entries by IP before adding the constraint.
		// We keep the one with the latest last_seen for each IP.
		`DELETE FROM agents
		 WHERE agent_id NOT IN (
			 SELECT DISTINCT ON (ip) agent_id
			 FROM agents
			 ORDER BY ip, last_seen DESC
		 );`,
		// Drop old composite index if exists
		`DROP INDEX IF EXISTS idx_agents_hostname_ip;`,
		// Remove unique constraint on ip if it exists
		`DROP INDEX IF EXISTS idx_agents_ip;`,
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (db *DB) UpsertAgent(session *AgentSession) error {
	// We use ip as the unique identifier for a node to prevent duplicates.
	// If an agent reconnects with a new agent_id but same ip, we update the record.
	query := `
	INSERT INTO agents (agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
		agent_version = EXCLUDED.agent_version;
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
	rows, err := db.conn.Query("SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen, is_pod, pod_ip, agent_version FROM agents")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, hostname, version, uptime, ip, status, podIP, agentVersion string
		var instancesCount int
		var lastSeen int64
		var isPod bool

		if err := rows.Scan(&id, &hostname, &version, &instancesCount, &uptime, &ip, &status, &lastSeen, &isPod, &podIP, &agentVersion); err != nil {
			log.Printf("Failed to scan agent row: %v", err)
			continue
		}

		session := &AgentSession{
			id:             id,
			hostname:       hostname,
			version:        version,
			instancesCount: instancesCount,
			uptime:         uptime,
			ip:             ip,
			status:         status,
			lastActive:     time.Unix(lastSeen, 0),
			isPod:          isPod,
			podIP:          podIP,
			agentVersion:   agentVersion,
			logChans:       make(map[string]chan *pb.LogEntry),
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
