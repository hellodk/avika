package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

const (
	defaultAgentPort = 5025
)

// handleListCertificates proxies ListCertificates to the agent
func (s *server) handleListCertificates(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent id required"}`, http.StatusBadRequest)
		return
	}

	client, conn, err := s.getAgentClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusNotFound)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := client.ListCertificates(ctx, &pb.CertListRequest{InstanceId: agentID})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to list certificates: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Certificates)
}

// handleUploadCertificate handles certificate upload and proxies to the agent
func (srv *server) handleUploadCertificate(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent id required"}`, http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read body"}`, http.StatusBadRequest)
		return
	}

	var req pb.UploadCertificateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	client, conn, err := srv.getAgentClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusNotFound)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := client.UploadCertificate(ctx, &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to upload certificate: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleDeleteCertificate proxies DeleteCertificate to the agent
func (s *server) handleDeleteCertificate(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	domain := r.URL.Query().Get("domain")
	if agentID == "" || domain == "" {
		http.Error(w, `{"error":"agent id and domain are required"}`, http.StatusBadRequest)
		return
	}

	client, conn, err := s.getAgentClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusNotFound)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := client.DeleteCertificate(ctx, &pb.DeleteCertificateRequest{
		CertificateId: domain, // We use domain as ID in the agent
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to delete certificate: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}


