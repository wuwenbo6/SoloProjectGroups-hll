package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

type Server struct {
	staticDir  string
	srpManager *SRPManager
}

func NewServer() *Server {
	return &Server{
		staticDir:  "./static",
		srpManager: NewSRPManager(1000),
	}
}

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(DefaultConfig())
}

func (s *Server) handleGetSRPStreams(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(DefaultSRPStreams())
}

func (s *Server) handleReserveStreams(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		return
	}

	var request SRPReservationRequest
	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	srpManager := NewSRPManager(1000)
	result := srpManager.ProcessReservationRequest(&request)
	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleRunSimulation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		return
	}

	var config SimulationConfig
	err := json.NewDecoder(r.Body).Decode(&config)
	if err != nil {
		http.Error(w, "Invalid configuration: "+err.Error(), http.StatusBadRequest)
		return
	}

	simulator := NewSimulator(&config)
	result := simulator.Run()

	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleExportXML(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/xml")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Disposition", "attachment; filename=tsn-config.xml")

	if r.Method == "OPTIONS" {
		return
	}

	var config struct {
		SimulationConfig SimulationConfig `json:"simulationConfig"`
		Streams          []SRPStream      `json:"streams"`
	}

	err := json.NewDecoder(r.Body).Decode(&config)
	if err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	xmlContent, err := ExportFullConfigToXML(&config.SimulationConfig, config.Streams)
	if err != nil {
		http.Error(w, "XML export failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(xmlContent))
}

func (s *Server) handleExportGCLXML(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/xml")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Disposition", "attachment; filename=ieee8021qbv-gcl.xml")

	if r.Method == "OPTIONS" {
		return
	}

	var config SimulationConfig
	err := json.NewDecoder(r.Body).Decode(&config)
	if err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	xmlContent, err := ExportToIEEE8021QbvXML(&config)
	if err != nil {
		http.Error(w, "XML export failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(xmlContent))
}

func (s *Server) handleStaticFiles(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	fullPath := filepath.Join(s.staticDir, path)
	_, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	http.ServeFile(w, r, fullPath)
}

func main() {
	server := NewServer()

	http.HandleFunc("/api/config", server.handleGetConfig)
	http.HandleFunc("/api/srp/streams", server.handleGetSRPStreams)
	http.HandleFunc("/api/srp/reserve", server.handleReserveStreams)
	http.HandleFunc("/api/simulate", server.handleRunSimulation)
	http.HandleFunc("/api/export/xml", server.handleExportXML)
	http.HandleFunc("/api/export/gcl-xml", server.handleExportGCLXML)
	http.HandleFunc("/", server.handleStaticFiles)

	log.Println("TSN Scheduler Simulator starting on :8888")
	log.Println("API Endpoints:")
	log.Println("  GET  /api/config         - Get default configuration")
	log.Println("  GET  /api/srp/streams    - Get default SRP streams")
	log.Println("  POST /api/srp/reserve    - Reserve SRP streams")
	log.Println("  POST /api/simulate       - Run simulation with custom config")
	log.Println("  POST /api/export/xml     - Export full config to XML")
	log.Println("  POST /api/export/gcl-xml - Export GCL to IEEE 802.1Qbv XML")
	log.Println("  GET  /                   - Web interface")

	if err := http.ListenAndServe(":8888", nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
