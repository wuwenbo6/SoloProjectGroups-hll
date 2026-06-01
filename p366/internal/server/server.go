package server

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"gptp-simulator/internal/ptp"
)

type Server struct {
	simulator *ptp.Simulator
	upgrader  websocket.Upgrader
	clients   map[*websocket.Conn]bool
	clientsMu sync.Mutex
	broadcast chan ptp.SyncMetrics
}

type StatusResponse struct {
	Running           bool    `json:"running"`
	MasterTime        int64   `json:"masterTime"`
	SlaveTime         int64   `json:"slaveTime"`
	LastPathDelay     int64   `json:"lastPathDelay"`
	LastOffset        int64   `json:"lastOffset"`
	SyncCount         uint64  `json:"syncCount"`
	MasterFreq        float64 `json:"masterFreq"`
	SlaveFreq         float64 `json:"slaveFreq"`
	LastSyncError     int64   `json:"lastSyncError"`
	RateRatio         float64 `json:"rateRatio"`
	MasterTemperature float64 `json:"masterTemperature"`
	SlaveTemperature  float64 `json:"slaveTemperature"`
	MasterFreqOffset  float64 `json:"masterFreqOffset"`
	SlaveFreqOffset   float64 `json:"slaveFreqOffset"`
}

type MetricsPoint struct {
	Timestamp         int64   `json:"timestamp"`
	SyncError         int64   `json:"syncError"`
	PathDelay         int64   `json:"pathDelay"`
	ClockOffset       int64   `json:"clockOffset"`
	RateRatio         float64 `json:"rateRatio"`
	MasterTemperature float64 `json:"masterTemperature"`
	SlaveTemperature  float64 `json:"slaveTemperature"`
	MasterFreqOffset  float64 `json:"masterFreqOffset"`
	SlaveFreqOffset   float64 `json:"slaveFreqOffset"`
}

func NewServer(simulator *ptp.Simulator) *Server {
	s := &Server{
		simulator: simulator,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan ptp.SyncMetrics, 100),
	}

	simulator.SetMetricsCallback(func(metrics ptp.SyncMetrics) {
		select {
		case s.broadcast <- metrics:
		default:
		}
	})

	return s
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/start", s.handleStart)
	mux.HandleFunc("/api/stop", s.handleStop)
	mux.HandleFunc("/api/reset", s.handleReset)
	mux.HandleFunc("/api/metrics", s.handleMetrics)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/ws", s.handleWebSocket)

	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", fs)

	go s.broadcastLoop()

	log.Printf("Server starting on %s", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	status := StatusResponse{
		Running:           s.simulator.IsRunning(),
		MasterTime:        s.simulator.GetMaster().Now().Nanoseconds(),
		SlaveTime:         s.simulator.GetSlave().Now().Nanoseconds(),
		LastPathDelay:     s.simulator.GetSlave().GetLastPathDelay(),
		LastOffset:        s.simulator.GetSlave().GetLastOffset(),
		SyncCount:         s.simulator.GetSlave().GetSyncCount(),
		MasterFreq:        s.simulator.GetMaster().GetClock().GetNaturalFreq(),
		SlaveFreq:         s.simulator.GetSlave().GetClock().GetNaturalFreq(),
		RateRatio:         s.simulator.GetSlave().GetRateRatio(),
		MasterTemperature: s.simulator.GetMaster().GetClock().GetTemperature(),
		SlaveTemperature:  s.simulator.GetSlave().GetClock().GetTemperature(),
		MasterFreqOffset:  s.simulator.GetMaster().GetClock().GetTempFreqOffset(),
		SlaveFreqOffset:   s.simulator.GetSlave().GetClock().GetTempFreqOffset(),
	}

	if metrics, ok := s.simulator.GetLastMetrics(); ok {
		status.LastSyncError = metrics.SyncError
	}

	json.NewEncoder(w).Encode(status)
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Start()
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Stop()
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Reset()
	json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	metrics := s.simulator.GetMetrics()
	points := make([]MetricsPoint, len(metrics))

	for i, m := range metrics {
		points[i] = MetricsPoint{
			Timestamp:         m.Timestamp.UnixNano(),
			SyncError:         m.SyncError,
			PathDelay:         m.PathDelay,
			ClockOffset:       m.ClockOffset,
			RateRatio:         m.RateRatio,
			MasterTemperature: m.MasterTemperature,
			SlaveTemperature:  m.SlaveTemperature,
			MasterFreqOffset:  m.MasterFreqOffset,
			SlaveFreqOffset:   m.SlaveFreqOffset,
		}
	}

	json.NewEncoder(w).Encode(points)
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodGet {
		config := ptp.DefaultSimulatorConfig()
		json.NewEncoder(w).Encode(config)
		return
	}

	if r.Method == http.MethodPost {
		var config ptp.SimulatorConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		s.simulator.Stop()

		s.simulator = ptp.NewSimulator(config)
		s.simulator.SetMetricsCallback(func(metrics ptp.SyncMetrics) {
			select {
			case s.broadcast <- metrics:
			default:
			}
		})

		json.NewEncoder(w).Encode(map[string]string{"status": "config updated"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) broadcastLoop() {
	for metrics := range s.broadcast {
		point := MetricsPoint{
			Timestamp:         metrics.Timestamp.UnixNano(),
			SyncError:         metrics.SyncError,
			PathDelay:         metrics.PathDelay,
			ClockOffset:       metrics.ClockOffset,
			RateRatio:         metrics.RateRatio,
			MasterTemperature: metrics.MasterTemperature,
			SlaveTemperature:  metrics.SlaveTemperature,
			MasterFreqOffset:  metrics.MasterFreqOffset,
			SlaveFreqOffset:   metrics.SlaveFreqOffset,
		}

		data, err := json.Marshal(point)
		if err != nil {
			log.Printf("Marshal error: %v", err)
			continue
		}

		s.clientsMu.Lock()
		for conn := range s.clients {
			err := conn.WriteMessage(websocket.TextMessage, data)
			if err != nil {
				conn.Close()
				delete(s.clients, conn)
			}
		}
		s.clientsMu.Unlock()
	}
}
