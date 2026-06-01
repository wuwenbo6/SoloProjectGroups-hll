package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"nvme-tcp-target/pkg/target"
)

type APIServer struct {
	nvmeServer *target.TCPServer
	rdmaServer *target.RDMAServer
}

func NewAPIServer(nvmeServer *target.TCPServer, rdmaServer *target.RDMAServer) *APIServer {
	return &APIServer{
		nvmeServer: nvmeServer,
		rdmaServer: rdmaServer,
	}
}

func (api *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	status := make(map[string]interface{})
	status["running"] = true
	status["nvme_port"] = "4420"
	status["rdma_port"] = "4421"
	status["rdma_simulated"] = true
	status["tcp_connections"] = api.nvmeServer.GetConnectionCount()
	status["rdma_connections"] = api.rdmaServer.GetConnectionCount()
	status["controller"] = api.nvmeServer.GetControllerInfo()

	json.NewEncoder(w).Encode(status)
}

func (api *APIServer) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	info := api.nvmeServer.GetControllerInfo()
	namespaces, ok := info["namespaces"]
	if !ok {
		namespaces = []interface{}{}
	}

	response := make(map[string]interface{})
	response["count"] = len(namespaces.([]map[string]interface{}))
	response["namespaces"] = namespaces

	json.NewEncoder(w).Encode(response)
}

func (api *APIServer) handleController(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	info := api.nvmeServer.GetControllerInfo()
	json.NewEncoder(w).Encode(info)
}

func (api *APIServer) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stats := make(map[string]interface{})
	stats["tcp"] = api.nvmeServer.GetConnectionStats()
	stats["rdma"] = api.rdmaServer.GetConnectionStats()

	json.NewEncoder(w).Encode(stats)
}

func main() {
	subsysNQN := "nqn.2024-06.com.example:nvme-tcp-target"
	controller := target.NewController(subsysNQN, 1)

	nvmeAddr := "0.0.0.0:4420"
	nvmeServer := target.NewTCPServer(nvmeAddr, controller)
	if err := nvmeServer.Start(); err != nil {
		log.Fatalf("Failed to start NVMe-TCP server: %v", err)
	}
	defer nvmeServer.Stop()

	rdmaAddr := "0.0.0.0:4421"
	rdmaServer := target.NewRDMAServer(rdmaAddr, controller)
	if err := rdmaServer.Start(); err != nil {
		log.Fatalf("Failed to start NVMe-RDMA server: %v", err)
	}
	defer rdmaServer.Stop()

	apiServer := NewAPIServer(nvmeServer, rdmaServer)

	http.HandleFunc("/api/status", apiServer.handleStatus)
	http.HandleFunc("/api/namespaces", apiServer.handleNamespaces)
	http.HandleFunc("/api/controller", apiServer.handleController)
	http.HandleFunc("/api/stats", apiServer.handleStats)

	http.Handle("/", http.FileServer(http.Dir("./frontend")))

	apiAddr := "0.0.0.0:8080"
	log.Printf("API server listening on http://%s", apiAddr)

	go func() {
		if err := http.ListenAndServe(apiAddr, nil); err != nil {
			log.Fatalf("Failed to start API server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
}
