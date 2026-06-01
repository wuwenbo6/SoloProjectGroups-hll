package api

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"time"

	"bgp-evpn-simulator/internal/models"
	"bgp-evpn-simulator/internal/vxlan"
)

type Server struct {
	vtepCtrl *vxlan.VTEPController
	mux      *http.ServeMux
}

func NewServer(vtepCtrl *vxlan.VTEPController) *Server {
	s := &Server{
		vtepCtrl: vtepCtrl,
		mux:      http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/vteps", s.handleVTEPs)
	s.mux.HandleFunc("/api/vteps/", s.handleVTEP)
	s.mux.HandleFunc("/api/vteps/{id}/mac-table", s.handleMACTable)
	s.mux.HandleFunc("/api/vteps/{id}/routes", s.handleRoutes)
	s.mux.HandleFunc("/api/vteps/{id}/routes/type3", s.handleType3Routes)
	s.mux.HandleFunc("/api/vteps/{id}/routes/export", s.handleExportRoutes)
	s.mux.HandleFunc("/api/tunnels", s.handleTunnels)
	s.mux.HandleFunc("/api/tunnels/", s.handleTunnel)
	s.mux.HandleFunc("/api/advertise", s.handleAdvertise)
	s.mux.HandleFunc("/api/advertise-multicast", s.handleAdvertiseMulticast)
	s.mux.HandleFunc("/api/simulate", s.handleSimulate)
	s.mux.HandleFunc("/api/topology", s.handleTopology)

	fs := http.FileServer(http.Dir("./web"))
	s.mux.Handle("/", fs)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleVTEPs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		vteps := s.vtepCtrl.ListVTEPs()
		sendJSON(w, vteps)
	case http.MethodPost:
		var req struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			IP         string `json:"ip"`
			LoopbackIP string `json:"loopback_ip"`
			L2VNI      uint32 `json:"l2_vni"`
			L3VNI      uint32 `json:"l3_vni"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		ip := net.ParseIP(req.IP)
		loopbackIP := net.ParseIP(req.LoopbackIP)
		vtep, err := s.vtepCtrl.CreateVTEP(req.ID, req.Name, ip, loopbackIP, req.L2VNI, req.L3VNI)
		if err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSON(w, vtep)
	default:
		sendError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleVTEP(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/vteps/"):]
	vtep, exists := s.vtepCtrl.GetVTEP(id)
	if !exists {
		sendError(w, http.StatusNotFound, "VTEP not found")
		return
	}
	sendJSON(w, vtep)
}

func (s *Server) handleMACTable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table, exists := s.vtepCtrl.GetMACTable(id)
	if !exists {
		sendError(w, http.StatusNotFound, "VTEP not found")
		return
	}
	sendJSON(w, table.List())
}

func (s *Server) handleRoutes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctrl, exists := s.vtepCtrl.GetEVPNController(id)
	if !exists {
		sendError(w, http.StatusNotFound, "VTEP not found")
		return
	}

	routeType := r.URL.Query().Get("type")
	switch routeType {
	case "3":
		sendJSON(w, ctrl.GetType3Routes())
	case "2":
		fallthrough
	default:
		sendJSON(w, ctrl.GetType2Routes())
	}
}

func (s *Server) handleType3Routes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	routes, err := s.vtepCtrl.GetType3Routes(id)
	if err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}
	sendJSON(w, routes)
}

func (s *Server) handleExportRoutes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var routeType *models.EVPNRouteType
	routeTypeStr := r.URL.Query().Get("type")
	if routeTypeStr != "" {
		switch routeTypeStr {
		case "2":
			t := models.EVPNRouteType2
			routeType = &t
		case "3":
			t := models.EVPNRouteType3
			routeType = &t
		}
	}

	routes, err := s.vtepCtrl.ExportRoutes(id, routeType)
	if err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}

	format := r.URL.Query().Get("format")
	if format == "download" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"evpn-routes-%s.json\"", id))
	}

	sendJSON(w, map[string]interface{}{
		"vtep_id":   id,
		"exported_at": time.Now().Format(time.RFC3339),
		"route_type": func() string {
			if routeType == nil {
				return "all"
			}
			return fmt.Sprintf("type-%d", *routeType)
		}(),
		"count":     len(routes),
		"routes":    routes,
	})
}

func (s *Server) handleAdvertiseMulticast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		VTEPID    string `json:"vtep_id"`
		L2VNI     uint32 `json:"l2_vni"`
		GroupIP   string `json:"group_ip"`
		SourceIP  string `json:"source_ip"`
		TunnelType uint8  `json:"tunnel_type"`
		Random    bool   `json:"random"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	tunnelType := models.PMSITunnelType(req.TunnelType)
	if tunnelType == 0 {
		tunnelType = models.PMSITunnelTypeIngressReplication
	}

	var route *models.EVPNRoute
	var err error

	if req.Random {
		route, err = s.vtepCtrl.AdvertiseRandomMulticastGroup(req.VTEPID, req.L2VNI)
	} else {
		groupIP := net.ParseIP(req.GroupIP)
		sourceIP := net.ParseIP(req.SourceIP)
		route, err = s.vtepCtrl.AdvertiseMulticastGroup(req.VTEPID, req.L2VNI, groupIP, sourceIP, tunnelType)
	}

	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	sendJSON(w, route)
}

func (s *Server) handleTunnels(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tunnels := s.vtepCtrl.ListTunnels()
		sendJSON(w, tunnels)
	case http.MethodPost:
		var req struct {
			SourceVTEP string `json:"source_vtep"`
			DestVTEP   string `json:"dest_vtep"`
			VNI        uint32 `json:"vni"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		tunnel, err := s.vtepCtrl.EstablishVXLANTunnel(req.SourceVTEP, req.DestVTEP, req.VNI)
		if err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSON(w, tunnel)
	default:
		sendError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/tunnels/"):]
	tunnel, exists := s.vtepCtrl.GetTunnel(id)
	if !exists {
		sendError(w, http.StatusNotFound, "tunnel not found")
		return
	}
	sendJSON(w, tunnel)
}

func (s *Server) handleAdvertise(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		VTEPID string `json:"vtep_id"`
		MAC    string `json:"mac"`
		IP     string `json:"ip"`
		L2VNI  uint32 `json:"l2_vni"`
		L3VNI  uint32 `json:"l3_vni"`
		Random bool   `json:"random"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	var route *models.EVPNRoute
	var err error

	if req.Random {
		route, err = s.vtepCtrl.AdvertiseRandomMAC(req.VTEPID, req.L2VNI, req.L3VNI)
	} else {
		mac, parseErr := models.ParseMAC(req.MAC)
		if parseErr != nil {
			sendError(w, http.StatusBadRequest, "invalid MAC address")
			return
		}
		ip := net.ParseIP(req.IP)
		route, err = s.vtepCtrl.AdvertiseMAC(req.VTEPID, mac, ip, req.L2VNI, req.L3VNI)
	}

	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	sendJSON(w, route)
}

func (s *Server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		VTEPID   string `json:"vtep_id"`
		L2VNI    uint32 `json:"l2_vni"`
		L3VNI    uint32 `json:"l3_vni"`
		Interval string `json:"interval"`
		Count    int    `json:"count"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	interval, err := time.ParseDuration(req.Interval)
	if err != nil {
		interval = 2 * time.Second
	}

	count := req.Count
	if count <= 0 {
		count = 5
	}

	go func() {
		for i := 0; i < count; i++ {
			s.vtepCtrl.AdvertiseRandomMAC(req.VTEPID, req.L2VNI, req.L3VNI)
			time.Sleep(interval)
		}
	}()

	sendJSON(w, map[string]string{"status": "simulation started", "count": strconv.Itoa(count), "interval": interval.String()})
}

func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	vteps := s.vtepCtrl.ListVTEPs()
	tunnels := s.vtepCtrl.ListTunnels()

	macTables := make(map[string][]*models.MACEntry)
	for _, vtep := range vteps {
		if table, exists := s.vtepCtrl.GetMACTable(vtep.ID); exists {
			macTables[vtep.ID] = table.List()
		}
	}

	routesType2 := make(map[string][]*models.EVPNRoute)
	routesType3 := make(map[string][]*models.EVPNRoute)
	for _, vtep := range vteps {
		if ctrl, exists := s.vtepCtrl.GetEVPNController(vtep.ID); exists {
			routesType2[vtep.ID] = ctrl.GetType2Routes()
			routesType3[vtep.ID] = ctrl.GetType3Routes()
		}
	}

	topology := map[string]interface{}{
		"vteps":        vteps,
		"tunnels":      tunnels,
		"mac_tables":   macTables,
		"routes_type2": routesType2,
		"routes_type3": routesType3,
		"stats": map[string]int{
			"vtep_count":        len(vteps),
			"tunnel_count":      len(tunnels),
			"mac_entry_count":   totalMACEntries(macTables),
			"route_type2_count": totalRoutes(routesType2),
			"route_type3_count": totalRoutes(routesType3),
		},
	}

	sendJSON(w, topology)
}

func totalMACEntries(tables map[string][]*models.MACEntry) int {
	count := 0
	for _, entries := range tables {
		count += len(entries)
	}
	return count
}

func totalRoutes(routes map[string][]*models.EVPNRoute) int {
	count := 0
	for _, rs := range routes {
		count += len(rs)
	}
	return count
}

func sendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func sendError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s)
}
