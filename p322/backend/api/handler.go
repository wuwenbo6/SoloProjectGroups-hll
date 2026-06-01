package api

import (
	"encoding/json"
	"net/http"

	"mdns-reflector/model"
	"mdns-reflector/reflector"
)

type Handler struct {
	registry *reflector.Registry
	engine   *reflector.Engine
}

func NewHandler(engine *reflector.Engine) *Handler {
	return &Handler{
		registry: engine.GetRegistry(),
		engine:   engine,
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) GetSubnets(w http.ResponseWriter, r *http.Request) {
	subnets := h.registry.GetSubnets()
	writeJSON(w, http.StatusOK, subnets)
}

func (h *Handler) GetServices(w http.ResponseWriter, r *http.Request) {
	subnetID := r.PathValue("subnetId")
	if subnetID == "" {
		subnetID = r.URL.Query().Get("subnetId")
	}
	svcType := r.URL.Query().Get("type")
	status := r.URL.Query().Get("status")
	services := h.registry.GetServices(subnetID, svcType, status)
	writeJSON(w, http.StatusOK, services)
}

func (h *Handler) GetRecords(w http.ResponseWriter, r *http.Request) {
	serviceID := r.PathValue("serviceId")
	if serviceID == "" {
		http.Error(w, "serviceId required", http.StatusBadRequest)
		return
	}
	records := h.registry.GetRecords(serviceID)
	if records == nil {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, records)
}

func (h *Handler) GetReflectorStatus(w http.ResponseWriter, r *http.Request) {
	status := h.engine.GetStatus()
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) GetServiceStats(w http.ResponseWriter, r *http.Request) {
	stats := h.registry.GetServiceStats()
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) GetAuthPolicy(w http.ResponseWriter, r *http.Request) {
	policy := h.registry.GetAuthPolicy()
	writeJSON(w, http.StatusOK, policy)
}

func (h *Handler) UpdateAuthPolicy(w http.ResponseWriter, r *http.Request) {
	var policy model.AuthPolicy
	if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	h.registry.UpdateAuthPolicy(&policy)
	writeJSON(w, http.StatusOK, policy)
}

func (h *Handler) SetServiceAuthorized(w http.ResponseWriter, r *http.Request) {
	serviceID := r.PathValue("serviceId")
	if serviceID == "" {
		http.Error(w, "serviceId required", http.StatusBadRequest)
		return
	}
	var body struct {
		Authorized bool `json:"authorized"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	ok := h.registry.SetServiceAuthorized(serviceID, body.Authorized)
	if !ok {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"authorized": body.Authorized})
}

func (h *Handler) ExportServices(w http.ResponseWriter, r *http.Request) {
	subnetID := r.URL.Query().Get("subnetId")
	svcType := r.URL.Query().Get("type")
	status := r.URL.Query().Get("status")
	export := h.registry.ExportServices(subnetID, svcType, status)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=mdns-services.json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}
