package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"grpc-invoker/backend/grpcutil"
	"grpc-invoker/backend/handler"
)

func main() {
	port := "8080"
	if envPort := os.Getenv("BACKEND_PORT"); envPort != "" {
		port = envPort
	}

	dataDir := filepath.Join(os.TempDir(), "grpc-invoker-data")
	if err := grpcutil.InitTestCaseStore(dataDir); err != nil {
		fmt.Fprintf(os.Stderr, "failed to init test case store: %v\n", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/connect", handler.HandleConnect)
	mux.HandleFunc("/api/services", handler.HandleServices)
	mux.HandleFunc("/api/invoke", handler.HandleInvoke)
	mux.HandleFunc("/api/schema", handler.HandleSchema)
	mux.HandleFunc("/api/cache/refresh", handleCacheRefresh)
	mux.HandleFunc("/api/cache/clear", handleCacheClear)
	mux.HandleFunc("/api/cache/stats", handleCacheStats)

	mux.HandleFunc("/api/testcases", handler.HandleTestCaseList)
	mux.HandleFunc("/api/testcases/save", handler.HandleTestCaseSave)
	mux.HandleFunc("/api/testcases/delete", handler.HandleTestCaseDelete)

	mux.HandleFunc("/api/proto/export", handler.HandleProtoExport)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	log.Printf("gRPC Invoker backend starting on port %s...", port)
	log.Printf("Data directory: %s", dataDir)
	log.Printf("API Endpoints:")
	log.Printf("  POST /api/connect       - Connect to gRPC server and list services")
	log.Printf("  POST /api/services      - Get methods for a service")
	log.Printf("  POST /api/invoke        - Invoke a gRPC method")
	log.Printf("  POST /api/schema        - Get JSON template for a method")
	log.Printf("  POST /api/cache/refresh - Refresh service cache")
	log.Printf("  POST /api/cache/clear   - Clear all cache")
	log.Printf("  GET  /api/cache/stats   - Get cache statistics")
	log.Printf("  GET  /api/testcases     - List saved test cases")
	log.Printf("  POST /api/testcases/save   - Save a test case")
	log.Printf("  POST /api/testcases/delete - Delete a test case")
	log.Printf("  POST /api/proto/export  - Export proto file source")

	if err := server.ListenAndServe(); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func handleCacheRefresh(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req struct {
		Address string `json:"address"`
		TLS     bool   `json:"tls"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Address != "" {
		grpcutil.InvalidateCache(req.Address, req.TLS)
	} else {
		grpcutil.InvalidateAllCache()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleCacheClear(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	grpcutil.InvalidateAllCache()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleCacheStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(grpcutil.GetCacheStats()))
}
