package listener

import (
	"alwayson-ag-simulator/internal/ag"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ConnectionType string

const (
	ConnectionReadWrite ConnectionType = "READWRITE"
	ConnectionReadOnly  ConnectionType = "READONLY"
)

type TrackedConnection struct {
	ID           string
	Type         ConnectionType
	ReplicaName  string
	CreatedAt    time.Time
	LastActive   time.Time
	RemoteAddr   string
}

type Listener struct {
	agManager         *ag.AvailabilityGroup
	Host              string
	Port              int
	TTL               time.Duration
	server            *http.Server
	connections       map[string]*TrackedConnection
	connMu            sync.RWMutex
	proxyTransports   map[string]*http.Transport
	transportMu       sync.RWMutex
	activeConnections map[string]net.Conn
	connMapMu         sync.Mutex
}

func NewListener(agManager *ag.AvailabilityGroup, host string, port int) *Listener {
	l := &Listener{
		agManager:         agManager,
		Host:              host,
		Port:              port,
		TTL:               30 * time.Second,
		connections:       make(map[string]*TrackedConnection),
		proxyTransports:   make(map[string]*http.Transport),
		activeConnections: make(map[string]net.Conn),
	}

	agManager.OnFailover(l.handleFailover)
	go l.startConnectionCleanup()

	return l
}

func (l *Listener) SetTTL(ttl time.Duration) {
	l.TTL = ttl
}

func (l *Listener) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", l.handleRequest)

	l.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", l.Host, l.Port),
		Handler:      mux,
		ReadTimeout:  l.TTL,
		WriteTimeout: l.TTL,
		IdleTimeout:  l.TTL,
		ConnContext: func(ctx context.Context, c net.Conn) context.Context {
			connID := fmt.Sprintf("%p", c)
			l.connMapMu.Lock()
			l.activeConnections[connID] = c
			l.connMapMu.Unlock()

			go func() {
				<-ctx.Done()
				l.connMapMu.Lock()
				delete(l.activeConnections, connID)
				l.connMapMu.Unlock()
			}()

			return context.WithValue(ctx, "connID", connID)
		},
	}

	return l.server.ListenAndServe()
}

func (l *Listener) Stop() error {
	if l.server != nil {
		return l.server.Close()
	}
	return nil
}

func (l *Listener) handleRequest(w http.ResponseWriter, r *http.Request) {
	connType := l.parseApplicationIntent(r)
	connID := r.RemoteAddr + "-" + fmt.Sprintf("%d", time.Now().UnixNano())

	l.trackConnection(connID, connType, "", r.RemoteAddr)

	var targetReplica *ag.Replica
	var targetType string

	if connType == ConnectionReadOnly {
		targetReplica = l.agManager.SelectReadOnlyReplica()
		targetType = "readonly secondary"
	} else {
		targetReplica = l.agManager.GetPrimary()
		targetType = "primary"
	}

	if targetReplica == nil {
		l.sendError(w, http.StatusServiceUnavailable, "No suitable replica available")
		return
	}

	targetStatus := targetReplica.GetStatus()
	l.updateConnectionReplica(connID, targetStatus.Name)

	proxyURL, err := url.Parse(fmt.Sprintf("http://%s:%d", targetStatus.Host, targetStatus.Port))
	if err != nil {
		l.sendError(w, http.StatusInternalServerError, "Failed to parse replica URL")
		return
	}

	log.Printf("[Listener] Forwarding request to %s: %s (%s), type=%s, TTL=%v",
		targetType, targetStatus.Name, proxyURL, connType, l.TTL)

	w.Header().Set("X-Target-Replica", targetStatus.Name)
	w.Header().Set("X-Connection-Type", string(connType))
	w.Header().Set("X-Connection-ID", connID)
	w.Header().Set("X-TTL", l.TTL.String())
	w.Header().Set("X-Forwarded-For", r.RemoteAddr)
	w.Header().Set("X-AG-Listener", fmt.Sprintf("%s:%d", l.Host, l.Port))

	proxy := l.getProxy(proxyURL, targetStatus.Name)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("X-Target-Replica", targetStatus.Name)
		req.Header.Set("X-Connection-Type", string(connType))
		req.Header.Set("X-Forwarded-Host", req.Host)
		req.Host = proxyURL.Host
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("X-Target-Replica", targetStatus.Name)
		resp.Header.Set("X-Connection-Type", string(connType))
		resp.Header.Set("X-AG-Processed", time.Now().Format(time.RFC3339))
		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[Listener] Proxy error: %v", err)
		l.sendError(w, http.StatusBadGateway,
			fmt.Sprintf("Failed to connect to %s replica %s: %v", targetType, targetStatus.Name, err))
	}

	proxy.ServeHTTP(w, r)
}

func (l *Listener) parseApplicationIntent(r *http.Request) ConnectionType {
	headerValues := []string{
		r.Header.Get("ApplicationIntent"),
		r.Header.Get("X-Application-Intent"),
		r.URL.Query().Get("application_intent"),
		r.URL.Query().Get("ApplicationIntent"),
	}

	for _, v := range headerValues {
		switch strings.ToLower(v) {
		case "readonly", "read-only", "ro":
			return ConnectionReadOnly
		case "readwrite", "read-write", "rw":
			return ConnectionReadWrite
		}
	}

	return ConnectionReadWrite
}

func (l *Listener) getProxy(targetURL *url.URL, replicaName string) *httputil.ReverseProxy {
	l.transportMu.RLock()
	transport, exists := l.proxyTransports[replicaName]
	l.transportMu.RUnlock()

	if !exists {
		l.transportMu.Lock()
		transport = &http.Transport{
			MaxIdleConns:        100,
			IdleConnTimeout:     l.TTL,
			MaxIdleConnsPerHost: 10,
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: l.TTL,
			}).DialContext,
		}
		l.proxyTransports[replicaName] = transport
		l.transportMu.Unlock()
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.Transport = transport
	return proxy
}

func (l *Listener) trackConnection(connID string, connType ConnectionType, replicaName, remoteAddr string) {
	l.connMu.Lock()
	defer l.connMu.Unlock()

	now := time.Now()
	l.connections[connID] = &TrackedConnection{
		ID:          connID,
		Type:        connType,
		ReplicaName: replicaName,
		CreatedAt:   now,
		LastActive:  now,
		RemoteAddr:  remoteAddr,
	}
}

func (l *Listener) updateConnectionReplica(connID, replicaName string) {
	l.connMu.Lock()
	defer l.connMu.Unlock()

	if conn, exists := l.connections[connID]; exists {
		conn.ReplicaName = replicaName
		conn.LastActive = time.Now()
	}
}

func (l *Listener) startConnectionCleanup() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		l.cleanupExpiredConnections()
	}
}

func (l *Listener) cleanupExpiredConnections() {
	l.connMu.Lock()
	defer l.connMu.Unlock()

	now := time.Now()
	for id, conn := range l.connections {
		if now.Sub(conn.LastActive) > l.TTL {
			delete(l.connections, id)
		}
	}
}

func (l *Listener) handleFailover(oldPrimary, newPrimary string) {
	log.Printf("[Listener] Failover detected: %s -> %s, closing old connections", oldPrimary, newPrimary)

	l.connMu.Lock()
	var connectionsToClose []string
	for id, conn := range l.connections {
		if conn.ReplicaName == oldPrimary {
			connectionsToClose = append(connectionsToClose, id)
		}
	}
	l.connMu.Unlock()

	if len(connectionsToClose) > 0 {
		log.Printf("[Listener] Closing %d connections to old primary %s", len(connectionsToClose), oldPrimary)
	}

	l.connMu.Lock()
	for _, id := range connectionsToClose {
		delete(l.connections, id)
	}
	l.connMu.Unlock()

	l.transportMu.Lock()
	if transport, exists := l.proxyTransports[oldPrimary]; exists {
		transport.CloseIdleConnections()
		delete(l.proxyTransports, oldPrimary)
	}
	l.transportMu.Unlock()

	l.connMapMu.Lock()
	for _, conn := range l.activeConnections {
		conn.Close()
	}
	l.activeConnections = make(map[string]net.Conn)
	l.connMapMu.Unlock()
}

func (l *Listener) GetConnectionStats() map[string]interface{} {
	l.connMu.RLock()
	defer l.connMu.RUnlock()

	stats := map[string]interface{}{
		"total_connections":    len(l.connections),
		"readwrite_connections": 0,
		"readonly_connections":  0,
		"connections_by_replica": make(map[string]int),
		"ttl_seconds":           l.TTL.Seconds(),
	}

	byReplica := stats["connections_by_replica"].(map[string]int)

	for _, conn := range l.connections {
		switch conn.Type {
		case ConnectionReadWrite:
			stats["readwrite_connections"] = stats["readwrite_connections"].(int) + 1
		case ConnectionReadOnly:
			stats["readonly_connections"] = stats["readonly_connections"].(int) + 1
		}
		byReplica[conn.ReplicaName]++
	}

	return stats
}

func (l *Listener) sendError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-AG-Error", "true")
	w.WriteHeader(statusCode)

	primary := l.agManager.GetPrimary()
	primaryName := "none"
	if primary != nil {
		primaryName = primary.GetStatus().Name
	}

	readOnly := l.agManager.SelectReadOnlyReplica()
	readOnlyName := "none"
	if readOnly != nil {
		readOnlyName = readOnly.GetStatus().Name
	}

	response := fmt.Sprintf(`{
		"error": %q,
		"listener": %q,
		"current_primary": %q,
		"current_readonly": %q,
		"ttl_seconds": %.0f,
		"timestamp": %q
	}`, message, fmt.Sprintf("%s:%d", l.Host, l.Port), primaryName, readOnlyName, l.TTL.Seconds(), time.Now().Format(time.RFC3339))

	io.WriteString(w, response)
}
