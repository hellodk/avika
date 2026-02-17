// Package migrations handles database schema migrations for the gateway.
package migrations

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed *.sql
var sqlFiles embed.FS

// Migration represents a single database migration
type Migration struct {
	Version string
	Name    string
	SQL     string
}

// Runner handles database migrations
type Runner struct {
	db *sql.DB
}

// NewRunner creates a new migration runner
func NewRunner(db *sql.DB) *Runner {
	return &Runner{db: db}
}

// Run executes all pending migrations
func (r *Runner) Run() error {
	// Ensure migrations table exists
	if err := r.ensureMigrationsTable(); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Get all migrations
	migrations, err := r.loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	// Get applied migrations
	applied, err := r.getAppliedMigrations()
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	// Run pending migrations
	for _, m := range migrations {
		if applied[m.Version] {
			log.Printf("Migration %s (%s) already applied, skipping", m.Version, m.Name)
			continue
		}

		log.Printf("Applying migration %s (%s)...", m.Version, m.Name)
		if err := r.applyMigration(m); err != nil {
			return fmt.Errorf("failed to apply migration %s: %w", m.Version, err)
		}
		log.Printf("Migration %s applied successfully", m.Version)
	}

	return nil
}

// ensureMigrationsTable creates the schema_migrations table if it doesn't exist
func (r *Runner) ensureMigrationsTable() error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`
	_, err := r.db.Exec(query)
	return err
}

// loadMigrations reads all SQL files and returns them as migrations
func (r *Runner) loadMigrations() ([]Migration, error) {
	entries, err := sqlFiles.ReadDir(".")
	if err != nil {
		return nil, err
	}

	var migrations []Migration
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		content, err := sqlFiles.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("failed to read %s: %w", entry.Name(), err)
		}

		// Extract version from filename (e.g., "001_init_schema.sql" -> "001")
		name := strings.TrimSuffix(entry.Name(), ".sql")
		parts := strings.SplitN(name, "_", 2)
		version := parts[0]
		migrationName := name
		if len(parts) > 1 {
			migrationName = parts[1]
		}

		migrations = append(migrations, Migration{
			Version: version,
			Name:    migrationName,
			SQL:     string(content),
		})
	}

	// Sort by version
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	return migrations, nil
}

// getAppliedMigrations returns a map of already applied migration versions
func (r *Runner) getAppliedMigrations() (map[string]bool, error) {
	applied := make(map[string]bool)

	rows, err := r.db.Query("SELECT version FROM schema_migrations")
	if err != nil {
		// Table might not exist yet
		return applied, nil
	}
	defer rows.Close()

	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			continue
		}
		applied[version] = true
	}

	return applied, nil
}

// applyMigration executes a single migration within a transaction
func (r *Runner) applyMigration(m Migration) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Execute the migration SQL
	if _, err := tx.Exec(m.SQL); err != nil {
		return fmt.Errorf("SQL execution failed: %w", err)
	}

	// Record the migration
	if _, err := tx.Exec(
		"INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
		m.Version, m.Name,
	); err != nil {
		return fmt.Errorf("failed to record migration: %w", err)
	}

	return tx.Commit()
}

// GetCurrentVersion returns the latest applied migration version
func (r *Runner) GetCurrentVersion() (string, error) {
	var version string
	err := r.db.QueryRow("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").Scan(&version)
	if err == sql.ErrNoRows {
		return "none", nil
	}
	return version, err
}

// ListApplied returns all applied migrations
func (r *Runner) ListApplied() ([]Migration, error) {
	rows, err := r.db.Query("SELECT version, name FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var migrations []Migration
	for rows.Next() {
		var m Migration
		if err := rows.Scan(&m.Version, &m.Name); err != nil {
			continue
		}
		migrations = append(migrations, m)
	}
	return migrations, nil
}

// Suppress unused import warning
var _ = filepath.Base
