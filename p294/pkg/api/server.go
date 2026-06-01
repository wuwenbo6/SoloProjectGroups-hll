package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/owamp-client/pkg/client"
	"github.com/owamp-client/pkg/ntp"
	"github.com/owamp-client/pkg/protocol"
)

type Server struct {
	httpServer  *http.Server
	owampClient *client.OWAMPClient
	config      client.OWMPServerConfig
}

type NTPRequest struct {
	Enabled  bool   `json:"enabled"`
	Server   string `json:"server"`
	Port     int    `json:"port"`
	TimeoutMs int   `json:"timeout_ms"`
	Attempts int    `json:"attempts"`
}

type AdaptiveRequest struct {
	Enabled        bool    `json:"enabled"`
	MinIntervalMs  int     `json:"min_interval_ms"`
	MaxIntervalMs  int     `json:"max_interval_ms"`
	IncreaseFactor float64 `json:"increase_factor"`
	DecreaseFactor float64 `json:"decrease_factor"`
	LossThreshold  float64 `json:"loss_threshold"`
	WindowSize     int     `json:"window_size"`
}

type TestRequest struct {
	Address       string          `json:"address"`
	Port          int             `json:"port"`
	PacketCount   int             `json:"packet_count"`
	IntervalMs    int             `json:"interval_ms"`
	TimeoutMs     int             `json:"timeout_ms"`
	SymmetricMode bool            `json:"symmetric_mode"`
	NTP           NTPRequest      `json:"ntp"`
	Adaptive      AdaptiveRequest `json:"adaptive"`
}

type TestResponse struct {
	Success              bool                     `json:"success"`
	Message              string                   `json:"message,omitempty"`
	Results              []*protocol.TestResult   `json:"results,omitempty"`
	Stats                *client.DelayStats       `json:"stats,omitempty"`
	Config               client.OWMPServerConfig  `json:"config,omitempty"`
	NTPResult            *ntp.NTPResult           `json:"ntp_result,omitempty"`
	RateControllerStats  map[string]interface{}   `json:"rate_controller_stats,omitempty"`
	IsRunning            bool                     `json:"is_running,omitempty"`
}

func NewServer(addr string) *Server {
	s := &Server{}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/test", s.handleTest)
	mux.HandleFunc("/api/stop", s.handleStop)
	mux.HandleFunc("/api/results", s.handleResults)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/ntp-status", s.handleNTPStatus)
	mux.Handle("/", http.FileServer(http.Dir("./web")))

	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	return s
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	config := client.OWMPServerConfig{
		Address:       req.Address,
		Port:          req.Port,
		PacketCount:   req.PacketCount,
		Interval:      time.Duration(req.IntervalMs) * time.Millisecond,
		Timeout:       time.Duration(req.TimeoutMs) * time.Millisecond,
		SymmetricMode: req.SymmetricMode,
		NTP: client.NTPConfig{
			Enabled:  req.NTP.Enabled,
			Server:   req.NTP.Server,
			Port:     req.NTP.Port,
			Timeout:  time.Duration(req.NTP.TimeoutMs) * time.Millisecond,
			Attempts: req.NTP.Attempts,
		},
		Adaptive: client.AdaptiveConfig{
			Enabled:        req.Adaptive.Enabled,
			MinInterval:    time.Duration(req.Adaptive.MinIntervalMs) * time.Millisecond,
			MaxInterval:    time.Duration(req.Adaptive.MaxIntervalMs) * time.Millisecond,
			IncreaseFactor: req.Adaptive.IncreaseFactor,
			DecreaseFactor: req.Adaptive.DecreaseFactor,
			LossThreshold:  req.Adaptive.LossThreshold,
			WindowSize:     req.Adaptive.WindowSize,
		},
	}

	s.config = config
	s.owampClient = client.NewOWAMPClient(config)

	go func() {
		s.owampClient.RunTest()
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TestResponse{
		Success:   true,
		Message:   "test started",
		Config:    config,
		IsRunning: true,
	})
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.owampClient == nil {
		json.NewEncoder(w).Encode(TestResponse{
			Success: false,
			Message: "no test is running",
		})
		return
	}

	s.owampClient.Stop()

	json.NewEncoder(w).Encode(TestResponse{
		Success:   true,
		Message:   "test stopped",
		IsRunning: false,
	})
}

func (s *Server) handleResults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.owampClient == nil {
		json.NewEncoder(w).Encode(TestResponse{
			Success: false,
			Message: "no test has been run yet",
		})
		return
	}

	results := s.owampClient.GetResults()
	isRunning := s.owampClient.IsRunning()

	json.NewEncoder(w).Encode(TestResponse{
		Success:             true,
		Results:             results,
		Message:             strconv.FormatBool(isRunning),
		IsRunning:           isRunning,
		RateControllerStats: s.owampClient.GetRateControllerStats(),
	})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.owampClient == nil {
		json.NewEncoder(w).Encode(TestResponse{
			Success: false,
			Message: "no test has been run yet",
		})
		return
	}

	results := s.owampClient.GetResults()
	stats := client.CalculateStats(results)

	ntpResult := s.owampClient.GetNTPResult()
	if ntpResult != nil && ntpResult.Success {
		stats.NTPServer = ntpResult.Server
		stats.NTPRoundTripDelay = ntpResult.RoundTripDelay
		stats.RateAdjustments = len(results)
	}

	json.NewEncoder(w).Encode(TestResponse{
		Success:             true,
		Stats:               stats,
		NTPResult:           ntpResult,
		RateControllerStats: s.owampClient.GetRateControllerStats(),
	})
}

func (s *Server) handleNTPStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.owampClient == nil {
		json.NewEncoder(w).Encode(TestResponse{
			Success: false,
			Message: "no test has been run yet",
		})
		return
	}

	ntpResult := s.owampClient.GetNTPResult()
	json.NewEncoder(w).Encode(TestResponse{
		Success:   ntpResult != nil && ntpResult.Success,
		NTPResult: ntpResult,
	})
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Stop() error {
	return s.httpServer.Close()
}
