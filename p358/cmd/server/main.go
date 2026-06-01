package main

import (
	"encoding/csv"
	"encoding/json"
	"kafka-simulator/internal/custom"
	"kafka-simulator/internal/group"
	"kafka-simulator/internal/types"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var manager *group.GroupManager
var customMgr *custom.Manager

func main() {
	manager = group.NewGroupManager()
	customMgr = manager.CustomAssignors()

	http.HandleFunc("/", serveIndex)
	http.HandleFunc("/api/", handleAPI)

	log.Println("Kafka Simulator starting on :8080...")
	log.Println("Open http://localhost:8080 to view the dashboard")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" || r.URL.Path == "/index.html" {
		workDir, _ := os.Getwd()
		indexPath := filepath.Join(workDir, "web", "index.html")
		http.ServeFile(w, r, indexPath)
		return
	}
	http.NotFound(w, r)
}

func handleAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api")

	switch {
	case path == "/brokers":
		handleBrokers(w, r)
	case path == "/topics":
		handleTopics(w, r)
	case strings.HasPrefix(path, "/topics/"):
		handleTopic(w, r)
	case path == "/groups":
		handleGroups(w, r)
	case strings.HasPrefix(path, "/groups/") && strings.Contains(path, "/export"):
		handleExportHistory(w, r)
	case strings.HasPrefix(path, "/groups/") && strings.Contains(path, "/consumers"):
		handleGroupConsumers(w, r)
	case strings.HasPrefix(path, "/groups/"):
		handleGroup(w, r)
	case path == "/events":
		handleEvents(w, r)
	case path == "/assignors":
		handleAssignors(w, r)
	case path == "/export/all":
		handleExportAll(w, r)
	case path == "/custom-assignors":
		handleCustomAssignors(w, r)
	case strings.HasPrefix(path, "/custom-assignors/") && strings.HasSuffix(path, "/test"):
		handleCustomAssignorTest(w, r)
	case strings.HasPrefix(path, "/custom-assignors/"):
		handleCustomAssignor(w, r)
	default:
		http.NotFound(w, r)
	}
}

func handleBrokers(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	brokers := manager.GetBrokers()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"brokers": brokers,
	})
}

func handleTopics(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		topics := manager.GetTopics()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"topics": topics,
		})
	case "POST":
		var req struct {
			Name       string `json:"name"`
			Partitions int32  `json:"partitions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := manager.CreateTopic(req.Name, req.Partitions); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "created"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleTopic(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/topics/")

	if r.Method != "DELETE" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := manager.DeleteTopic(name); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

func handleGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		groups := manager.GetGroups()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"groups": groups,
		})
	case "POST":
		var req struct {
			ID       string   `json:"id"`
			Protocol string   `json:"protocol"`
			Topics   []string `json:"topics"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := manager.CreateGroup(req.ID, req.Protocol, req.Topics); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "created"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGroup(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/groups/"), "/")
	groupID := parts[0]

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	group, err := manager.GetGroup(groupID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(group)
}

func handleGroupConsumers(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/groups/"), "/")
	groupID := parts[0]

	if len(parts) >= 3 && parts[1] == "consumers" {
		consumerID := parts[2]

		switch r.Method {
		case "DELETE":
			if err := manager.RemoveConsumer(groupID, consumerID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]string{"status": "removed"})
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	if parts[1] == "consumers" {
		switch r.Method {
		case "POST":
			var req struct {
				ID     string   `json:"id"`
				Topics []string `json:"topics"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := manager.AddConsumer(groupID, req.ID, req.Topics); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"status": "added"})
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	events := manager.GetRebalanceEvents()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events": events,
	})
}

func handleAssignors(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	assignors := manager.GetAssignors()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"assignors": assignors,
	})
}

func handleCustomAssignors(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		assignors := manager.CustomAssignors().List()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"assignors": assignors,
		})
	case "POST":
		var req struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Script      string `json:"script"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		ca, err := manager.CustomAssignors().Create(req.ID, req.Name, req.Description, req.Script)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		manager.RefreshCustomAssignor(req.ID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(ca)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCustomAssignor(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/custom-assignors/")
	parts := strings.Split(path, "/")
	id := parts[0]

	switch r.Method {
	case "GET":
		ca, err := manager.CustomAssignors().Get(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(ca)
	case "PUT":
		var req struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Script      string `json:"script"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		ca, err := manager.CustomAssignors().Update(id, req.Name, req.Description, req.Script)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		manager.RefreshCustomAssignor(id)
		json.NewEncoder(w).Encode(ca)
	case "DELETE":
		if err := manager.CustomAssignors().Delete(id); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		manager.RemoveCustomAssignor(id)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCustomAssignorTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/custom-assignors/")
	parts := strings.Split(path, "/")
	id := parts[0]

	var input types.AssignorTestInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result := manager.CustomAssignors().Test(id, &input)
	json.NewEncoder(w).Encode(result)
}

func handleExportHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/groups/"), "/")
	groupID := parts[0]

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=history-"+groupID+".csv")
		records, err := manager.ExportHistoryCSV(groupID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writer := csv.NewWriter(w)
		writer.WriteAll(records)
		writer.Flush()
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=history-"+groupID+".json")
		data, err := manager.ExportHistoryJSON(groupID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}
}

func handleExportAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=history-all.csv")
		records, err := manager.ExportHistoryCSV("")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writer := csv.NewWriter(w)
		writer.WriteAll(records)
		writer.Flush()
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=history-all.json")
		data, err := manager.ExportHistoryJSON("")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}
}
