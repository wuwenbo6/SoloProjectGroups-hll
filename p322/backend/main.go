package main

import (
	"log"
	"net/http"

	"mdns-reflector/api"
	"mdns-reflector/reflector"
)

func main() {
	engine := reflector.NewEngine()
	engine.Start()
	defer engine.Stop()

	hub := api.NewHub(engine.GetBus())
	go hub.Run()

	handler := api.NewHandler(engine)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/subnets", handler.GetSubnets)
	mux.HandleFunc("GET /api/subnets/{subnetId}/services", handler.GetServices)
	mux.HandleFunc("GET /api/services", handler.GetServices)
	mux.HandleFunc("GET /api/services/export", handler.ExportServices)
	mux.HandleFunc("GET /api/services/{serviceId}/records", handler.GetRecords)
	mux.HandleFunc("PATCH /api/services/{serviceId}/auth", handler.SetServiceAuthorized)
	mux.HandleFunc("GET /api/reflector/status", handler.GetReflectorStatus)
	mux.HandleFunc("GET /api/stats/services", handler.GetServiceStats)
	mux.HandleFunc("GET /api/auth/policy", handler.GetAuthPolicy)
	mux.HandleFunc("PUT /api/auth/policy", handler.UpdateAuthPolicy)
	mux.HandleFunc("GET /api/ws", api.HandleWS(hub))

	fs := http.FileServer(http.Dir("./dist"))
	mux.Handle("/", fs)

	corsMux := corsMiddleware(mux)

	log.Println("mDNS Reflector starting on :8199")
	log.Fatal(http.ListenAndServe(":8199", corsMux))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
