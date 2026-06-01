package main

import (
	"fmt"
	"log"
	"net/http"

	"dht-krpc-simulator/api"
	"dht-krpc-simulator/dht"
)

func main() {
	node, err := dht.NewDHTNode(9301)
	if err != nil {
		log.Fatalf("Failed to create DHT node: %v", err)
	}

	simulator := dht.NewSimulator(9401)

	if err := node.Start(); err != nil {
		log.Fatalf("Failed to start DHT node: %v", err)
	}

	handler := api.NewHandler(node, simulator)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"service":"dht-krpc-simulator","node_id":"%s","status":"running"}`, node.ID.String())
	})

	port := 9300
	log.Printf("Starting API server on :%d", port)
	log.Printf("DHT Node ID: %s", node.ID.String())
	log.Printf("DHT Node listening on :9301")
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
