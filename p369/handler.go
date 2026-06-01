package main

import (
	"fmt"
	"log"
	"net"
	"time"

	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
	"layeh.com/radius/rfc3576"
)

type RADIUSServer struct {
	store    *SessionStore
	secret   []byte
	notifier *NASNotifier
	logger   *AuthChangeLogger

	authAddr   string
	acctAddr   string
	coaAddr    string
	authServer *radius.PacketServer
	acctServer *radius.PacketServer
	coaServer  *radius.PacketServer
}

func NewRADIUSServer(store *SessionStore, secret string, notifier *NASNotifier, logger *AuthChangeLogger) *RADIUSServer {
	return &RADIUSServer{
		store:    store,
		secret:   []byte(secret),
		notifier: notifier,
		logger:   logger,
		authAddr: ":1812",
		acctAddr: ":1813",
		coaAddr:  ":3799",
	}
}

func (s *RADIUSServer) Start() error {
	secretSource := radius.StaticSecretSource(s.secret)

	handler := radius.HandlerFunc(s.handlePacket)

	s.authServer = &radius.PacketServer{
		Addr:         s.authAddr,
		Network:      "udp",
		SecretSource: secretSource,
		Handler:      handler,
	}

	s.acctServer = &radius.PacketServer{
		Addr:         s.acctAddr,
		Network:      "udp",
		SecretSource: secretSource,
		Handler:      handler,
	}

	s.coaServer = &radius.PacketServer{
		Addr:         s.coaAddr,
		Network:      "udp",
		SecretSource: secretSource,
		Handler:      handler,
	}

	go func() {
		log.Printf("RADIUS Auth server listening on %s", s.authAddr)
		if err := s.authServer.ListenAndServe(); err != nil {
			log.Printf("Auth server error: %v", err)
		}
	}()

	go func() {
		log.Printf("RADIUS Accounting server listening on %s", s.acctAddr)
		if err := s.acctServer.ListenAndServe(); err != nil {
			log.Printf("Accounting server error: %v", err)
		}
	}()

	go func() {
		log.Printf("RADIUS CoA/DM server listening on %s", s.coaAddr)
		if err := s.coaServer.ListenAndServe(); err != nil {
			log.Printf("CoA/DM server error: %v", err)
		}
	}()

	return nil
}

func (s *RADIUSServer) handlePacket(w radius.ResponseWriter, r *radius.Request) {
	switch r.Code {
	case radius.CodeAccessRequest:
		s.handleAccessRequest(w, r)
	case radius.CodeAccountingRequest:
		s.handleAccountingRequest(w, r)
	case radius.CodeCoARequest:
		s.handleCoARequest(w, r)
	case radius.CodeDisconnectRequest:
		s.handleDisconnectRequest(w, r)
	default:
		log.Printf("Unhandled packet code: %d (%s)", r.Code, r.Code)
	}
}

func (s *RADIUSServer) handleAccessRequest(w radius.ResponseWriter, r *radius.Request) {
	username := rfc2865.UserName_GetString(r.Packet)
	nasIP := getNASIP(r.Packet)
	nasPort := rfc2865.NASPort_Get(r.Packet)

	log.Printf("Access-Request: user=%s nas=%s port=%d from=%s", username, nasIP, nasPort, r.RemoteAddr)

	if username == "" {
		log.Printf("Access-Request rejected: empty username")
		w.Write(r.Packet.Response(radius.CodeAccessReject))
		return
	}

	sessionID := GenerateSessionID()
	session := &Session{
		SessionID:      sessionID,
		UserName:       username,
		NASIP:          nasIP,
		NASPort:        uint32(nasPort),
		FramedIP:       "10.0.0." + fmt.Sprintf("%d", uint32(nasPort)%254+1),
		BandwidthUp:    1024,
		BandwidthDown:  2048,
		SessionTimeout: 3600,
		FilterID:       "default",
		StartTime:      getTimeNow(),
		Status:         StatusActive,
	}

	s.store.Add(session)

	resp := r.Packet.Response(radius.CodeAccessAccept)
	rfc2865.SessionTimeout_Set(resp, rfc2865.SessionTimeout(session.SessionTimeout))
	rfc2865.FilterID_SetString(resp, session.FilterID)
	rfc2865.FramedIPAddress_Set(resp, net.ParseIP(session.FramedIP))
	rfc2866.AcctSessionID_SetString(resp, sessionID)

	if err := w.Write(resp); err != nil {
		log.Printf("Error writing Access-Accept: %v", err)
		return
	}

	log.Printf("Access-Accept: user=%s session=%s bw_up=%d bw_down=%d", username, sessionID, session.BandwidthUp, session.BandwidthDown)
}

func (s *RADIUSServer) handleAccountingRequest(w radius.ResponseWriter, r *radius.Request) {
	username := rfc2865.UserName_GetString(r.Packet)
	sessionID := rfc2866.AcctSessionID_GetString(r.Packet)
	statusType := rfc2866.AcctStatusType_Get(r.Packet)

	log.Printf("Accounting-Request: user=%s session=%s status=%d from=%s", username, sessionID, statusType, r.RemoteAddr)

	if statusType == rfc2866.AcctStatusType_Value_Stop {
		s.store.Disconnect(sessionID)
		log.Printf("Session stopped: session=%s", sessionID)
	}

	w.Write(r.Packet.Response(radius.CodeAccountingResponse))
}

func (s *RADIUSServer) handleCoARequest(w radius.ResponseWriter, r *radius.Request) {
	sessionID := rfc2866.AcctSessionID_GetString(r.Packet)
	username := rfc2865.UserName_GetString(r.Packet)

	log.Printf("CoA-Request: user=%s session=%s from=%s", username, sessionID, r.RemoteAddr)

	session, found := s.store.GetBySessionIDAndUser(sessionID, username)
	if !found {
		log.Printf("CoA-NAK: session not found or user mismatch: session=%s user=%s", sessionID, username)
		resp := r.Packet.Response(radius.CodeCoANAK)
		rfc3576.ErrorCause_Set(resp, rfc3576.ErrorCause_Value_SessionContextNotFound)
		w.Write(resp)
		return
	}

	if session.Status == StatusDisconnected {
		log.Printf("CoA-NAK: session already disconnected: %s", sessionID)
		resp := r.Packet.Response(radius.CodeCoANAK)
		rfc3576.ErrorCause_Set(resp, rfc3576.ErrorCause_Value_SessionContextNotFound)
		w.Write(resp)
		return
	}

	var updates []string
	changes := make(map[string]interface{})
	vendor := detectVendor(r.Packet)

	if timeout, err := rfc2865.SessionTimeout_Lookup(r.Packet); err == nil {
		s.store.UpdateSessionTimeout(sessionID, uint32(timeout))
		session.SessionTimeout = uint32(timeout)
		updates = append(updates, fmt.Sprintf("session_timeout:%d", timeout))
		changes["session_timeout"] = uint32(timeout)
		log.Printf("CoA: updated SessionTimeout=%d for session=%s", timeout, sessionID)
	}

	if filterID := rfc2865.FilterID_GetString(r.Packet); filterID != "" {
		s.store.UpdateFilterID(sessionID, filterID)
		session.FilterID = filterID
		updates = append(updates, fmt.Sprintf("filter_id:%s", filterID))
		changes["filter_id"] = filterID
		log.Printf("CoA: updated FilterID=%s for session=%s", filterID, sessionID)
	}

	if bwUp, bwDown := extractBandwidth(r.Packet); bwUp > 0 || bwDown > 0 {
		if bwUp > 0 {
			session.BandwidthUp = bwUp
			updates = append(updates, fmt.Sprintf("bandwidth_up:%d", bwUp))
			changes["bandwidth_up"] = bwUp
		}
		if bwDown > 0 {
			session.BandwidthDown = bwDown
			updates = append(updates, fmt.Sprintf("bandwidth_down:%d", bwDown))
			changes["bandwidth_down"] = bwDown
		}
		s.store.UpdateBandwidth(sessionID, session.BandwidthUp, session.BandwidthDown)
		log.Printf("CoA: updated bandwidth up=%d down=%d for session=%s", session.BandwidthUp, session.BandwidthDown, sessionID)
	}

	if bwUp, bwDown, vendorFound := ExtractVendorBandwidth(r.Packet); vendorFound {
		if bwUp > 0 {
			session.BandwidthUp = bwUp
			updates = append(updates, fmt.Sprintf("vendor_bw_up:%d", bwUp))
			changes["vendor_bandwidth_up"] = bwUp
		}
		if bwDown > 0 {
			session.BandwidthDown = bwDown
			updates = append(updates, fmt.Sprintf("vendor_bw_down:%d", bwDown))
			changes["vendor_bandwidth_down"] = bwDown
		}
		s.store.UpdateBandwidth(sessionID, session.BandwidthUp, session.BandwidthDown)
		log.Printf("CoA: vendor bandwidth up=%d down=%d vendor=%s", bwUp, bwDown, vendor)
	}

	resp := r.Packet.Response(radius.CodeCoAACK)
	rfc2865.SessionTimeout_Set(resp, rfc2865.SessionTimeout(session.SessionTimeout))
	rfc2865.FilterID_SetString(resp, session.FilterID)
	rfc2866.AcctSessionID_SetString(resp, sessionID)

	if err := w.Write(resp); err != nil {
		if s.logger != nil {
			s.logger.Log(buildAuthLogEntry(session, "coa", vendor, changes, "failed", err.Error()))
		}
		log.Printf("Error writing CoA-ACK: %v", err)
		return
	}

	log.Printf("CoA-ACK: session=%s user=%s bw_up=%d bw_down=%d timeout=%d filter=%s vendor=%s",
		sessionID, session.UserName, session.BandwidthUp, session.BandwidthDown, session.SessionTimeout, session.FilterID, vendor)

	if len(updates) > 0 && s.notifier != nil {
		s.notifier.PushSessionUpdate(session, updates)
	}

	if s.logger != nil && len(changes) > 0 {
		s.logger.Log(buildAuthLogEntry(session, "coa", vendor, changes, "success", "CoA-ACK sent"))
	}
}

func (s *RADIUSServer) handleDisconnectRequest(w radius.ResponseWriter, r *radius.Request) {
	sessionID := rfc2866.AcctSessionID_GetString(r.Packet)
	username := rfc2865.UserName_GetString(r.Packet)

	log.Printf("Disconnect-Request: user=%s session=%s from=%s", username, sessionID, r.RemoteAddr)

	session, found := s.store.GetBySessionIDAndUser(sessionID, username)
	if !found {
		if username != "" {
			log.Printf("Disconnect-NAK: session/user mismatch: session=%s user=%s", sessionID, username)
		} else {
			log.Printf("Disconnect-NAK: session not found: %s", sessionID)
		}
		resp := r.Packet.Response(radius.CodeDisconnectNAK)
		rfc3576.ErrorCause_Set(resp, rfc3576.ErrorCause_Value_SessionContextNotFound)
		w.Write(resp)
		return
	}

	if session.Status == StatusDisconnected {
		log.Printf("Disconnect-NAK: session already disconnected: %s", sessionID)
		resp := r.Packet.Response(radius.CodeDisconnectNAK)
		rfc3576.ErrorCause_Set(resp, rfc3576.ErrorCause_Value_SessionContextNotFound)
		w.Write(resp)
		return
	}

	s.store.Disconnect(sessionID)

	resp := r.Packet.Response(radius.CodeDisconnectACK)
	rfc2866.AcctSessionID_SetString(resp, sessionID)

	if err := w.Write(resp); err != nil {
		if s.logger != nil {
			changes := map[string]interface{}{"status": "disconnected"}
			s.logger.Log(buildAuthLogEntry(session, "disconnect", "standard", changes, "failed", err.Error()))
		}
		log.Printf("Error writing Disconnect-ACK: %v", err)
		return
	}

	log.Printf("Disconnect-ACK: session=%s user=%s disconnected", sessionID, username)

	if s.notifier != nil {
		s.notifier.PushDisconnect(session)
	}

	if s.logger != nil {
		changes := map[string]interface{}{"status": "disconnected"}
		s.logger.Log(buildAuthLogEntry(session, "disconnect", "standard", changes, "success", "Disconnect-ACK sent"))
	}
}

func getNASIP(p *radius.Packet) string {
	ip := rfc2865.NASIPAddress_Get(p)
	if ip != nil {
		return ip.String()
	}
	return rfc2865.NASIdentifier_GetString(p)
}

func extractBandwidth(p *radius.Packet) (uint32, uint32) {
	var bwUp, bwDown uint32

	for _, avp := range p.Attributes {
		switch avp.Type {
		case 107:
			bwUp = radiusInteger(avp.Attribute)
		case 108:
			bwDown = radiusInteger(avp.Attribute)
		}
	}

	return bwUp, bwDown
}

func radiusInteger(attr radius.Attribute) uint32 {
	b := []byte(attr)
	if len(b) < 4 {
		return 0
	}
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}

func getTimeNow() time.Time {
	return time.Now()
}

func detectVendor(p *radius.Packet) string {
	for _, avp := range p.Attributes {
		if avp.Type != AttributeVendorSpecific {
			continue
		}
		vendorID, _, _, _, ok := ParseVendorSpecific(avp.Attribute)
		if !ok {
			continue
		}
		switch vendorID {
		case VendorCisco:
			return "cisco"
		case VendorHuawei:
			return "huawei"
		case VendorJuniper:
			return "juniper"
		case VendorMikrotik:
			return "mikrotik"
		}
	}
	return "standard"
}

var _ = net.InterfaceAddrs
