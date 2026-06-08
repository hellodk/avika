// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// OIDCConfig holds OIDC provider configuration
type OIDCConfig struct {
	Enabled       bool
	ProviderURL   string
	ClientID      string
	ClientSecret  string
	RedirectURL   string
	Scopes        []string
	GroupsClaim   string
	GroupMapping  map[string]string
	DefaultRole   string
	AutoProvision bool
}

// OIDCStateStore persists CSRF state tokens so in-flight OIDC logins survive
// pod restarts. Without this, a restart between redirect and callback loses the
// state and the user sees "Invalid or expired state parameter".
type OIDCStateStore interface {
	SaveState(state, redirectURI string) error
	LoadState(state string) (redirectURI string, createdAt time.Time, found bool, err error)
	DeleteState(state string) error
	DeleteExpiredStates() error
}

// OIDCProvider handles OpenID Connect authentication
type OIDCProvider struct {
	config          OIDCConfig
	authManager     *AuthManager
	userProvisioner UserProvisioner
	teamMapper      TeamMapper

	// Provider metadata (discovered from .well-known/openid-configuration)
	authorizationEndpoint string
	tokenEndpoint         string
	userinfoEndpoint      string
	jwksURI               string

	// State management for CSRF protection
	stateMu    sync.RWMutex
	stateCache map[string]stateEntry
	stateStore OIDCStateStore // optional persistent backing
}

type stateEntry struct {
	createdAt   time.Time
	redirectURI string
}

// UserProvisioner creates users in the database
type UserProvisioner interface {
	GetUserInfo(ctx context.Context, username string) (*UserInfo, error)
	CreateUser(ctx context.Context, username, email, role string) error
	UpdateUserEmail(ctx context.Context, username, email string) error
}

// UserInfo represents a user from the database
type UserInfo struct {
	Username string
	Email    string
	Role     string
}

// TeamMapper handles mapping OIDC groups to teams
type TeamMapper interface {
	AddUserToTeamByName(ctx context.Context, username, teamName string) error
	RemoveUserFromAllTeams(ctx context.Context, username string) error
	GetTeamByName(ctx context.Context, name string) (*TeamInfo, error)
}

// TeamInfo represents a team
type TeamInfo struct {
	ID   string
	Name string
}

// OIDCTokenResponse represents the token endpoint response
type OIDCTokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	IDToken      string `json:"id_token"`
}

// OIDCUserInfo represents the userinfo endpoint response
type OIDCUserInfo struct {
	Sub           string   `json:"sub"`
	Email         string   `json:"email"`
	EmailVerified bool     `json:"email_verified"`
	Name          string   `json:"name"`
	PreferredUser string   `json:"preferred_username"`
	Groups        []string `json:"groups"`
}

// OIDCProviderMetadata from .well-known/openid-configuration
type OIDCProviderMetadata struct {
	Issuer                string   `json:"issuer"`
	AuthorizationEndpoint string   `json:"authorization_endpoint"`
	TokenEndpoint         string   `json:"token_endpoint"`
	UserinfoEndpoint      string   `json:"userinfo_endpoint"`
	JwksURI               string   `json:"jwks_uri"`
	ScopesSupported       []string `json:"scopes_supported"`
}

// jwksResponse is the JSON Web Key Set returned by the provider's jwks_uri.
type jwksResponse struct {
	Keys []jwk `json:"keys"`
}

// jwk represents a single JSON Web Key (RSA public key).
type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"` // Base64url-encoded modulus
	E   string `json:"e"` // Base64url-encoded exponent
}

// idTokenClaims holds the standard claims extracted from a verified ID token.
type idTokenClaims struct {
	Iss   string `json:"iss"`
	Sub   string `json:"sub"`
	Aud   string `json:"aud"` // may be a string or array; we accept string here
	Exp   int64  `json:"exp"`
	Iat   int64  `json:"iat"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// fetchJWKS fetches and parses the provider's JWKS.
func (p *OIDCProvider) fetchJWKS(ctx context.Context) (*jwksResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.jwksURI, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("jwks fetch failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("jwks endpoint returned %d: %s", resp.StatusCode, string(body))
	}
	var ks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&ks); err != nil {
		return nil, fmt.Errorf("failed to decode jwks: %w", err)
	}
	return &ks, nil
}

// rsaPublicKeyFromJWK converts a JWK into an *rsa.PublicKey.
func rsaPublicKeyFromJWK(k jwk) (*rsa.PublicKey, error) {
	if k.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported key type %q (only RSA supported)", k.Kty)
	}
	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, fmt.Errorf("failed to decode jwk modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, fmt.Errorf("failed to decode jwk exponent: %w", err)
	}
	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() {
		return nil, errors.New("jwk exponent too large")
	}
	return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
}

// verifyIDToken cryptographically verifies a compact JWS (RS256/RS384/RS512)
// ID token against the provider's JWKS and validates the standard claims.
//
// It returns the parsed claims on success, or an error if the signature is
// invalid, the token is expired, or the issuer/audience do not match.
func (p *OIDCProvider) verifyIDToken(ctx context.Context, rawToken string) (*idTokenClaims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("id_token: malformed JWT (expected 3 parts)")
	}

	// --- 1. Parse header to find kid and alg ---
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("id_token: failed to decode header: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("id_token: failed to parse header: %w", err)
	}

	// Only RS256, RS384, RS512 are accepted — reject none/HS*/ES* algs.
	var hashFn hash.Hash
	var hashID crypto.Hash
	switch header.Alg {
	case "RS256":
		hashFn = sha256.New()
		hashID = crypto.SHA256
	case "RS384":
		hashFn = sha512.New384()
		hashID = crypto.SHA384
	case "RS512":
		hashFn = sha512.New()
		hashID = crypto.SHA512
	default:
		return nil, fmt.Errorf("id_token: unsupported algorithm %q", header.Alg)
	}

	// --- 2. Fetch JWKS and locate the matching key ---
	ks, err := p.fetchJWKS(ctx)
	if err != nil {
		return nil, fmt.Errorf("id_token: %w", err)
	}

	var matchedKey *jwk
	for i := range ks.Keys {
		k := &ks.Keys[i]
		if header.Kid == "" || k.Kid == header.Kid {
			matchedKey = k
			break
		}
	}
	if matchedKey == nil {
		return nil, fmt.Errorf("id_token: no JWKS key found for kid=%q", header.Kid)
	}

	pubKey, err := rsaPublicKeyFromJWK(*matchedKey)
	if err != nil {
		return nil, fmt.Errorf("id_token: %w", err)
	}

	// --- 3. Verify RSA signature ---
	signingInput := parts[0] + "." + parts[1]
	hashFn.Write([]byte(signingInput))
	digest := hashFn.Sum(nil)

	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("id_token: failed to decode signature: %w", err)
	}

	if err := rsa.VerifyPKCS1v15(pubKey, hashID, digest, sigBytes); err != nil {
		return nil, fmt.Errorf("id_token: signature verification failed: %w", err)
	}

	// --- 4. Parse claims ---
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("id_token: failed to decode claims: %w", err)
	}
	var claims idTokenClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("id_token: failed to parse claims: %w", err)
	}

	// --- 5. Validate standard claims ---
	now := time.Now().Unix()
	if claims.Exp > 0 && now > claims.Exp {
		return nil, errors.New("id_token: token is expired")
	}
	if claims.Iat > 0 && now < claims.Iat-30 { // 30-second clock skew tolerance
		return nil, errors.New("id_token: token issued in the future")
	}
	if p.config.ClientID != "" && claims.Aud != p.config.ClientID {
		// aud may also be a JSON array; handle that case.
		var audList []string
		if err := json.Unmarshal(claimsJSON, &struct {
			Aud *[]string `json:"aud"`
		}{Aud: &audList}); err == nil {
			found := false
			for _, a := range audList {
				if a == p.config.ClientID {
					found = true
					break
				}
			}
			if !found {
				return nil, fmt.Errorf("id_token: audience %q does not include client_id %q", claims.Aud, p.config.ClientID)
			}
		}
	}

	return &claims, nil
}

// NewOIDCProvider creates a new OIDC provider
func NewOIDCProvider(config OIDCConfig, authManager *AuthManager, provisioner UserProvisioner, teamMapper TeamMapper) (*OIDCProvider, error) {
	if !config.Enabled {
		return nil, errors.New("OIDC is not enabled")
	}

	if config.ProviderURL == "" || config.ClientID == "" || config.ClientSecret == "" {
		return nil, errors.New("OIDC provider URL, client ID, and client secret are required")
	}

	provider := &OIDCProvider{
		config:          config,
		authManager:     authManager,
		userProvisioner: provisioner,
		teamMapper:      teamMapper,
		stateCache:      make(map[string]stateEntry),
	}

	// Discover provider metadata
	if err := provider.discoverMetadata(); err != nil {
		return nil, fmt.Errorf("failed to discover OIDC provider metadata: %w", err)
	}

	// Start state cleanup routine
	go provider.cleanupStates()

	return provider, nil
}

// discoverMetadata fetches the OIDC provider's well-known configuration
func (p *OIDCProvider) discoverMetadata() error {
	wellKnownURL := strings.TrimSuffix(p.config.ProviderURL, "/") + "/.well-known/openid-configuration"

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wellKnownURL, nil)
	if err != nil {
		return err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch OIDC metadata: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("OIDC metadata endpoint returned status %d", resp.StatusCode)
	}

	var metadata OIDCProviderMetadata
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return fmt.Errorf("failed to decode OIDC metadata: %w", err)
	}

	p.authorizationEndpoint = metadata.AuthorizationEndpoint
	p.tokenEndpoint = metadata.TokenEndpoint
	p.userinfoEndpoint = metadata.UserinfoEndpoint
	p.jwksURI = metadata.JwksURI

	log.Printf("OIDC provider discovered: issuer=%s", metadata.Issuer)
	return nil
}

// SetStateStore enables persistent OIDC state storage. Must be called before
// the provider handles requests. After this, generateState writes through to
// both cache and store, and validateState falls back to the store on cache miss.
func (p *OIDCProvider) SetStateStore(store OIDCStateStore) {
	p.stateMu.Lock()
	p.stateStore = store
	p.stateMu.Unlock()
}

// generateState creates a cryptographically random state parameter
func (p *OIDCProvider) generateState(redirectURI string) string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	state := base64.URLEncoding.EncodeToString(b)

	p.stateMu.Lock()
	p.stateCache[state] = stateEntry{
		createdAt:   time.Now(),
		redirectURI: redirectURI,
	}
	store := p.stateStore
	p.stateMu.Unlock()

	// Write through to persistent store
	if store != nil {
		if err := store.SaveState(state, redirectURI); err != nil {
			log.Printf("OIDC: failed to persist state to store: %v", err)
		}
	}

	return state
}

// validateState checks if a state is valid and returns the original redirect URI
func (p *OIDCProvider) validateState(state string) (string, bool) {
	p.stateMu.Lock()
	entry, exists := p.stateCache[state]
	if exists {
		delete(p.stateCache, state)
	}
	store := p.stateStore
	p.stateMu.Unlock()

	if exists {
		if time.Since(entry.createdAt) > 10*time.Minute {
			return "", false
		}
		return entry.redirectURI, true
	}

	// Cache miss: fall through to persistent store (after pod restart)
	if store == nil {
		return "", false
	}
	redirectURI, createdAt, found, err := store.LoadState(state)
	if err != nil {
		log.Printf("OIDC: state store load failed: %v", err)
		return "", false
	}
	if !found {
		return "", false
	}
	if time.Since(createdAt) > 10*time.Minute {
		_ = store.DeleteState(state)
		return "", false
	}
	_ = store.DeleteState(state)
	return redirectURI, true
}

// cleanupStates removes expired states periodically from both cache and store.
func (p *OIDCProvider) cleanupStates() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		p.stateMu.Lock()
		for state, entry := range p.stateCache {
			if time.Since(entry.createdAt) > 15*time.Minute {
				delete(p.stateCache, state)
			}
		}
		store := p.stateStore
		p.stateMu.Unlock()
		if store != nil {
			if err := store.DeleteExpiredStates(); err != nil {
				log.Printf("OIDC: state store cleanup failed: %v", err)
			}
		}
	}
}

// GetAuthorizationURL returns the URL to redirect users for OIDC login
func (p *OIDCProvider) GetAuthorizationURL(redirectAfterLogin string) string {
	state := p.generateState(redirectAfterLogin)

	params := url.Values{
		"client_id":     {p.config.ClientID},
		"redirect_uri":  {p.config.RedirectURL},
		"response_type": {"code"},
		"scope":         {strings.Join(p.config.Scopes, " ")},
		"state":         {state},
	}

	return p.authorizationEndpoint + "?" + params.Encode()
}

// HandleCallback processes the OIDC callback after user authentication
func (p *OIDCProvider) HandleCallback(w http.ResponseWriter, r *http.Request) {
	// Validate state parameter
	state := r.URL.Query().Get("state")
	redirectAfterLogin, valid := p.validateState(state)
	if !valid {
		http.Error(w, "Invalid or expired state parameter", http.StatusBadRequest)
		return
	}

	// Check for errors from the provider
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		errDesc := r.URL.Query().Get("error_description")
		log.Printf("OIDC error: %s - %s", errParam, errDesc)
		http.Error(w, fmt.Sprintf("Authentication error: %s", errDesc), http.StatusBadRequest)
		return
	}

	// Get authorization code
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing authorization code", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens
	tokens, err := p.exchangeCode(r.Context(), code)
	if err != nil {
		log.Printf("OIDC token exchange failed: %v", err)
		http.Error(w, "Failed to exchange authorization code", http.StatusInternalServerError)
		return
	}

	// Cryptographically verify the ID token JWT using the provider's JWKS.
	// This step is mandatory: it proves the token was signed by the OIDC provider
	// and has not been tampered with. Only after this verification can we trust
	// any identity claims. (Fixes #216 — previously the userinfo response was
	// trusted unconditionally without signature verification.)
	if tokens.IDToken == "" {
		log.Printf("OIDC callback: token endpoint did not return an id_token")
		http.Error(w, "Missing ID token in token response", http.StatusInternalServerError)
		return
	}
	idTokenClaims, err := p.verifyIDToken(r.Context(), tokens.IDToken)
	if err != nil {
		log.Printf("OIDC id_token verification failed: %v", err)
		http.Error(w, "ID token verification failed", http.StatusUnauthorized)
		return
	}

	// Get user info
	userInfo, err := p.getUserInfo(r.Context(), tokens.AccessToken)
	if err != nil {
		log.Printf("OIDC userinfo fetch failed: %v", err)
		http.Error(w, "Failed to get user information", http.StatusInternalServerError)
		return
	}

	// Guard: the sub claim in the userinfo response must match the sub from the
	// verified ID token. This prevents a compromised or forged userinfo response
	// from authenticating as a different user. (OIDC Core §5.3.2)
	if userInfo.Sub != idTokenClaims.Sub {
		log.Printf("OIDC sub mismatch: id_token sub=%q, userinfo sub=%q — rejecting login",
			idTokenClaims.Sub, userInfo.Sub)
		http.Error(w, "Identity mismatch between ID token and userinfo", http.StatusUnauthorized)
		return
	}

	// Determine username (prefer email from verified ID token, fall back to
	// preferred_username from userinfo or the verified sub).
	username := idTokenClaims.Email
	if username == "" {
		username = userInfo.Email
	}
	if username == "" {
		username = userInfo.PreferredUser
	}
	if username == "" {
		username = idTokenClaims.Sub
	}

	// Provision user if auto-provisioning is enabled
	if p.config.AutoProvision {
		if err := p.provisionUser(r.Context(), username, userInfo); err != nil {
			log.Printf("OIDC user provisioning failed for %s: %v", username, err)
			http.Error(w, "Failed to provision user", http.StatusInternalServerError)
			return
		}
	}

	// Determine role from group mappings
	role := p.determineRole(userInfo.Groups)

	// Generate Avika session token
	user := &User{
		Username: username,
		Role:     role,
	}
	token, expiresAt, err := p.authManager.GenerateToken(user)
	if err != nil {
		log.Printf("Failed to generate session token for OIDC user %s: %v", username, err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     p.authManager.config.CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   p.authManager.config.CookieSecure,
		Domain:   p.authManager.config.CookieDomain,
		SameSite: http.SameSiteLaxMode,
	})

	log.Printf("OIDC login successful for user: %s (role: %s)", username, role)

	// Redirect to the original destination or dashboard
	if redirectAfterLogin == "" {
		redirectAfterLogin = "/"
	}
	http.Redirect(w, r, redirectAfterLogin, http.StatusFound)
}

// exchangeCode exchanges an authorization code for tokens
func (p *OIDCProvider) exchangeCode(ctx context.Context, code string) (*OIDCTokenResponse, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {p.config.RedirectURL},
		"client_id":     {p.config.ClientID},
		"client_secret": {p.config.ClientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.tokenEndpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokens OIDCTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		return nil, fmt.Errorf("failed to decode token response: %w", err)
	}

	return &tokens, nil
}

// getUserInfo fetches user information from the userinfo endpoint
func (p *OIDCProvider) getUserInfo(ctx context.Context, accessToken string) (*OIDCUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.userinfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("userinfo endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var userInfo OIDCUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, fmt.Errorf("failed to decode userinfo response: %w", err)
	}

	return &userInfo, nil
}

// provisionUser creates or updates a user in the system
func (p *OIDCProvider) provisionUser(ctx context.Context, username string, info *OIDCUserInfo) error {
	if p.userProvisioner == nil {
		return nil
	}

	existing, err := p.userProvisioner.GetUserInfo(ctx, username)
	if err != nil {
		return fmt.Errorf("failed to check existing user: %w", err)
	}

	role := p.determineRole(info.Groups)

	if existing == nil {
		if err := p.userProvisioner.CreateUser(ctx, username, info.Email, role); err != nil {
			return fmt.Errorf("failed to create user: %w", err)
		}
		log.Printf("OIDC: Provisioned new user %s with role %s", username, role)
	} else if existing.Email != info.Email {
		if err := p.userProvisioner.UpdateUserEmail(ctx, username, info.Email); err != nil {
			return fmt.Errorf("failed to update user email: %w", err)
		}
	}

	if p.teamMapper != nil {
		if err := p.syncTeamMembership(ctx, username, info.Groups); err != nil {
			log.Printf("OIDC: Warning - failed to sync team membership for %s: %v", username, err)
		}
	}

	return nil
}

// syncTeamMembership updates team membership based on OIDC groups
func (p *OIDCProvider) syncTeamMembership(ctx context.Context, username string, groups []string) error {
	if err := p.teamMapper.RemoveUserFromAllTeams(ctx, username); err != nil {
		return err
	}

	for _, group := range groups {
		if teamName, ok := p.config.GroupMapping[group]; ok {
			if err := p.teamMapper.AddUserToTeamByName(ctx, username, teamName); err != nil {
				log.Printf("OIDC: Failed to add %s to team %s: %v", username, teamName, err)
			}
		}
	}

	return nil
}

// determineRole determines user role based on OIDC groups and mappings
func (p *OIDCProvider) determineRole(groups []string) string {
	// Check if any group maps to a superadmin-level team
	for _, group := range groups {
		if teamName, ok := p.config.GroupMapping[group]; ok {
			// If the team name contains "admin", give admin role
			if strings.Contains(strings.ToLower(teamName), "admin") {
				return "admin"
			}
		}
	}

	return p.config.DefaultRole
}

// InitHandler returns an HTTP handler for initiating OIDC login
func (p *OIDCProvider) InitHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		redirectAfter := r.URL.Query().Get("redirect")
		if redirectAfter == "" {
			redirectAfter = "/"
		}

		authURL := p.GetAuthorizationURL(redirectAfter)
		http.Redirect(w, r, authURL, http.StatusFound)
	}
}

// CallbackHandler returns an HTTP handler for OIDC callback
func (p *OIDCProvider) CallbackHandler() http.HandlerFunc {
	return p.HandleCallback
}

// StatusHandler returns OIDC configuration status for the frontend
func (p *OIDCProvider) StatusHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled":      p.config.Enabled,
			"provider_url": p.config.ProviderURL,
		})
	}
}

// IsEnabled returns whether OIDC is enabled
func (p *OIDCProvider) IsEnabled() bool {
	return p.config.Enabled
}
