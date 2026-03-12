package main

import (
	"encoding/json"
	"net/http"
)

func (s *server) handleGetSLOTargets(w http.ResponseWriter, r *http.Request) {
	targets, err := s.db.ListSLOTargets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(targets)
}

func (s *server) handleUpsertSLOTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var target SLOTarget
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	if err := s.db.UpsertSLOTarget(&target); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(target)
}

func (s *server) handleDeleteSLOTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing id", http.StatusBadRequest)
		return
	}

	if err := s.db.DeleteSLOTarget(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

type SLOComplianceResult struct {
	Target SLOTarget `json:"target"`
	SLI    float64   `json:"sli"`
}

func (s *server) handleGetSLOCompliance(w http.ResponseWriter, r *http.Request) {
	targets, err := s.db.ListSLOTargets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var results []SLOComplianceResult
	for _, t := range targets {
		sli, err := s.clickhouse.GetSLI(r.Context(), t.EntityType, t.EntityID, t.SLOType, t.TimeWindow)
		if err != nil {
			// fallback/skip if CH fails for a row
			continue
		}
		results = append(results, SLOComplianceResult{
			Target: t,
			SLI:    sli,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
