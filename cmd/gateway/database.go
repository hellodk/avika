package main

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
	pb "github.com/user/nginx-manager/api/proto"
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
	query := `
	CREATE TABLE IF NOT EXISTS agents (
		agent_id TEXT PRIMARY KEY,
		hostname TEXT,
		version TEXT,
		instances_count INT,
		uptime TEXT,
		ip TEXT,
		status TEXT,
		last_seen BIGINT
	);
	`
	_, err := db.conn.Exec(query)
	return err
}

func (db *DB) UpsertAgent(session *AgentSession) error {
	query := `
	INSERT INTO agents (agent_id, hostname, version, instances_count, uptime, ip, status, last_seen)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (agent_id) DO UPDATE SET
		hostname = EXCLUDED.hostname,
		version = EXCLUDED.version,
		instances_count = EXCLUDED.instances_count,
		uptime = EXCLUDED.uptime,
		ip = EXCLUDED.ip,
		status = EXCLUDED.status,
		last_seen = EXCLUDED.last_seen;
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
	rows, err := db.conn.Query("SELECT agent_id, hostname, version, instances_count, uptime, ip, status, last_seen FROM agents")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, hostname, version, uptime, ip, status string
		var instancesCount int
		var lastSeen int64

		if err := rows.Scan(&id, &hostname, &version, &instancesCount, &uptime, &ip, &status, &lastSeen); err != nil {
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
			logChans:       make(map[string]chan *pb.LogEntry),
		}
		sessions.Store(id, session)
	}
	return nil
}
