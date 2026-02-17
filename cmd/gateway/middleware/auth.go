// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// User represents an authenticated user.
type User struct {
	Username string `json:"username"`
	Role     string `json:"role"` // "admin" or "viewer"
}

// contextKey is a custom type for context keys to avoid collisions.
type contextKey string

const (
	// UserContextKey is the key used to store user info in request context.
	UserContextKey contextKey = "user"
)

// UserLookupFunc is a function that looks up a user by username and returns their password hash and role
type UserLookupFunc func(username string) (passwordHash string, role string, found bool)

// AuthConfig holds authentication configuration.
type AuthConfig struct {
	Enabled            bool          `json:"enabled"`
	Username           string        `json:"username"`
	PasswordHash       string        `json:"password_hash"`        // SHA-256 hash (fallback if no UserLookup)
	JWTSecret          string        `json:"jwt_secret"`
	TokenExpiry        time.Duration `json:"token_expiry"`
	CookieName         string        `json:"cookie_name"`
	CookieSecure       bool          `json:"cookie_secure"`        // Set to true in production with HTTPS
	CookieDomain       string        `json:"cookie_domain"`
	FirstTimeSetup     bool          `json:"first_time_setup"`     // True if using auto-generated password
	RequirePassChange  bool          `json:"require_pass_change"`  // Force password change on first login
	InitialSecretPath  string        `json:"initial_secret_path"`  // File to write initial secret
	UserLookup         UserLookupFunc `json:"-"`                   // Function to look up users from database
}

// DefaultAuthConfig returns default auth configuration.
func DefaultAuthConfig() AuthConfig {
	return AuthConfig{
		Enabled:      false,
		Username:     "admin",
		PasswordHash: "", // Must be set if enabled
		JWTSecret:    "", // Will be auto-generated if empty
		TokenExpiry:  24 * time.Hour,
		CookieName:   "avika_session",
		CookieSecure: false,
		CookieDomain: "",
	}
}

// AuthManager handles authentication operations.
type AuthManager struct {
	config              AuthConfig
	mu                  sync.RWMutex
	tokenCache          map[string]*tokenCacheEntry
	passwordChangeCache map[string]bool // Tracks users who need to change password
}

type tokenCacheEntry struct {
	user              *User
	expiresAt         time.Time
	requirePassChange bool
}

// NewAuthManager creates a new auth manager.
func NewAuthManager(config AuthConfig) *AuthManager {
	// Auto-generate JWT secret if not provided
	if config.JWTSecret == "" {
		secret := make([]byte, 32)
		rand.Read(secret)
		config.JWTSecret = base64.StdEncoding.EncodeToString(secret)
		log.Printf("Auto-generated JWT secret (store this for persistence across restarts)")
	}

	am := &AuthManager{
		config:              config,
		tokenCache:          make(map[string]*tokenCacheEntry),
		passwordChangeCache: make(map[string]bool),
	}

	// Handle first-time setup - use default password "admin"
	if config.Enabled && config.PasswordHash == "" {
		// Use a well-known default password that users must change
		defaultPassword := "admin"
		config.PasswordHash = HashPassword(defaultPassword)
		am.config = config
		am.config.FirstTimeSetup = true
		am.config.RequirePassChange = true
		am.passwordChangeCache[config.Username] = true

		// Display initial credentials (similar to Jenkins)
		log.Println("")
		log.Println("*************************************************************")
		log.Println("*************************************************************")
		log.Println("")
		log.Println("  AVIKA FIRST-TIME SETUP")
		log.Println("")
		log.Println("  Default credentials:")
		log.Printf("    Username: %s", config.Username)
		log.Printf("    Password: %s", defaultPassword)
		log.Println("")
		log.Println("  You will be required to change your password on first login.")
		log.Println("")
		log.Println("*************************************************************")
		log.Println("*************************************************************")
		log.Println("")
	}

	// Start cleanup goroutine
	go am.cleanupLoop()

	return am
}

// generateInitialPassword creates a secure random password.
func (am *AuthManager) generateInitialPassword() string {
	// Generate 16 bytes of random data
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based if crypto/rand fails
		return fmt.Sprintf("avika-%d", time.Now().UnixNano())
	}
	// Use hex encoding for human-readable password
	return hex.EncodeToString(bytes)
}

// HashPassword creates a SHA-256 hash of the password.
func HashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

// ValidateCredentials checks if username and password are valid.
// Returns the user's role if valid, empty string if invalid.
func (am *AuthManager) ValidateCredentials(username, password string) (bool, string) {
	am.mu.RLock()
	defer am.mu.RUnlock()

	passwordHash := HashPassword(password)

	// Try database lookup first if available
	if am.config.UserLookup != nil {
		storedHash, role, found := am.config.UserLookup(username)
		if found && storedHash == passwordHash {
			return true, role
		}
	}

	// Fallback to config-based single user (backwards compatibility)
	if username == am.config.Username && passwordHash == am.config.PasswordHash {
		return true, "admin"
	}

	return false, ""
}

// GenerateToken creates a new session token for the user.
func (am *AuthManager) GenerateToken(user *User) (string, time.Time, error) {
	return am.GenerateTokenWithFlags(user, false)
}

// ValidateToken checks if a token is valid and returns the associated user.
func (am *AuthManager) ValidateToken(token string) (*User, bool) {
	am.mu.RLock()
	defer am.mu.RUnlock()

	entry, exists := am.tokenCache[token]
	if !exists {
		return nil, false
	}

	if time.Now().After(entry.expiresAt) {
		return nil, false
	}

	return entry.user, true
}

// RevokeToken invalidates a token.
func (am *AuthManager) RevokeToken(token string) {
	am.mu.Lock()
	delete(am.tokenCache, token)
	am.mu.Unlock()
}

// cleanupLoop removes expired tokens periodically.
func (am *AuthManager) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		am.mu.Lock()
		now := time.Now()
		for token, entry := range am.tokenCache {
			if now.After(entry.expiresAt) {
				delete(am.tokenCache, token)
			}
		}
		am.mu.Unlock()
	}
}

// GetConfig returns the auth configuration.
func (am *AuthManager) GetConfig() AuthConfig {
	am.mu.RLock()
	defer am.mu.RUnlock()
	return am.config
}

// IsEnabled returns whether authentication is enabled.
func (am *AuthManager) IsEnabled() bool {
	am.mu.RLock()
	defer am.mu.RUnlock()
	return am.config.Enabled
}

// LoginRequest represents a login API request.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse represents a login API response.
type LoginResponse struct {
	Success            bool   `json:"success"`
	Message            string `json:"message,omitempty"`
	User               *User  `json:"user,omitempty"`
	ExpiresAt          string `json:"expires_at,omitempty"`
	RequirePassChange  bool   `json:"require_password_change,omitempty"`
}

// ChangePasswordRequest represents a password change request.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePasswordResponse represents a password change response.
type ChangePasswordResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// LoginHandler returns an HTTP handler for login requests.
func (am *AuthManager) LoginHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(LoginResponse{
				Success: false,
				Message: "Invalid request body",
			})
			return
		}

		valid, role := am.ValidateCredentials(req.Username, req.Password)
		if !valid {
			log.Printf("Failed login attempt for user: %s from IP: %s", req.Username, getClientIP(r))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(LoginResponse{
				Success: false,
				Message: "Invalid username or password",
			})
			return
		}

		// Check if password change is required
		am.mu.RLock()
		requirePassChange := am.passwordChangeCache[req.Username]
		am.mu.RUnlock()

		user := &User{
			Username: req.Username,
			Role:     role,
		}

		token, expiresAt, err := am.GenerateTokenWithFlags(user, requirePassChange)
		if err != nil {
			log.Printf("Failed to generate token: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(LoginResponse{
				Success: false,
				Message: "Internal server error",
			})
			return
		}

		// Set session cookie
		http.SetCookie(w, &http.Cookie{
			Name:     am.config.CookieName,
			Value:    token,
			Path:     "/",
			Expires:  expiresAt,
			HttpOnly: true,
			Secure:   am.config.CookieSecure,
			SameSite: http.SameSiteLaxMode,
			Domain:   am.config.CookieDomain,
		})

		log.Printf("Successful login for user: %s from IP: %s (password_change_required=%v)", req.Username, getClientIP(r), requirePassChange)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(LoginResponse{
			Success:           true,
			Message:           "Login successful",
			User:              user,
			ExpiresAt:         expiresAt.Format(time.RFC3339),
			RequirePassChange: requirePassChange,
		})
	}
}

// GenerateTokenWithFlags creates a new session token with additional flags.
func (am *AuthManager) GenerateTokenWithFlags(user *User, requirePassChange bool) (string, time.Time, error) {
	// Generate random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", time.Time{}, fmt.Errorf("failed to generate token: %w", err)
	}

	token := base64.URLEncoding.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(am.config.TokenExpiry)

	// Store in cache
	am.mu.Lock()
	am.tokenCache[token] = &tokenCacheEntry{
		user:              user,
		expiresAt:         expiresAt,
		requirePassChange: requirePassChange,
	}
	am.mu.Unlock()

	return token, expiresAt, nil
}

// ChangePasswordHandler returns an HTTP handler for password change requests.
// The callback receives username and newHash to persist to database.
func (am *AuthManager) ChangePasswordHandler(onPasswordChanged func(username, newHash string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Get current user from context (must be authenticated)
		user := GetUserFromContext(r.Context())
		if user == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(ChangePasswordResponse{
				Success: false,
				Message: "Not authenticated",
			})
			return
		}

		var req ChangePasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ChangePasswordResponse{
				Success: false,
				Message: "Invalid request body",
			})
			return
		}

		// Validate current password
		valid, _ := am.ValidateCredentials(user.Username, req.CurrentPassword)
		if !valid {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(ChangePasswordResponse{
				Success: false,
				Message: "Current password is incorrect",
			})
			return
		}

		// Validate new password
		if len(req.NewPassword) < 8 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ChangePasswordResponse{
				Success: false,
				Message: "New password must be at least 8 characters",
			})
			return
		}

		// Update password
		newHash := HashPassword(req.NewPassword)
		am.mu.Lock()
		am.config.PasswordHash = newHash
		am.config.FirstTimeSetup = false
		delete(am.passwordChangeCache, user.Username)
		am.mu.Unlock()

		// Callback to persist new password hash
		if onPasswordChanged != nil {
			if err := onPasswordChanged(user.Username, newHash); err != nil {
				log.Printf("Warning: Failed to persist password change: %v", err)
			}
		}

		// Remove initial secret file if it exists
		if am.config.InitialSecretPath != "" {
			os.Remove(am.config.InitialSecretPath)
		}

		log.Printf("Password changed for user: %s from IP: %s", user.Username, getClientIP(r))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ChangePasswordResponse{
			Success: true,
			Message: "Password changed successfully",
		})
	}
}

// LogoutHandler returns an HTTP handler for logout requests.
func (am *AuthManager) LogoutHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get token from cookie
		cookie, err := r.Cookie(am.config.CookieName)
		if err == nil {
			am.RevokeToken(cookie.Value)
		}

		// Clear session cookie
		http.SetCookie(w, &http.Cookie{
			Name:     am.config.CookieName,
			Value:    "",
			Path:     "/",
			Expires:  time.Unix(0, 0),
			HttpOnly: true,
			Secure:   am.config.CookieSecure,
			MaxAge:   -1,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Logged out successfully",
		})
	}
}

// MeHandler returns an HTTP handler that returns current user info.
func (am *AuthManager) MeHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := GetUserFromContext(r.Context())
		if user == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"authenticated": false,
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"authenticated": true,
			"user":          user,
		})
	}
}

// AuthMiddleware creates middleware that validates authentication.
// If auth is disabled, it passes through all requests.
// publicPaths are paths that don't require authentication.
func (am *AuthManager) AuthMiddleware(publicPaths []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth if disabled
			if !am.IsEnabled() {
				next.ServeHTTP(w, r)
				return
			}

			// Check if path is public
			for _, path := range publicPaths {
				if strings.HasPrefix(r.URL.Path, path) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Try to get token from cookie
			var token string
			cookie, err := r.Cookie(am.config.CookieName)
			if err == nil {
				token = cookie.Value
			}

			// Try Authorization header as fallback
			if token == "" {
				authHeader := r.Header.Get("Authorization")
				if strings.HasPrefix(authHeader, "Bearer ") {
					token = strings.TrimPrefix(authHeader, "Bearer ")
				}
			}

			// Validate token
			if token == "" {
				am.sendUnauthorized(w, r, "Authentication required")
				return
			}

			user, valid := am.ValidateToken(token)
			if !valid {
				am.sendUnauthorized(w, r, "Invalid or expired token")
				return
			}

			// Add user to context
			ctx := context.WithValue(r.Context(), UserContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// sendUnauthorized sends an unauthorized response.
func (am *AuthManager) sendUnauthorized(w http.ResponseWriter, r *http.Request, message string) {
	// For API requests, return JSON
	if strings.HasPrefix(r.URL.Path, "/api/") || r.Header.Get("Accept") == "application/json" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "unauthorized",
			"message": message,
		})
		return
	}

	// For browser requests, could redirect to login page
	http.Error(w, message, http.StatusUnauthorized)
}

// GetUserFromContext retrieves the user from the request context.
func GetUserFromContext(ctx context.Context) *User {
	user, ok := ctx.Value(UserContextKey).(*User)
	if !ok {
		return nil
	}
	return user
}

// RequireRole middleware checks if the user has the required role.
func RequireRole(requiredRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			if user.Role != requiredRole && user.Role != "admin" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
