package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"nfv-mano/internal/models"
	"nfv-mano/internal/service"

	"github.com/gorilla/mux"
)

type Handler struct {
	service *service.ManoService
}

func NewHandler(svc *service.ManoService) *Handler {
	return &Handler{service: svc}
}

func (h *Handler) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/v1").Subrouter()

	api.HandleFunc("/vnfds", h.GetAllVnfds).Methods("GET")
	api.HandleFunc("/vnfds/{id}", h.GetVnfd).Methods("GET")
	api.HandleFunc("/vnfds", h.CreateVnfd).Methods("POST")
	api.HandleFunc("/vnfds/{id}", h.DeleteVnfd).Methods("DELETE")

	api.HandleFunc("/vnfs", h.GetAllVnfs).Methods("GET")
	api.HandleFunc("/vnfs/{id}", h.GetVnf).Methods("GET")
	api.HandleFunc("/vnfs", h.InstantiateVnf).Methods("POST")
	api.HandleFunc("/vnfs/batch", h.BatchInstantiateVnfs).Methods("POST")
	api.HandleFunc("/vnfs/{id}/scale", h.ScaleVnf).Methods("PUT")
	api.HandleFunc("/vnfs/{id}", h.TerminateVnf).Methods("DELETE")
	api.HandleFunc("/vnfs/{id}/routes", h.GetRouteTable).Methods("GET")
	api.HandleFunc("/vnfs/{id}/neighbors", h.GetNeighborVnfs).Methods("GET")
	api.HandleFunc("/vnfs/{id}/autoscaling", h.GetAutoScalingConfig).Methods("GET")
	api.HandleFunc("/vnfs/{id}/autoscaling", h.UpdateAutoScalingConfig).Methods("PUT")
	api.HandleFunc("/vnfs/{id}/metrics", h.GetMetrics).Methods("GET")
	api.HandleFunc("/vnfs/{id}/tosca", h.ExportToscaTemplate).Methods("GET")

	api.HandleFunc("/links", h.GetAllLinks).Methods("GET")
	api.HandleFunc("/links", h.CreateLink).Methods("POST")
	api.HandleFunc("/links/{id}", h.DeleteLink).Methods("DELETE")

	api.HandleFunc("/events", h.GetEvents).Methods("GET")
	api.HandleFunc("/stats", h.GetStats).Methods("GET")
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *Handler) GetAllVnfds(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.service.GetAllVnfds())
}

func (h *Handler) GetVnfd(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	vnfd := h.service.GetVnfd(id)
	if vnfd == nil {
		writeError(w, http.StatusNotFound, "VNFD not found")
		return
	}
	writeJSON(w, http.StatusOK, vnfd)
}

func (h *Handler) CreateVnfd(w http.ResponseWriter, r *http.Request) {
	var vnfd models.Vnfd
	if err := json.NewDecoder(r.Body).Decode(&vnfd); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	h.service.CreateVnfd(&vnfd)
	writeJSON(w, http.StatusCreated, vnfd)
}

func (h *Handler) DeleteVnfd(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if !h.service.DeleteVnfd(id) {
		writeError(w, http.StatusNotFound, "VNFD not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "VNFD deleted"})
}

func (h *Handler) GetAllVnfs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.service.GetAllVnfs())
}

func (h *Handler) GetVnf(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	vnf := h.service.GetVnf(id)
	if vnf == nil {
		writeError(w, http.StatusNotFound, "VNF not found")
		return
	}
	writeJSON(w, http.StatusOK, vnf)
}

func (h *Handler) InstantiateVnf(w http.ResponseWriter, r *http.Request) {
	var req models.InstantiateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	vnf, err := h.service.InstantiateVnf(&req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, vnf)
}

func (h *Handler) BatchInstantiateVnfs(w http.ResponseWriter, r *http.Request) {
	var req models.BatchInstantiateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	vnfs, err := h.service.BatchInstantiateVnfs(&req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "Batch instantiation started",
		"vnfs":    vnfs,
		"count":   len(vnfs),
	})
}

func (h *Handler) GetRouteTable(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	rt := h.service.GetRouteTable(id)
	if rt == nil {
		writeError(w, http.StatusNotFound, "Route table not found")
		return
	}
	writeJSON(w, http.StatusOK, rt)
}

func (h *Handler) GetNeighborVnfs(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	neighbors := h.service.GetNeighborVnfs(id)
	writeJSON(w, http.StatusOK, neighbors)
}

func (h *Handler) ScaleVnf(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req models.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	vnf, err := h.service.ScaleVnf(id, &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, vnf)
}

func (h *Handler) TerminateVnf(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := h.service.TerminateVnf(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "VNF termination initiated"})
}

func (h *Handler) GetAllLinks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.service.GetAllLinks())
}

func (h *Handler) CreateLink(w http.ResponseWriter, r *http.Request) {
	var req models.CreateLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	link, err := h.service.CreateLink(&req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, link)
}

func (h *Handler) DeleteLink(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if err := h.service.DeleteLink(id); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Link deleted"})
}

func (h *Handler) GetEvents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.service.GetEvents())
}

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.service.GetStats())
}

func (h *Handler) GetAutoScalingConfig(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	config := h.service.GetAutoScalingConfig(id)
	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) UpdateAutoScalingConfig(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var req models.AutoScalingConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	config, err := h.service.UpdateAutoScalingConfig(id, &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, config)
}

func (h *Handler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	metrics := h.service.GetMetrics(id, limit)
	writeJSON(w, http.StatusOK, metrics)
}

func (h *Handler) ExportToscaTemplate(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	template, err := h.service.ExportToscaTemplate(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/yaml")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-tosca.yaml\"", id))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(template))
}
