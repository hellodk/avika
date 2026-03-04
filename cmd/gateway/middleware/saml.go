// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"context"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/crewjam/saml/samlsp"
)

// SAMLConfig holds SAML 2.0 Enterprise configuration
type SAMLConfig struct {
	Enabled        bool
	IdPMetadataURL string
	EntityID       string
	RootURL        string
	CertFile       string
	KeyFile        string
	GroupsClaim    string
	GroupMapping   map[string]string
	DefaultRole    string
	AutoProvision  bool
}

// SAMLProvider handles SAML authentication
type SAMLProvider struct {
	config          SAMLConfig
	authManager     *AuthManager
	userProvisioner UserProvisioner
	teamMapper      TeamMapper
	samlSP          *samlsp.Middleware
}

// NewSAMLProvider creates a new SAML provider
func NewSAMLProvider(config SAMLConfig, authManager *AuthManager, provisioner UserProvisioner, teamMapper TeamMapper) (*SAMLProvider, error) {
	if !config.Enabled {
		return nil, fmt.Errorf("SAML is not enabled")
	}

	if config.IdPMetadataURL == "" || config.RootURL == "" {
		return nil, fmt.Errorf("IdP metadata URL and Root URL are required")
	}

	keyPair, err := tls.LoadX509KeyPair(config.CertFile, config.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load SAML cert/key: %w", err)
	}
	keyPair.Leaf, err = x509.ParseCertificate(keyPair.Certificate[0])
	if err != nil {
		return nil, fmt.Errorf("failed to parse SAML certificate: %w", err)
	}

	idpMetadataURL, err := url.Parse(config.IdPMetadataURL)
	if err != nil {
		return nil, fmt.Errorf("invalid IdP metadata URL: %w", err)
	}

	idpMetadata, err := samlsp.FetchMetadata(context.Background(), http.DefaultClient, *idpMetadataURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch IdP metadata: %w", err)
	}

	rootURL, err := url.Parse(config.RootURL)
	if err != nil {
		return nil, fmt.Errorf("invalid Root URL: %w", err)
	}

	samlSP, err := samlsp.New(samlsp.Options{
		URL:         *rootURL,
		Key:         keyPair.PrivateKey.(*rsa.PrivateKey),
		Certificate: keyPair.Leaf,
		IDPMetadata: idpMetadata,
		EntityID:    config.EntityID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize SAML service provider: %w", err)
	}

	return &SAMLProvider{
		config:          config,
		authManager:     authManager,
		userProvisioner: provisioner,
		teamMapper:      teamMapper,
		samlSP:          samlSP,
	}, nil
}

// determineRole determines user role based on SAML groups and mappings
func (p *SAMLProvider) determineRole(groups []string) string {
	for _, group := range groups {
		if teamName, ok := p.config.GroupMapping[group]; ok {
			if strings.Contains(strings.ToLower(teamName), "admin") {
				return "admin"
			}
		}
	}
	return p.config.DefaultRole
}

// syncTeamMembership updates team membership
func (p *SAMLProvider) syncTeamMembership(username string, groups []string) error {
	if p.teamMapper == nil {
		return nil
	}

	if err := p.teamMapper.RemoveUserFromAllTeams(username); err != nil {
		return err
	}

	for _, group := range groups {
		if teamName, ok := p.config.GroupMapping[group]; ok {
			if err := p.teamMapper.AddUserToTeamByName(username, teamName); err != nil {
				log.Printf("SAML: Failed to add %s to team %s: %v", username, teamName, err)
			}
		}
	}

	return nil
}

// HTTPHandlers returns the SAML service provider HTTP handlers
func (p *SAMLProvider) HTTPHandlers() http.Handler {
	// Let crewjam/saml handle the standard ACS / Metadata routes
	mux := http.NewServeMux()

	// We wrap the standard flow to inject our Avika session generation upon successful callback
	mux.Handle("/saml/acs", p.handleACS())
	mux.Handle("/saml/metadata", p.samlSP)
	// Optionally initiate login from explicit trigger
	mux.Handle("/saml/login", p.samlSP.RequireAccount(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Because RequireAccount sets its own session/cookie upon success, we read it
		session := samlsp.SessionFromContext(r.Context())
		if session == nil {
			http.Error(w, "SAML session missing", http.StatusUnauthorized)
			return
		}

		p.finalizeSAMLSession(w, r, session.(samlsp.SessionWithAttributes))
	})))

	return mux
}

// finalizeSAMLSession executes the Avika-specific provisioning and token generation
func (p *SAMLProvider) finalizeSAMLSession(w http.ResponseWriter, r *http.Request, sessionAttr samlsp.SessionWithAttributes) {
	attrs := sessionAttr.GetAttributes()

	username := ""
	email := ""

	if uid, ok := attrs["uid"]; ok && len(uid) > 0 {
		username = uid[0]
	} else if nameID, ok := attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"]; ok && len(nameID) > 0 {
		username = nameID[0]
	}

	if mail, ok := attrs["mail"]; ok && len(mail) > 0 {
		email = mail[0]
	} else if emailClaim, ok := attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]; ok && len(emailClaim) > 0 {
		email = emailClaim[0]
	}

	if username == "" {
		username = email
	}

	groups := attrs[p.config.GroupsClaim]
	if len(groups) == 0 {
		groups = attrs["http://schemas.xmlsoap.org/claims/Group"]
	}

	role := p.determineRole(groups)

	if p.config.AutoProvision && p.userProvisioner != nil {
		existing, err := p.userProvisioner.GetUserInfo(username)
		if err != nil {
			log.Printf("SAML provision error checking user %s: %v", username, err)
		} else if existing == nil {
			if err := p.userProvisioner.CreateUser(username, email, role); err != nil {
				log.Printf("SAML failed to create user %s: %v", username, err)
			}
		} else if existing.Email != email {
			_ = p.userProvisioner.UpdateUserEmail(username, email)
		}

		_ = p.syncTeamMembership(username, groups)
	}

	user := &User{
		Username: username,
		Role:     role,
	}

	token, expiresAt, err := p.authManager.GenerateToken(user)
	if err != nil {
		log.Printf("Failed to generate session token for SAML user %s: %v", username, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

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

	log.Printf("SAML login successful for user: %s (role: %s)", username, role)
	http.Redirect(w, r, "/", http.StatusFound)
}

// handleACS injects Avika tracking inside the standard ACS return curve
func (p *SAMLProvider) handleACS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := r.ParseForm()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Let SAMLSP handle the assertion processing standardly first
		p.samlSP.ServeHTTP(w, r)
	}
}

// IsEnabled returns whether SAML is enabled
func (p *SAMLProvider) IsEnabled() bool {
	return p.config.Enabled
}
