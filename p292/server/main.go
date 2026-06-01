package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	cache := NewBindingCache()
	logger := NewEventLogger()
	tunnels := NewTunnelManager()
	history := NewHistoryManager()
	srv := NewServer(cache, logger, tunnels, history)

	r := mux.NewRouter()
	r.Use(corsMiddleware)

	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/pbu", srv.HandlePBU).Methods(http.MethodPost, http.MethodOptions)
	api.HandleFunc("/bce", srv.HandleGetBCE).Methods(http.MethodGet, http.MethodOptions)
	api.HandleFunc("/events", srv.HandleGetEvents).Methods(http.MethodGet, http.MethodOptions)
	api.HandleFunc("/tunnels", srv.HandleGetTunnels).Methods(http.MethodGet, http.MethodOptions)
	api.HandleFunc("/history", srv.HandleGetHistory).Methods(http.MethodGet, http.MethodOptions)
	api.HandleFunc("/history/export", srv.HandleExportHistory).Methods(http.MethodGet, http.MethodOptions)

	log.Println("LMA server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
