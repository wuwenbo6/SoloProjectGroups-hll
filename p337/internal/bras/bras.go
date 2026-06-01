package bras

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net"
	"sync"
	"time"

	"bras-simulator/internal/auth"
	"bras-simulator/internal/pppoe"
	"bras-simulator/internal/radius"
	"bras-simulator/internal/stats"
	"bras-simulator/internal/vlan"
)

type BRAS struct {
	mu             sync.RWMutex
	sessionManager *pppoe.SessionManager
	authenticator  *auth.Authenticator
	vlanPool       *vlan.VLANPool
	radiusClient   *radius.RADIUSClient
	radiusServer   *radius.RADIUSServer
	statsCollector *stats.StatsCollector
	events         []*BRAS_Event
	eventChan      chan *BRAS_Event
	running        bool
	statsTicker    *time.Ticker
	radiusEnabled  bool
}

type BRAS_Event struct {
	ID        string      `json:"id"`
	Timestamp time.Time   `json:"timestamp"`
	Level     string      `json:"level"`
	Category  string      `json:"category"`
	SessionID string      `json:"session_id,omitempty"`
	Username  string      `json:"username,omitempty"`
	VLANID    int         `json:"vlan_id,omitempty"`
	Message   string      `json:"message"`
	Details   interface{} `json:"details,omitempty"`
}

type ConnectRequest struct {
	MACAddress  string `json:"mac_address"`
	ServiceName string `json:"service_name"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	AuthMethod  string `json:"auth_method"`
}

type ConnectResult struct {
	Success    bool                   `json:"success"`
	SessionID  string                 `json:"session_id"`
	Username   string                 `json:"username"`
	RemoteIP   string                 `json:"remote_ip"`
	VLANID     int                    `json:"vlan_id"`
	Message    string                 `json:"message"`
	Events     []*BRAS_Event          `json:"events"`
	Discovery  *pppoe.DiscoveryResult `json:"discovery,omitempty"`
	AuthResult *auth.AuthResult       `json:"auth_result,omitempty"`
}

type SessionSummary struct {
	SessionID    string     `json:"session_id"`
	MACAddress   string     `json:"mac_address"`
	State        string     `json:"state"`
	Username     string     `json:"username"`
	AuthMethod   string     `json:"auth_method"`
	RemoteIP     string     `json:"remote_ip"`
	AssignedVLAN int        `json:"assigned_vlan"`
	CreatedAt    time.Time  `json:"created_at"`
	ConnectedAt  *time.Time `json:"connected_at,omitempty"`
	BytesIn      int64      `json:"bytes_in"`
	BytesOut     int64      `json:"bytes_out"`
	PacketsIn    int64      `json:"packets_in"`
	PacketsOut   int64      `json:"packets_out"`
}

type SystemStats struct {
	TotalSessions     int                 `json:"total_sessions"`
	ActiveSessions    int                 `json:"active_sessions"`
	Authentications   int                 `json:"authentications"`
	AuthSuccess       int                 `json:"auth_success"`
	AuthFailed        int                 `json:"auth_failed"`
	VLANAllocations   int                 `json:"vlan_allocations"`
	VLANTotalCapacity int                 `json:"vlan_total_capacity"`
	VLANUsagePercent  float64             `json:"vlan_usage_percent"`
	Uptime            string              `json:"uptime"`
	PoolStats         map[string]PoolStat `json:"pool_stats"`
}

type PoolStat struct {
	Total     int `json:"total"`
	Used      int `json:"used"`
	Available int `json:"available"`
}

func NewBRAS() *BRAS {
	store := auth.NewCredentialStore()
	radiusConfig := radius.DefaultClientConfig()
	radiusSrv := radius.NewRADIUSServer(radius.DefaultServerConfig())

	return &BRAS{
		sessionManager: pppoe.NewSessionManager(),
		authenticator:  auth.NewAuthenticator(store),
		vlanPool:       vlan.NewVLANPool(),
		radiusClient:   radius.NewRADIUSClient(radiusConfig),
		radiusServer:   radiusSrv,
		statsCollector: stats.NewStatsCollector(),
		events:         make([]*BRAS_Event, 0, 1000),
		eventChan:      make(chan *BRAS_Event, 1000),
		running:        false,
		radiusEnabled:  true,
	}
}

func (b *BRAS) Start() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.running {
		return fmt.Errorf("BRAS already running")
	}

	b.running = true
	go b.eventProcessor()
	go b.statsUpdater()

	if b.radiusEnabled {
		if err := b.radiusServer.Start(); err != nil {
			b.addEvent(&BRAS_Event{
				Level:    "WARNING",
				Category: "RADIUS",
				Message:  fmt.Sprintf("RADIUS server start failed: %v (running in local-only mode)", err),
			})
		} else {
			b.addEvent(&BRAS_Event{
				Level:    "INFO",
				Category: "RADIUS",
				Message:  "RADIUS authentication proxy server started (auth=1812, acct=1813)",
			})
		}
	}

	b.addEvent(&BRAS_Event{
		Level:    "INFO",
		Category: "SYSTEM",
		Message:  "BRAS Simulator started",
	})

	return nil
}

func (b *BRAS) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.running {
		return
	}

	b.running = false
	if b.statsTicker != nil {
		b.statsTicker.Stop()
	}

	if b.radiusServer.IsRunning() {
		b.radiusServer.Stop()
		b.addEvent(&BRAS_Event{
			Level:    "INFO",
			Category: "RADIUS",
			Message:  "RADIUS server stopped",
		})
	}

	b.addEvent(&BRAS_Event{
		Level:    "INFO",
		Category: "SYSTEM",
		Message:  "BRAS Simulator stopped",
	})
}

func (b *BRAS) eventProcessor() {
	for e := range b.eventChan {
		b.mu.Lock()
		e.ID = fmt.Sprintf("EVT-%08d", len(b.events)+1)
		b.events = append(b.events, e)
		if len(b.events) > 1000 {
			b.events = b.events[1:]
		}
		b.mu.Unlock()
	}
}

func (b *BRAS) statsUpdater() {
	b.statsTicker = time.NewTicker(5 * time.Second)
	defer b.statsTicker.Stop()

	for range b.statsTicker.C {
		b.mu.RLock()
		if !b.running {
			b.mu.RUnlock()
			return
		}
		sessions := b.sessionManager.ListSessions()
		b.mu.RUnlock()

		for _, s := range sessions {
			if s.GetState() == pppoe.StateUp {
				s.UpdateStats(
					int64(rand.Intn(10000)+1000),
					int64(rand.Intn(5000)+500),
					int64(rand.Intn(50)+5),
					int64(rand.Intn(30)+2),
				)
			}
		}
	}
}

func (b *BRAS) addEvent(e *BRAS_Event) {
	e.Timestamp = time.Now()
	select {
	case b.eventChan <- e:
	default:
	}
}

func (b *BRAS) Connect(req *ConnectRequest) *ConnectResult {
	result := &ConnectResult{
		Events: make([]*BRAS_Event, 0),
	}

	if req.MACAddress == "" {
		req.MACAddress = generateRandomMAC()
	}
	if req.ServiceName == "" {
		req.ServiceName = "INTERNET"
	}
	if req.AuthMethod == "" {
		req.AuthMethod = "PAP"
	}

	b.addEvent(&BRAS_Event{
		Level:    "DEBUG",
		Category: "PPPOE",
		Message:  fmt.Sprintf("Initiating connection from MAC %s, user %s", req.MACAddress, req.Username),
	})

	discoveryResult := pppoe.SimulateDiscovery(b.sessionManager, req.MACAddress, req.ServiceName)
	result.Discovery = discoveryResult
	session := discoveryResult.Session
	result.SessionID = session.SessionID

	for _, e := range discoveryResult.Events {
		evt := &BRAS_Event{
			Level:     "DEBUG",
			Category:  "PPPOE",
			SessionID: session.SessionID,
			Message:   e.Description,
		}
		b.addEvent(evt)
		result.Events = append(result.Events, evt)
	}

	if !discoveryResult.Success {
		result.Success = false
		result.Message = fmt.Sprintf("PPPoE discovery failed: %s", discoveryResult.Error)
		return result
	}

	session.Username = req.Username
	session.AuthMethod = req.AuthMethod
	session.SetState(pppoe.StateAuth)

	var authResult *auth.AuthResult
	var radiusResp *radius.AuthResponse
	var usedRADIUS bool

	if b.radiusEnabled && b.radiusClient.IsEnabled() && b.radiusServer.IsRunning() {
		b.addEvent(&BRAS_Event{
			Level:     "INFO",
			Category:  "RADIUS",
			SessionID: session.SessionID,
			Username:  req.Username,
			Message:   fmt.Sprintf("Proxying authentication to RADIUS server (%s:%d)", b.radiusClient.GetConfig().ServerHost, b.radiusClient.GetConfig().AuthPort),
		})

		if req.AuthMethod == "CHAP" {
			challenge := b.authenticator.GenerateCHAPChallenge(session.ACName)
			chapResponse := b.authenticator.ComputeCHAPResponse(challenge, req.Username, req.Password)
			radiusResp = b.radiusClient.AuthenticateCHAP(req.Username, challenge.Identifier, challenge.Value, chapResponse.Value, session.SessionID, req.MACAddress)
		} else {
			radiusResp = b.radiusClient.AuthenticatePAP(req.Username, req.Password, session.SessionID, req.MACAddress)
		}

		usedRADIUS = true

		b.addEvent(&BRAS_Event{
			Level:     "INFO",
			Category:  "RADIUS",
			SessionID: session.SessionID,
			Username:  req.Username,
			Message:   fmt.Sprintf("RADIUS response: %s (duration: %s)", radiusResp.ReplyMessage, radiusResp.Duration),
		})

		if radiusResp.Accepted {
			authResult = &auth.AuthResult{
				Success:   true,
				Username:  req.Username,
				Method:    auth.AuthMethod(req.AuthMethod),
				SessionID: session.SessionID,
				RemoteIP:  radiusResp.FramedIP,
				Message:   fmt.Sprintf("RADIUS Access-Accept for user '%s'", req.Username),
				Timestamp: time.Now(),
				Duration:  radiusResp.Duration.String(),
			}
			if radiusResp.FramedIP != "" {
				authResult.RemoteIP = radiusResp.FramedIP
			}
		} else {
			authResult = &auth.AuthResult{
				Success:   false,
				Username:  req.Username,
				Method:    auth.AuthMethod(req.AuthMethod),
				SessionID: session.SessionID,
				Message:   fmt.Sprintf("RADIUS Access-Reject: %s", radiusResp.ReplyMessage),
				Timestamp: time.Now(),
				Duration:  radiusResp.Duration.String(),
			}
		}
	} else {
		if req.AuthMethod == "CHAP" {
			challenge := b.authenticator.GenerateCHAPChallenge(session.ACName)
			chapResponse := b.authenticator.ComputeCHAPResponse(challenge, req.Username, req.Password)

			evt := &BRAS_Event{
				Level:     "DEBUG",
				Category:  "AUTH",
				SessionID: session.SessionID,
				Username:  req.Username,
				Message:   fmt.Sprintf("CHAP challenge sent: id=0x%02x, value=%016x... (16 bytes random)", challenge.Identifier, challenge.Value[0:8]),
			}
			b.addEvent(evt)
			result.Events = append(result.Events, evt)

			evt = &BRAS_Event{
				Level:     "DEBUG",
				Category:  "AUTH",
				SessionID: session.SessionID,
				Username:  req.Username,
				Message:   fmt.Sprintf("CHAP response received: id=0x%02x, hash=%08x... (MD5)", chapResponse.Identifier, chapResponse.Value[0:4]),
			}
			b.addEvent(evt)
			result.Events = append(result.Events, evt)

			authResult = b.authenticator.AuthenticateCHAP(session.SessionID, req.Username, challenge, chapResponse)
		} else {
			evt := &BRAS_Event{
				Level:     "DEBUG",
				Category:  "AUTH",
				SessionID: session.SessionID,
				Username:  req.Username,
				Message:   "PAP authentication request received",
			}
			b.addEvent(evt)
			result.Events = append(result.Events, evt)

			authResult = b.authenticator.AuthenticatePAP(session.SessionID, req.Username, req.Password)
		}
	}

	result.AuthResult = authResult

	evt := &BRAS_Event{
		Level:     "INFO",
		Category:  "AUTH",
		SessionID: session.SessionID,
		Username:  req.Username,
		Message:   authResult.Message,
	}
	b.addEvent(evt)
	result.Events = append(result.Events, evt)

	if !authResult.Success {
		session.SetState(pppoe.StateDown)
		result.Success = false
		result.Message = authResult.Message
		return result
	}

	session.RemoteIP = authResult.RemoteIP

	cred, _ := b.authenticator.GetStore().GetCredential(req.Username)
	var poolName string
	switch {
	case cred.VLAN >= 100 && cred.VLAN < 200:
		poolName = "residential"
	case cred.VLAN >= 200 && cred.VLAN < 300:
		poolName = "business"
	case cred.VLAN >= 300 && cred.VLAN < 400:
		poolName = "management"
	default:
		poolName = "residential"
	}

	vlanAlloc, err := b.vlanPool.Allocate(poolName, session.SessionID, req.Username)
	if err != nil {
		evt := &BRAS_Event{
			Level:     "ERROR",
			Category:  "VLAN",
			SessionID: session.SessionID,
			Username:  req.Username,
			Message:   fmt.Sprintf("VLAN allocation failed: %v", err),
		}
		b.addEvent(evt)
		result.Events = append(result.Events, evt)

		session.SetState(pppoe.StateDown)
		result.Success = false
		result.Message = fmt.Sprintf("VLAN allocation failed: %v", err)
		return result
	}

	session.AssignedVLAN = vlanAlloc.VLANID

	evt = &BRAS_Event{
		Level:     "INFO",
		Category:  "VLAN",
		SessionID: session.SessionID,
		Username:  req.Username,
		VLANID:    vlanAlloc.VLANID,
		Message:   fmt.Sprintf("VLAN %d allocated to user %s (pool: %s)", vlanAlloc.VLANID, req.Username, poolName),
	}
	b.addEvent(evt)
	result.Events = append(result.Events, evt)

	session.SetState(pppoe.StateUp)

	evt = &BRAS_Event{
		Level:     "INFO",
		Category:  "SYSTEM",
		SessionID: session.SessionID,
		Username:  req.Username,
		VLANID:    vlanAlloc.VLANID,
		Message:   fmt.Sprintf("Session established: IP=%s, VLAN=%d, RADIUS=%v", authResult.RemoteIP, vlanAlloc.VLANID, usedRADIUS),
	}
	b.addEvent(evt)
	result.Events = append(result.Events, evt)

	b.statsCollector.RecordSessionStart(
		session.SessionID, req.Username, req.MACAddress,
		req.AuthMethod, authResult.RemoteIP, vlanAlloc.VLANID,
		poolName, usedRADIUS,
	)

	if usedRADIUS && b.radiusClient.IsEnabled() {
		go func() {
			b.radiusClient.SendAccountingStart(session.SessionID, req.Username, req.MACAddress, authResult.RemoteIP, vlanAlloc.VLANID)
		}()
	}

	result.Success = true
	result.Username = req.Username
	result.RemoteIP = authResult.RemoteIP
	result.VLANID = vlanAlloc.VLANID
	result.Message = fmt.Sprintf("Session established successfully. IP: %s, VLAN: %d, Auth: %s", authResult.RemoteIP, vlanAlloc.VLANID, map[bool]string{true: "RADIUS", false: "Local"}[usedRADIUS])

	return result
}

func (b *BRAS) Disconnect(sessionID string) error {
	session, ok := b.sessionManager.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	session.SetState(pppoe.StateTerminating)

	snap := session.GetSnapshot()
	sessionTime := uint32(0)
	if snap.ConnectedAt != nil {
		sessionTime = uint32(time.Since(*snap.ConnectedAt).Seconds())
	}

	if err := b.vlanPool.Release(session.AssignedVLAN); err != nil {
	} else {
		b.addEvent(&BRAS_Event{
			Level:     "INFO",
			Category:  "VLAN",
			SessionID: sessionID,
			Username:  session.Username,
			VLANID:    session.AssignedVLAN,
			Message:   fmt.Sprintf("VLAN %d released", session.AssignedVLAN),
		})
	}

	session.SetState(pppoe.StateDown)

	b.statsCollector.RecordSessionEnd(
		sessionID, snap.BytesIn, snap.BytesOut,
		snap.PacketsIn, snap.PacketsOut,
		"User-Request",
	)

	if b.radiusEnabled && b.radiusClient.IsEnabled() {
		go func() {
			b.radiusClient.SendAccountingStop(
				sessionID, snap.Username, snap.MACAddress,
				snap.RemoteIP, snap.AssignedVLAN,
				sessionTime,
				uint64(snap.BytesIn), uint64(snap.BytesOut),
				radius.TerminateUserRequest,
			)
		}()
	}

	b.addEvent(&BRAS_Event{
		Level:     "INFO",
		Category:  "SYSTEM",
		SessionID: sessionID,
		Username:  session.Username,
		Message:   fmt.Sprintf("Session %s disconnected for user %s (duration: %ds)", sessionID, session.Username, sessionTime),
	})

	return nil
}

func (b *BRAS) ListSessions() []*SessionSummary {
	b.mu.RLock()
	defer b.mu.RUnlock()

	sessions := b.sessionManager.ListSessions()
	summaries := make([]*SessionSummary, 0, len(sessions))

	for _, s := range sessions {
		snap := s.GetSnapshot()
		summaries = append(summaries, &SessionSummary{
			SessionID:    snap.SessionID,
			MACAddress:   snap.MACAddress,
			State:        snap.State.String(),
			Username:     snap.Username,
			AuthMethod:   snap.AuthMethod,
			RemoteIP:     snap.RemoteIP,
			AssignedVLAN: snap.AssignedVLAN,
			CreatedAt:    snap.CreatedAt,
			ConnectedAt:  snap.ConnectedAt,
			BytesIn:      snap.BytesIn,
			BytesOut:     snap.BytesOut,
			PacketsIn:    snap.PacketsIn,
			PacketsOut:   snap.PacketsOut,
		})
	}

	return summaries
}

func (b *BRAS) GetSession(sessionID string) (*SessionSummary, error) {
	session, ok := b.sessionManager.GetSession(sessionID)
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	snap := session.GetSnapshot()

	return &SessionSummary{
		SessionID:    snap.SessionID,
		MACAddress:   snap.MACAddress,
		State:        snap.State.String(),
		Username:     snap.Username,
		AuthMethod:   snap.AuthMethod,
		RemoteIP:     snap.RemoteIP,
		AssignedVLAN: snap.AssignedVLAN,
		CreatedAt:    snap.CreatedAt,
		ConnectedAt:  snap.ConnectedAt,
		BytesIn:      snap.BytesIn,
		BytesOut:     snap.BytesOut,
		PacketsIn:    snap.PacketsIn,
		PacketsOut:   snap.PacketsOut,
	}, nil
}

func (b *BRAS) ListVLANAllocations() []*vlan.VLANAllocation {
	return b.vlanPool.ListAllocations()
}

func (b *BRAS) ListVLANPools() []*vlan.PoolRange {
	return b.vlanPool.ListPools()
}

func (b *BRAS) GetVLANFreeList(poolName string) []int {
	return b.vlanPool.GetFreeList(poolName)
}

func (b *BRAS) ListVLANHistory() []*vlan.VLANAllocation {
	return b.vlanPool.ListHistory()
}

func (b *BRAS) GetVLANPoolStats(poolName string) (total, used, available int, err error) {
	return b.vlanPool.PoolStats(poolName)
}

func (b *BRAS) ListEvents() []*BRAS_Event {
	b.mu.RLock()
	defer b.mu.RUnlock()
	result := make([]*BRAS_Event, len(b.events))
	copy(result, b.events)
	return result
}

func (b *BRAS) GetStats() *SystemStats {
	b.mu.RLock()
	defer b.mu.RUnlock()

	poolNames := []string{"residential", "business", "management", "guest"}
	poolStats := make(map[string]PoolStat)
	totalCapacity := 0
	totalUsed := 0

	for _, name := range poolNames {
		total, used, available, _ := b.vlanPool.PoolStats(name)
		poolStats[name] = PoolStat{
			Total:     total,
			Used:      used,
			Available: available,
		}
		totalCapacity += total
		totalUsed += used
	}

	usagePercent := 0.0
	if totalCapacity > 0 {
		usagePercent = float64(totalUsed) / float64(totalCapacity) * 100
	}

	return &SystemStats{
		TotalSessions:     b.sessionManager.SessionCount(),
		ActiveSessions:    b.sessionManager.ActiveSessionCount(),
		VLANAllocations:   totalUsed,
		VLANTotalCapacity: totalCapacity,
		VLANUsagePercent:  usagePercent,
		PoolStats:         poolStats,
	}
}

func (b *BRAS) GetEventsJSON() string {
	events := b.ListEvents()
	data, _ := json.MarshalIndent(events, "", "  ")
	return string(data)
}

func (b *BRAS) GetDurationStats() *stats.DurationStats {
	return b.statsCollector.GetDurationStats()
}

func (b *BRAS) GetSessionRecords(limit, offset int) []*stats.SessionRecord {
	return b.statsCollector.GetSessionRecords(limit, offset)
}

func (b *BRAS) ExportSessionCSV(w io.Writer) error {
	return b.statsCollector.ExportCSV(w)
}

func (b *BRAS) ExportSessionJSON(w io.Writer) error {
	return b.statsCollector.ExportJSON(w)
}

func (b *BRAS) GetRADIUSServerStats() *radius.ServerStats {
	if b.radiusServer == nil {
		return nil
	}
	return b.radiusServer.GetStats()
}

func (b *BRAS) IsRADIUSEnabled() bool {
	return b.radiusEnabled
}

func (b *BRAS) SetRADIUSEnabled(enabled bool) {
	b.radiusEnabled = enabled
	b.radiusClient.SetEnabled(enabled)
}

func (b *BRAS) GetRADIUSClientConfig() *radius.ClientConfig {
	if b.radiusClient == nil {
		return nil
	}
	return b.radiusClient.GetConfig()
}

func generateRandomMAC() string {
	hw := make(net.HardwareAddr, 6)
	rand.Read(hw)
	hw[0] = (hw[0] & 0xFE) | 0x02
	return hw.String()
}
