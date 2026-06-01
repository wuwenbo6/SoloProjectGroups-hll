package web

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"dns-proxy/server"
)

type WebServer struct {
	addr       string
	dnsServer  *server.DNSServer
	httpServer *http.Server
	templates  *template.Template
}

func NewWebServer(addr string, dnsServer *server.DNSServer, templatesDir string) (*WebServer, error) {
	tpl, err := template.ParseGlob(filepath.Join(templatesDir, "*.html"))
	if err != nil {
		return nil, err
	}

	return &WebServer{
		addr:      addr,
		dnsServer: dnsServer,
		templates: tpl,
	}, nil
}

func (ws *WebServer) ListenAndServe(stopCh <-chan struct{}) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", ws.handleIndex)
	mux.HandleFunc("/api/stats", ws.handleStats)
	mux.HandleFunc("/api/health", ws.handleHealth)

	ws.httpServer = &http.Server{
		Addr:         ws.addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("Web server listening on %s", ws.addr)
		if err := ws.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-stopCh:
		return ws.Shutdown()
	}
}

func (ws *WebServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	data := struct {
		Title string
	}{
		Title: "DNS Proxy Dashboard",
	}

	if err := ws.templates.ExecuteTemplate(w, "index.html", data); err != nil {
		log.Printf("Template error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (ws *WebServer) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := ws.dnsServer.GetStats()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	if err := json.NewEncoder(w).Encode(stats); err != nil {
		log.Printf("JSON encode error: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (ws *WebServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (ws *WebServer) Shutdown() error {
	if ws.httpServer != nil {
		return ws.httpServer.Close()
	}
	return nil
}
