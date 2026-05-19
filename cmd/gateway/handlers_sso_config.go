package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// ============================================================================
// SSO Configuration Handlers
// ============================================================================

// handleGetSSOConfig handles GET /api/sso/config/{provider}
func (srv *server) handleGetSSOConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	provider := r.PathValue("provider")
	if provider != "oidc" && provider != "ldap" && provider != "saml" {
		http.Error(w, `{"error":"invalid provider, must be oidc, ldap, or saml"}`, http.StatusBadRequest)
		return
	}

	// Fetch DB config
	dbRecord, err := srv.db.GetSSOConfig(provider)
	if err != nil {
		log.Printf("Error fetching SSO config for %s: %v", provider, err)
		http.Error(w, fmt.Sprintf(`{"error":"failed to fetch SSO config","message":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Build runtime config from environment/config file
	runtimeConfig := srv.buildSSORuntime(provider)
	runtimeHasValues := len(runtimeConfig) > 0

	// Determine source
	dbHasValues := dbRecord != nil && string(dbRecord.Config) != "{}" && string(dbRecord.Config) != ""
	source := "env"
	if dbHasValues && runtimeHasValues {
		source = "mixed"
	} else if dbHasValues {
		source = "db"
	} else if runtimeHasValues {
		source = "env"
	}

	// Build response
	var configJSON json.RawMessage
	isEnabled := false
	if dbRecord != nil {
		configJSON = dbRecord.Config
		isEnabled = dbRecord.IsEnabled
	} else {
		configJSON = json.RawMessage(`{}`)
	}

	// Redact secrets in runtime config
	redactedRuntime := redactSSOSecrets(provider, runtimeConfig)

	runtimeEnabled := srv.isSSOProviderRuntimeEnabled(provider)

	resp := map[string]interface{}{
		"provider":       provider,
		"is_enabled":     isEnabled,
		"runtime_enabled": runtimeEnabled,
		"config":         configJSON,
		"runtime_config": redactedRuntime,
		"source":         source,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// handlePutSSOConfig handles PUT /api/sso/config/{provider}
func (srv *server) handlePutSSOConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	provider := r.PathValue("provider")
	if provider != "oidc" && provider != "ldap" && provider != "saml" {
		http.Error(w, `{"error":"invalid provider, must be oidc, ldap, or saml"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Config    json.RawMessage `json:"config"`
		IsEnabled bool            `json:"is_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Config == nil {
		req.Config = json.RawMessage(`{}`)
	}

	if err := srv.db.UpsertSSOConfig(provider, req.Config, req.IsEnabled, user.Username); err != nil {
		log.Printf("Error upserting SSO config for %s: %v", provider, err)
		http.Error(w, fmt.Sprintf(`{"error":"failed to save SSO config","message":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Audit log
	_ = srv.db.CreateAuditLog(user.Username, "update", "sso_config", provider, r.RemoteAddr, r.UserAgent(), map[string]string{
		"provider":   provider,
		"is_enabled": fmt.Sprintf("%v", req.IsEnabled),
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("SSO config for %s saved successfully", provider),
	})
}

// handleTestSSOConfig handles POST /api/sso/test/{provider}
func (srv *server) handleTestSSOConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	provider := r.PathValue("provider")
	if provider != "oidc" && provider != "ldap" && provider != "saml" {
		http.Error(w, `{"error":"invalid provider, must be oidc, ldap, or saml"}`, http.StatusBadRequest)
		return
	}

	var success bool
	var message string

	switch provider {
	case "oidc":
		success, message = srv.testOIDCConfig()
	case "ldap":
		success, message = srv.testLDAPConfig()
	case "saml":
		success, message = srv.testSAMLConfig()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"message": message,
	})
}

// ============================================================================
// SSO Test Helpers
// ============================================================================

// testOIDCConfig attempts to fetch the OIDC discovery document.
func (srv *server) testOIDCConfig() (bool, string) {
	// Try DB config first, then runtime config
	issuerURL := ""

	dbRecord, err := srv.db.GetSSOConfig("oidc")
	if err == nil && dbRecord != nil {
		var cfg map[string]interface{}
		if json.Unmarshal(dbRecord.Config, &cfg) == nil {
			if u, ok := cfg["provider_url"].(string); ok && u != "" {
				issuerURL = u
			}
		}
	}

	// Fall back to runtime config
	if issuerURL == "" {
		issuerURL = srv.config.OIDC.ProviderURL
	}

	if issuerURL == "" {
		return false, "no OIDC provider URL configured"
	}

	discoveryURL := strings.TrimRight(issuerURL, "/") + "/.well-known/openid-configuration"
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(discoveryURL)
	if err != nil {
		return false, fmt.Sprintf("failed to reach OIDC discovery endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("OIDC discovery endpoint returned status %d", resp.StatusCode)
	}

	return true, fmt.Sprintf("OIDC discovery endpoint reachable at %s", discoveryURL)
}

// testLDAPConfig attempts a TCP dial to the configured LDAP server.
func (srv *server) testLDAPConfig() (bool, string) {
	ldapURL := ""

	dbRecord, err := srv.db.GetSSOConfig("ldap")
	if err == nil && dbRecord != nil {
		var cfg map[string]interface{}
		if json.Unmarshal(dbRecord.Config, &cfg) == nil {
			if u, ok := cfg["url"].(string); ok && u != "" {
				ldapURL = u
			}
		}
	}

	// Fall back to runtime config
	if ldapURL == "" {
		ldapURL = srv.config.LDAP.URL
	}

	if ldapURL == "" {
		return false, "no LDAP server URL configured"
	}

	// Parse the LDAP URL to extract host:port for TCP dial
	addr := ldapURL
	addr = strings.TrimPrefix(addr, "ldaps://")
	addr = strings.TrimPrefix(addr, "ldap://")
	addr = strings.TrimRight(addr, "/")

	// Add default port if missing
	if !strings.Contains(addr, ":") {
		if strings.HasPrefix(ldapURL, "ldaps://") {
			addr = addr + ":636"
		} else {
			addr = addr + ":389"
		}
	}

	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return false, fmt.Sprintf("failed to connect to LDAP server at %s: %v", addr, err)
	}
	conn.Close()

	return true, fmt.Sprintf("LDAP server reachable at %s", addr)
}

// testSAMLConfig attempts to fetch the IdP metadata URL.
func (srv *server) testSAMLConfig() (bool, string) {
	metadataURL := ""

	dbRecord, err := srv.db.GetSSOConfig("saml")
	if err == nil && dbRecord != nil {
		var cfg map[string]interface{}
		if json.Unmarshal(dbRecord.Config, &cfg) == nil {
			if u, ok := cfg["idp_metadata_url"].(string); ok && u != "" {
				metadataURL = u
			}
		}
	}

	// Fall back to runtime config
	if metadataURL == "" {
		metadataURL = srv.config.SAML.IdPMetadataURL
	}

	if metadataURL == "" {
		return false, "no SAML IdP metadata URL configured"
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(metadataURL)
	if err != nil {
		return false, fmt.Sprintf("failed to reach SAML IdP metadata endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("SAML IdP metadata endpoint returned status %d", resp.StatusCode)
	}

	return true, fmt.Sprintf("SAML IdP metadata endpoint reachable at %s", metadataURL)
}

// ============================================================================
// SSO Runtime Config Helpers
// ============================================================================

// buildSSORuntime extracts the runtime (env/config-file) SSO settings for a provider.
// Secrets are NOT redacted here; use redactSSOSecrets on the result.
func (srv *server) buildSSORuntime(provider string) map[string]string {
	result := make(map[string]string)

	switch provider {
	case "oidc":
		cfg := srv.config.OIDC
		if cfg.ProviderURL != "" {
			result["provider_url"] = cfg.ProviderURL
		}
		if cfg.ClientID != "" {
			result["client_id"] = cfg.ClientID
		}
		if cfg.ClientSecret != "" {
			result["client_secret"] = cfg.ClientSecret
		}
		if cfg.RedirectURL != "" {
			result["redirect_url"] = cfg.RedirectURL
		}
		if len(cfg.Scopes) > 0 {
			result["scopes"] = strings.Join(cfg.Scopes, ",")
		}
		if cfg.GroupsClaim != "" {
			result["groups_claim"] = cfg.GroupsClaim
		}
		if cfg.DefaultRole != "" {
			result["default_role"] = cfg.DefaultRole
		}

	case "ldap":
		cfg := srv.config.LDAP
		if cfg.URL != "" {
			result["url"] = cfg.URL
		}
		if cfg.BindDN != "" {
			result["bind_dn"] = cfg.BindDN
		}
		if cfg.BindPassword != "" {
			result["bind_password"] = cfg.BindPassword
		}
		if cfg.BaseDN != "" {
			result["base_dn"] = cfg.BaseDN
		}
		if cfg.UserFilter != "" {
			result["user_filter"] = cfg.UserFilter
		}
		if cfg.GroupFilter != "" {
			result["group_filter"] = cfg.GroupFilter
		}
		if cfg.DefaultRole != "" {
			result["default_role"] = cfg.DefaultRole
		}

	case "saml":
		cfg := srv.config.SAML
		if cfg.IdPMetadataURL != "" {
			result["idp_metadata_url"] = cfg.IdPMetadataURL
		}
		if cfg.EntityID != "" {
			result["entity_id"] = cfg.EntityID
		}
		if cfg.RootURL != "" {
			result["root_url"] = cfg.RootURL
		}
		if cfg.CertFile != "" {
			result["cert_file"] = cfg.CertFile
		}
		if cfg.KeyFile != "" {
			result["key_file"] = cfg.KeyFile
		}
		if cfg.GroupsClaim != "" {
			result["groups_claim"] = cfg.GroupsClaim
		}
		if cfg.DefaultRole != "" {
			result["default_role"] = cfg.DefaultRole
		}
	}

	return result
}

// redactSSOSecrets replaces secret field values with "***" (or "" if empty).
func redactSSOSecrets(provider string, runtime map[string]string) map[string]string {
	secretFields := map[string]map[string]bool{
		"oidc": {"client_secret": true},
		"ldap": {"bind_password": true},
		"saml": {"key_file": true},
	}

	redacted := make(map[string]string, len(runtime))
	for k, v := range runtime {
		if secretFields[provider][k] {
			if v != "" {
				redacted[k] = "***"
			} else {
				redacted[k] = ""
			}
		} else {
			redacted[k] = v
		}
	}
	return redacted
}

// isSSOProviderRuntimeEnabled checks if the provider is enabled in the runtime config (env/file).
func (srv *server) isSSOProviderRuntimeEnabled(provider string) bool {
	switch provider {
	case "oidc":
		return srv.config.OIDC.Enabled
	case "ldap":
		return srv.config.LDAP.Enabled
	case "saml":
		return srv.config.SAML.Enabled
	}
	return false
}
