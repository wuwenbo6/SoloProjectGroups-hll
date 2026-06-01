package api

import (
	"encoding/hex"
	"encoding/json"
	"net/http"

	"l2tpv3-manager/frame"
	"l2tpv3-manager/l2tp"

	"github.com/gorilla/mux"
)

type Handler struct {
	manager *l2tp.Manager
}

func NewHandler(manager *l2tp.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/status", h.GetStatus).Methods("GET")

	r.HandleFunc("/api/tunnels", h.ListTunnels).Methods("GET")
	r.HandleFunc("/api/tunnels", h.CreateTunnel).Methods("POST")
	r.HandleFunc("/api/tunnels/{name}", h.GetTunnel).Methods("GET")
	r.HandleFunc("/api/tunnels/{name}", h.DeleteTunnel).Methods("DELETE")
	r.HandleFunc("/api/tunnels/{name}/stats", h.GetTunnelStats).Methods("GET")
	r.HandleFunc("/api/tunnels/{name}/stats", h.ResetTunnelStats).Methods("DELETE")

	r.HandleFunc("/api/tunnels/{tunnel}/sessions", h.ListSessions).Methods("GET")
	r.HandleFunc("/api/tunnels/{tunnel}/sessions", h.CreateSession).Methods("POST")
	r.HandleFunc("/api/tunnels/{tunnel}/sessions/{session}", h.GetSession).Methods("GET")
	r.HandleFunc("/api/tunnels/{tunnel}/sessions/{session}", h.DeleteSession).Methods("DELETE")
	r.HandleFunc("/api/tunnels/{tunnel}/sessions/{session}/avp", h.GenerateSessionAVP).Methods("GET")
	r.HandleFunc("/api/tunnels/{tunnel}/sessions/{session}/stats", h.GetSessionStats).Methods("GET")

	r.HandleFunc("/api/stats", h.GetAllStats).Methods("GET")

	r.HandleFunc("/api/frame/encapsulate", h.EncapsulateFrame).Methods("POST")
	r.HandleFunc("/api/frame/decapsulate", h.DecapsulateFrame).Methods("POST")
	r.HandleFunc("/api/frame/dispatch", h.DispatchPacket).Methods("POST")

	r.HandleFunc("/api/ipsec/encrypt", h.EncryptIPsec).Methods("POST")
	r.HandleFunc("/api/ipsec/decrypt", h.DecryptIPsec).Methods("POST")
}

func writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, statusCode int, msg string) {
	writeJSON(w, statusCode, ErrorResponse{Error: msg})
}

func (h *Handler) GetStatus(w http.ResponseWriter, r *http.Request) {
	dp := "linux-netlink"
	if h.manager.IsNullDataPlane() {
		dp = "null (simulation)"
	}

	tunnels := h.manager.ListTunnels()
	sessionCount := 0
	for _, t := range tunnels {
		sessions, _ := h.manager.ListSessions(t.Name)
		sessionCount += len(sessions)
	}

	writeJSON(w, http.StatusOK, StatusResponse{
		Status:       "running",
		DataPlane:    dp,
		TunnelCount:  len(tunnels),
		SessionCount: sessionCount,
	})
}

func (h *Handler) ListTunnels(w http.ResponseWriter, r *http.Request) {
	tunnels := h.manager.ListTunnels()
	writeJSON(w, http.StatusOK, tunnels)
}

func (h *Handler) CreateTunnel(w http.ResponseWriter, r *http.Request) {
	var req CreateTunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.LocalAddr == "" {
		writeError(w, http.StatusBadRequest, "local_addr is required")
		return
	}
	if req.PeerAddr == "" {
		writeError(w, http.StatusBadRequest, "peer_addr is required")
		return
	}

	encap := req.Encap
	if encap == "" {
		encap = "udp"
	}

	info, err := h.manager.CreateTunnel(req.Name, req.LocalAddr, req.PeerAddr, req.TunnelID, req.PeerTunnelID, encap)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, info)
}

func (h *Handler) GetTunnel(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	info, err := h.manager.GetTunnel(name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) DeleteTunnel(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	if err := h.manager.DeleteTunnel(name); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]
	sessions, err := h.manager.ListSessions(tunnelName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]

	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	info, err := h.manager.CreateSession(tunnelName, req.Name, req.SessionID, req.PeerSessionID, req.Cookie, req.PeerCookie)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, info)
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]
	sessionName := mux.Vars(r)["session"]

	info, err := h.manager.GetSession(tunnelName, sessionName)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]
	sessionName := mux.Vars(r)["session"]

	if err := h.manager.DeleteSession(tunnelName, sessionName); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) EncapsulateFrame(w http.ResponseWriter, r *http.Request) {
	var req EncapsulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	dstMAC, err := frame.StringToMAC(req.DstMAC)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	srcMAC, err := frame.StringToMAC(req.SrcMAC)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	payload, err := hex.DecodeString(req.Payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload hex: "+err.Error())
		return
	}

	var cookie []byte
	if req.Cookie != "" {
		cookie, err = hex.DecodeString(req.Cookie)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid cookie hex: "+err.Error())
			return
		}
	}

	ethFrame := &frame.EthernetFrame{
		DstMAC:    dstMAC,
		SrcMAC:    srcMAC,
		EtherType: req.EtherType,
		Payload:   payload,
	}
	if req.VLANID > 0 {
		ethFrame.IsVLAN = true
		ethFrame.VLANID = req.VLANID
	}

	rawFrame, err := ethFrame.Marshal()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to marshal ethernet frame: "+err.Error())
		return
	}

	encap := frame.EncapsulateL2TPv3(req.SessionID, cookie, rawFrame)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ethernet_frame": hex.EncodeToString(rawFrame),
		"ethernet_info":  ethFrame.String(),
		"l2tpv3_encap":   hex.EncodeToString(encap),
		"session_id":     req.SessionID,
		"cookie":         req.Cookie,
		"total_length":   len(encap),
	})
}

func (h *Handler) DecapsulateFrame(w http.ResponseWriter, r *http.Request) {
	var req DecapsulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid data hex: "+err.Error())
		return
	}

	sessionID, cookie, payload, err := frame.DecapsulateL2TPv3(data, req.CookieLen)
	if err != nil {
		writeError(w, http.StatusBadRequest, "decapsulation failed: "+err.Error())
		return
	}

	ethFrame, err := frame.ParseEthernetFrame(payload)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"session_id":  sessionID,
			"cookie":      hex.EncodeToString(cookie),
			"payload_hex": hex.EncodeToString(payload),
			"parse_error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"session_id":    sessionID,
		"cookie":        hex.EncodeToString(cookie),
		"ethernet_info": ethFrame.String(),
		"dst_mac":       frame.MACToString(ethFrame.DstMAC),
		"src_mac":       frame.MACToString(ethFrame.SrcMAC),
		"ether_type":    frame.EtherTypeToString(ethFrame.EtherType),
		"vlan_id":       ethFrame.VLANID,
		"is_vlan":       ethFrame.IsVLAN,
		"payload_hex":   hex.EncodeToString(ethFrame.Payload),
	})
}

func (h *Handler) DispatchPacket(w http.ResponseWriter, r *http.Request) {
	var req DispatchPacketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid data hex: "+err.Error())
		return
	}

	result, err := h.manager.DispatchPacket(data, req.CookieLen)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dispatch failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) GenerateSessionAVP(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]
	sessionName := mux.Vars(r)["session"]

	avps, err := h.manager.GenerateAVPForSession(sessionName, tunnelName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tunnel_name":  tunnelName,
		"session_name": sessionName,
		"avps":         avps,
	})
}

func (h *Handler) GetTunnelStats(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["name"]

	stats, ok := h.manager.GetTunnelStats(tunnelName)
	if !ok {
		writeError(w, http.StatusNotFound, "tunnel not found")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) GetSessionStats(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["tunnel"]
	sessionName := mux.Vars(r)["session"]

	stats, ok := h.manager.GetSessionStats(tunnelName, sessionName)
	if !ok {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) GetAllStats(w http.ResponseWriter, r *http.Request) {
	stats := h.manager.GetAllTunnelStats()
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) ResetTunnelStats(w http.ResponseWriter, r *http.Request) {
	tunnelName := mux.Vars(r)["name"]

	ok := h.manager.ResetTunnelStats(tunnelName)
	if !ok {
		writeError(w, http.StatusNotFound, "tunnel not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "tunnel stats reset",
	})
}

func (h *Handler) EncryptIPsec(w http.ResponseWriter, r *http.Request) {
	var req IPsecEncryptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid data hex: "+err.Error())
		return
	}

	ciphertext, err := h.manager.EncryptIPsec(data, req.SPI, req.Key, req.SeqNum, req.NextHeader)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "encryption failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":        hex.EncodeToString(ciphertext),
		"length":      len(ciphertext),
		"spi":         req.SPI,
		"seq_num":     req.SeqNum,
		"next_header": req.NextHeader,
	})
}

func (h *Handler) DecryptIPsec(w http.ResponseWriter, r *http.Request) {
	var req IPsecDecryptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := hex.DecodeString(req.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid data hex: "+err.Error())
		return
	}

	plaintext, nextHeader, err := h.manager.DecryptIPsec(data, req.SPI, req.Key)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "decryption failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":        hex.EncodeToString(plaintext),
		"length":      len(plaintext),
		"next_header": nextHeader,
		"spi":         req.SPI,
	})
}
