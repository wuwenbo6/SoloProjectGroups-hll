package main

import (
	"alwayson-ag-simulator/internal/ag"
	"alwayson-ag-simulator/internal/api"
	"alwayson-ag-simulator/internal/listener"
	replicaServer "alwayson-ag-simulator/internal/replica"
	"alwayson-ag-simulator/internal/web"
	"fmt"
	"log"
	"net/http"
	"sync"
)

func main() {
	agManager := ag.NewAvailabilityGroup()

	agManager.AddReplica("replica-1", "127.0.0.1", 8081, ag.SynchronousCommit)
	agManager.AddReplica("replica-2", "127.0.0.1", 8082, ag.SynchronousCommit)
	agManager.AddReplica("replica-3", "127.0.0.1", 8083, ag.AsynchronousCommit)

	agManager.SetPrimary("replica-1")

	var wg sync.WaitGroup

	go agManager.StartSyncLoop()

	replicaConfigs := []struct {
		name string
		port int
	}{
		{"replica-1", 8081},
		{"replica-2", 8082},
		{"replica-3", 8083},
	}

	for _, rc := range replicaConfigs {
		rs, err := replicaServer.NewServer(agManager, rc.name, "127.0.0.1", rc.port)
		if err != nil {
			log.Printf("Failed to create replica server for %s: %v", rc.name, err)
			continue
		}
		wg.Add(1)
		go func(name string, port int, s *replicaServer.ReplicaServer) {
			defer wg.Done()
			log.Printf("Replica Server %s starting on 127.0.0.1:%d...", name, port)
			if err := s.Start(); err != nil && err != http.ErrServerClosed {
				log.Printf("Replica Server %s error: %v", name, err)
			}
		}(rc.name, rc.port, rs)
	}

	agListener := listener.NewListener(agManager, "127.0.0.1", 8080)
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Printf("Virtual Listener starting on %s:%d...", agListener.Host, agListener.Port)
		if err := agListener.Start(); err != nil && err != http.ErrServerClosed {
			log.Printf("Listener error: %v", err)
		}
	}()

	apiServer := api.NewServer(agManager, "127.0.0.1", 8084)
	apiServer.SetListener(agListener)
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Printf("API Server starting on %s:%d...", apiServer.Host, apiServer.Port)
		if err := apiServer.Start(); err != nil && err != http.ErrServerClosed {
			log.Printf("API Server error: %v", err)
		}
	}()

	webServer := web.NewServer(agManager, "127.0.0.1", 8085)
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Printf("Web Dashboard starting on http://%s:%d...", webServer.Host, webServer.Port)
		if err := webServer.Start(); err != nil && err != http.ErrServerClosed {
			log.Printf("Web Server error: %v", err)
		}
	}()

	fmt.Println("\n========================================")
	fmt.Println("AlwaysOn AG Simulator Started")
	fmt.Println("========================================")
	fmt.Printf("Virtual Listener: %s:%d\n", "127.0.0.1", 8080)
	fmt.Printf("API Server:       http://%s:%d\n", "127.0.0.1", 8084)
	fmt.Printf("Web Dashboard:    http://%s:%d\n", "127.0.0.1", 8085)
	fmt.Println("========================================")
	fmt.Println("Endpoints:")
	fmt.Println("  GET  /api/status          - Get AG status")
	fmt.Println("  POST /api/failover/:name  - Failover to replica")
	fmt.Println("  GET  /api/health          - Health check")
	fmt.Println("========================================")

	wg.Wait()
}
