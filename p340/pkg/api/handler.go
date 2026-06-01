package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"vsan-storage-simulator/pkg/models"
	"vsan-storage-simulator/pkg/zone"
)

type Handler struct {
	manager *zone.Manager
}

func NewHandler(manager *zone.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api")

	switch {
	case path == "/hbas":
		h.handleHBAs(w, r)
	case strings.HasPrefix(path, "/hbas/"):
		h.handleHBA(w, r)
	case path == "/targets":
		h.handleStorageTargets(w, r)
	case strings.HasPrefix(path, "/targets/"):
		h.handleStorageTarget(w, r)
	case path == "/zones":
		h.handleZones(w, r)
	case strings.HasPrefix(path, "/zones/"):
		h.handleZone(w, r)
	case strings.HasPrefix(path, "/zone-members"):
		h.handleZoneMembers(w, r)
	case path == "/access-check":
		h.handleAccessCheck(w, r)
	case path == "/acl":
		h.handleACL(w, r)
	case path == "/version-history":
		h.handleVersionHistory(w, r)
	case path == "/sync-status":
		h.handleSyncStatus(w, r)
	case path == "/switch-nodes":
		h.handleSwitchNodes(w, r)
	case path == "/rollback":
		h.handleRollback(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) handleHBAs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		hbas := h.manager.GetAllHBAs()
		json.NewEncoder(w).Encode(hbas)
	case http.MethodPost:
		var hba models.HBA
		if err := json.NewDecoder(r.Body).Decode(&hba); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := h.manager.AddHBA(hba); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(hba)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleHBA(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/hbas/")

	switch r.Method {
	case http.MethodGet:
		hba, exists := h.manager.GetHBA(id)
		if !exists {
			http.Error(w, "HBA not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(hba)
	case http.MethodDelete:
		if err := h.manager.DeleteHBA(id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleStorageTargets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		targets := h.manager.GetAllStorageTargets()
		json.NewEncoder(w).Encode(targets)
	case http.MethodPost:
		var target models.StorageTarget
		if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := h.manager.AddStorageTarget(target); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(target)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleStorageTarget(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/targets/")

	switch r.Method {
	case http.MethodGet:
		target, exists := h.manager.GetStorageTarget(id)
		if !exists {
			http.Error(w, "Storage Target not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(target)
	case http.MethodDelete:
		if err := h.manager.DeleteStorageTarget(id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleZones(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		zones := h.manager.GetAllZones()
		json.NewEncoder(w).Encode(zones)
	case http.MethodPost:
		var zone models.Zone
		if err := json.NewDecoder(r.Body).Decode(&zone); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := h.manager.CreateZone(zone); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(zone)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleZone(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/zones/")
	parts := strings.Split(path, "/")
	id := parts[0]

	if len(parts) > 1 {
		switch parts[1] {
		case "add-hba":
			h.handleAddHBAToZone(w, r, id)
			return
		case "remove-hba":
			h.handleRemoveHBAFromZone(w, r, id)
			return
		case "add-target":
			h.handleAddTargetToZone(w, r, id)
			return
		case "remove-target":
			h.handleRemoveTargetFromZone(w, r, id)
			return
		}
	}

	switch r.Method {
	case http.MethodGet:
		zone, exists := h.manager.GetZone(id)
		if !exists {
			http.Error(w, "Zone not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(zone)
	case http.MethodPut:
		var updates models.Zone
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := h.manager.UpdateZone(id, updates); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		zone, _ := h.manager.GetZone(id)
		json.NewEncoder(w).Encode(zone)
	case http.MethodDelete:
		if err := h.manager.DeleteZone(id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleAddHBAToZone(w http.ResponseWriter, r *http.Request, zoneID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var op ZoneMemberOperation
	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.manager.AddHBAToZone(zoneID, op.HBAID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (h *Handler) handleRemoveHBAFromZone(w http.ResponseWriter, r *http.Request, zoneID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var op ZoneMemberOperation
	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.manager.RemoveHBAFromZone(zoneID, op.HBAID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (h *Handler) handleAddTargetToZone(w http.ResponseWriter, r *http.Request, zoneID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var op ZoneMemberOperation
	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.manager.AddStorageTargetToZone(zoneID, op.StorageTargetID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (h *Handler) handleRemoveTargetFromZone(w http.ResponseWriter, r *http.Request, zoneID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var op ZoneMemberOperation
	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.manager.RemoveStorageTargetFromZone(zoneID, op.StorageTargetID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (h *Handler) handleZoneMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api")
	id := strings.TrimPrefix(path, "/zone-members/")
	id = strings.TrimPrefix(id, "/zone-members")
	id = strings.TrimPrefix(id, "/")

	if id == "" {
		views := h.manager.GetAllZoneMemberViews()
		json.NewEncoder(w).Encode(views)
		return
	}

	view, exists := h.manager.GetZoneMemberView(id)
	if !exists {
		http.Error(w, "Zone not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(view)
}

type ZoneMemberOperation struct {
	HBAID            string `json:"hba_id"`
	StorageTargetID  string `json:"storage_target_id"`
}

func (h *Handler) handleAccessCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var op = struct {
		HBAID     string `json:"hba_id"`
		TargetID  string `json:"target_id"`
	}{}

	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result := h.manager.CheckAccess(op.HBAID, op.TargetID)
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) handleACL(w http.ResponseWriter, r *http.Request) {
	syncManager := h.manager.GetSyncManager()

	switch r.Method {
	case http.MethodGet:
		version := r.URL.Query().Get("version")
		var acl interface{}
		var exists bool

		if version != "" {
			acl, exists = syncManager.GetACL(version)
		} else {
			acl, exists = syncManager.GetCurrentACL()
		}

		if !exists {
			http.Error(w, "ACL not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(acl)

	case http.MethodPost:
		var req struct {
			Description string `json:"description"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		version := h.manager.ForceACLUpdate(req.Description)
		json.NewEncoder(w).Encode(version)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleVersionHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	syncManager := h.manager.GetSyncManager()
	history := syncManager.GetVersionHistory()
	json.NewEncoder(w).Encode(history)
}

func (h *Handler) handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	syncManager := h.manager.GetSyncManager()
	status := syncManager.GetSyncStatus()
	json.NewEncoder(w).Encode(status)
}

func (h *Handler) handleSwitchNodes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	syncManager := h.manager.GetSyncManager()
	nodes := syncManager.GetSwitchNodes()
	json.NewEncoder(w).Encode(nodes)
}

func (h *Handler) handleRollback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	syncManager := h.manager.GetSyncManager()
	if err := syncManager.RollbackToVersion(req.Version); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Rolled back to version %s", req.Version),
	})
}
