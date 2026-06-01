package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"vnc-multiuser/pkg/vnc"
)

type WebsocketHandler struct {
	Proxy   *vnc.VNCProxy
	upgrader websocket.Upgrader
}

func NewHandler(proxy *vnc.VNCProxy) *WebsocketHandler {
	return &WebsocketHandler{
		Proxy: proxy,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024 * 1024,
			WriteBufferSize: 1024 * 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			Subprotocols: []string{"binary"},
		},
	}
}

func (h *WebsocketHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	sessionID := generateSessionID()
	userName := r.URL.Query().Get("username")
	if userName == "" {
		userName = "Anonymous"
	}

	wsConn := &websocketNetConn{conn: conn}

	client := &vnc.VNCClient{
		ID:         sessionID,
		UserID:     sessionID,
		UserName:   userName,
		Conn:       wsConn,
	}

	if err := h.Proxy.AddClient(client); err != nil {
		conn.Close()
		return
	}
}

type websocketNetConn struct {
	conn *websocket.Conn
	readBuf []byte
}

func (w *websocketNetConn) Read(p []byte) (n int, err error) {
	if len(w.readBuf) > 0 {
		n = copy(p, w.readBuf)
		w.readBuf = w.readBuf[n:]
		return n, nil
	}

	_, message, err := w.conn.ReadMessage()
	if err != nil {
		return 0, err
	}

	n = copy(p, message)
	if n < len(message) {
		w.readBuf = message[n:]
	}
	return n, nil
}

func (w *websocketNetConn) Write(p []byte) (n int, err error) {
	err = w.conn.WriteMessage(websocket.BinaryMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (w *websocketNetConn) Close() error {
	return w.conn.Close()
}

func generateSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func IsWebsocketRequest(r *http.Request) bool {
	return strings.Contains(strings.ToLower(r.Header.Get("Upgrade")), "websocket")
}

func (w *websocketNetConn) LocalAddr() net.Addr { return w.conn.LocalAddr() }
func (w *websocketNetConn) RemoteAddr() net.Addr { return w.conn.RemoteAddr() }
func (w *websocketNetConn) SetDeadline(t time.Time) error { return nil }
func (w *websocketNetConn) SetReadDeadline(t time.Time) error { return nil }
func (w *websocketNetConn) SetWriteDeadline(t time.Time) error { return nil }
