package main

import (
	"flag"
	"log"
	"net/http"

	"l2tpv3-manager/api"
	"l2tpv3-manager/l2tp"

	"github.com/gorilla/mux"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP server listen address")
	nullDP := flag.Bool("null-dataplane", true, "Use null data plane (for development on non-Linux systems)")
	flag.Parse()

	manager, err := l2tp.NewManager(*nullDP)
	if err != nil {
		log.Fatalf("Failed to create L2TP manager: %v", err)
	}
	defer manager.Close()

	if manager.IsNullDataPlane() {
		log.Println("INFO: Using null data plane (simulation mode)")
	} else {
		log.Println("INFO: Using Linux kernel L2TP data plane via netlink")
	}

	handler := api.NewHandler(manager)

	r := mux.NewRouter()
	handler.RegisterRoutes(r)

	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./web")))

	log.Printf("INFO: Starting L2TPv3 Manager on %s", *addr)
	log.Printf("INFO: Open http://localhost%s in your browser", *addr)

	if err := http.ListenAndServe(*addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
