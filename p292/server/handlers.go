package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Server struct {
	cache   *BindingCache
	logger  *EventLogger
	tunnels *TunnelManager
	history *HistoryManager
}

func NewServer(cache *BindingCache, logger *EventLogger, tunnels *TunnelManager, history *HistoryManager) *Server {
	return &Server{
		cache:   cache,
		logger:  logger,
		tunnels: tunnels,
		history: history,
	}
}

func (s *Server) HandlePBU(w http.ResponseWriter, r *http.Request) {
	var req PBURequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.MNID == "" || req.MNPrefix == "" || req.MAGAddress == "" {
		http.Error(w, "missing required fields: mn_id, mn_prefix, mag_address", http.StatusBadRequest)
		return
	}

	if req.AccessTech == "" {
		req.AccessTech = AccessTechWiFi
	}
	if !req.AccessTech.IsValid() {
		http.Error(w, "invalid access_tech_type: must be ethernet, wifi, lte, or 5g", http.StatusBadRequest)
		return
	}

	priority := req.AccessTech.Priority()

	var qosProfile *QoSProfile
	if len(req.QoSClasses) > 0 {
		qosProfile = NewQoSProfile(req.QoSClasses)
		qosProfile = NegotiateQoS(qosProfile, req.MAGAddress, req.AccessTech)
		s.logger.Log("qos_negotiate", req.MNID, req.MAGAddress,
			fmt.Sprintf("QoS negotiated: %d flows, %d kbps total, granted=%v, reason=%s",
				len(qosProfile.FlowMappings), qosProfile.TotalBandwidth(),
				qosProfile.Granted, qosProfile.Reason))
	}

	if req.Lifetime == 0 {
		oldEntry, existed := s.cache.DeRegister(req.MNID)
		if existed {
			s.tunnels.CompleteHandover(req.MNID)
			s.logger.Log("deregister", req.MNID, req.MAGAddress,
				fmt.Sprintf("BCE deregistered for MN %s (was on %s/%s)",
					req.MNID, oldEntry.MAGAddress, oldEntry.AccessTech))
			rec := BindingUpdateRecord{
				MNID:          req.MNID,
				MNPrefix:      req.MNPrefix,
				OldMAGAddress: oldEntry.MAGAddress,
				NewMAGAddress: req.MAGAddress,
				OldAccessTech: oldEntry.AccessTech,
				NewAccessTech: req.AccessTech,
				Lifetime:      0,
				Operation:     "deregister",
				Status:        "success",
				Message:       "deregistered",
			}
			s.history.AddRecord(rec)
			respondJSON(w, http.StatusOK, PBAResponse{
				Status:         0,
				Message:        "deregistered",
				MNID:           req.MNID,
				TunnelPriority: oldEntry.TunnelPriority,
			})
		} else {
			s.logger.Log("deregister_failed", req.MNID, req.MAGAddress, "no BCE found for MN "+req.MNID)
			rec := BindingUpdateRecord{
				MNID:          req.MNID,
				MNPrefix:      req.MNPrefix,
				NewMAGAddress: req.MAGAddress,
				NewAccessTech: req.AccessTech,
				Lifetime:      0,
				Operation:     "deregister",
				Status:        "rejected",
				Message:       "entry not found",
			}
			s.history.AddRecord(rec)
			respondJSON(w, http.StatusNotFound, PBAResponse{
				Status:  1,
				Message: "entry not found",
				MNID:    req.MNID,
			})
		}
		return
	}

	entry := BCEEntry{
		MNID:       req.MNID,
		MNPrefix:   req.MNPrefix,
		MAGAddress: req.MAGAddress,
		AccessTech: req.AccessTech,
		Lifetime:   req.Lifetime,
		QoSProfile: qosProfile,
	}

	existing, loaded := s.cache.Lookup(req.MNID)
	if loaded {
		if existing.MAGAddress != req.MAGAddress {
			oldPriority := existing.TunnelPriority
			tunnel := s.tunnels.CreateHandoverTunnel(
				req.MNID, existing.MAGAddress, req.MAGAddress,
				string(existing.AccessTech), string(req.AccessTech),
			)

			entry.RegisteredAt = existing.RegisteredAt
			s.cache.Update(entry)

			s.logger.Log("handover", req.MNID, req.MAGAddress,
				fmt.Sprintf("MN %s handover: %s/%s(P%d) -> %s/%s(P%d), %s",
					req.MNID,
					existing.MAGAddress, existing.AccessTech, oldPriority,
					req.MAGAddress, req.AccessTech, priority,
					tunnelSummary(tunnel)))

			s.logger.Log("tunnel_buffer", req.MNID, existing.MAGAddress,
				fmt.Sprintf("Forwarding %d buffered packets to OLD MAG %s",
					tunnel.BufferedPkts, existing.MAGAddress))
			s.logger.Log("tunnel_buffer", req.MNID, req.MAGAddress,
				fmt.Sprintf("Forwarding %d buffered packets to NEW MAG %s",
					tunnel.BufferedPkts, req.MAGAddress))

			rec := BindingUpdateRecord{
				MNID:          req.MNID,
				MNPrefix:      req.MNPrefix,
				OldMAGAddress: existing.MAGAddress,
				NewMAGAddress: req.MAGAddress,
				OldAccessTech: existing.AccessTech,
				NewAccessTech: req.AccessTech,
				Lifetime:      req.Lifetime,
				Operation:     "handover",
				QoSProfile:    qosProfile,
				Status:        "success",
				Message:       "handover_completed",
			}
			s.history.AddRecord(rec)

			respondJSON(w, http.StatusOK, PBAResponse{
				Status:         0,
				Message:        "handover_completed",
				MNID:           req.MNID,
				MNPrefix:       req.MNPrefix,
				MAGAddress:     req.MAGAddress,
				Lifetime:       req.Lifetime,
				TunnelPriority: priority,
				Handover:       true,
				OldMAG:         existing.MAGAddress,
				QoSProfile:     qosProfile,
			})
		} else {
			entry.RegisteredAt = existing.RegisteredAt
			s.cache.Update(entry)
			s.logger.Log("update", req.MNID, req.MAGAddress,
				fmt.Sprintf("BCE updated for MN %s: tech=%s P=%d lifetime=%d",
					req.MNID, req.AccessTech, priority, req.Lifetime))
			rec := BindingUpdateRecord{
				MNID:          req.MNID,
				MNPrefix:      req.MNPrefix,
				OldMAGAddress: existing.MAGAddress,
				NewMAGAddress: req.MAGAddress,
				OldAccessTech: existing.AccessTech,
				NewAccessTech: req.AccessTech,
				Lifetime:      req.Lifetime,
				Operation:     "update",
				QoSProfile:    qosProfile,
				Status:        "success",
				Message:       "updated",
			}
			s.history.AddRecord(rec)
			respondJSON(w, http.StatusOK, PBAResponse{
				Status:         0,
				Message:        "updated",
				MNID:           req.MNID,
				MNPrefix:       req.MNPrefix,
				MAGAddress:     req.MAGAddress,
				Lifetime:       req.Lifetime,
				TunnelPriority: priority,
				QoSProfile:     qosProfile,
			})
		}
	} else {
		s.cache.Register(entry)
		s.logger.Log("register", req.MNID, req.MAGAddress,
			fmt.Sprintf("BCE created for MN %s: tech=%s P=%d lifetime=%d",
				req.MNID, req.AccessTech, priority, req.Lifetime))
		rec := BindingUpdateRecord{
			MNID:          req.MNID,
			MNPrefix:      req.MNPrefix,
			NewMAGAddress: req.MAGAddress,
			NewAccessTech: req.AccessTech,
			Lifetime:      req.Lifetime,
			Operation:     "register",
			QoSProfile:    qosProfile,
			Status:        "success",
			Message:       "registered",
		}
		s.history.AddRecord(rec)
		respondJSON(w, http.StatusCreated, PBAResponse{
			Status:         0,
			Message:        "registered",
			MNID:           req.MNID,
			MNPrefix:       req.MNPrefix,
			MAGAddress:     req.MAGAddress,
			Lifetime:       req.Lifetime,
			TunnelPriority: priority,
			QoSProfile:     qosProfile,
		})
	}
}

func (s *Server) HandleGetBCE(w http.ResponseWriter, r *http.Request) {
	entries := s.cache.GetAll()
	respondJSON(w, http.StatusOK, entries)
}

func (s *Server) HandleGetEvents(w http.ResponseWriter, r *http.Request) {
	events := s.logger.GetAll()
	respondJSON(w, http.StatusOK, events)
}

func (s *Server) HandleGetTunnels(w http.ResponseWriter, r *http.Request) {
	tunnels := s.tunnels.GetAll()
	respondJSON(w, http.StatusOK, tunnels)
}

func (s *Server) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	mnID := r.URL.Query().Get("mn_id")
	records := s.history.GetAll()
	if mnID != "" && mnID != "*" {
		records = s.history.GetByMN(mnID)
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"total":   len(records),
		"records": records,
	})
}

func (s *Server) HandleExportHistory(w http.ResponseWriter, r *http.Request) {
	mnID := r.URL.Query().Get("mn_id")
	format := strings.ToLower(r.URL.Query().Get("format"))

	if format == "csv" {
		records, err := s.history.ExportCSV(mnID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		csvContent := s.history.WriteCSV(records)
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"binding-history-%s.csv\"", mnID))
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(csvContent))
		return
	}

	export := s.history.ExportJSON(mnID)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"binding-history-%s.json\"", mnID))
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
