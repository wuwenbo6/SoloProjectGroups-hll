package server

import (
	"encoding/json"
	"log"
	"net/http"
	"nvme-simulator/pkg/nvme"
	"strings"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WebSocketServer struct {
	controller *nvme.Controller
}

func NewWebSocketController(controller *nvme.Controller) *WebSocketServer {
	return &WebSocketServer{
		controller: controller,
	}
}

func (s *WebSocketServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("Client connected: %s", conn.RemoteAddr().String())

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			log.Printf("Client disconnected: %s", conn.RemoteAddr().String())
			break
		}

		var wsCmd nvme.WebSocketCommand
		if err := json.Unmarshal(message, &wsCmd); err != nil {
			log.Printf("Failed to parse command: %v", err)
			resp := nvme.WebSocketResponse{
				Type:  "error",
				Error: "Invalid command format: " + err.Error(),
			}
			sendResponse(conn, resp)
			continue
		}

		log.Printf("Received command: Type=%s, Opcode=0x%02x (%s)",
			wsCmd.Type, wsCmd.Command.Opcode, s.controller.OpcodeToString(wsCmd.Command.Opcode))

		if wsCmd.Command.CID == 0 {
			wsCmd.Command.CID = s.controller.GetNextCID()
		}

		resp := s.controller.ProcessCommand(&wsCmd.Command)

		wsResp := nvme.WebSocketResponse{
			Type:     "response",
			Response: *resp,
		}

		log.Printf("Sent response: %s, Status=%s",
			resp.String(), s.controller.StatusToString(resp.Status))

		sendResponse(conn, wsResp)
	}
}

func sendResponse(conn *websocket.Conn, resp nvme.WebSocketResponse) {
	message, err := json.Marshal(resp)
	if err != nil {
		log.Printf("Failed to marshal response: %v", err)
		return
	}

	if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
		log.Printf("Failed to write message: %v", err)
	}
}

func (s *WebSocketServer) HandleStatus(w http.ResponseWriter, r *http.Request) {
	smart := s.controller.GetSMARTData()
	ns := s.controller.GetNamespace(1)

	status := map[string]interface{}{
		"controller": map[string]interface{}{
			"serial_number":    strings.TrimRight(s.controller.GetIdentifyData().SerialNumber(), " "),
			"model_number":     strings.TrimRight(s.controller.GetIdentifyData().ModelNumber(), " "),
			"firmware_rev":     strings.Trim(s.controller.GetIdentifyData().FirmwareRevision(), "\x00 "),
			"version":          s.controller.GetIdentifyData().VER,
		},
		"smart": map[string]interface{}{
			"critical_warning":         smart.CriticalWarning,
			"temperature":              smart.Temperature,
			"available_spare":          smart.AvailableSpare,
			"available_spare_threshold": smart.AvailableSpareThreshold,
			"percentage_used":          smart.PercentageUsed,
			"data_units_read":          nvme.GetInt128(smart.DataUnitsRead[:]),
			"data_units_written":       nvme.GetInt128(smart.DataUnitsWritten[:]),
			"host_read_commands":       nvme.GetInt128(smart.HostReadCommands[:]),
			"host_write_commands":      nvme.GetInt128(smart.HostWriteCommands[:]),
			"controller_busy_time":     nvme.GetInt128(smart.ControllerBusyTime[:]),
			"power_cycles":             nvme.GetInt128(smart.PowerCycles[:]),
			"power_on_hours":           nvme.GetInt128(smart.PowerOnHours[:]),
			"unsafe_shutdowns":         nvme.GetInt128(smart.UnsafeShutdowns[:]),
			"media_errors":             nvme.GetInt128(smart.MediaErrors[:]),
			"num_err_log_entries":      nvme.GetInt128(smart.NumErrLogEntries[:]),
		},
		"namespace": map[string]interface{}{
			"id":   1,
			"size": ns.Size,
			"lba_count": ns.Size / nvme.SectorSize,
			"lba_size":  nvme.SectorSize,
		},
		"io_submission_queues": s.controller.GetIOSubmissionQueues(),
		"io_completion_queues": s.controller.GetIOCompletionQueues(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func (s *WebSocketServer) HandleIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "web/index.html")
}
