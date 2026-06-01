package input

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"go.uber.org/zap"

	"log-analyzer/internal/es"
	"log-analyzer/internal/models"
)

type WinlogServer struct {
	port   int
	es     *es.Client
	logger *zap.Logger
}

func NewWinlogServer(port int, esClient *es.Client, logger *zap.Logger) *WinlogServer {
	return &WinlogServer{
		port:   port,
		es:     esClient,
		logger: logger,
	}
}

func (w *WinlogServer) Start() error {
	http.HandleFunc("/winlog", w.handleWinlog)

	go func() {
		addr := fmt.Sprintf("0.0.0.0:%d", w.port)
		w.logger.Info("Winlog HTTP endpoint started", zap.String("addr", addr))
		if err := http.ListenAndServe(addr, nil); err != nil {
			w.logger.Error("Winlog server error", zap.Error(err))
		}
	}()

	return nil
}

func (w *WinlogServer) handleWinlog(resp http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		resp.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		resp.WriteHeader(http.StatusBadRequest)
		return
	}

	var entries []map[string]interface{}
	if err := json.Unmarshal(body, &entries); err != nil {
		var singleEntry map[string]interface{}
		if err := json.Unmarshal(body, &singleEntry); err != nil {
			resp.WriteHeader(http.StatusBadRequest)
			return
		}
		entries = []map[string]interface{}{singleEntry}
	}

	for _, entryData := range entries {
		logEntry := w.parseWinlogEntry(entryData)
		if err := w.es.IndexDocument("logs", logEntry.ID, logEntry); err != nil {
			w.logger.Error("Failed to index winlog entry", zap.Error(err))
		}
	}

	resp.WriteHeader(http.StatusOK)
	resp.Write([]byte(`{"status":"ok"}`))
}

func (w *WinlogServer) parseWinlogEntry(data map[string]interface{}) *models.LogEntry {
	entry := models.NewLogEntry()
	entry.Source = "winlog"

	if winlog, ok := data["winlog"].(map[string]interface{}); ok {
		if eventID, ok := winlog["event_id"].(string); ok {
			entry.Fields["event_id"] = eventID
		}
		if channel, ok := winlog["channel"].(string); ok {
			entry.Facility = channel
		}
		if computer, ok := winlog["computer_name"].(string); ok {
			entry.Hostname = computer
		}
	}

	if message, ok := data["message"].(string); ok {
		entry.Message = message
	}

	if level, ok := data["log_level"].(string); ok {
		entry.Severity = level
	}

	if raw, err := json.Marshal(data); err == nil {
		entry.Raw = string(raw)
	}

	return entry
}
