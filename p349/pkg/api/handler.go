package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"sriov-simulator/pkg/sriov"
)

type Handler struct {
	manager *sriov.Manager
}

func NewHandler(manager *sriov.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/stats", h.handleStats)
	
	mux.HandleFunc("/api/pfs", h.handlePFs)
	mux.HandleFunc("/api/pfs/", h.handlePFAndVFs)
	
	mux.HandleFunc("/api/vms", h.handleVMs)
	mux.HandleFunc("/api/vms/", h.handleVM)
	
	mux.HandleFunc("/api/assign", h.handleAssignVF)
	mux.HandleFunc("/api/release", h.handleReleaseVF)
	mux.HandleFunc("/api/migrate", h.handleMigrateVF)
	
	mux.HandleFunc("/api/vfs/qos", h.handleSetVFQoS)
	
	mux.HandleFunc("/api/logs", h.handleLogs)
	mux.HandleFunc("/api/logs/export/json", h.handleExportLogsJSON)
	mux.HandleFunc("/api/logs/export/csv", h.handleExportLogsCSV)
	
	mux.Handle("/", http.FileServer(http.Dir("./web")))
}

func sendJSON(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func sendError(w http.ResponseWriter, err error, status int) {
	sendJSON(w, map[string]string{"error": err.Error()}, status)
}

func (h *Handler) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stats := h.manager.GetStats()
	sendJSON(w, stats, http.StatusOK)
}

func (h *Handler) handlePFs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		pfs := h.manager.ListPFs()
		sendJSON(w, pfs, http.StatusOK)
	case http.MethodPost:
		var req struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			PCIAddress string `json:"pci_address"`
			MaxVFs     int    `json:"max_vfs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, err, http.StatusBadRequest)
			return
		}
		pf := h.manager.AddPF(req.ID, req.Name, req.PCIAddress, req.MaxVFs)
		sendJSON(w, pf, http.StatusCreated)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handlePFAndVFs(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.NotFound(w, r)
		return
	}
	pfID := parts[3]

	if len(parts) >= 5 && parts[4] == "vfs" {
		h.handlePFVFs(w, r, pfID, parts)
		return
	}

	switch r.Method {
	case http.MethodGet:
		pf, err := h.manager.GetPF(pfID)
		if err != nil {
			sendError(w, err, http.StatusNotFound)
			return
		}
		sendJSON(w, pf, http.StatusOK)
	case http.MethodDelete:
		if err := h.manager.RemovePF(pfID); err != nil {
			sendError(w, err, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handlePFVFs(w http.ResponseWriter, r *http.Request, pfID string, parts []string) {
	switch r.Method {
	case http.MethodGet:
		vfs, err := h.manager.ListVFs(pfID)
		if err != nil {
			sendError(w, err, http.StatusNotFound)
			return
		}
		sendJSON(w, vfs, http.StatusOK)
	case http.MethodPost:
		var req struct {
			Count int `json:"count"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			req.Count = 1
		}
		if req.Count <= 0 {
			req.Count = 1
		}
		vfs, err := h.manager.CreateMultipleVFs(pfID, req.Count)
		if err != nil {
			sendError(w, err, http.StatusBadRequest)
			return
		}
		sendJSON(w, vfs, http.StatusCreated)
	case http.MethodDelete:
		if len(parts) < 6 {
			http.Error(w, "VF ID required", http.StatusBadRequest)
			return
		}
		vfID := parts[5]
		if err := h.manager.RemoveVF(pfID, vfID); err != nil {
			sendError(w, err, http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleVMs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		vms := h.manager.ListVMs()
		sendJSON(w, vms, http.StatusOK)
	case http.MethodPost:
		var req struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, err, http.StatusBadRequest)
			return
		}
		vm := h.manager.AddVM(req.ID, req.Name)
		sendJSON(w, vm, http.StatusCreated)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleVM(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.NotFound(w, r)
		return
	}
	vmID := parts[3]

	switch r.Method {
	case http.MethodGet:
		vm, err := h.manager.GetVM(vmID)
		if err != nil {
			sendError(w, err, http.StatusNotFound)
			return
		}
		sendJSON(w, vm, http.StatusOK)
	case http.MethodDelete:
		if err := h.manager.RemoveVM(vmID); err != nil {
			sendError(w, err, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleAssignVF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PFID        string `json:"pf_id"`
		VFID        string `json:"vf_id"`
		VMID        string `json:"vm_id"`
		VirtPCIAddr string `json:"virt_pci_addr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}

	vf, err := h.manager.AssignVF(req.PFID, req.VFID, req.VMID, req.VirtPCIAddr)
	if err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}
	sendJSON(w, vf, http.StatusOK)
}

func (h *Handler) handleReleaseVF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PFID string `json:"pf_id"`
		VFID string `json:"vf_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}

	vf, err := h.manager.ReleaseVF(req.PFID, req.VFID)
	if err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}
	sendJSON(w, vf, http.StatusOK)
}

func (h *Handler) handleMigrateVF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SourcePFID string `json:"source_pf_id"`
		SourceVFID string `json:"source_vf_id"`
		DestPFID   string `json:"dest_pf_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}

	result, err := h.manager.MigrateVF(req.SourcePFID, req.SourceVFID, req.DestPFID)
	if err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}
	sendJSON(w, result, http.StatusOK)
}

func (h *Handler) handleSetVFQoS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PFID       string `json:"pf_id"`
		VFID       string `json:"vf_id"`
		MaxTxMbps  int    `json:"max_tx_mbps"`
		MaxRxMbps  int    `json:"max_rx_mbps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}

	vf, err := h.manager.SetVFQoS(req.PFID, req.VFID, req.MaxTxMbps, req.MaxRxMbps)
	if err != nil {
		sendError(w, err, http.StatusBadRequest)
		return
	}
	sendJSON(w, vf, http.StatusOK)
}

func (h *Handler) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	logs := h.manager.GetLogs()
	sendJSON(w, logs, http.StatusOK)
}

func (h *Handler) handleExportLogsJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=\"vf_logs.json\"")
	h.manager.ExportLogsJSON(w)
}

func (h *Handler) handleExportLogsCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\"vf_logs.csv\"")
	h.manager.ExportLogsCSV(w)
}
