package replica

import (
	"alwayson-ag-simulator/internal/ag"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type ReplicaServer struct {
	agManager *ag.AvailabilityGroup
	replica   *ag.Replica
	Host      string
	Port      int
	server    *http.Server
}

func NewServer(agManager *ag.AvailabilityGroup, replicaName string, host string, port int) (*ReplicaServer, error) {
	replica, exists := agManager.GetReplica(replicaName)
	if !exists {
		return nil, fmt.Errorf("replica %s not found", replicaName)
	}

	return &ReplicaServer{
		agManager: agManager,
		replica:   replica,
		Host:      host,
		Port:      port,
	}, nil
}

func (s *ReplicaServer) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/query", s.handleQuery)
	mux.HandleFunc("/status", s.handleStatus)

	s.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", s.Host, s.Port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	return s.server.ListenAndServe()
}

func (s *ReplicaServer) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func (s *ReplicaServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	status := s.replica.GetStatus()
	agStatus := s.agManager.GetStatus()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Replica-Name", status.Name)
	w.Header().Set("X-Replica-Role", string(status.Role))

	response := map[string]interface{}{
		"replica":        status,
		"ag_name":        agStatus.Name,
		"primary_replica": agStatus.PrimaryReplica,
		"is_primary":     status.Role == ag.Primary,
		"request_path":   r.URL.Path,
		"timestamp":      time.Now().Format(time.RFC3339),
		"server_info":    fmt.Sprintf("AlwaysOn AG Replica Server - %s", status.Name),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *ReplicaServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	status := s.replica.GetStatus()

	w.Header().Set("Content-Type", "application/json")

	health := "healthy"
	httpStatus := http.StatusOK

	if !status.IsConnected {
		health = "disconnected"
		httpStatus = http.StatusServiceUnavailable
	} else if status.SyncHealth == "CRITICAL" {
		health = "critical"
		httpStatus = http.StatusServiceUnavailable
	} else if status.SyncHealth == "NOT_HEALTHY" {
		health = "unhealthy"
		httpStatus = http.StatusOK
	}

	w.WriteHeader(httpStatus)

	response := map[string]interface{}{
		"name":       status.Name,
		"role":       status.Role,
		"health":     health,
		"sync_state": status.SyncState,
		"lsn":        status.LSN,
		"connected":  status.IsConnected,
		"timestamp":  time.Now().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *ReplicaServer) handleQuery(w http.ResponseWriter, r *http.Request) {
	status := s.replica.GetStatus()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Replica-Name", status.Name)
	w.Header().Set("X-Replica-Role", string(status.Role))

	query := r.URL.Query().Get("sql")
	if query == "" {
		query = "SELECT @@VERSION"
	}

	if status.Role != ag.Primary {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "NOT_PRIMARY",
			"message": "This replica is not the primary. Write operations are not allowed.",
			"replica": status.Name,
			"role":    status.Role,
		})
		return
	}

	results := []map[string]interface{}{
		{
			"id":    1,
			"name":  "AlwaysOn AG Simulator",
			"value": fmt.Sprintf("Query executed on primary replica %s", status.Name),
		},
	}

	response := map[string]interface{}{
		"replica":      status.Name,
		"role":         status.Role,
		"query":        query,
		"rows_affected": len(results),
		"results":      results,
		"lsn":          status.LSN,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *ReplicaServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := s.replica.GetStatus()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
