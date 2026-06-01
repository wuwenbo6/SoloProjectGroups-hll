package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"netconf-validator/pkg/netconf"
)

func main() {
	baseDir, _ := os.Getwd()
	modelsDir := filepath.Join(baseDir, "models")
	dataDir := filepath.Join(baseDir, "data")
	staticDir := filepath.Join(baseDir, "static")

	server := netconf.NewServer(modelsDir, dataDir)

	if err := server.LoadModels(); err != nil {
		log.Printf("Warning: failed to load existing models: %v", err)
	}

	if err := server.LoadBaselines(); err != nil {
		log.Printf("Warning: failed to load existing baselines: %v", err)
	}

	mux := http.NewServeMux()

	server.SetupRoutes(mux)

	fs := http.FileServer(http.Dir(staticDir))
	mux.Handle("/", fs)

	port := ":8080"
	fmt.Printf("Netconf Validator Server starting on port %s...\n", port)
	fmt.Printf("Models directory: %s\n", modelsDir)
	fmt.Printf("Static files: %s\n", staticDir)
	fmt.Printf("\nAPI Endpoints:\n")
	fmt.Printf("  POST /api/upload        - Upload YANG model\n")
	fmt.Printf("  POST /api/validate      - Validate data against model\n")
	fmt.Printf("  GET  /api/models        - List available models\n")
	fmt.Printf("  GET  /api/model         - Get model structure\n")
	fmt.Printf("  POST /api/baseline      - Save baseline data\n")
	fmt.Printf("  GET  /api/baseline/get  - Get baseline data\n")
	fmt.Printf("  POST /api/diff          - Compare data with baseline\n")
	fmt.Printf("\nWeb UI: http://localhost%s\n", port)

	if err := http.ListenAndServe(port, mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
