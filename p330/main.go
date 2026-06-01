package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/user/lldp-topology/internal/api"
	"github.com/user/lldp-topology/internal/lldp"
	"github.com/user/lldp-topology/internal/topology"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	iface := flag.String("interface", "en0", "Network interface for LLDP capture")
	simulate := flag.Bool("simulate", true, "Use simulated LLDP data instead of real capture")
	flag.Parse()

	store := topology.NewTopologyStore()
	store.StartCleanupTask()

	var events chan lldp.LLDPEvent
	var stopFn func()

	if *simulate {
		log.Println("Starting LLDP simulator...")
		sim := lldp.NewSimulator()
		events = sim.Events
		stopFn = func() { sim.Stop() }
		sim.Start()
	} else {
		log.Printf("Starting LLDP listener on interface %s...", *iface)
		listener := lldp.NewListener(*iface)
		events = listener.Events
		stopFn = func() { listener.Stop() }
		if err := listener.Start(); err != nil {
			log.Fatalf("Failed to start LLDP listener: %v", err)
		}
	}

	go processEvents(store, events)

	handler := api.NewHandler(store)
	routes := handler.SetupRoutes()

	addr := fmt.Sprintf(":%d", *port)
	server := &http.Server{
		Addr:    addr,
		Handler: routes,
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("HTTP server listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	<-sigCh
	log.Println("Shutting down...")
	stopFn()
	server.Close()
}

func processEvents(store *topology.TopologyStore, events chan lldp.LLDPEvent) {
	for ev := range events {
		log.Printf("LLDP event: chassis=%s port=%s system=%s targetChassis=%s targetPort=%s",
			ev.ChassisID, ev.PortID, ev.SystemName, ev.TargetChassisID, ev.TargetPortID)

		if ev.TargetChassisID != "" {
			store.ProcessLLDPWithTarget(ev, ev.TargetChassisID, ev.TargetPortID)
		} else {
			store.ProcessLLDP(ev)
		}
	}
}
