package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	secret := getEnv("RADIUS_SECRET", "sharedsecret")
	apiPort := getEnv("API_PORT", "8080")

	store := NewSessionStore()
	client := NewCoAClient(secret)

	nasURL := getEnv("NAS_CALLBACK_URL", "http://127.0.0.1:8080/api/internal/session-update")
	notifier := NewNASNotifier(nasURL)
	logger := NewAuthChangeLogger(1000)

	server := NewRADIUSServer(store, secret, notifier, logger)

	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start RADIUS server: %v", err)
	}

	api := NewAPI(store, client, secret, notifier, logger)

	mux := http.NewServeMux()
	api.SetupRoutes(mux)

	fs := http.FileServer(http.Dir("./static"))
	mux.Handle("/", fs)

	addr := fmt.Sprintf(":%s", apiPort)
	log.Printf("API server listening on %s", addr)
	log.Printf("Frontend available at http://localhost%s", addr)
	log.Printf("RADIUS Auth port: 1812, Acct port: 1813, CoA/DM port: 3799")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
