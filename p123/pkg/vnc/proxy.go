package vnc

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"vnc-multiuser/pkg/database"
	"vnc-multiuser/pkg/recorder"
)

const (
	MsgTypeSetPixelFormat   = 0
	MsgTypeSetEncodings     = 2
	MsgTypeFramebufferUpdateRequest = 3
	MsgTypeKeyEvent         = 4
	MsgTypePointerEvent     = 5
	MsgTypeClientCutText    = 6
	MsgTypeFramebufferUpdate = 0
	MsgTypeSetColourMapEntries = 1
	MsgTypeBell            = 2
	MsgTypeServerCutText   = 3
	MsgTypeResizeFrameBuffer = 4
	MsgTypeKeyFrameRequest = 5

	EncodingRaw     = 0
	EncodingCopyRect = 1
	EncodingRRE     = 2
	EncodingCoRRE   = 4
	EncodingHextile = 5
	EncodingTight   = 7
	EncodingTightPNG = -260
	EncodingZRLE    = 16
)

type QualitySettings struct {
	CompressionLevel int
	QualityLevel     int
	Encoding         int
}

var DefaultQuality = QualitySettings{
	CompressionLevel: 6,
	QualityLevel:     8,
	Encoding:         EncodingTight,
}

type VNCClient struct {
	ID           string
	UserID       string
	UserName     string
	Conn         net.Conn
	IsController bool
	LastActive   time.Time
	mu           sync.Mutex
}

type VNCProxy struct {
	VNCConfig    Config
	DB           *database.Database
	Recorder     *recorder.Recorder

	vncConn      net.Conn
	clients      map[string]*VNCClient
	suspendedClients map[string]*SuspendedSession
	controllerID string
	broadcast    chan []byte
	mu           sync.RWMutex

	framebufferWidth  uint16
	framebufferHeight uint16
	serverName        string

	cursorX uint16
	cursorY uint16
	cursorMask uint8

	quality    QualitySettings
	suspendEnabled bool

	done chan struct{}
}

type Config struct {
	Host             string
	Port             int
	Password         string
	MaxViewers       int
	Encoding         string
	CompressionLevel int
	QualityLevel     int
	EnableSuspend    bool
}

type SuspendedSession struct {
	Session   *database.Session
	Quality   QualitySettings
	SuspendedAt time.Time
}

type PresetQuality struct {
	Name        string
	Compression int
	Quality     int
	Description string
}

func NewProxy(cfg Config, db *database.Database, rec *recorder.Recorder) *VNCProxy {
	encoding := EncodingTight
	switch cfg.Encoding {
	case "raw":
		encoding = EncodingRaw
	case "hextile":
		encoding = EncodingHextile
	case "zrle":
		encoding = EncodingZRLE
	}

	quality := DefaultQuality
	if cfg.CompressionLevel > 0 {
		quality.CompressionLevel = cfg.CompressionLevel
	}
	if cfg.QualityLevel > 0 {
		quality.QualityLevel = cfg.QualityLevel
	}
	quality.Encoding = encoding

	return &VNCProxy{
		VNCConfig:        cfg,
		DB:               db,
		Recorder:         rec,
		clients:          make(map[string]*VNCClient),
		suspendedClients: make(map[string]*SuspendedSession),
		broadcast:        make(chan []byte, 1024),
		done:             make(chan struct{}),
		quality:          quality,
		suspendEnabled:   cfg.EnableSuspend,
	}
}

var QualityPresets = []PresetQuality{
	{"lowest", 9, 2, "最低画质，最高压缩，带宽最小"},
	{"low", 8, 4, "低画质，高压缩"},
	{"medium", 6, 7, "中等画质（默认）"},
	{"high", 4, 8, "高质量，较低压缩"},
	{"highest", 2, 9, "最高画质，低压缩"},
	{"lossless", 1, 9, "无损压缩，带宽最高"},
}

func GetQualityPreset(name string) *QualitySettings {
	for _, p := range QualityPresets {
		if p.Name == name {
			return &QualitySettings{
				CompressionLevel: p.Compression,
				QualityLevel:     p.Quality,
				Encoding:         EncodingTight,
			}
		}
	}
	return nil
}

func (p *VNCProxy) Start() error {
	addr := fmt.Sprintf("%s:%d", p.VNCConfig.Host, p.VNCConfig.Port)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to connect to VNC server: %w", err)
	}

	p.vncConn = conn
	if err := p.handshake(); err != nil {
		conn.Close()
		return fmt.Errorf("VNC handshake failed: %w", err)
	}

	go p.readFromVNC()
	go p.broadcastLoop()
	go p.cleanupLoop()

	if p.Recorder != nil {
		p.Recorder.Start()
	}

	return nil
}

func (p *VNCProxy) handshake() error {
	buf := make([]byte, 1024)

	if _, err := io.ReadFull(p.vncConn, buf[:12]); err != nil {
		return err
	}
	version := string(buf[:12])
	if version[:4] != "RFB " {
		return fmt.Errorf("invalid VNC version: %s", version)
	}

	if _, err := p.vncConn.Write([]byte("RFB 003.008\n")); err != nil {
		return err
	}

	if _, err := io.ReadFull(p.vncConn, buf[:1]); err != nil {
		return err
	}
	numSecTypes := int(buf[0])
	if numSecTypes == 0 {
		if _, err := io.ReadFull(p.vncConn, buf[:4]); err != nil {
			return err
		}
		reasonLen := binary.BigEndian.Uint32(buf[:4])
		reason, _ := io.ReadAll(io.LimitReader(p.vncConn, int64(reasonLen)))
		return fmt.Errorf("VNC connection failed: %s", reason)
	}

	secTypes := make([]byte, numSecTypes)
	if _, err := io.ReadFull(p.vncConn, secTypes); err != nil {
		return err
	}

	selectedSecType := byte(1)
	for _, t := range secTypes {
		if t == 2 && p.VNCConfig.Password != "" {
			selectedSecType = 2
			break
		}
	}

	if _, err := p.vncConn.Write([]byte{selectedSecType}); err != nil {
		return err
	}

	if selectedSecType == 2 {
		if err := p.authenticate(buf); err != nil {
			return err
		}
	}

	if _, err := io.ReadFull(p.vncConn, buf[:4]); err != nil {
		return err
	}
	authResult := binary.BigEndian.Uint32(buf[:4])
	if authResult != 0 {
		if authResult == 1 {
			return fmt.Errorf("VNC authentication failed")
		}
		reasonLen := binary.BigEndian.Uint32(buf[:4])
		reason, _ := io.ReadAll(io.LimitReader(p.vncConn, int64(reasonLen)))
		return fmt.Errorf("VNC init failed: %s", reason)
	}

	initMsg := make([]byte, 1)
	initMsg[0] = 1
	if _, err := p.vncConn.Write(initMsg); err != nil {
		return err
	}

	if _, err := io.ReadFull(p.vncConn, buf[:24]); err != nil {
		return err
	}

	p.framebufferWidth = binary.BigEndian.Uint16(buf[0:2])
	p.framebufferHeight = binary.BigEndian.Uint16(buf[2:4])

	nameLen := binary.BigEndian.Uint32(buf[20:24])
	nameBuf := make([]byte, nameLen)
	if _, err := io.ReadFull(p.vncConn, nameBuf); err != nil {
		return err
	}
	p.serverName = string(nameBuf)

	return nil
}

func (p *VNCProxy) authenticate(buf []byte) error {
	challenge := make([]byte, 16)
	if _, err := io.ReadFull(p.vncConn, challenge); err != nil {
		return err
	}

	response := p.desEncrypt(challenge, []byte(p.VNCConfig.Password))
	if _, err := p.vncConn.Write(response); err != nil {
		return err
	}

	return nil
}

func (p *VNCProxy) desEncrypt(challenge, key []byte) []byte {
	return challenge
}

func (p *VNCProxy) readFromVNC() {
	buf := make([]byte, 65536)
	for {
		select {
		case <-p.done:
			return
		default:
			n, err := p.vncConn.Read(buf)
			if err != nil {
				return
			}

			data := make([]byte, n)
			copy(data, buf[:n])

			p.broadcast <- data

			if p.Recorder != nil {
				p.Recorder.WriteFrame(data)
			}
		}
	}
}

func (p *VNCProxy) broadcastLoop() {
	for {
		select {
		case <-p.done:
			return
		case data := <-p.broadcast:
			p.mu.RLock()
			for _, client := range p.clients {
				client.mu.Lock()
				client.Conn.Write(data)
				client.mu.Unlock()
			}
			p.mu.RUnlock()
		}
	}
}

func (p *VNCProxy) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-p.done:
			return
		case <-ticker.C:
			p.DB.CleanupSessions(time.Hour)
		}
	}
}

func (p *VNCProxy) AddClient(client *VNCClient) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.clients) >= p.VNCConfig.MaxViewers {
		return fmt.Errorf("maximum viewers reached")
	}

	if len(p.clients) == 0 {
		client.IsController = true
		p.controllerID = client.ID
	}

	p.clients[client.ID] = client

	session := &database.Session{
		ID:           client.ID,
		UserID:       client.UserID,
		UserName:     client.UserName,
		IsController: client.IsController,
		ConnectedAt:  time.Now(),
		LastActive:   time.Now(),
	}
	p.DB.AddSession(session)

	go p.handleClient(client)

	return nil
}

func (p *VNCProxy) handleClient(client *VNCClient) {
	defer p.RemoveClient(client.ID)

	buf := make([]byte, 65536)

	serverInit := p.buildServerInit()
	client.mu.Lock()
	client.Conn.Write(serverInit)
	client.mu.Unlock()

	if !client.IsController {
		p.mu.RLock()
		cursorEvent := p.buildPointerEvent(p.cursorX, p.cursorY, p.cursorMask)
		p.mu.RUnlock()
		client.mu.Lock()
		client.Conn.Write(cursorEvent)
		client.mu.Unlock()
	}

	for {
		n, err := client.Conn.Read(buf)
		if err != nil {
			return
		}

		client.LastActive = time.Now()
		p.DB.UpdateSessionActive(client.ID)

		msgType := buf[0]
		isControlMessage := (msgType == MsgTypeKeyEvent || msgType == MsgTypePointerEvent ||
			msgType == MsgTypeSetPixelFormat || msgType == MsgTypeSetEncodings ||
			msgType == MsgTypeFramebufferUpdateRequest || msgType == MsgTypeClientCutText)

		if isControlMessage {
			p.mu.RLock()
			hasController := p.controllerID != ""
			isClientController := client.IsController
			p.mu.RUnlock()

			if !hasController || isClientController {
				p.vncConn.Write(buf[:n])

				if msgType == MsgTypePointerEvent && n >= 6 {
					p.mu.Lock()
					p.cursorX = binary.BigEndian.Uint16(buf[2:4])
					p.cursorY = binary.BigEndian.Uint16(buf[4:6])
					p.cursorMask = buf[1]
					cursorData := make([]byte, n)
					copy(cursorData, buf[:n])
					p.mu.Unlock()

					p.broadcastCursor(cursorData, client.ID)
				}
			}
		}
	}
}

func (p *VNCProxy) buildPointerEvent(x, y uint16, mask uint8) []byte {
	buf := make([]byte, 6)
	buf[0] = MsgTypePointerEvent
	buf[1] = mask
	binary.BigEndian.PutUint16(buf[2:4], x)
	binary.BigEndian.PutUint16(buf[4:6], y)
	return buf
}

func (p *VNCProxy) broadcastCursor(data []byte, excludeClientID string) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	for id, client := range p.clients {
		if id == excludeClientID {
			continue
		}
		client.mu.Lock()
		client.Conn.Write(data)
		client.mu.Unlock()
	}
}

func (p *VNCProxy) buildServerInit() []byte {
	buf := make([]byte, 24+len(p.serverName))
	binary.BigEndian.PutUint16(buf[0:2], p.framebufferWidth)
	binary.BigEndian.PutUint16(buf[2:4], p.framebufferHeight)

	buf[4] = 32
	buf[5] = 24
	buf[6] = 0
	buf[7] = 1
	binary.BigEndian.PutUint16(buf[8:10], 255)
	binary.BigEndian.PutUint16(buf[10:12], 255)
	binary.BigEndian.PutUint16(buf[12:14], 255)
	buf[14] = 16
	buf[15] = 8
	buf[16] = 0

	binary.BigEndian.PutUint32(buf[20:24], uint32(len(p.serverName)))
	copy(buf[24:], p.serverName)

	return buf
}

func (p *VNCProxy) RemoveClient(clientID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	client := p.clients[clientID]
	if client == nil {
		return
	}

	client.Conn.Close()
	delete(p.clients, clientID)
	p.DB.RemoveSession(clientID)

	if client.IsController {
		p.controllerID = ""
		for _, c := range p.clients {
			c.IsController = true
			p.controllerID = c.ID
			p.DB.SetController(c.ID, true)
			break
		}
	}
}

func (p *VNCProxy) RequestControl(clientID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.controllerID == "" {
		if client, ok := p.clients[clientID]; ok {
			client.IsController = true
			p.controllerID = clientID
			p.DB.SetController(clientID, true)
			return true
		}
	}
	return p.controllerID == clientID
}

func (p *VNCProxy) ReleaseControl(clientID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.controllerID == clientID {
		if client, ok := p.clients[clientID]; ok {
			client.IsController = false
		}
		p.controllerID = ""
		p.DB.SetController(clientID, false)
	}
}

func (p *VNCProxy) GetActiveClients() []*VNCClient {
	p.mu.RLock()
	defer p.mu.RUnlock()

	clients := make([]*VNCClient, 0, len(p.clients))
	for _, c := range p.clients {
		clients = append(clients, c)
	}
	return clients
}

func (p *VNCProxy) Stop() {
	close(p.done)
	if p.vncConn != nil {
		p.vncConn.Close()
	}
	if p.Recorder != nil {
		p.Recorder.Stop()
	}
}

func (p *VNCProxy) SetQuality(settings QualitySettings) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if settings.CompressionLevel < 0 || settings.CompressionLevel > 9 {
		return fmt.Errorf("invalid compression level: %d (0-9)", settings.CompressionLevel)
	}
	if settings.QualityLevel < 0 || settings.QualityLevel > 9 {
		return fmt.Errorf("invalid quality level: %d (0-9)", settings.QualityLevel)
	}

	p.quality = settings

	encMsg := p.buildSetEncodingsMessage()
	p.vncConn.Write(encMsg)

	qMsg := p.buildTightQualityMessage(settings)
	p.vncConn.Write(qMsg)

	for _, client := range p.clients {
		client.mu.Lock()
		client.Conn.Write(encMsg)
		client.Conn.Write(qMsg)
		client.mu.Unlock()
	}

	return nil
}

func (p *VNCProxy) GetQuality() QualitySettings {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.quality
}

func (p *VNCProxy) buildSetEncodingsMessage() []byte {
	buf := make([]byte, 4 + 3*4)
	buf[0] = MsgTypeSetEncodings
	buf[1] = 0
	binary.BigEndian.PutUint16(buf[2:4], 3)

	encodings := []int32{
		int32(p.quality.Encoding),
		-239,
		-240,
	}

	for i, enc := range encodings {
		binary.BigEndian.PutUint32(buf[4+i*4:8+i*4], uint32(enc))
	}

	return buf
}

func (p *VNCProxy) buildTightQualityMessage(settings QualitySettings) []byte {
	buf := make([]byte, 8)

	buf[0] = MsgTypeSetEncodings
	buf[1] = 0
	binary.BigEndian.PutUint16(buf[2:4], 2)

	qLevel := uint32(0xFFFFFF00 | uint32(settings.QualityLevel))
	compLevel := uint32(0xFFFFFF00 | uint32(settings.CompressionLevel))

	binary.BigEndian.PutUint32(buf[4:8], qLevel)
	compBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(compBuf, compLevel)

	return append(buf, compBuf...)
}

func (p *VNCProxy) SuspendSession(clientID string) error {
	if !p.suspendEnabled {
		return fmt.Errorf("session suspend is not enabled")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	client, ok := p.clients[clientID]
	if !ok {
		return fmt.Errorf("session not found")
	}

	session, err := p.DB.GetActiveSessions()
	if err != nil {
		return err
	}

	var targetSession *database.Session
	for _, s := range session {
		if s.ID == clientID {
			targetSession = s
			break
		}
	}

	suspended := &SuspendedSession{
		Session:     targetSession,
		Quality:     p.quality,
		SuspendedAt: time.Now(),
	}

	p.suspendedClients[clientID] = suspended

	client.Conn.Close()
	delete(p.clients, clientID)

	if client.IsController {
		p.controllerID = ""
		for _, c := range p.clients {
			c.IsController = true
			p.controllerID = c.ID
			p.DB.SetController(c.ID, true)
			break
		}
	}

	return nil
}

func (p *VNCProxy) ResumeSession(clientID string, newConn net.Conn) (*VNCClient, error) {
	if !p.suspendEnabled {
		return nil, fmt.Errorf("session suspend is not enabled")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	suspended, ok := p.suspendedClients[clientID]
	if !ok {
		return nil, fmt.Errorf("suspended session not found")
	}

	client := &VNCClient{
		ID:         clientID,
		UserID:     suspended.Session.UserID,
		UserName:   suspended.Session.UserName,
		Conn:       newConn,
		LastActive: time.Now(),
	}

	p.clients[clientID] = client
	delete(p.suspendedClients, clientID)

	suspended.Session.ConnectedAt = time.Now()
	suspended.Session.LastActive = time.Now()
	p.DB.AddSession(suspended.Session)

	go p.handleClient(client)

	return client, nil
}

func (p *VNCProxy) GetSuspendedSessions() []*SuspendedSession {
	p.mu.RLock()
	defer p.mu.RUnlock()

	sessions := make([]*SuspendedSession, 0, len(p.suspendedClients))
	for _, s := range p.suspendedClients {
		sessions = append(sessions, s)
	}
	return sessions
}

func (p *VNCProxy) GetSuspendedSession(clientID string) *SuspendedSession {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.suspendedClients[clientID]
}
