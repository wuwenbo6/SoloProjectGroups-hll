package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

var globalServer *Server

type TestRequest struct {
	BlockSize int  `json:"block_size"`
	UseTsize  bool `json:"use_tsize"`
}

type TestResponse struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	ReqBlockSize int   `json:"req_block_size"`
	NegBlockSize int   `json:"neg_block_size"`
	SessionID   string `json:"session_id"`
	TSize       int64  `json:"tsize"`
}

type ConcurrentTestRequest struct {
	NumClients int    `json:"num_clients"`
	Filename   string `json:"filename"`
	BlockSize  int    `json:"block_size"`
	UseTsize   bool   `json:"use_tsize"`
}

type ConcurrentTestResponse struct {
	Success        bool     `json:"success"`
	Message        string   `json:"message"`
	TotalClients   int32    `json:"total_clients"`
	SuccessClients int32    `json:"success_clients"`
	FailedClients  int32    `json:"failed_clients"`
	TotalTransfers int32    `json:"total_transfers"`
	AvgDurationMs  int64    `json:"avg_duration_ms"`
	BlocksSent     int32    `json:"blocks_sent"`
	TotalDuration  int64    `json:"total_duration_ms"`
	Errors         []string `json:"errors"`
}

func StartHTTPServer() {
	http.HandleFunc("/", serveIndex)
	http.HandleFunc("/api/logs", getLogs)
	http.HandleFunc("/api/test", testNegotiation)
	http.HandleFunc("/api/files", listFiles)
	http.HandleFunc("/api/create-test-file", createTestFile)
	http.HandleFunc("/api/concurrent-test", runConcurrentTest)
	http.HandleFunc("/api/sessions", getActiveSessions)

	port := ":8080"
	fmt.Printf("HTTP Server running on http://localhost%s\n", port)
	http.ListenAndServe(port, nil)
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "web/index.html")
}

func getLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GetNegotiationLogs())
}

func testNegotiation(w http.ResponseWriter, r *http.Request) {
	var req TestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	blockSize := DefaultBlockSize
	message := ""

	if req.BlockSize < MinBlockSize {
		blockSize = MinBlockSize
		message = fmt.Sprintf("请求的块大小 %d 过小，使用最小值 %d", req.BlockSize, MinBlockSize)
	} else if req.BlockSize > MaxBlockSize {
		blockSize = MaxBlockSize
		message = fmt.Sprintf("请求的块大小 %d 过大，使用最大值 %d", req.BlockSize, MaxBlockSize)
	} else {
		blockSize = req.BlockSize
		message = fmt.Sprintf("已接受请求的块大小 %d", req.BlockSize)
	}

	var tsize int64 = 0
	if req.UseTsize {
		tsize = 10240
		message += fmt.Sprintf(", tsize %d bytes", tsize)
	}

	logNegotiation("web-test", "test-file.bin", "octet", req.BlockSize, blockSize, true, message)

	resp := TestResponse{
		Success:      true,
		Message:      message,
		ReqBlockSize: req.BlockSize,
		NegBlockSize: blockSize,
		SessionID:    fmt.Sprintf("test-%d", time.Now().Unix()),
		TSize:        tsize,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func runConcurrentTest(w http.ResponseWriter, r *http.Request) {
	var req ConcurrentTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.NumClients <= 0 {
		req.NumClients = 10
	}
	if req.NumClients > 200 {
		req.NumClients = 200
	}
	if req.Filename == "" {
		req.Filename = "medium_test.bin"
	}

	result := ConcurrentTestResponse{
		Success:      true,
		Message:      fmt.Sprintf("并发测试完成: %d 客户端", req.NumClients),
		TotalClients: int32(req.NumClients),
		Errors:       make([]string, 0),
	}

	filename := filepath.Join("tftp_root", req.Filename)
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		result.Success = false
		result.Message = fmt.Sprintf("文件不存在: %s，请先创建测试文件", req.Filename)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
		return
	}

	go func() {
		testResult := RunConcurrentTest(req.NumClients, req.Filename, req.BlockSize, req.UseTsize)
		result.SuccessClients = testResult.SuccessClients
		result.FailedClients = testResult.FailedClients
		result.TotalTransfers = testResult.TotalTransfers
		result.AvgDurationMs = testResult.AvgDuration
		result.BlocksSent = testResult.BlocksSent
		result.TotalDuration = testResult.Duration.Milliseconds()
		result.Errors = testResult.Errors
	}()

	result.Message = fmt.Sprintf("并发测试已启动: %d 客户端正在下载 %s", req.NumClients, req.Filename)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func getActiveSessions(w http.ResponseWriter, r *http.Request) {
	type SessionInfo struct {
		ClientAddr string `json:"client_addr"`
		Filename   string `json:"filename"`
		BlockSize  int    `json:"block_size"`
		BlockNum   uint16 `json:"block_num"`
		IsWrite    bool   `json:"is_write"`
		TSize      int64  `json:"tsize"`
	}

	sessions := make([]SessionInfo, 0)

	if globalServer != nil {
		globalServer.mu.RLock()
		for addr, session := range globalServer.sessions {
			sessions = append(sessions, SessionInfo{
				ClientAddr: addr,
				Filename:   session.Filename,
				BlockSize:  session.BlockSize,
				BlockNum:   session.BlockNum,
				IsWrite:    session.IsWrite,
				TSize:      session.TSize,
			})
		}
		globalServer.mu.RUnlock()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":    len(sessions),
		"sessions": sessions,
	})
}

func listFiles(w http.ResponseWriter, r *http.Request) {
	files, _ := filepath.Glob("tftp_root/*")
	fileInfos := make([]map[string]interface{}, 0)
	for _, f := range files {
		if fi, err := os.Stat(f); err == nil {
			fileInfos = append(fileInfos, map[string]interface{}{
				"name": filepath.Base(f),
				"size": fi.Size(),
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fileInfos)
}

func createTestFile(w http.ResponseWriter, r *http.Request) {
	size := r.URL.Query().Get("size")
	var fileSize int
	var filename string

	switch size {
	case "small":
		fileSize = 1024
		filename = "small_test.bin"
	case "medium":
		fileSize = 10 * 1024
		filename = "medium_test.bin"
	case "large":
		fileSize = 100 * 1024
		filename = "large_test.bin"
	default:
		fileSize = 1024
		filename = "test.bin"
	}

	os.MkdirAll("tftp_root", 0755)
	data := make([]byte, fileSize)
	for i := range data {
		data[i] = byte(i % 256)
	}

	err := os.WriteFile(filepath.Join("tftp_root", filename), data, 0644)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"filename": filename,
		"size":     fileSize,
		"message":  fmt.Sprintf("已创建测试文件: %s (%d KB)", filename, fileSize/1024),
	})
}
