package mqttsn

import (
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type Handler interface {
	OnConnect(clientID string, addr net.Addr) ReturnCode
	OnDisconnect(clientID string, duration uint16)
	OnPublish(clientID string, topicID uint16, data []byte, qos byte)
	OnSubscribe(clientID string, topicName string, messageID uint16) (uint16, ReturnCode)
	OnUnsubscribe(clientID string, topicName string)
	OnPing(clientID string)
	GetTopicName(topicID uint16) string
	RegisterTopic(clientID string, topicName string) uint16
}

type ServerConfig struct {
	GwID              byte
	AdvertisePeriod   time.Duration
	AdvertiseDuration uint16
}

func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		GwID:              1,
		AdvertisePeriod:   15 * time.Second,
		AdvertiseDuration: 30,
	}
}

type MessageStats struct {
	MessagesUplink    uint64
	MessagesDownlink  uint64
	MessagesDropped   uint64
	MessagesQueued    uint64
	MessagesDelivered uint64
	DropsQueueFull    uint64
	DropsSleeping     uint64
	DropsUnknownTopic uint64
	DropsOffline      uint64
}

type Server struct {
	addr      string
	conn      *net.UDPConn
	handler   Handler
	cfg       *ServerConfig
	clients   map[string]*ClientSession
	mu        sync.RWMutex
	nextMsgID uint16
	stats     MessageStats
}

type ClientSession struct {
	ClientID      string
	Addr          net.Addr
	Connected     bool
	LastSeen      time.Time
	Sleeping      bool
	SleepDuration time.Duration
}

func NewServer(addr string, handler Handler) *Server {
	return NewServerWithConfig(addr, handler, DefaultServerConfig())
}

func NewServerWithConfig(addr string, handler Handler, cfg *ServerConfig) *Server {
	return &Server{
		addr:      addr,
		handler:   handler,
		cfg:       cfg,
		clients:   make(map[string]*ClientSession),
		nextMsgID: 1,
	}
}

func (s *Server) GetStats() MessageStats {
	return MessageStats{
		MessagesUplink:    atomic.LoadUint64(&s.stats.MessagesUplink),
		MessagesDownlink:  atomic.LoadUint64(&s.stats.MessagesDownlink),
		MessagesDropped:   atomic.LoadUint64(&s.stats.MessagesDropped),
		MessagesQueued:    atomic.LoadUint64(&s.stats.MessagesQueued),
		MessagesDelivered: atomic.LoadUint64(&s.stats.MessagesDelivered),
		DropsQueueFull:    atomic.LoadUint64(&s.stats.DropsQueueFull),
		DropsSleeping:     atomic.LoadUint64(&s.stats.DropsSleeping),
		DropsUnknownTopic: atomic.LoadUint64(&s.stats.DropsUnknownTopic),
		DropsOffline:      atomic.LoadUint64(&s.stats.DropsOffline),
	}
}

func (s *Server) ResetStats() {
	atomic.StoreUint64(&s.stats.MessagesUplink, 0)
	atomic.StoreUint64(&s.stats.MessagesDownlink, 0)
	atomic.StoreUint64(&s.stats.MessagesDropped, 0)
	atomic.StoreUint64(&s.stats.MessagesQueued, 0)
	atomic.StoreUint64(&s.stats.MessagesDelivered, 0)
	atomic.StoreUint64(&s.stats.DropsQueueFull, 0)
	atomic.StoreUint64(&s.stats.DropsSleeping, 0)
	atomic.StoreUint64(&s.stats.DropsUnknownTopic, 0)
	atomic.StoreUint64(&s.stats.DropsOffline, 0)
}

func (s *Server) IncrementUplink() {
	atomic.AddUint64(&s.stats.MessagesUplink, 1)
}

func (s *Server) IncrementDownlink() {
	atomic.AddUint64(&s.stats.MessagesDownlink, 1)
}

func (s *Server) IncrementDelivered() {
	atomic.AddUint64(&s.stats.MessagesDelivered, 1)
}

func (s *Server) IncrementQueued() {
	atomic.AddUint64(&s.stats.MessagesQueued, 1)
}

func (s *Server) IncrementDrop(reason *uint64) {
	atomic.AddUint64(&s.stats.MessagesDropped, 1)
	atomic.AddUint64(reason, 1)
}

func (s *Server) ListenAndServe() error {
	udpAddr, err := net.ResolveUDPAddr("udp", s.addr)
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return err
	}
	s.conn = conn
	log.Printf("MQTT-SN server listening on %s (GW ID=%d)", s.addr, s.cfg.GwID)

	go s.cleanupLoop()
	if s.cfg.AdvertisePeriod > 0 {
		go s.advertiseLoop()
	}

	return s.serve()
}

func (s *Server) serve() error {
	buf := make([]byte, 1280)
	for {
		n, addr, err := s.conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("UDP read error: %v", err)
			continue
		}
		go s.handlePacket(buf[:n], addr)
	}
}

func (s *Server) handlePacket(data []byte, addr net.Addr) {
	msg := ParseMessage(data)
	if msg == nil {
		log.Printf("Unknown message from %s", addr)
		return
	}
	switch m := msg.(type) {
	case *SearchGwMessage:
		s.handleSearchGw(m, addr)
	case *AdvertiseMessage:
	case *GwInfoMessage:
	case *ConnectMessage:
		s.handleConnect(m, addr)
	case *PublishMessage:
		s.handlePublish(m, addr)
	case *SubscribeMessage:
		s.handleSubscribe(m, addr)
	case *UnsubscribeMessage:
		s.handleUnsubscribe(m, addr)
	case *PingReqMessage:
		s.handlePingReq(m, addr)
	case *DisconnectMessage:
		s.handleDisconnect(m, addr)
	case *RegisterMessage:
		s.handleRegister(m, addr)
	}
}

func (s *Server) handleSearchGw(m *SearchGwMessage, addr net.Addr) {
	log.Printf("SEARCHGW from %s: radius=%d", addr, m.Radius)
	resp := &GwInfoMessage{
		GwID:      s.cfg.GwID,
		GwAddress: s.addr,
	}
	s.send(addr, resp)
}

func (s *Server) advertiseLoop() {
	ticker := time.NewTicker(s.cfg.AdvertisePeriod)
	defer ticker.Stop()

	adv := &AdvertiseMessage{
		GwID:     s.cfg.GwID,
		Duration: s.cfg.AdvertiseDuration,
	}

	for range ticker.C {
		if err := s.sendBroadcast(adv); err != nil {
			log.Printf("Failed to send ADVERTISE: %v", err)
		}
	}
}

func (s *Server) sendBroadcast(msg Message) error {
	data := msg.Marshal()
	udpAddr, err := net.ResolveUDPAddr("udp", "255.255.255.255:1884")
	if err != nil {
		return err
	}
	_, err = s.conn.WriteTo(data, udpAddr)
	return err
}

func (s *Server) handleConnect(m *ConnectMessage, addr net.Addr) {
	log.Printf("CONNECT from %s: client=%s", addr, m.ClientID)
	rc := s.handler.OnConnect(m.ClientID, addr)
	s.mu.Lock()
	s.clients[m.ClientID] = &ClientSession{
		ClientID:  m.ClientID,
		Addr:      addr,
		Connected: rc == RC_ACCEPTED,
		LastSeen:  time.Now(),
	}
	s.mu.Unlock()
	resp := &ConnAckMessage{ReturnCode: rc}
	s.send(addr, resp)
}

func (s *Server) handlePublish(m *PublishMessage, addr net.Addr) {
	client := s.getClientByAddr(addr)
	if client == nil {
		s.IncrementDrop(&s.stats.DropsOffline)
		return
	}
	client.LastSeen = time.Now()
	client.Sleeping = false
	s.IncrementUplink()
	s.handler.OnPublish(client.ClientID, m.TopicID, m.Data, m.QoS())
	if m.QoS() > 0 {
		resp := &PubAckMessage{
			TopicID:    m.TopicID,
			MessageID:  m.MessageID,
			ReturnCode: RC_ACCEPTED,
		}
		s.send(addr, resp)
	}
}

func (s *Server) handleSubscribe(m *SubscribeMessage, addr net.Addr) {
	client := s.getClientByAddr(addr)
	if client == nil {
		return
	}
	client.LastSeen = time.Now()
	topicID, rc := s.handler.OnSubscribe(client.ClientID, m.TopicName, m.MessageID)
	resp := &SubAckMessage{
		Flags:      m.Flags,
		TopicID:    topicID,
		MessageID:  m.MessageID,
		ReturnCode: rc,
	}
	s.send(addr, resp)
}

func (s *Server) handleUnsubscribe(m *UnsubscribeMessage, addr net.Addr) {
	client := s.getClientByAddr(addr)
	if client == nil {
		return
	}
	client.LastSeen = time.Now()
	s.handler.OnUnsubscribe(client.ClientID, m.TopicName)
	resp := &UnsubAckMessage{MessageID: m.MessageID}
	s.send(addr, resp)
}

func (s *Server) handlePingReq(m *PingReqMessage, addr net.Addr) {
	if m.ClientID != "" {
		s.mu.RLock()
		client := s.clients[m.ClientID]
		s.mu.RUnlock()
		if client != nil {
			client.LastSeen = time.Now()
			if client.Sleeping {
				client.Sleeping = false
				log.Printf("Client %s woke up from sleep", m.ClientID)
			}
		}
		s.handler.OnPing(m.ClientID)
	}
	resp := &PingRespMessage{}
	s.send(addr, resp)
}

func (s *Server) handleDisconnect(m *DisconnectMessage, addr net.Addr) {
	client := s.getClientByAddr(addr)
	if client == nil {
		return
	}
	if m.Duration > 0 {
		client.Sleeping = true
		client.SleepDuration = time.Duration(m.Duration) * time.Second
		log.Printf("Client %s entering sleep for %v", client.ClientID, client.SleepDuration)
	} else {
		s.mu.Lock()
		delete(s.clients, client.ClientID)
		s.mu.Unlock()
		s.handler.OnDisconnect(client.ClientID, 0)
		log.Printf("Client %s disconnected", client.ClientID)
	}
}

func (s *Server) handleRegister(m *RegisterMessage, addr net.Addr) {
	client := s.getClientByAddr(addr)
	if client == nil {
		return
	}
	client.LastSeen = time.Now()
	topicID := s.handler.RegisterTopic(client.ClientID, m.TopicName)
	log.Printf("Client %s registered topic '%s' with ID %d", client.ClientID, m.TopicName, topicID)
	resp := &RegAckMessage{
		TopicID:    topicID,
		MessageID:  m.MessageID,
		ReturnCode: RC_ACCEPTED,
	}
	s.send(addr, resp)
}

func (s *Server) send(addr net.Addr, msg Message) {
	_, err := s.conn.WriteTo(msg.Marshal(), addr)
	if err != nil {
		log.Printf("Failed to send message to %s: %v", addr, err)
	}
}

func (s *Server) SendToClient(clientID string, msg Message) bool {
	s.mu.RLock()
	client, ok := s.clients[clientID]
	s.mu.RUnlock()
	if !ok {
		s.IncrementDrop(&s.stats.DropsOffline)
		return false
	}
	if client.Sleeping {
		s.IncrementDrop(&s.stats.DropsSleeping)
		return false
	}
	s.IncrementDownlink()
	s.IncrementDelivered()
	s.send(client.Addr, msg)
	return true
}

func (s *Server) SendToClientOrQueue(clientID string, msg Message) (sent bool, queued bool) {
	s.mu.RLock()
	client, ok := s.clients[clientID]
	s.mu.RUnlock()
	if !ok {
		s.IncrementDrop(&s.stats.DropsOffline)
		return false, false
	}
	if client.Sleeping {
		return false, true
	}
	s.IncrementDownlink()
	s.IncrementDelivered()
	s.send(client.Addr, msg)
	return true, false
}

func (s *Server) getClientByAddr(addr net.Addr) *ClientSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.clients {
		if c.Addr.String() == addr.String() {
			return c
		}
	}
	return nil
}

func (s *Server) GetClient(clientID string) *ClientSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.clients[clientID]
}

func (s *Server) GetAllClients() []*ClientSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	clients := make([]*ClientSession, 0, len(s.clients))
	for _, c := range s.clients {
		clients = append(clients, c)
	}
	return clients
}

func (s *Server) IsClientSleeping(clientID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[clientID]
	return ok && client.Sleeping
}

func (s *Server) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.cleanup()
	}
}

func (s *Server) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for id, client := range s.clients {
		if now.Sub(client.LastSeen) > 5*time.Minute {
			delete(s.clients, id)
			log.Printf("Client %s timed out", id)
		}
	}
}

func (s *Server) nextMessageID() uint16 {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextMsgID
	s.nextMsgID++
	if s.nextMsgID == 0 {
		s.nextMsgID = 1
	}
	return id
}

func (s *Server) GetConfig() *ServerConfig {
	return s.cfg
}

func (s *Server) GetStatsPointer() *MessageStats {
	return &s.stats
}
