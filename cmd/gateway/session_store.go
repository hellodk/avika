package main

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// PgSessionStore is a PostgreSQL-backed implementation of middleware.SessionStore.
// It backs the in-memory token cache so sessions survive pod restarts.
type PgSessionStore struct {
	db *sql.DB
}

// NewPgSessionStore creates a new persistent session store backed by Postgres.
func NewPgSessionStore(db *sql.DB) *PgSessionStore {
	return &PgSessionStore{db: db}
}

// Save persists a new session to the sessions table.
func (s *PgSessionStore) Save(token string, user *middleware.User, expiresAt time.Time, requirePassChange bool) error {
	if user == nil {
		return fmt.Errorf("session store: nil user")
	}
	_, err := s.db.Exec(
		`INSERT INTO sessions (token, username, role, expires_at, require_pass_change)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (token) DO UPDATE SET
		   username = EXCLUDED.username,
		   role = EXCLUDED.role,
		   expires_at = EXCLUDED.expires_at,
		   require_pass_change = EXCLUDED.require_pass_change`,
		token, user.Username, user.Role, expiresAt, requirePassChange,
	)
	return err
}

// Load retrieves a session by token. Returns (nil, false, nil) if not found.
func (s *PgSessionStore) Load(token string) (*middleware.PersistedSession, bool, error) {
	var ps middleware.PersistedSession
	err := s.db.QueryRow(
		`SELECT username, role, expires_at, require_pass_change
		 FROM sessions WHERE token = $1`,
		token,
	).Scan(&ps.Username, &ps.Role, &ps.ExpiresAt, &ps.RequirePassChange)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &ps, true, nil
}

// Delete removes a session by token (used on logout).
func (s *PgSessionStore) Delete(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = $1`, token)
	return err
}

// DeleteExpired removes all sessions whose expiry has passed.
func (s *PgSessionStore) DeleteExpired() error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at < NOW()`)
	return err
}

// PgOIDCStateStore is a PostgreSQL-backed implementation of middleware.OIDCStateStore.
type PgOIDCStateStore struct {
	db *sql.DB
}

// NewPgOIDCStateStore creates a new persistent OIDC state store backed by Postgres.
func NewPgOIDCStateStore(db *sql.DB) *PgOIDCStateStore {
	return &PgOIDCStateStore{db: db}
}

// SaveState persists an OIDC CSRF state token.
func (s *PgOIDCStateStore) SaveState(state, redirectURI string) error {
	_, err := s.db.Exec(
		`INSERT INTO oidc_states (state, redirect_uri, created_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (state) DO UPDATE SET redirect_uri = EXCLUDED.redirect_uri, created_at = EXCLUDED.created_at`,
		state, redirectURI,
	)
	return err
}

// LoadState retrieves an OIDC state entry. Returns (_, _, false, nil) if not found.
func (s *PgOIDCStateStore) LoadState(state string) (redirectURI string, createdAt time.Time, found bool, err error) {
	err = s.db.QueryRow(
		`SELECT redirect_uri, created_at FROM oidc_states WHERE state = $1`,
		state,
	).Scan(&redirectURI, &createdAt)
	if err == sql.ErrNoRows {
		return "", time.Time{}, false, nil
	}
	if err != nil {
		return "", time.Time{}, false, err
	}
	return redirectURI, createdAt, true, nil
}

// DeleteState removes an OIDC state entry after it is consumed.
func (s *PgOIDCStateStore) DeleteState(state string) error {
	_, err := s.db.Exec(`DELETE FROM oidc_states WHERE state = $1`, state)
	return err
}

// DeleteExpiredStates removes states older than 15 minutes.
func (s *PgOIDCStateStore) DeleteExpiredStates() error {
	_, err := s.db.Exec(`DELETE FROM oidc_states WHERE created_at < NOW() - INTERVAL '15 minutes'`)
	return err
}
