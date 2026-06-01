package quic

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"github.com/quic-go/quic-go"
	"mqtt-quic-broker/internal/mqtt"
	"mqtt-quic-broker/internal/session"
	"mqtt-quic-broker/internal/websocket"
)

func generateConnID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type Connection struct {
	conn          quic.Connection
	stream        quic.Stream
	sessionMgr    *session.Manager
	wsHub         *websocket.Hub
	clientID      string
	connected     bool
	closeOnce     sync.Once
	done          chan struct{}
	readBuffer    []byte
	lastAddr      string
	connID        string
	using0RTT     bool
}

type Server struct {
	addr         string
	tlsConfig    *tls.Config
	quicConfig   *quic.Config
	listener     *quic.EarlyListener
	sessionMgr   *session.Manager
	wsHub        *websocket.Hub
	ctx          context.Context
	cancel       context.CancelFunc
}

func NewServer(addr, certFile, keyFile string, sessionMgr *session.Manager, wsHub *websocket.Hub) (*Server, error) {
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{"mqtt-quic"},
	}

	quicConfig := &quic.Config{
		MaxIdleTimeout:      30 * time.Second,
		KeepAlivePeriod:    10 * time.Second,
		EnableDatagrams:    true,
		Allow0RTT:          true,
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Server{
		addr:       addr,
		tlsConfig:  tlsConfig,
		quicConfig: quicConfig,
		sessionMgr: sessionMgr,
		wsHub:      wsHub,
		ctx:        ctx,
		cancel:     cancel,
	}, nil
}

func (s *Server) ListenAndServe() error {
	conn, err := net.ListenPacket("udp", s.addr)
	if err != nil {
		return err
	}

	tr := quic.Transport{
		Conn: conn,
	}

	listener, err := tr.ListenEarly(s.tlsConfig, s.quicConfig)
	if err != nil {
		return err
	}
	s.listener = listener

	log.Printf("MQTT over QUIC broker listening on %s (with 0-RTT support)", s.addr)

	for {
		select {
		case <-s.ctx.Done():
			return nil
		default:
		}

		earlyConn, err := listener.Accept(s.ctx)
		if err != nil {
			log.Printf("accept error: %v", err)
			continue
		}

		go s.handleEarlyConnection(earlyConn)
	}
}

func (s *Server) handleEarlyConnection(earlyConn quic.Connection) {
	using0RTT := false
	if ec, ok := any(earlyConn).(interface{ HandshakeComplete() <-chan struct{} }); ok {
		select {
		case <-ec.HandshakeComplete():
			using0RTT = false
		default:
			using0RTT = true
		}
	}
	log.Printf("new QUIC connection from %s (0-RTT: %v)", earlyConn.RemoteAddr(), using0RTT)

	for {
		stream, err := earlyConn.AcceptStream(s.ctx)
		if err != nil {
			log.Printf("accept stream error from %s: %v", earlyConn.RemoteAddr(), err)
			return
		}

		go s.handleStream(earlyConn, stream, using0RTT)
	}
}

func (s *Server) handleStream(conn quic.Connection, stream quic.Stream, using0RTT bool) {
	connID := generateConnID()
	c := &Connection{
		conn:       conn,
		stream:     stream,
		sessionMgr: s.sessionMgr,
		wsHub:      s.wsHub,
		done:       make(chan struct{}),
		readBuffer: make([]byte, 0, 4096),
		lastAddr:   conn.RemoteAddr().String(),
		connID:     connID,
		using0RTT:  using0RTT,
	}

	defer c.Close()

	go c.monitorPathChange(conn)

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Printf("read error from %s: %v", conn.RemoteAddr(), err)
			}
			return
		}

		c.readBuffer = append(c.readBuffer, buf[:n]...)

		for {
			packet, remaining, err := mqtt.DecodePacket(c.readBuffer)
			if err != nil {
				if err == io.ErrShortBuffer {
					break
				}
				log.Printf("decode packet error: %v", err)
				c.readBuffer = c.readBuffer[1:]
				continue
			}

			c.readBuffer = remaining
			c.handlePacket(packet)
		}
	}
}

func (c *Connection) handlePacket(packet mqtt.Packet) {
	switch p := packet.(type) {
	case *mqtt.ConnectPacket:
		c.handleConnect(p)
	case *mqtt.PublishPacket:
		c.handlePublish(p)
	case *mqtt.PubackPacket:
		c.handlePuback(p)
	case *mqtt.SubscribePacket:
		c.handleSubscribe(p)
	case *mqtt.PingreqPacket:
		c.handlePingreq()
	case *mqtt.DisconnectPacket:
		c.handleDisconnect()
	}
}

func (c *Connection) handleConnect(p *mqtt.ConnectPacket) {
	c.clientID = p.ClientID
	if c.clientID == "" {
		c.clientID = "anonymous-" + time.Now().Format("20060102150405")
	}

	sess := c.sessionMgr.GetOrCreate(c.clientID)
	wasConnected := sess.Connected
	oldAddr := sess.CurrentAddr
	isMigrating := sess.Migrating

	if c.using0RTT {
		c.sessionMgr.Set0RTTStatus(c.clientID, true)
	}

	if wasConnected && !isMigrating {
		c.sessionMgr.StartMigration(c.clientID)
	}

	c.sessionMgr.SetConnected(c.clientID, true, c.conn.RemoteAddr().String(), c.connID)
	c.sessionMgr.SetKeepAlive(c.clientID, p.KeepAlive)

	if p.WillFlag {
		will := &session.WillMessage{
			Topic:   p.WillTopic,
			Payload: p.WillMessage,
			QoS:     p.WillQoS,
			Retain:  p.WillRetain,
		}
		c.sessionMgr.SetWill(c.clientID, will)
		log.Printf("Client %s set Will message: %s", c.clientID, p.WillTopic)
	} else if p.CleanSession {
		c.sessionMgr.ClearWill(c.clientID)
	}

	connack := &mqtt.ConnackPacket{
		SessionPresent: !p.CleanSession && wasConnected,
		ReturnCode:     0,
	}

	data, _ := connack.Encode()
	c.stream.Write(data)

	c.connected = true

	if wasConnected && oldAddr != "" && oldAddr != c.conn.RemoteAddr().String() {
		log.Printf("Client %s migrated from %s to %s (0-RTT: %v)", c.clientID, oldAddr, c.conn.RemoteAddr(), c.using0RTT)
		
		duration := c.sessionMgr.CompleteMigration(c.clientID)
		
		stats, _ := c.sessionMgr.GetMigrationStats(c.clientID)
		
		c.wsHub.PathChanged(
			c.clientID, 
			oldAddr, 
			c.conn.RemoteAddr().String(), 
			c.connID,
			duration,
			stats.Count,
			stats.AvgDuration,
			c.using0RTT,
		)
	} else if !wasConnected {
		log.Printf("Client %s connected from %s (0-RTT: %v)", c.clientID, c.conn.RemoteAddr(), c.using0RTT)
		c.wsHub.ClientConnected(c.clientID, c.conn.RemoteAddr().String(), c.connID)
	}

	go c.sendQueuedMessages()
}

func (c *Connection) handlePublish(p *mqtt.PublishPacket) {
	if c.clientID == "" {
		return
	}

	c.sessionMgr.UpdateLastSeen(c.clientID)

	payloadStr := string(p.Payload)
	log.Printf("Client %s published to %s: %s", c.clientID, p.Topic, payloadStr)
	c.wsHub.MessagePublished(c.clientID, p.Topic, payloadStr)

	msg := session.Message{
		Topic:     p.Topic,
		Payload:   p.Payload,
		QoS:       p.QoS,
		Timestamp: time.Now(),
	}

	subscribers := c.sessionMgr.GetSubscribers(p.Topic)
	for _, sub := range subscribers {
		if sub.ClientID == c.clientID {
			continue
		}
		c.sessionMgr.QueueMessage(sub.ClientID, msg)
	}
}

func (c *Connection) handlePuback(p *mqtt.PubackPacket) {
	if c.clientID == "" {
		return
	}
	c.sessionMgr.UpdateLastSeen(c.clientID)
}

func (c *Connection) handleSubscribe(p *mqtt.SubscribePacket) {
	if c.clientID == "" {
		return
	}

	c.sessionMgr.UpdateLastSeen(c.clientID)

	returnCodes := make([]byte, len(p.TopicFilters))
	for i, tf := range p.TopicFilters {
		c.sessionMgr.AddSubscription(c.clientID, tf.Topic, tf.QoS)
		returnCodes[i] = tf.QoS
		log.Printf("Client %s subscribed to %s (QoS %d)", c.clientID, tf.Topic, tf.QoS)
	}

	suback := &mqtt.SubackPacket{
		PacketID:    p.PacketID,
		ReturnCodes: returnCodes,
	}

	data, _ := suback.Encode()
	c.stream.Write(data)
}

func (c *Connection) handlePingreq() {
	if c.clientID == "" {
		return
	}

	c.sessionMgr.UpdateLastSeen(c.clientID)

	pingresp := &mqtt.PingrespPacket{}
	data, _ := pingresp.Encode()
	c.stream.Write(data)
}

func (c *Connection) handleDisconnect() {
	if c.clientID != "" {
		c.sessionMgr.ClearWill(c.clientID)
		c.sessionMgr.SetConnected(c.clientID, false, c.conn.RemoteAddr().String(), c.connID)
		c.wsHub.ClientDisconnected(c.clientID, c.conn.RemoteAddr().String(), c.connID)
		log.Printf("Client %s disconnected gracefully, Will message cleared", c.clientID)
	}
	c.Close()
}

func (c *Connection) sendQueuedMessages() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case <-ticker.C:
			if !c.connected {
				continue
			}

			sess, ok := c.sessionMgr.Get(c.clientID)
			if !ok {
				return
			}

			for {
				msg, hasMsg := sess.DequeueMessage()
				if !hasMsg {
					break
				}

				publish := &mqtt.PublishPacket{
					Topic:   msg.Topic,
					Payload: msg.Payload,
					QoS:     msg.QoS,
				}

				data, _ := publish.Encode()
				_, err := c.stream.Write(data)
				if err != nil {
					c.sessionMgr.QueueMessage(c.clientID, msg)
					return
				}

				c.wsHub.MessageReceived(c.clientID, msg.Topic, string(msg.Payload))
			}
		}
	}
}

func (c *Connection) monitorPathChange(conn quic.Connection) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case <-ticker.C:
			currentAddr := conn.RemoteAddr().String()
			if currentAddr != c.lastAddr {
				log.Printf("Path change detected for %s: %s -> %s", c.clientID, c.lastAddr, currentAddr)
				if c.clientID != "" {
					stats, _ := c.sessionMgr.GetMigrationStats(c.clientID)
					c.wsHub.PathChanged(c.clientID, c.lastAddr, currentAddr, c.connID, 0, stats.Count, stats.AvgDuration, c.using0RTT)
				}
				c.lastAddr = currentAddr
			}
		}
	}
}

func (c *Connection) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		if c.stream != nil {
			c.stream.Close()
		}
	})
}

func (s *Server) Shutdown() {
	s.cancel()
	if s.listener != nil {
		s.listener.Close()
	}
}
