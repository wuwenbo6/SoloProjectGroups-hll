package main

import (
	"encoding/json"
	"fip-simulator/pkg/fip"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var (
	simulator *fip.FIPSimulator
	upgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

func main() {
	simulator = fip.NewFIPSimulator()

	simulator.AddVNPort("VN_Port_A", "00:11:22:33:44:55", "20:00:00:11:22:33:44:55", "10:00:00:11:22:33:44:55", 100)
	simulator.AddVNPort("VN_Port_B", "00:11:22:33:44:66", "20:00:00:11:22:33:44:66", "10:00:00:11:22:33:44:66", 200)
	simulator.AddVNPort("VN_Port_C", "00:11:22:33:44:77", "20:00:00:11:22:33:44:77", "10:00:00:11:22:33:44:77", 150)

	simulator.StartFKA()
	simulator.StartVFIDTTLTimer()

	http.HandleFunc("/", serveIndex)
	http.HandleFunc("/api/ports", getPorts)
	http.HandleFunc("/api/ports/add", addPort)
	http.HandleFunc("/api/vlans", getVLANS)
	http.HandleFunc("/api/vlan-discovery", startVLANDiscovery)
	http.HandleFunc("/api/param-exchange", startParamExchange)
	http.HandleFunc("/api/links", getLinks)
	http.HandleFunc("/api/events", getEvents)
	http.HandleFunc("/api/vfid", getVFIDTable)
	http.HandleFunc("/api/vfid/refresh", refreshVFID)
	http.HandleFunc("/api/election", triggerElection)
	http.HandleFunc("/api/sessions", getSessionTable)
	http.HandleFunc("/api/sessions/export/json", exportSessionJSON)
	http.HandleFunc("/api/sessions/export/csv", exportSessionCSV)
	http.HandleFunc("/ws", handleWebSocket)
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	log.Println("FIP Simulator Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "web/index.html")
}

func getPorts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetPorts())
}

func addPort(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		Name     string `json:"name"`
		MAC      string `json:"mac"`
		WWPN     string `json:"wwpn"`
		WWNN     string `json:"wwnn"`
		Priority int    `json:"priority"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	port := simulator.AddVNPort(data.Name, data.MAC, data.WWPN, data.WWNN, data.Priority)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(port)
}

func getVLANS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetVLANS())
}

func startVLANDiscovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		PortID string `json:"portId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := simulator.StartVLANDiscovery(data.PortID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func startParamExchange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		PortID string `json:"portId"`
		PeerID string `json:"peerId"`
		VLANID int    `json:"vlanId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := simulator.StartParameterExchange(data.PortID, data.PeerID, data.VLANID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func getLinks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetVirtualLinks())
}

func getEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetEvents())
}

func getVFIDTable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetVFIDTable())
}

func refreshVFID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		PortID string `json:"portId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := simulator.RefreshVFID(data.PortID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "refreshed"})
}

func triggerElection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	simulator.RunElection()
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "election_triggered"})
}

func getSessionTable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(simulator.GetSessionTable())
}

func exportSessionJSON(w http.ResponseWriter, r *http.Request) {
	data, err := simulator.ExportSessionTableJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=fip_sessions.json")
	w.Write(data)
}

func exportSessionCSV(w http.ResponseWriter, r *http.Request) {
	data, err := simulator.ExportSessionTableCSVBytes()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=fip_sessions.csv")
	w.Write(data)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	eventChan := simulator.GetEventChannel()
	done := make(chan struct{})

	go func() {
		for {
			select {
			case event := <-eventChan:
				data, _ := json.Marshal(event)
				if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
					log.Println("WebSocket write error:", err)
					close(done)
					return
				}
			case <-done:
				return
			}
		}
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			close(done)
			break
		}
	}
}
