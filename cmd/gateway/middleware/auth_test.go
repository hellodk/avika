package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestHashPassword tests the password hashing function
func TestHashPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
	}{
		{"simple password", "password123"},
		{"complex password", "P@ssw0rd!#$%"},
		{"empty password", ""},
		{"long password", "this-is-a-very-long-password-that-should-still-work-correctly-12345"},
		{"unicode password", "пароль密码🔐"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash := HashPassword(tt.password)

			// Hash should be consistent
			hash2 := HashPassword(tt.password)
			if hash != hash2 {
				t.Errorf("HashPassword not consistent: got %s and %s", hash, hash2)
			}

			// Hash should be 64 chars (SHA-256 hex)
			if len(hash) != 64 {
				t.Errorf("Expected hash length 64, got %d", len(hash))
			}

			// Different passwords should produce different hashes
			differentHash := HashPassword(tt.password + "x")
			if hash == differentHash && tt.password != "" {
				t.Error("Different passwords produced same hash")
			}
		})
	}
}

// TestNewAuthManager tests auth manager creation
func TestNewAuthManager(t *testing.T) {
	tests := []struct {
		name   string
		config AuthConfig
	}{
		{
			name:   "default config",
			config: DefaultAuthConfig(),
		},
		{
			name: "enabled with password",
			config: AuthConfig{
				Enabled:      true,
				Username:     "admin",
				PasswordHash: HashPassword("testpass"),
				TokenExpiry:  1 * time.Hour,
				CookieName:   "test_session",
			},
		},
		{
			name: "with custom JWT secret",
			config: AuthConfig{
				Enabled:      true,
				Username:     "admin",
				PasswordHash: HashPassword("testpass"),
				JWTSecret:    "custom-secret-key-12345",
				TokenExpiry:  24 * time.Hour,
				CookieName:   "avika_session",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			am := NewAuthManager(tt.config)
			if am == nil {
				t.Fatal("NewAuthManager returned nil")
			}

			// Config should be set
			gotConfig := am.GetConfig()
			if gotConfig.Username != tt.config.Username {
				t.Errorf("Username mismatch: expected %s, got %s", tt.config.Username, gotConfig.Username)
			}

			// If no JWT secret provided, one should be generated
			if tt.config.JWTSecret == "" && gotConfig.JWTSecret == "" {
				t.Error("JWT secret should be auto-generated when not provided")
			}
		})
	}
}

// TestValidateCredentials tests credential validation
func TestValidateCredentials(t *testing.T) {
	password := "correct-password"
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword(password),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "test_session",
	})

	tests := []struct {
		name     string
		username string
		password string
		want     bool
	}{
		{"correct credentials", "admin", password, true},
		{"wrong password", "admin", "wrong-password", false},
		{"wrong username", "user", password, false},
		{"both wrong", "user", "wrong", false},
		{"empty username", "", password, false},
		{"empty password", "admin", "", false},
		{"case sensitive username", "Admin", password, false},
		{"password with spaces", "admin", " " + password, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := am.ValidateCredentials(tt.username, tt.password)
			if got != tt.want {
				t.Errorf("ValidateCredentials(%q, %q) = %v, want %v", tt.username, tt.password, got, tt.want)
			}
		})
	}
}

// TestGenerateAndValidateToken tests token generation and validation
func TestGenerateAndValidateToken(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "test_session",
	})

	user := &User{
		Username: "admin",
		Role:     "admin",
	}

	// Generate token
	token, expiresAt, err := am.GenerateToken(user)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if token == "" {
		t.Error("Generated token is empty")
	}

	if expiresAt.Before(time.Now()) {
		t.Error("Token expires in the past")
	}

	// Validate token
	gotUser, valid := am.ValidateToken(token)
	if !valid {
		t.Error("Token should be valid")
	}

	if gotUser == nil {
		t.Fatal("ValidateToken returned nil user")
	}

	if gotUser.Username != user.Username {
		t.Errorf("Username mismatch: expected %s, got %s", user.Username, gotUser.Username)
	}

	// Invalid token should fail
	_, valid = am.ValidateToken("invalid-token")
	if valid {
		t.Error("Invalid token should not be valid")
	}
}

// TestRevokeToken tests token revocation
func TestRevokeToken(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "test_session",
	})

	user := &User{Username: "admin", Role: "admin"}
	token, _, _ := am.GenerateToken(user)

	// Token should be valid initially
	_, valid := am.ValidateToken(token)
	if !valid {
		t.Fatal("Token should be valid before revocation")
	}

	// Revoke token
	am.RevokeToken(token)

	// Token should be invalid after revocation
	_, valid = am.ValidateToken(token)
	if valid {
		t.Error("Token should be invalid after revocation")
	}
}

// TestTokenExpiry tests that expired tokens are rejected
func TestTokenExpiry(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Millisecond, // Very short expiry for testing
		CookieName:   "test_session",
	})

	user := &User{Username: "admin", Role: "admin"}
	token, _, _ := am.GenerateToken(user)

	// Wait for token to expire
	time.Sleep(10 * time.Millisecond)

	// Token should be invalid
	_, valid := am.ValidateToken(token)
	if valid {
		t.Error("Expired token should not be valid")
	}
}

// TestLoginHandler tests the login HTTP handler
func TestLoginHandler(t *testing.T) {
	password := "test-password-123"
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword(password),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	handler := am.LoginHandler()

	tests := []struct {
		name           string
		method         string
		body           interface{}
		wantStatus     int
		wantSuccess    bool
		wantCookie     bool
	}{
		{
			name:       "successful login",
			method:     http.MethodPost,
			body:       LoginRequest{Username: "admin", Password: password},
			wantStatus: http.StatusOK,
			wantSuccess: true,
			wantCookie: true,
		},
		{
			name:       "wrong password",
			method:     http.MethodPost,
			body:       LoginRequest{Username: "admin", Password: "wrong"},
			wantStatus: http.StatusUnauthorized,
			wantSuccess: false,
			wantCookie: false,
		},
		{
			name:       "wrong username",
			method:     http.MethodPost,
			body:       LoginRequest{Username: "nobody", Password: password},
			wantStatus: http.StatusUnauthorized,
			wantSuccess: false,
			wantCookie: false,
		},
		{
			name:       "empty credentials",
			method:     http.MethodPost,
			body:       LoginRequest{Username: "", Password: ""},
			wantStatus: http.StatusUnauthorized,
			wantSuccess: false,
			wantCookie: false,
		},
		{
			name:       "GET method not allowed",
			method:     http.MethodGet,
			body:       nil,
			wantStatus: http.StatusMethodNotAllowed,
			wantSuccess: false,
			wantCookie: false,
		},
		{
			name:       "invalid JSON",
			method:     http.MethodPost,
			body:       "not-json",
			wantStatus: http.StatusBadRequest,
			wantSuccess: false,
			wantCookie: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body []byte
			var err error
			if tt.body != nil {
				if s, ok := tt.body.(string); ok {
					body = []byte(s)
				} else {
					body, err = json.Marshal(tt.body)
					if err != nil {
						t.Fatalf("Failed to marshal body: %v", err)
					}
				}
			}

			req := httptest.NewRequest(tt.method, "/api/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Status code = %d, want %d", w.Code, tt.wantStatus)
			}

			// Check response body for POST requests
			if tt.method == http.MethodPost && w.Code != http.StatusMethodNotAllowed {
				var resp LoginResponse
				if err := json.NewDecoder(w.Body).Decode(&resp); err == nil {
					if resp.Success != tt.wantSuccess {
						t.Errorf("Success = %v, want %v", resp.Success, tt.wantSuccess)
					}
				}
			}

			// Check cookie
			cookies := w.Result().Cookies()
			hasCookie := false
			for _, c := range cookies {
				if c.Name == "avika_session" && c.Value != "" {
					hasCookie = true
					break
				}
			}
			if hasCookie != tt.wantCookie {
				t.Errorf("Cookie present = %v, want %v", hasCookie, tt.wantCookie)
			}
		})
	}
}

// TestLogoutHandler tests the logout HTTP handler
func TestLogoutHandler(t *testing.T) {
	password := "test-password"
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword(password),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	// First login to get a token
	user := &User{Username: "admin", Role: "admin"}
	token, _, _ := am.GenerateToken(user)

	// Logout request
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{
		Name:  "avika_session",
		Value: token,
	})
	w := httptest.NewRecorder()

	am.LogoutHandler()(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", w.Code, http.StatusOK)
	}

	// Check that cookie is cleared
	cookies := w.Result().Cookies()
	for _, c := range cookies {
		if c.Name == "avika_session" {
			if c.MaxAge != -1 && c.Value != "" {
				t.Error("Session cookie should be cleared")
			}
		}
	}

	// Token should be revoked
	_, valid := am.ValidateToken(token)
	if valid {
		t.Error("Token should be revoked after logout")
	}
}

// TestMeHandler tests the /me endpoint
func TestMeHandler(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	handler := am.MeHandler()

	t.Run("authenticated user", func(t *testing.T) {
		user := &User{Username: "admin", Role: "admin"}
		req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
		ctx := context.WithValue(req.Context(), UserContextKey, user)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusOK)
		}

		var resp map[string]interface{}
		json.NewDecoder(w.Body).Decode(&resp)

		if resp["authenticated"] != true {
			t.Error("Expected authenticated to be true")
		}
	})

	t.Run("unauthenticated user", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusUnauthorized)
		}

		var resp map[string]interface{}
		json.NewDecoder(w.Body).Decode(&resp)

		if resp["authenticated"] != false {
			t.Error("Expected authenticated to be false")
		}
	})
}

// TestAuthMiddleware tests the authentication middleware
func TestAuthMiddleware(t *testing.T) {
	password := "test-password"
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword(password),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	// Create a simple handler that returns 200
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	publicPaths := []string{"/api/auth/login", "/api/auth/logout", "/health"}
	middleware := am.AuthMiddleware(publicPaths)
	handler := middleware(nextHandler)

	// Generate a valid token
	user := &User{Username: "admin", Role: "admin"}
	validToken, _, _ := am.GenerateToken(user)

	tests := []struct {
		name       string
		path       string
		token      string
		useBearer  bool
		wantStatus int
	}{
		{
			name:       "public path - login",
			path:       "/api/auth/login",
			token:      "",
			wantStatus: http.StatusOK,
		},
		{
			name:       "public path - health",
			path:       "/health",
			token:      "",
			wantStatus: http.StatusOK,
		},
		{
			name:       "protected path - no token",
			path:       "/api/servers",
			token:      "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "protected path - valid cookie token",
			path:       "/api/servers",
			token:      validToken,
			useBearer:  false,
			wantStatus: http.StatusOK,
		},
		{
			name:       "protected path - valid bearer token",
			path:       "/api/servers",
			token:      validToken,
			useBearer:  true,
			wantStatus: http.StatusOK,
		},
		{
			name:       "protected path - invalid token",
			path:       "/api/servers",
			token:      "invalid-token",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)

			if tt.token != "" {
				if tt.useBearer {
					req.Header.Set("Authorization", "Bearer "+tt.token)
				} else {
					req.AddCookie(&http.Cookie{
						Name:  "avika_session",
						Value: tt.token,
					})
				}
			}

			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Status code = %d, want %d, body: %s", w.Code, tt.wantStatus, w.Body.String())
			}
		})
	}
}

// TestAuthMiddlewareDisabled tests middleware when auth is disabled
func TestAuthMiddlewareDisabled(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled: false, // Auth disabled
	})

	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := am.AuthMiddleware(nil)
	handler := middleware(nextHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/servers", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("With auth disabled, all requests should pass. Got status %d", w.Code)
	}
}

// TestChangePasswordHandler tests password change functionality
func TestChangePasswordHandler(t *testing.T) {
	initialPassword := "initial-password"
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword(initialPassword),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	var savedHash string
	onPasswordChanged := func(newHash string) error {
		savedHash = newHash
		return nil
	}

	handler := am.ChangePasswordHandler(onPasswordChanged)

	t.Run("successful password change", func(t *testing.T) {
		user := &User{Username: "admin", Role: "admin"}
		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: initialPassword,
			NewPassword:     "new-secure-password",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := context.WithValue(req.Context(), UserContextKey, user)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusOK)
		}

		var resp ChangePasswordResponse
		json.NewDecoder(w.Body).Decode(&resp)

		if !resp.Success {
			t.Errorf("Expected success, got: %s", resp.Message)
		}

		if savedHash == "" {
			t.Error("Password hash callback was not called")
		}
	})

	t.Run("wrong current password", func(t *testing.T) {
		user := &User{Username: "admin", Role: "admin"}
		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: "wrong-password",
			NewPassword:     "new-password",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := context.WithValue(req.Context(), UserContextKey, user)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})

	t.Run("password too short", func(t *testing.T) {
		// First update the password to something known since previous test changed it
		am.mu.Lock()
		am.config.PasswordHash = HashPassword("current-pass")
		am.mu.Unlock()

		user := &User{Username: "admin", Role: "admin"}
		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: "current-pass",
			NewPassword:     "short",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := context.WithValue(req.Context(), UserContextKey, user)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusBadRequest)
		}
	})

	t.Run("unauthenticated request", func(t *testing.T) {
		body, _ := json.Marshal(ChangePasswordRequest{
			CurrentPassword: "password",
			NewPassword:     "new-password",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})
}

// TestRequireRole tests role-based access control
func TestRequireRole(t *testing.T) {
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	tests := []struct {
		name         string
		requiredRole string
		userRole     string
		wantStatus   int
	}{
		{"admin accessing admin route", "admin", "admin", http.StatusOK},
		{"viewer accessing viewer route", "viewer", "viewer", http.StatusOK},
		{"admin accessing viewer route", "viewer", "admin", http.StatusOK}, // Admin can access all
		{"viewer accessing admin route", "admin", "viewer", http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			middleware := RequireRole(tt.requiredRole)
			handler := middleware(nextHandler)

			user := &User{Username: "testuser", Role: tt.userRole}
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			ctx := context.WithValue(req.Context(), UserContextKey, user)
			req = req.WithContext(ctx)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Status code = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}

	t.Run("no user in context", func(t *testing.T) {
		middleware := RequireRole("admin")
		handler := middleware(nextHandler)

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("Status code = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})
}

// TestGetUserFromContext tests context user retrieval
func TestGetUserFromContext(t *testing.T) {
	t.Run("user in context", func(t *testing.T) {
		user := &User{Username: "admin", Role: "admin"}
		ctx := context.WithValue(context.Background(), UserContextKey, user)

		got := GetUserFromContext(ctx)
		if got == nil {
			t.Fatal("Expected user, got nil")
		}
		if got.Username != user.Username {
			t.Errorf("Username = %s, want %s", got.Username, user.Username)
		}
	})

	t.Run("no user in context", func(t *testing.T) {
		ctx := context.Background()
		got := GetUserFromContext(ctx)
		if got != nil {
			t.Errorf("Expected nil, got %v", got)
		}
	})

	t.Run("wrong type in context", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), UserContextKey, "not-a-user")
		got := GetUserFromContext(ctx)
		if got != nil {
			t.Errorf("Expected nil for wrong type, got %v", got)
		}
	})
}

// TestIsEnabled tests the IsEnabled method
func TestIsEnabled(t *testing.T) {
	t.Run("enabled", func(t *testing.T) {
		am := NewAuthManager(AuthConfig{
			Enabled:      true,
			Username:     "admin",
			PasswordHash: HashPassword("password"),
		})
		if !am.IsEnabled() {
			t.Error("Expected IsEnabled to be true")
		}
	})

	t.Run("disabled", func(t *testing.T) {
		am := NewAuthManager(AuthConfig{
			Enabled: false,
		})
		if am.IsEnabled() {
			t.Error("Expected IsEnabled to be false")
		}
	})
}

// BenchmarkHashPassword benchmarks password hashing
func BenchmarkHashPassword(b *testing.B) {
	password := "test-password-123"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HashPassword(password)
	}
}

// BenchmarkValidateToken benchmarks token validation
func BenchmarkValidateToken(b *testing.B) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Hour,
	})

	user := &User{Username: "admin", Role: "admin"}
	token, _, _ := am.GenerateToken(user)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		am.ValidateToken(token)
	}
}

// TestFirstTimeSetup tests the Jenkins-style first-time setup
func TestFirstTimeSetup(t *testing.T) {
	t.Run("auto-generates password when enabled with empty hash", func(t *testing.T) {
		am := NewAuthManager(AuthConfig{
			Enabled:      true,
			Username:     "admin",
			PasswordHash: "", // Empty = trigger first-time setup
			TokenExpiry:  1 * time.Hour,
			CookieName:   "test_session",
		})

		// Should have generated a password hash
		cfg := am.GetConfig()
		if cfg.PasswordHash == "" {
			t.Error("PasswordHash should be auto-generated")
		}

		// First-time setup flags should be set
		if !cfg.FirstTimeSetup {
			t.Error("FirstTimeSetup flag should be true")
		}
		if !cfg.RequirePassChange {
			t.Error("RequirePassChange flag should be true")
		}
	})

	t.Run("does not generate password when disabled", func(t *testing.T) {
		am := NewAuthManager(AuthConfig{
			Enabled:      false,
			Username:     "admin",
			PasswordHash: "",
		})

		cfg := am.GetConfig()
		if cfg.PasswordHash != "" {
			t.Error("PasswordHash should remain empty when auth is disabled")
		}
	})

	t.Run("does not generate password when hash is provided", func(t *testing.T) {
		providedHash := HashPassword("provided-password")
		am := NewAuthManager(AuthConfig{
			Enabled:      true,
			Username:     "admin",
			PasswordHash: providedHash,
			TokenExpiry:  1 * time.Hour,
		})

		cfg := am.GetConfig()
		if cfg.PasswordHash != providedHash {
			t.Error("Should use provided password hash")
		}
		if cfg.FirstTimeSetup {
			t.Error("FirstTimeSetup should be false when hash is provided")
		}
	})
}

// TestLoginWithPasswordChangeRequired tests login that requires password change
func TestLoginWithPasswordChangeRequired(t *testing.T) {
	// Create manager with first-time setup
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: "", // Trigger first-time setup
		TokenExpiry:  1 * time.Hour,
		CookieName:   "avika_session",
	})

	handler := am.LoginHandler()

	// We need to get the auto-generated password
	// Since we can't directly access it, we'll use a known approach
	// by resetting the password hash to a known value
	knownPassword := "test-password-123"
	am.mu.Lock()
	am.config.PasswordHash = HashPassword(knownPassword)
	am.passwordChangeCache["admin"] = true
	am.mu.Unlock()

	// Login with the password
	body, _ := json.Marshal(LoginRequest{
		Username: "admin",
		Password: knownPassword,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", w.Code, http.StatusOK)
	}

	var resp LoginResponse
	json.NewDecoder(w.Body).Decode(&resp)

	if !resp.Success {
		t.Error("Login should succeed")
	}

	if !resp.RequirePassChange {
		t.Error("RequirePassChange should be true for first-time login")
	}
}

// TestGenerateTokenWithFlags tests token generation with flags
func TestGenerateTokenWithFlags(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("password"),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "test_session",
	})

	user := &User{Username: "admin", Role: "admin"}

	t.Run("token without password change requirement", func(t *testing.T) {
		token, _, err := am.GenerateTokenWithFlags(user, false)
		if err != nil {
			t.Fatalf("GenerateTokenWithFlags failed: %v", err)
		}

		am.mu.RLock()
		entry := am.tokenCache[token]
		am.mu.RUnlock()

		if entry == nil {
			t.Fatal("Token not found in cache")
		}
		if entry.requirePassChange {
			t.Error("requirePassChange should be false")
		}
	})

	t.Run("token with password change requirement", func(t *testing.T) {
		token, _, err := am.GenerateTokenWithFlags(user, true)
		if err != nil {
			t.Fatalf("GenerateTokenWithFlags failed: %v", err)
		}

		am.mu.RLock()
		entry := am.tokenCache[token]
		am.mu.RUnlock()

		if entry == nil {
			t.Fatal("Token not found in cache")
		}
		if !entry.requirePassChange {
			t.Error("requirePassChange should be true")
		}
	})
}

// TestGenerateInitialPassword tests initial password generation
func TestGenerateInitialPassword(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled: false,
	})

	password := am.generateInitialPassword()

	if password == "" {
		t.Error("Generated password should not be empty")
	}

	// Should be 32 hex chars (16 bytes)
	if len(password) != 32 {
		t.Errorf("Generated password should be 32 chars, got %d", len(password))
	}

	// Should be different each time
	password2 := am.generateInitialPassword()
	if password == password2 {
		t.Error("Each generated password should be unique")
	}
}

// TestPasswordChangeClearsFlag tests that password change clears the flag
func TestPasswordChangeClearsFlag(t *testing.T) {
	am := NewAuthManager(AuthConfig{
		Enabled:      true,
		Username:     "admin",
		PasswordHash: HashPassword("initial-pass"),
		TokenExpiry:  1 * time.Hour,
		CookieName:   "test_session",
	})

	// Set password change requirement
	am.mu.Lock()
	am.passwordChangeCache["admin"] = true
	am.mu.Unlock()

	// Change password
	handler := am.ChangePasswordHandler(nil)

	user := &User{Username: "admin", Role: "admin"}
	body, _ := json.Marshal(ChangePasswordRequest{
		CurrentPassword: "initial-pass",
		NewPassword:     "new-secure-password",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), UserContextKey, user)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", w.Code, http.StatusOK)
	}

	// Flag should be cleared
	am.mu.RLock()
	requireChange := am.passwordChangeCache["admin"]
	am.mu.RUnlock()

	if requireChange {
		t.Error("Password change flag should be cleared after successful change")
	}
}
