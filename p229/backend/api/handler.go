package api

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ib-subnet-manager/config"
	"ib-subnet-manager/model"
	"ib-subnet-manager/sm"
	"ib-subnet-manager/smp"

	"github.com/gorilla/mux"
)

type APIHandler struct {
	subnetManager *sm.SubnetManager
	smpHandler    *smp.SMPHandler
	smpSessionMgr *smp.SMPSessionManager
}

func NewAPIHandler(sm *sm.SubnetManager) *APIHandler {
	smpHandler := smp.NewSMPHandler(sm)
	sessionMgr := smp.NewSMPSessionManager(sm, smpHandler)
	return &APIHandler{
		subnetManager: sm,
		smpHandler:    smpHandler,
		smpSessionMgr: sessionMgr,
	}
}

func (h *APIHandler) GetSMPSessionManager() *smp.SMPSessionManager {
	return h.smpSessionMgr
}

func (h *APIHandler) SetupRoutes(r *mux.Router) {
	r.HandleFunc("/api/topology", h.GetTopology).Methods("GET")
	r.HandleFunc("/api/nodes", h.GetNodes).Methods("GET")
	r.HandleFunc("/api/nodes", h.AddNode).Methods("POST")
	r.HandleFunc("/api/nodes/{guid}", h.GetNode).Methods("GET")
	r.HandleFunc("/api/nodes/{guid}", h.DeleteNode).Methods("DELETE")
	r.HandleFunc("/api/nodes/{guid}/ports/{port}", h.GetPort).Methods("GET")
	r.HandleFunc("/api/connect", h.ConnectNodes).Methods("POST")
	r.HandleFunc("/api/routes/compute", h.ComputeRoutes).Methods("POST")
	r.HandleFunc("/api/routes/{guid}", h.GetRouteTable).Methods("GET")
	r.HandleFunc("/api/routes", h.GetAllRouteTables).Methods("GET")
	r.HandleFunc("/api/smp", h.HandleSMPRequest).Methods("POST")
	r.HandleFunc("/api/smp/nodeinfo/{guid}", h.GetNodeInfoSMP).Methods("GET")
	r.HandleFunc("/api/smp/portinfo/{guid}/{port}", h.GetPortInfoSMP).Methods("GET")
	r.HandleFunc("/api/smp/events", h.GetSMPEvents).Methods("GET")
	r.HandleFunc("/api/smp/sessions", h.GetSMPPessions).Methods("GET")
	r.HandleFunc("/api/smp/lft/reset", h.ResetLFTDistribution).Methods("POST")
	r.HandleFunc("/api/simulate/traffic", h.SimulateTraffic).Methods("POST")
	r.HandleFunc("/api/training/{guid}/{port}/start", h.StartLinkTraining).Methods("POST")
	r.HandleFunc("/api/training/{guid}/{port}/advance", h.AdvanceLinkTraining).Methods("POST")
	r.HandleFunc("/api/routing/adaptive", h.GetAdaptiveRouting).Methods("GET")
	r.HandleFunc("/api/routing/adaptive", h.SetAdaptiveRouting).Methods("POST")
	r.HandleFunc("/api/routing/rebalance", h.RebalanceRoutes).Methods("POST")
	r.HandleFunc("/api/congestion", h.GetCongestionStats).Methods("GET")
	r.HandleFunc("/api/config/opensm", h.GetOpenSMConfig).Methods("GET")
	r.HandleFunc("/api/config/topology.dot", h.GetTopologyDot).Methods("GET")
	r.HandleFunc("/api/config/node-name-map", h.GetNodeNameMap).Methods("GET")
}

func (h *APIHandler) GetTopology(w http.ResponseWriter, r *http.Request) {
	topology := h.subnetManager.GetTopology()
	if topology == nil {
		http.Error(w, "Topology not available", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(topology)
}

func (h *APIHandler) GetNodes(w http.ResponseWriter, r *http.Request) {
	nodes := h.subnetManager.GetAllNodes()
	json.NewEncoder(w).Encode(nodes)
}

type AddNodeRequest struct {
	GUID        string         `json:"guid"`
	NodeType    model.NodeType `json:"node_type"`
	Name        string         `json:"name"`
	NumPorts    int            `json:"num_ports"`
	VendorID    uint16         `json:"vendor_id"`
	DeviceID    uint16         `json:"device_id"`
}

func (h *APIHandler) AddNode(w http.ResponseWriter, r *http.Request) {
	var req AddNodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	guid, err := parseGUID(req.GUID)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	node := &model.Node{
		GUID:            guid,
		NodeType:        req.NodeType,
		Name:            req.Name,
		NumPorts:        req.NumPorts,
		SystemImageGUID: guid,
		VendorID:        req.VendorID,
		DeviceID:        req.DeviceID,
	}

	if err := h.subnetManager.AddNode(node); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(node)
}

func (h *APIHandler) GetNode(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	node, exists := h.subnetManager.GetNode(guid)
	if !exists {
		http.Error(w, "Node not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(node)
}

func (h *APIHandler) DeleteNode(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.subnetManager.RemoveNode(guid); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *APIHandler) GetPort(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]
	portStr := vars["port"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	portNum, err := strconv.Atoi(portStr)
	if err != nil {
		http.Error(w, "Invalid port number", http.StatusBadRequest)
		return
	}

	portInfo, err := h.subnetManager.GetPortInfo(guid, portNum)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(portInfo)
}

type ConnectRequest struct {
	FromGUID string `json:"from_guid"`
	FromPort int    `json:"from_port"`
	ToGUID   string `json:"to_guid"`
	ToPort   int    `json:"to_port"`
}

func (h *APIHandler) ConnectNodes(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fromGUID, err := parseGUID(req.FromGUID)
	if err != nil {
		http.Error(w, "Invalid from GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	toGUID, err := parseGUID(req.ToGUID)
	if err != nil {
		http.Error(w, "Invalid to GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.subnetManager.ConnectNodes(fromGUID, req.FromPort, toGUID, req.ToPort); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "connected"})
}

func (h *APIHandler) ComputeRoutes(w http.ResponseWriter, r *http.Request) {
	if err := h.subnetManager.ComputeRoutes(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "routes computed"})
}

func (h *APIHandler) GetRouteTable(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	rt, exists := h.subnetManager.GetRouteTable(guid)
	if !exists {
		http.Error(w, "Route table not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(rt)
}

func (h *APIHandler) GetAllRouteTables(w http.ResponseWriter, r *http.Request) {
	tables := h.subnetManager.GetAllRouteTables()
	json.NewEncoder(w).Encode(tables)
}

type SMPRequest struct {
	Data string `json:"data"`
}

type SMPResponse struct {
	Data string `json:"data"`
}

func (h *APIHandler) HandleSMPRequest(w http.ResponseWriter, r *http.Request) {
	var req SMPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		http.Error(w, "Invalid hex data: "+err.Error(), http.StatusBadRequest)
		return
	}

	response, err := h.smpHandler.HandleSMP(data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(SMPResponse{
		Data: hex.EncodeToString(response),
	})
}

func (h *APIHandler) GetNodeInfoSMP(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	nodeInfo, err := h.subnetManager.GetNodeInfo(guid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(nodeInfo)
}

func (h *APIHandler) GetPortInfoSMP(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]
	portStr := vars["port"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	portNum, err := strconv.Atoi(portStr)
	if err != nil {
		http.Error(w, "Invalid port number", http.StatusBadRequest)
		return
	}

	portInfo, err := h.subnetManager.GetPortInfo(guid, portNum)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(portInfo)
}

func (h *APIHandler) SimulateTraffic(w http.ResponseWriter, r *http.Request) {
	h.subnetManager.SimulateTraffic()
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "traffic simulated"})
}

func (h *APIHandler) GetSMPEvents(w http.ResponseWriter, r *http.Request) {
	events := h.smpHandler.GetEvents()
	json.NewEncoder(w).Encode(events)
}

func (h *APIHandler) GetSMPPessions(w http.ResponseWriter, r *http.Request) {
	sessions := h.smpSessionMgr.GetSessions()
	json.NewEncoder(w).Encode(sessions)
}

func (h *APIHandler) ResetLFTDistribution(w http.ResponseWriter, r *http.Request) {
	h.smpSessionMgr.ResetDistribution()
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "LFT distribution reset"})
}

func (h *APIHandler) StartLinkTraining(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]
	portStr := vars["port"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	portNum, err := strconv.Atoi(portStr)
	if err != nil {
		http.Error(w, "Invalid port number", http.StatusBadRequest)
		return
	}

	if err := h.subnetManager.StartLinkTraining(guid, portNum); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "link training started"})
}

func (h *APIHandler) AdvanceLinkTraining(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	guidStr := vars["guid"]
	portStr := vars["port"]

	guid, err := parseGUID(guidStr)
	if err != nil {
		http.Error(w, "Invalid GUID: "+err.Error(), http.StatusBadRequest)
		return
	}

	portNum, err := strconv.Atoi(portStr)
	if err != nil {
		http.Error(w, "Invalid port number", http.StatusBadRequest)
		return
	}

	if err := h.subnetManager.AdvanceLinkTraining(guid, portNum); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "link training advanced"})
}

func (h *APIHandler) GetAdaptiveRouting(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	config := h.subnetManager.GetOpenSMConfig()
	json.NewEncoder(w).Encode(config.AdaptiveRouting)
}

func (h *APIHandler) SetAdaptiveRouting(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.subnetManager.SetAdaptiveRouting(req.Enabled)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"enabled": req.Enabled,
	})
}

func (h *APIHandler) RebalanceRoutes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	changes := h.subnetManager.RebalanceRoutes()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"changes":  changes,
	})
}

func (h *APIHandler) GetCongestionStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	stats := h.subnetManager.GetCongestionSummary()
	json.NewEncoder(w).Encode(stats)
}

func (h *APIHandler) GetOpenSMConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", "attachment; filename=opensm.conf")

	cfg := h.subnetManager.GetOpenSMConfig()
	exporter := config.NewOpenSMExporter(*cfg)
	w.Write([]byte(exporter.GenerateConfig()))
}

func (h *APIHandler) GetTopologyDot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", "attachment; filename=topology.dot")

	topology := h.subnetManager.GetSimpleTopology()
	w.Write([]byte(config.GenerateTopologyDot(topology)))
}

func (h *APIHandler) GetNodeNameMap(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", "attachment; filename=node-name-map")

	topology := h.subnetManager.GetSimpleTopology()
	w.Write([]byte(config.GenerateNodeNameMap(topology)))
}

func parseGUID(s string) (model.GUID, error) {
	s = strings.ReplaceAll(s, ":", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "0x", "")

	if len(s) != 16 {
		return 0, fmt.Errorf("GUID must be 16 hex characters")
	}

	bytes, err := hex.DecodeString(s)
	if err != nil {
		return 0, err
	}

	var guid uint64
	for i := 0; i < 8; i++ {
		guid = (guid << 8) | uint64(bytes[i])
	}

	return model.GUID(guid), nil
}
