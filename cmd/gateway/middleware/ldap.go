// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-ldap/ldap/v3"
)

// LDAPConfig holds LDAP Enterprise configuration
type LDAPConfig struct {
	Enabled       bool
	URL           string
	BindDN        string
	BindPassword  string
	BaseDN        string
	UserFilter    string
	GroupFilter   string
	GroupMapping  map[string]string
	DefaultRole   string
	AutoProvision bool
}

// LDAPProvider handles LDAP authentication
type LDAPProvider struct {
	config          LDAPConfig
	authManager     *AuthManager
	userProvisioner UserProvisioner
	teamMapper      TeamMapper
}

// NewLDAPProvider creates a new LDAP provider
func NewLDAPProvider(config LDAPConfig, authManager *AuthManager, provisioner UserProvisioner, teamMapper TeamMapper) (*LDAPProvider, error) {
	if !config.Enabled {
		return nil, fmt.Errorf("LDAP is not enabled")
	}

	if config.URL == "" {
		return nil, fmt.Errorf("LDAP URL is required")
	}

	return &LDAPProvider{
		config:          config,
		authManager:     authManager,
		userProvisioner: provisioner,
		teamMapper:      teamMapper,
	}, nil
}

// connect establishes a connection to the LDAP server
func (p *LDAPProvider) connect() (*ldap.Conn, error) {
	parsedURL, err := url.Parse(p.config.URL)
	if err != nil {
		return nil, err
	}

	var l *ldap.Conn

	if parsedURL.Scheme == "ldaps" {
		l, err = ldap.DialTLS("tcp", parsedURL.Host, &tls.Config{InsecureSkipVerify: true})
	} else {
		l, err = ldap.DialURL(p.config.URL)
	}

	if err != nil {
		return nil, err
	}

	// Bind as service account if configured
	if p.config.BindDN != "" && p.config.BindPassword != "" {
		err = l.Bind(p.config.BindDN, p.config.BindPassword)
		if err != nil {
			l.Close()
			return nil, fmt.Errorf("LDAP bind failed: %w", err)
		}
	}

	return l, nil
}

// Authenticate user via LDAP
// Returns the username, email, groups, and an error if authentication fails.
func (p *LDAPProvider) Authenticate(username, password string) (string, string, []string, error) {
	l, err := p.connect()
	if err != nil {
		return "", "", nil, err
	}
	defer l.Close()

	userFilter := strings.Replace(p.config.UserFilter, "%s", ldap.EscapeFilter(username), -1)
	if userFilter == "" {
		userFilter = fmt.Sprintf("(uid=%s)", ldap.EscapeFilter(username))
	}

	// Find the user
	searchRequest := ldap.NewSearchRequest(
		p.config.BaseDN,
		ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false,
		userFilter,
		[]string{"dn", "cn", "mail", "uid", "sAMAccountName", "memberOf"},
		nil,
	)

	searchResult, err := l.Search(searchRequest)
	if err != nil {
		return "", "", nil, fmt.Errorf("LDAP user search failed: %w", err)
	}

	if len(searchResult.Entries) == 0 {
		return "", "", nil, fmt.Errorf("user not found")
	}

	if len(searchResult.Entries) > 1 {
		return "", "", nil, fmt.Errorf("multiple users found")
	}

	userEntry := searchResult.Entries[0]
	userDN := userEntry.DN
	email := userEntry.GetAttributeValue("mail")

	// Verify password by binding as the user
	err = l.Bind(userDN, password)
	if err != nil {
		return "", "", nil, fmt.Errorf("invalid credentials")
	}

	// Rebind as service account for group search (if needed)
	if p.config.BindDN != "" && p.config.BindPassword != "" {
		_ = l.Bind(p.config.BindDN, p.config.BindPassword)
	}

	// Extract groups (Active Directory typically embeds these in memberOf)
	groups := userEntry.GetAttributeValues("memberOf")

	// If memberOf isn't there, search explicitly via group filter (OpenLDAP style)
	if len(groups) == 0 && p.config.GroupFilter != "" {
		uidAttr := userEntry.GetAttributeValue("uid")
		if uidAttr == "" {
			uidAttr = userEntry.GetAttributeValue("sAMAccountName")
		}

		groupFilter := strings.Replace(p.config.GroupFilter, "%s", ldap.EscapeFilter(uidAttr), -1)
		groupSearch := ldap.NewSearchRequest(
			p.config.BaseDN,
			ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 0, 0, false,
			groupFilter,
			[]string{"cn", "dn"},
			nil,
		)

		if groupResult, err := l.Search(groupSearch); err == nil {
			for _, entry := range groupResult.Entries {
				groups = append(groups, entry.GetAttributeValue("cn"))
			}
		}
	}

	return username, email, groups, nil
}

// determineRole determines user role based on LDAP groups and mappings
func (p *LDAPProvider) determineRole(groups []string) string {
	for _, group := range groups {
		if teamName, ok := p.config.GroupMapping[group]; ok {
			if strings.Contains(strings.ToLower(teamName), "admin") {
				return "admin"
			}
		}
		// Also match CNs directly
		for mappingGroup, teamName := range p.config.GroupMapping {
			if strings.Contains(group, mappingGroup) {
				if strings.Contains(strings.ToLower(teamName), "admin") {
					return "admin"
				}
			}
		}
	}
	return p.config.DefaultRole
}

// syncTeamMembership updates team membership
func (p *LDAPProvider) syncTeamMembership(username string, groups []string) error {
	if p.teamMapper == nil {
		return nil
	}

	if err := p.teamMapper.RemoveUserFromAllTeams(username); err != nil {
		return err
	}

	for _, group := range groups {
		for mappingGroup, teamName := range p.config.GroupMapping {
			if strings.Contains(group, mappingGroup) || group == mappingGroup {
				if err := p.teamMapper.AddUserToTeamByName(username, teamName); err != nil {
					log.Printf("LDAP: Failed to add %s to team %s: %v", username, teamName, err)
				}
			}
		}
	}

	return nil
}

// LoginHandler returns an HTTP handler for LDAP login
func (p *LDAPProvider) LoginHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		username, email, groups, err := p.Authenticate(req.Username, req.Password)
		if err != nil {
			log.Printf("LDAP login failed for user %s: %v", req.Username, err)
			http.Error(w, "Invalid username or password", http.StatusUnauthorized)
			return
		}

		role := p.determineRole(groups)

		if p.config.AutoProvision && p.userProvisioner != nil {
			existing, err := p.userProvisioner.GetUserInfo(username)
			if err != nil {
				log.Printf("LDAP provision error checking user %s: %v", username, err)
			} else if existing == nil {
				if err := p.userProvisioner.CreateUser(username, email, role); err != nil {
					log.Printf("LDAP failed to create user %s: %v", username, err)
				}
			} else if existing.Email != email {
				_ = p.userProvisioner.UpdateUserEmail(username, email)
			}

			_ = p.syncTeamMembership(username, groups)
		}

		// Generate Session Token
		user := &User{
			Username: username,
			Role:     role,
		}

		token, expiresAt, err := p.authManager.GenerateToken(user)
		if err != nil {
			log.Printf("Failed to generate session token for LDAP user %s: %v", username, err)
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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"user":    username,
			"role":    role,
		})
	}
}

// IsEnabled returns whether LDAP is enabled
func (p *LDAPProvider) IsEnabled() bool {
	return p.config.Enabled
}
