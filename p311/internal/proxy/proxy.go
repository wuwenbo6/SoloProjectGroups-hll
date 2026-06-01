package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"github.com/codeserver-manager/internal/codeserver"
	"github.com/codeserver-manager/internal/user"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type Manager struct {
	userStore       *user.Store
	instanceManager *codeserver.Manager
	upgrader        websocket.Upgrader
	proxyCache      map[string]*httputil.ReverseProxy
	proxyCacheLock  sync.RWMutex
}

func NewManager(us *user.Store, im *codeserver.Manager) *Manager {
	return &Manager{
		userStore:       us,
		instanceManager: im,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		proxyCache: make(map[string]*httputil.ReverseProxy),
	}
}

func (m *Manager) getOrCreateProxy(port int) *httputil.ReverseProxy {
	key := fmt.Sprintf("localhost:%d", port)

	m.proxyCacheLock.RLock()
	if proxy, exists := m.proxyCache[key]; exists {
		m.proxyCacheLock.RUnlock()
		return proxy
	}
	m.proxyCacheLock.RUnlock()

	m.proxyCacheLock.Lock()
	defer m.proxyCacheLock.Unlock()

	if proxy, exists := m.proxyCache[key]; exists {
		return proxy
	}

	target := fmt.Sprintf("http://127.0.0.1:%d", port)
	targetURL, _ := url.Parse(target)

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "Proxy error: "+err.Error(), http.StatusBadGateway)
	}

	m.proxyCache[key] = proxy
	return proxy
}

func (m *Manager) Proxy(c *gin.Context) {
	token := c.GetHeader("X-User-Token")
	if token == "" {
		token = c.Query("token")
	}

	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user token"})
		return
	}

	u, err := m.userStore.GetByToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	inst, err := m.instanceManager.Get(u.ID)
	if err != nil || inst.Status != codeserver.StatusRunning {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":      "code-server instance not running",
			"user_id":    u.ID,
			"username":   u.Username,
			"need_start": true,
		})
		return
	}

	m.instanceManager.RecordActivity(u.ID)

	if websocket.IsWebSocketUpgrade(c.Request) {
		m.proxyWebSocket(c, inst)
		return
	}

	m.proxyHTTP(c, inst)
}

func (m *Manager) proxyHTTP(c *gin.Context, inst *codeserver.Instance) {
	proxy := m.getOrCreateProxy(inst.Port)

	path := c.Param("proxyPath")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	c.Request.URL.Path = path
	c.Request.URL.RawPath = path

	proxy.ServeHTTP(c.Writer, c.Request)
}

func (m *Manager) proxyWebSocket(c *gin.Context, inst *codeserver.Instance) {
	path := c.Param("proxyPath")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	targetURL := fmt.Sprintf("ws://127.0.0.1:%d%s", inst.Port, path)
	if c.Request.URL.RawQuery != "" {
		targetURL += "?" + c.Request.URL.RawQuery
	}

	targetConn, _, err := websocket.DefaultDialer.Dial(targetURL, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to connect to code-server: " + err.Error()})
		return
	}
	defer targetConn.Close()

	clientConn, err := m.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		copyWebSocket(targetConn, clientConn)
	}()

	go func() {
		defer wg.Done()
		copyWebSocket(clientConn, targetConn)
	}()

	wg.Wait()
}

func copyWebSocket(dst, src *websocket.Conn) {
	for {
		msgType, msg, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(msgType, msg); err != nil {
			return
		}
	}
}

func (m *Manager) StreamLogs(c *gin.Context) {
	var userID string
	if uid, exists := c.Get("user_id"); exists {
		userID = uid.(string)
	} else {
		token := c.Query("token")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}
		u, err := m.userStore.GetByToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		userID = u.ID
	}

	inst, err := m.instanceManager.Get(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "instance not found"})
		return
	}

	logPath := fmt.Sprintf("%s/code-server.log", inst.Workspace)
	c.FileAttachment(logPath, "code-server.log")
}

func (m *Manager) DirectProxy(c *gin.Context, userID string) {
	inst, err := m.instanceManager.Get(userID)
	if err != nil || inst.Status != codeserver.StatusRunning {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "code-server instance not running",
		})
		return
	}

	if websocket.IsWebSocketUpgrade(c.Request) {
		m.proxyWebSocket(c, inst)
		return
	}

	m.proxyHTTP(c, inst)
}
