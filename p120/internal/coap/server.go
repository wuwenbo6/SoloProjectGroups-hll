package coap

import (
	"bytes"
	"context"
	"fmt"
	"sync"
	"time"

	"coap-gateway/internal/config"
	"coap-gateway/internal/database"
	"coap-gateway/internal/models"

	"github.com/plgd-dev/go-coap/v3/message"
	"github.com/plgd-dev/go-coap/v3/message/codes"
	"github.com/plgd-dev/go-coap/v3/message/pool"
	coapNet "github.com/plgd-dev/go-coap/v3/net"
	"github.com/plgd-dev/go-coap/v3/net/blockwise"
	"github.com/plgd-dev/go-coap/v3/net/responsewriter"
	"github.com/plgd-dev/go-coap/v3/options"
	"github.com/plgd-dev/go-coap/v3/tcp"
	"github.com/plgd-dev/go-coap/v3/tcp/client"
	tcpServer "github.com/plgd-dev/go-coap/v3/tcp/server"
	dtlsSvr "github.com/plgd-dev/go-coap/v3/dtls/server"
	"go.uber.org/zap"
)

type DeviceConnection struct {
	Conn        *client.Conn
	DeviceID    string
	RemoteAddr  string
	ConnectedAt time.Time
	LastActive  time.Time
	connMu      sync.Mutex
}

type Server struct {
	cfg          *config.Config
	db           *database.Database
	logger       *zap.Logger
	tcpServer    *tcpServer.Server
	dtlsServer   *dtlsSvr.Server
	connections  map[string]*DeviceConnection
	connMutex    sync.RWMutex
	observeMgr   *ObserveManager
	tokenMgr     *TokenManager
}

func NewServer(cfg *config.Config, db *database.Database, logger *zap.Logger) *Server {
	return &Server{
		cfg:         cfg,
		db:          db,
		logger:      logger,
		connections: make(map[string]*DeviceConnection),
		observeMgr:  NewObserveManager(logger, db),
		tokenMgr:    NewTokenManager(logger),
	}
}

func (s *Server) Start(ctx context.Context) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Server.CoAP.TCP.Host, s.cfg.Server.CoAP.TCP.Port)
	s.logger.Info("Starting CoAP TCP server", zap.String("addr", addr))

	s.tcpServer = tcp.NewServer(
		options.WithOnNewConn(func(conn *client.Conn) {
			s.handleNewConnection(conn)
		}),
		options.WithHandlerFunc(func(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message) {
			s.handleRequest(w, req)
		}),
		options.WithBlockwise(true, blockwise.SZX1024, time.Second*30),
	)

	ln, err := coapNet.NewTCPListener("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen tcp failed: %w", err)
	}

	go func() {
		<-ctx.Done()
		s.logger.Info("Stopping CoAP TCP server")
		ln.Close()
		s.tcpServer.Stop()
	}()

	go func() {
		if err := s.tcpServer.Serve(ln); err != nil {
			s.logger.Error("CoAP TCP server error", zap.Error(err))
		}
	}()

	go s.observeMgr.Start(ctx)

	return nil
}

func (s *Server) handleNewConnection(conn *client.Conn) {
	remoteAddr := conn.RemoteAddr().String()
	s.logger.Info("New CoAP TCP connection", zap.String("remote_addr", remoteAddr))

	deviceConn := &DeviceConnection{
		Conn:        conn,
		RemoteAddr:  remoteAddr,
		ConnectedAt: time.Now(),
		LastActive:  time.Now(),
	}

	s.connMutex.Lock()
	s.connections[remoteAddr] = deviceConn
	s.connMutex.Unlock()

	conn.AddOnClose(func() {
		s.handleConnectionClose(remoteAddr)
	})
}

func (s *Server) handleConnectionClose(remoteAddr string) {
	s.logger.Info("CoAP TCP connection closed", zap.String("remote_addr", remoteAddr))

	s.connMutex.Lock()
	deviceConn, ok := s.connections[remoteAddr]
	var deviceID string
	if ok {
		deviceID = deviceConn.DeviceID
		if deviceID != "" {
			s.db.UpdateDeviceStatus(deviceID, "offline", remoteAddr)
		}
		delete(s.connections, remoteAddr)
	}
	s.connMutex.Unlock()

	if deviceID != "" {
		s.observeMgr.CleanupDeviceSubscriptions(deviceID)
	}
}

func (s *Server) handleRequest(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message) {
	path, err := req.Path()
	if err != nil {
		s.logger.Error("Get path failed", zap.Error(err))
		return
	}

	remoteAddr := w.Conn().RemoteAddr().String()
	code := req.Code()

	s.logger.Debug("Received CoAP request",
		zap.String("path", path),
		zap.String("code", code.String()),
		zap.String("remote_addr", remoteAddr),
	)

	s.connMutex.RLock()
	deviceConn := s.connections[remoteAddr]
	s.connMutex.RUnlock()

	if deviceConn != nil {
		deviceConn.connMu.Lock()
		deviceConn.LastActive = time.Now()
		deviceConn.connMu.Unlock()
	}

	switch path {
	case "/register":
		s.handleRegister(w, req, deviceConn)
		return
	}

	if deviceConn == nil || deviceConn.DeviceID == "" {
		s.sendError(w, codes.Unauthorized, "Device not registered")
		return
	}

	observe, _ := req.Observe()
	if code == codes.GET && observe == 0 {
		s.handleObserve(w, req, path, deviceConn)
		return
	}

	if code == codes.GET && observe == 1 {
		s.handleCancelObserve(w, req, path, deviceConn)
		return
	}

	s.handleDeviceRequest(w, req, path, deviceConn)
}

func (s *Server) handleRegister(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message, deviceConn *DeviceConnection) {
	deviceID := ""
	queries, _ := req.Queries()
	for _, q := range queries {
		if len(q) > 3 && q[:3] == "id=" {
			deviceID = q[3:]
		}
	}

	if deviceID == "" {
		s.sendError(w, codes.BadRequest, "Missing device ID")
		return
	}

	_, err := s.db.GetDevice(deviceID)
	if err != nil {
		device := &models.Device{
			DeviceID:   deviceID,
			Name:       "Device-" + deviceID,
			Type:       "unknown",
			Status:     "online",
			RemoteAddr: deviceConn.RemoteAddr,
			Protocol:   "coap-tcp",
			LastSeen:   time.Now(),
		}
		if err := s.db.CreateDevice(device); err != nil {
			s.logger.Error("Create device failed", zap.Error(err))
			s.sendError(w, codes.InternalServerError, "Failed to register device")
			return
		}
	} else {
		s.db.UpdateDeviceStatus(deviceID, "online", deviceConn.RemoteAddr)
	}

	s.connMutex.Lock()
	deviceConn.DeviceID = deviceID
	s.connMutex.Unlock()

	s.logger.Info("Device registered", zap.String("device_id", deviceID), zap.String("remote_addr", deviceConn.RemoteAddr))

	err = w.SetResponse(codes.Created, message.TextPlain, bytes.NewReader([]byte("registered")))
	if err != nil {
		s.logger.Error("Set response failed", zap.Error(err))
	}
}

func (s *Server) handleObserve(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message, path string, deviceConn *DeviceConnection) {
	s.logger.Info("Observe request",
		zap.String("device_id", deviceConn.DeviceID),
		zap.String("path", path),
	)

	resp := w.Message()
	resp.SetCode(codes.Content)
	resp.SetObserve(0)

	tokenStr := fmt.Sprintf("%x", req.Token())
	err := s.observeMgr.AddSubscription(deviceConn.DeviceID, path, tokenStr)
	if err != nil {
		s.logger.Error("Add observe subscription failed", zap.Error(err))
		resp.SetCode(codes.InternalServerError)
	}
}

func (s *Server) handleCancelObserve(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message, path string, deviceConn *DeviceConnection) {
	s.logger.Info("Cancel observe",
		zap.String("device_id", deviceConn.DeviceID),
		zap.String("path", path),
	)

	tokenStr := fmt.Sprintf("%x", req.Token())
	s.observeMgr.CancelSubscription(tokenStr)

	w.Message().SetCode(codes.Content)
}

func (s *Server) handleDeviceRequest(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message, path string, deviceConn *DeviceConnection) {
	s.logger.Debug("Device request",
		zap.String("device_id", deviceConn.DeviceID),
		zap.String("path", path),
		zap.String("code", req.Code().String()),
	)

	if req.Code() == codes.POST || req.Code() == codes.PUT {
		s.observeMgr.HandleDeviceNotification(deviceConn.DeviceID, path, req)
	}

	w.Message().SetCode(codes.Content)
}

func (s *Server) sendError(w *responsewriter.ResponseWriter[*client.Conn], code codes.Code, msg string) {
	err := w.SetResponse(code, message.TextPlain, bytes.NewReader([]byte(msg)))
	if err != nil {
		s.logger.Error("Set error response failed", zap.Error(err))
	}
}

func (s *Server) SendMessage(deviceID string, msg *pool.Message) (*pool.Message, error) {
	s.connMutex.RLock()
	var deviceConn *DeviceConnection
	for _, conn := range s.connections {
		if conn.DeviceID == deviceID {
			deviceConn = conn
			break
		}
	}
	s.connMutex.RUnlock()

	if deviceConn == nil {
		return nil, fmt.Errorf("device %s not connected", deviceID)
	}

	deviceConn.connMu.Lock()
	defer deviceConn.connMu.Unlock()

	resp, err := deviceConn.Conn.Do(msg)
	if err != nil {
		return nil, fmt.Errorf("send request to device failed: %w", err)
	}

	return resp, nil
}

func (s *Server) SendRequestToDevice(deviceID, path string, msg *pool.Message) (*pool.Message, error) {
	return s.SendMessage(deviceID, msg)
}

func (s *Server) GetDeviceConnection(deviceID string) *client.Conn {
	s.connMutex.RLock()
	defer s.connMutex.RUnlock()
	for _, conn := range s.connections {
		if conn.DeviceID == deviceID {
			return conn.Conn
		}
	}
	return nil
}

func (s *Server) GetObserveManager() *ObserveManager {
	return s.observeMgr
}

func (s *Server) GetTokenManager() *TokenManager {
	return s.tokenMgr
}

func (s *Server) ListDevices() []string {
	s.connMutex.RLock()
	defer s.connMutex.RUnlock()
	devices := make([]string, 0, len(s.connections))
	for _, conn := range s.connections {
		if conn.DeviceID != "" {
			devices = append(devices, conn.DeviceID)
		}
	}
	return devices
}
