package main

import (
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"os"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// handleInstallInfo handles GET /api/system/install-info.
//
// Returns metadata the frontend uses to build a complete agent install snippet:
//   - tls_self_signed: whether the gateway's TLS cert is self-signed (frontend
//     adds INSECURE_CURL=true to the snippet so deploy-agent.sh can curl through it).
//   - version: gateway version string, useful for the "Test Reachability" UI.
//
// Auth: any authenticated user (info is non-sensitive but admin context only).
func (srv *server) handleInstallInfo(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	selfSigned := false
	if srv.config != nil && srv.config.Security.TLSCertFile != "" {
		if data, err := os.ReadFile(srv.config.Security.TLSCertFile); err == nil {
			block, _ := pem.Decode(data)
			if block != nil {
				if cert, err := x509.ParseCertificate(block.Bytes); err == nil {
					// A cert is self-signed when its Issuer DN equals its Subject DN.
					// This is the same heuristic openssl uses for `-subject -issuer`.
					selfSigned = cert.Issuer.String() == cert.Subject.String()
				}
			}
		}
	}

	grpcAddr := ""
	if srv.config != nil {
		grpcAddr = srv.config.Server.ExternalGRPCAddr
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"version":         Version,
		"tls_self_signed": selfSigned,
		"grpc_addr":       grpcAddr,
	})
}
