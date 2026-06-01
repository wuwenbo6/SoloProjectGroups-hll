package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"vnc-multiuser/pkg/database"
	"vnc-multiuser/pkg/recorder"
	"vnc-multiuser/pkg/vnc"
	ws "vnc-multiuser/pkg/websocket"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		HTTPPort      int    `yaml:"http_port"`
		WebsocketPath string `yaml:"websocket_path"`
	} `yaml:"server"`
	VNC struct {
		Host             string `yaml:"host"`
		Port             int    `yaml:"port"`
		Password         string `yaml:"password"`
		MaxViewers       int    `yaml:"max_viewers"`
		Encoding         string `yaml:"encoding"`
		CompressionLevel int    `yaml:"compression_level"`
		QualityLevel     int    `yaml:"quality_level"`
		EnableSuspend    bool   `yaml:"enable_suspend"`
	} `yaml:"vnc"`
	Database struct {
		Path string `yaml:"path"`
	} `yaml:"database"`
	Recording struct {
		Enabled   bool   `yaml:"enabled"`
		OutputDir string `yaml:"output_dir"`
		FPS       int    `yaml:"fps"`
		Quality   string `yaml:"quality"`
		ExportMP4 bool   `yaml:"export_mp4"`
		FFmpegPath string `yaml:"ffmpeg_path"`
	} `yaml:"recording"`
	Session struct {
		Timeout        int  `yaml:"timeout"`
		EnableSuspend  bool `yaml:"enable_suspend"`
	} `yaml:"session"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

func main() {
	config, err := loadConfig("config/config.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.New(config.Database.Path)
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}
	defer db.Close()

	rec := recorder.New(db, config.Recording.OutputDir, config.Recording.FPS, config.Recording.Enabled)

	proxy := vnc.NewProxy(vnc.Config{
		Host:             config.VNC.Host,
		Port:             config.VNC.Port,
		Password:         config.VNC.Password,
		MaxViewers:       config.VNC.MaxViewers,
		Encoding:         config.VNC.Encoding,
		CompressionLevel: config.VNC.CompressionLevel,
		QualityLevel:     config.VNC.QualityLevel,
		EnableSuspend:    config.Session.EnableSuspend,
	}, db, rec)

	if err := proxy.Start(); err != nil {
		log.Fatalf("Failed to start VNC proxy: %v", err)
	}
	defer proxy.Stop()

	log.Printf("Connected to VNC server at %s:%d", config.VNC.Host, config.VNC.Port)

	wsHandler := ws.NewHandler(proxy)

	mux := http.NewServeMux()

	mux.HandleFunc(config.Server.WebsocketPath, wsHandler.ServeHTTP)

	mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		sessions, err := db.GetActiveSessions()
		if err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		writeJSON(w, APIResponse{Success: true, Data: map[string]interface{}{"sessions": sessions}}, http.StatusOK)
	})

	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		id := filepath.Base(r.URL.Path)
		if err := db.RemoveSession(id); err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		proxy.RemoveClient(id)
		writeJSON(w, APIResponse{Success: true, Message: "Session removed"}, http.StatusOK)
	})

	mux.HandleFunc("/api/control/request", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			SessionID string `json:"session_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		clients := proxy.GetActiveClients()
		var targetID string
		for _, c := range clients {
			if c.UserName == req.SessionID || c.ID == req.SessionID {
				targetID = c.ID
				break
			}
		}

		if targetID == "" {
			writeJSON(w, APIResponse{Success: false, Message: "Session not found"}, http.StatusNotFound)
			return
		}

		success := proxy.RequestControl(targetID)
		if success {
			writeJSON(w, APIResponse{Success: true, Message: "Control granted"}, http.StatusOK)
		} else {
			writeJSON(w, APIResponse{Success: false, Message: "Controller already active"}, http.StatusConflict)
		}
	})

	mux.HandleFunc("/api/control/release", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			SessionID string `json:"session_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		clients := proxy.GetActiveClients()
		var targetID string
		for _, c := range clients {
			if c.UserName == req.SessionID || c.ID == req.SessionID {
				targetID = c.ID
				break
			}
		}

		if targetID != "" {
			proxy.ReleaseControl(targetID)
		}
		writeJSON(w, APIResponse{Success: true, Message: "Control released"}, http.StatusOK)
	})

	mux.HandleFunc("/api/recordings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		recordings, err := db.GetRecordings()
		if err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		writeJSON(w, APIResponse{Success: true, Data: map[string]interface{}{"recordings": recordings}}, http.StatusOK)
	})

	mux.HandleFunc("/api/recordings/", func(w http.ResponseWriter, r *http.Request) {
		id := filepath.Base(r.URL.Path)
		recordings, err := db.GetRecordings()
		if err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		var target *database.Recording
		for _, rec := range recordings {
			if rec.ID == id {
				target = rec
				break
			}
		}
		if target == nil {
			writeJSON(w, APIResponse{Success: false, Message: "Recording not found"}, http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, target.FilePath)
	})

	mux.HandleFunc("/api/quality", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			q := proxy.GetQuality()
			writeJSON(w, APIResponse{
				Success: true,
				Data: map[string]interface{}{
					"quality": q,
					"presets": vnc.QualityPresets,
				},
			}, http.StatusOK)

		case http.MethodPost:
			var req struct {
				Preset           string `json:"preset"`
				CompressionLevel int    `json:"compression_level"`
				QualityLevel     int    `json:"quality_level"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, APIResponse{Success: false, Message: "Invalid request"}, http.StatusBadRequest)
				return
			}

			var settings vnc.QualitySettings
			if req.Preset != "" {
				preset := vnc.GetQualityPreset(req.Preset)
				if preset == nil {
					writeJSON(w, APIResponse{Success: false, Message: "Invalid preset"}, http.StatusBadRequest)
					return
				}
				settings = *preset
			} else {
				settings = vnc.QualitySettings{
					CompressionLevel: req.CompressionLevel,
					QualityLevel:     req.QualityLevel,
					Encoding:         vnc.EncodingTight,
				}
			}

			if err := proxy.SetQuality(settings); err != nil {
				writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusBadRequest)
				return
			}
			writeJSON(w, APIResponse{Success: true, Message: "Quality updated"}, http.StatusOK)

		default:
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/sessions/:id/suspend", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		id := filepath.Base(r.URL.Path)
		if err := proxy.SuspendSession(id); err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		db.RemoveSession(id)
		writeJSON(w, APIResponse{Success: true, Message: "Session suspended"}, http.StatusOK)
	})

	mux.HandleFunc("/api/sessions/:id/resume", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		id := filepath.Base(r.URL.Path)
		suspended := proxy.GetSuspendedSession(id)
		if suspended == nil {
			writeJSON(w, APIResponse{Success: false, Message: "Suspended session not found"}, http.StatusNotFound)
			return
		}
		writeJSON(w, APIResponse{Success: true, Data: suspended}, http.StatusOK)
	})

	mux.HandleFunc("/api/sessions/suspended", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		suspended := proxy.GetSuspendedSessions()
		writeJSON(w, APIResponse{Success: true, Data: map[string]interface{}{"sessions": suspended}}, http.StatusOK)
	})

	mux.HandleFunc("/api/recordings/:id/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, APIResponse{Success: false, Message: "Method not allowed"}, http.StatusMethodNotAllowed)
			return
		}
		id := filepath.Base(r.URL.Path)
		recordings, err := db.GetRecordings()
		if err != nil {
			writeJSON(w, APIResponse{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		var target *database.Recording
		for _, rec := range recordings {
			if rec.ID == id {
				target = rec
				break
			}
		}
		if target == nil {
			writeJSON(w, APIResponse{Success: false, Message: "Recording not found"}, http.StatusNotFound)
			return
		}

		mp4Path, err := recorder.ExportToMP4(target.FilePath, config.Recording.FPS, config.Recording.FFmpegPath)
		if err != nil {
			writeJSON(w, APIResponse{Success: false, Message: "Export failed: " + err.Error()}, http.StatusInternalServerError)
			return
		}

		writeJSON(w, APIResponse{
			Success: true,
			Message: "Export completed",
			Data: map[string]interface{}{
				"mp4_path": mp4Path,
				"download_url": "/api/recordings/mp4/" + filepath.Base(mp4Path),
			},
		}, http.StatusOK)
	})

	mux.HandleFunc("/api/recordings/mp4/", func(w http.ResponseWriter, r *http.Request) {
		filename := filepath.Base(r.URL.Path)
		mp4Path := filepath.Join(config.Recording.OutputDir, filename)
		if _, err := os.Stat(mp4Path); os.IsNotExist(err) {
			writeJSON(w, APIResponse{Success: false, Message: "MP4 not found"}, http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, mp4Path)
	})

	staticDir := http.FileServer(http.Dir("static"))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "static/index.html")
			return
		}
		staticDir.ServeHTTP(w, r)
	}))

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", config.Server.HTTPPort),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %d", config.Server.HTTPPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	proxy.Stop()
	server.Close()
}

func loadConfig(path string) (*Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var config Config
	if err := yaml.NewDecoder(f).Decode(&config); err != nil {
		return nil, err
	}

	return &config, nil
}

func writeJSON(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
