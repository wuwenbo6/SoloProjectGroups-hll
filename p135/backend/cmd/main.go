package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sflow-analyzer/internal/anomaly"
	"sflow-analyzer/internal/api"
	"sflow-analyzer/internal/bgp"
	"sflow-analyzer/internal/report"
	"sflow-analyzer/internal/sflow"
	"sflow-analyzer/internal/storage"
	"sflow-analyzer/internal/stream"
	"sflow-analyzer/pkg/types"
)

func main() {
	sflowAddr := flag.String("sflow-addr", ":6343", "sFlow UDP listen address")
	httpAddr := flag.String("http-addr", ":8080", "HTTP API listen address")
	dbPath := flag.String("db", "./sflow.db", "SQLite database path")
	reportDir := flag.String("report-dir", "./reports", "Report output directory")
	windowDuration := flag.Duration("window", 5*time.Second, "Sliding window duration")
	maxWindows := flag.Int("windows", 60, "Maximum number of windows to keep")
	topN := flag.Int("topn", 10, "Number of top entries to track")
	enableMock := flag.Bool("mock", true, "Enable mock data generator")
	enableDetection := flag.Bool("detection", true, "Enable anomaly detection")
	flag.Parse()

	receiver := sflow.NewReceiver()
	if err := receiver.Start(*sflowAddr); err != nil {
		log.Fatalf("Failed to start sFlow receiver: %v", err)
	}
	defer receiver.Stop()

	asnResolver := sflow.NewASNResolver()
	store, err := storage.NewStorage(*dbPath, asnResolver)
	if err != nil {
		log.Fatalf("Failed to create storage: %v", err)
	}
	defer store.Stop()
	store.Start()

	processorChan := make(chan types.FlowRecord, 10000)
	processor := stream.NewProcessor(processorChan, receiver, *windowDuration, *maxWindows, *topN)
	processor.Start()
	defer processor.Stop()

	detector := anomaly.NewDetector(anomaly.DefaultConfig())
	if *enableDetection {
		detector.Start()
	}

	bgpLookup := bgp.NewBGPLookup()

	reportGen := report.NewGenerator(*reportDir)

	go func() {
		for record := range receiver.FlowChannel() {
			store.Store(record)
			select {
			case processorChan <- record:
			default:
			}
			if *enableDetection {
				detector.ProcessRecord(record)
			}
		}
		close(processorChan)
	}()

	server := api.NewServer(receiver, processor, store, detector, bgpLookup, reportGen)

	if *enableMock {
		server.StartMockGenerator()
	}

	go func() {
		if err := server.Start(*httpAddr); err != nil {
			log.Fatalf("Failed to start API server: %v", err)
		}
	}()

	log.Println("========================================")
	log.Println("sFlow Traffic Analyzer started")
	log.Println("========================================")
	log.Printf("sFlow listener: %s", *sflowAddr)
	log.Printf("HTTP API:       %s", *httpAddr)
	log.Printf("Database:       %s", *dbPath)
	log.Printf("Report dir:     %s", *reportDir)
	log.Printf("Window:         %s x %d", *windowDuration, *maxWindows)
	log.Printf("Top N:          %d", *topN)
	log.Printf("Mock data:      %v", *enableMock)
	log.Printf("DDoS detection: %v", *enableDetection)
	log.Println("========================================")
	log.Println("Press Ctrl+C to stop")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("\nShutting down...")
}
