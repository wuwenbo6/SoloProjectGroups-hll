package http

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
)

type BootConfig struct {
	Label        string
	OSType       string
	KernelURL    string
	InitrdURL    string
	KernelParams string
}

type BootScriptGenerator func(mac string) *BootConfig

type MenuScriptGenerator func() ([]BootConfig, string, uint32, string)

type BootCallback func(mac, osType, ip, userAgent string)

type Server struct {
	addr         string
	generator    BootScriptGenerator
	menuGen      MenuScriptGenerator
	bootCallback BootCallback
	mux          *http.ServeMux
	httpServer   *http.Server
}

func NewServer(addr string, generator BootScriptGenerator, menuGen MenuScriptGenerator, bootCallback BootCallback) *Server {
	s := &Server{
		addr:         addr,
		generator:    generator,
		menuGen:      menuGen,
		bootCallback: bootCallback,
		mux:          http.NewServeMux(),
	}

	s.mux.HandleFunc("/", s.handleRoot)
	s.mux.HandleFunc("/boot.ipxe", s.handleBootScript)
	s.mux.HandleFunc("/menu.ipxe", s.handleMenuScript)
	s.mux.HandleFunc("/boot/", s.handleBootByMAC)
	s.mux.HandleFunc("/choose/", s.handleChoose)
	s.mux.HandleFunc("/api/bootlog", s.handleBootLog)
	s.mux.HandleFunc("/health", s.handleHealth)

	return s
}

func (s *Server) handleBootScript(w http.ResponseWriter, r *http.Request) {
	mac := extractMAC(r)
	if mac == "" {
		mac = "unknown"
		log.Printf("No MAC address found in request from %s, using default", r.RemoteAddr)
	}

	log.Printf("Generating boot script for MAC %s", mac)

	cfg := s.generator(mac)
	if cfg == nil {
		http.Error(w, "no boot configuration found for this client", http.StatusNotFound)
		log.Printf("No boot configuration for MAC %s", mac)
		return
	}

	ip := getRemoteIP(r)
	userAgent := r.UserAgent()
	if s.bootCallback != nil {
		s.bootCallback(mac, cfg.OSType, ip, userAgent)
	}

	script := generateiPXEScript(cfg)

	setiPXEContentType(w)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(script))

	log.Printf("Sent boot script for MAC %s: OS=%s, kernel=%s", mac, cfg.OSType, cfg.KernelURL)
}

func (s *Server) handleBootByMAC(w http.ResponseWriter, r *http.Request) {
	mac := strings.TrimPrefix(r.URL.Path, "/boot/")
	mac = strings.ReplaceAll(mac, "-", ":")

	if _, err := net.ParseMAC(mac); err != nil {
		http.Error(w, fmt.Sprintf("invalid MAC address: %s", mac), http.StatusBadRequest)
		return
	}

	log.Printf("Generating boot script by MAC path for %s", mac)

	cfg := s.generator(mac)
	if cfg == nil {
		http.Error(w, "no boot configuration found for this client", http.StatusNotFound)
		return
	}

	ip := getRemoteIP(r)
	userAgent := r.UserAgent()
	if s.bootCallback != nil {
		s.bootCallback(mac, cfg.OSType, ip, userAgent)
	}

	script := generateiPXEScript(cfg)

	setiPXEContentType(w)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(script))
}

func (s *Server) handleMenuScript(w http.ResponseWriter, r *http.Request) {
	if s.menuGen == nil {
		http.Error(w, "menu not configured", http.StatusNotFound)
		return
	}

	entries, title, timeout, defaultLabel := s.menuGen()
	if len(entries) == 0 {
		http.Error(w, "no menu entries configured", http.StatusNotFound)
		return
	}

	script := generateiPXEMenu(entries, title, timeout, defaultLabel)

	setiPXEContentType(w)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(script))

	log.Printf("Sent iPXE menu with %d entries", len(entries))
}

func (s *Server) handleChoose(w http.ResponseWriter, r *http.Request) {
	osType := strings.TrimPrefix(r.URL.Path, "/choose/")
	osType = strings.TrimSpace(osType)

	if osType == "" {
		http.Error(w, "os type required", http.StatusBadRequest)
		return
	}

	mac := extractMAC(r)
	if mac == "" {
		mac = "unknown"
	}

	log.Printf("Manual OS selection for MAC %s: %s", mac, osType)

	cfg := s.generator(mac)
	if cfg == nil || cfg.OSType != osType {
		if osDefault, ok := getOSDefault(osType); ok {
			cfg = osDefault
		} else {
			http.Error(w, fmt.Sprintf("no configuration for os type: %s", osType), http.StatusNotFound)
			return
		}
	}

	ip := getRemoteIP(r)
	userAgent := r.UserAgent()
	if s.bootCallback != nil {
		s.bootCallback(mac, osType, ip, userAgent)
	}

	script := generateiPXEScript(cfg)

	setiPXEContentType(w)
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(script))

	log.Printf("Sent manual boot script for MAC %s: OS=%s", mac, osType)
}

func (s *Server) handleBootLog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok", "message": "bootlog endpoint"}`))
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		http.Error(w, "PXE Boot Server", http.StatusOK)
		return
	}

	if strings.HasSuffix(strings.ToLower(r.URL.Path), ".ipxe") {
		mac := extractMAC(r)
		cfg := s.generator(mac)
		if cfg == nil {
			http.Error(w, "no boot configuration found for this client", http.StatusNotFound)
			log.Printf("No boot configuration for path %s, MAC %s", r.URL.Path, mac)
			return
		}

		ip := getRemoteIP(r)
		userAgent := r.UserAgent()
		if s.bootCallback != nil {
			s.bootCallback(mac, cfg.OSType, ip, userAgent)
		}

		script := generateiPXEScript(cfg)
		setiPXEContentType(w)
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(script))

		log.Printf("Sent .ipxe boot script for path %s, MAC %s: OS=%s", r.URL.Path, mac, cfg.OSType)
		return
	}

	http.NotFound(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (s *Server) ListenAndServe() error {
	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: s.mux,
	}

	log.Printf("HTTP server listening on %s", s.addr)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Close() error {
	if s.httpServer != nil {
		return s.httpServer.Close()
	}
	return nil
}

func extractMAC(r *http.Request) string {
	mac := r.URL.Query().Get("mac")
	if mac != "" {
		if _, err := net.ParseMAC(mac); err == nil {
			return strings.ToLower(mac)
		}
	}

	for _, line := range r.Header["X-Pxe"] {
		if strings.HasPrefix(line, "mac=") {
			mac = strings.TrimPrefix(line, "mac=")
			if _, err := net.ParseMAC(mac); err == nil {
				return strings.ToLower(mac)
			}
		}
	}

	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		ip := strings.Split(xForwardedFor, ",")[0]
		ip = strings.TrimSpace(ip)
		mac = arpLookup(ip)
		if mac != "" {
			return strings.ToLower(mac)
		}
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		mac = arpLookup(host)
		if mac != "" {
			return strings.ToLower(mac)
		}
	}

	return ""
}

func arpLookup(ip string) string {
	return ""
}

func getRemoteIP(r *http.Request) string {
	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		ip := strings.Split(xForwardedFor, ",")[0]
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

var osDefaults map[string]*BootConfig

func RegisterOSDefault(osType string, cfg *BootConfig) {
	if osDefaults == nil {
		osDefaults = make(map[string]*BootConfig)
	}
	osDefaults[osType] = cfg
}

func getOSDefault(osType string) (*BootConfig, bool) {
	cfg, ok := osDefaults[osType]
	return cfg, ok
}

func setiPXEContentType(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
}

func generateiPXEScript(cfg *BootConfig) string {
	var sb strings.Builder

	sb.WriteString("#!ipxe\n")
	sb.WriteString(fmt.Sprintf("# Boot script for %s\n", cfg.OSType))
	sb.WriteString("\n")
	sb.WriteString("echo Booting from network...\n")
	sb.WriteString(fmt.Sprintf("echo OS Type: %s\n", cfg.OSType))
	sb.WriteString("\n")

	switch cfg.OSType {
	case "ubuntu":
		sb.WriteString(generateUbuntuScript(cfg))
	case "centos":
		sb.WriteString(generateCentOSScript(cfg))
	default:
		sb.WriteString(generateGenericScript(cfg))
	}

	return sb.String()
}

func generateUbuntuScript(cfg *BootConfig) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("kernel %s", cfg.KernelURL))
	if cfg.KernelParams != "" {
		sb.WriteString(fmt.Sprintf(" %s", cfg.KernelParams))
	} else {
		sb.WriteString(" auto=true priority=critical")
	}
	sb.WriteString("\n")

	sb.WriteString(fmt.Sprintf("initrd %s\n", cfg.InitrdURL))
	sb.WriteString("boot\n")

	return sb.String()
}

func generateCentOSScript(cfg *BootConfig) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("kernel %s", cfg.KernelURL))
	if cfg.KernelParams != "" {
		sb.WriteString(fmt.Sprintf(" %s", cfg.KernelParams))
	} else {
		sb.WriteString(" text ks=http://192.168.1.1:8080/kickstart/centos.ks")
	}
	sb.WriteString("\n")

	sb.WriteString(fmt.Sprintf("initrd %s\n", cfg.InitrdURL))
	sb.WriteString("boot\n")

	return sb.String()
}

func generateGenericScript(cfg *BootConfig) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("kernel %s %s\n", cfg.KernelURL, cfg.KernelParams))
	sb.WriteString(fmt.Sprintf("initrd %s\n", cfg.InitrdURL))
	sb.WriteString("boot\n")

	return sb.String()
}

func generateiPXEMenu(entries []BootConfig, title string, timeout uint32, defaultLabel string) string {
	var sb strings.Builder

	sb.WriteString("#!ipxe\n")
	sb.WriteString(fmt.Sprintf("# %s\n", title))
	sb.WriteString("\n")
	sb.WriteString("echo PXE Boot Menu\n")
	sb.WriteString("\n")

	sb.WriteString(fmt.Sprintf(":menu\n"))
	sb.WriteString(fmt.Sprintf("menu %s\n", title))
	sb.WriteString(fmt.Sprintf("set menu-timeout %d\n", timeout*1000))
	if defaultLabel != "" {
		sb.WriteString(fmt.Sprintf("set menu-default %s\n", defaultLabel))
	} else if len(entries) > 0 {
		sb.WriteString(fmt.Sprintf("set menu-default %s\n", entries[0].OSType))
	}
	sb.WriteString("\n")

	for i, entry := range entries {
		label := entry.Label
		if label == "" {
			label = entry.OSType
		}
		sb.WriteString(fmt.Sprintf("item --gap -- ---- %s ----\n", strings.ToUpper(entry.OSType)))
		sb.WriteString(fmt.Sprintf("item %s %s\n", entry.OSType, label))
		_ = i
	}

	sb.WriteString("\n")
	sb.WriteString("choose --timeout ${menu-timeout} --default ${menu-default} selected || goto cancel\n")
	sb.WriteString("goto ${selected}\n")
	sb.WriteString("\n")

	sb.WriteString(":cancel\n")
	sb.WriteString("echo Boot cancelled\n")
	sb.WriteString("sleep 2\n")
	sb.WriteString("goto menu\n")
	sb.WriteString("\n")

	for _, entry := range entries {
		sb.WriteString(fmt.Sprintf(":%s\n", entry.OSType))
		sb.WriteString(fmt.Sprintf("echo Booting %s...\n", entry.OSType))
		sb.WriteString(fmt.Sprintf("chain --autofree /choose/%s\n", entry.OSType))
		sb.WriteString("goto menu\n")
		sb.WriteString("\n")
	}

	sb.WriteString(":fail\n")
	sb.WriteString("echo Boot failed\n")
	sb.WriteString("sleep 2\n")
	sb.WriteString("goto menu\n")
	sb.WriteString("\n")

	return sb.String()
}
