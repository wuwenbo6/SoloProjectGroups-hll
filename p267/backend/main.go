package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	ospf "ospfv3-simulator/ospf"
	ws "ospfv3-simulator/websocket"
)

func main() {
	engine := ospf.NewEngine()
	hub := ws.NewHub(engine)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)

	distDir := "./dist"
	if _, err := os.Stat(distDir); err == nil {
		fileServer := http.FileServer(http.Dir(distDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" {
				r.URL.Path = "/index.html"
			}
			w.Header().Set("Cache-Control", "no-cache")
			fileServer.ServeHTTP(w, r)
		})
		log.Printf("Serving frontend from %s", distDir)
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprintln(w, "OSPFv3 Simulator Backend - Run frontend with: npm run dev")
		})
		log.Printf("No frontend dist found, API-only mode")
	}

	addr := ":8080"
	log.Printf("OSPFv3 Simulator starting on http://localhost%s", addr)
	log.Printf("WebSocket endpoint: ws://localhost%s/ws", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server error:", err)
	}
}
