package main

import (
	"fmt"
	"lma/internal/cache"
	"lma/internal/handler"
	"log"
	"net/http"
	"time"
)

func main() {
	bindingCache := cache.NewBindingCache()
	h := handler.NewHandler(bindingCache)

	go startCleanupWorker(bindingCache)

	mux := http.NewServeMux()
	mux.HandleFunc("/pbu", enableCORS(h.HandlePBU))
	mux.HandleFunc("/bindings", enableCORS(h.GetBindings))
	mux.HandleFunc("/convert", enableCORS(h.HandleImageConvert))
	mux.HandleFunc("/convert/batch", enableCORS(h.HandleBatchConvert))
	mux.HandleFunc("/formats", enableCORS(h.HandleFormats))
	mux.HandleFunc("/", h.ServeStatic)

	fmt.Println("LMA (Local Mobility Anchor) server starting on :8080")
	fmt.Println("POST /pbu          - Process Proxy Binding Update")
	fmt.Println("GET  /bindings     - Get all binding cache entries")
	fmt.Println("POST /convert      - Convert single image (png/jpeg/avif/jxl)")
	fmt.Println("POST /convert/batch - Batch convert images, ZIP download")
	fmt.Println("GET  /formats      - List available output formats")
	fmt.Println("GET  /             - View binding cache dashboard")

	log.Fatal(http.ListenAndServe(":8080", mux))
}

func startCleanupWorker(bc *cache.BindingCache) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		bc.CleanupExpired()
	}
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}
