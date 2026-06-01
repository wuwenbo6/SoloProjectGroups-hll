package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"sip-detector/api"
	"sip-detector/blocker"
	"sip-detector/capture"
	"sip-detector/detector"
	"sip-detector/geo"
	"sip-detector/logger"
	"sip-detector/types"
)

var (
	device         = flag.String("device", "en0", "Network interface to capture packets")
	threshold      = flag.Float64("threshold", 10.0, "Alert threshold (weighted requests per second)")
	window         = flag.Int("window", 5, "Time window in seconds (default: 5)")
	apiAddr        = flag.String("api", ":8080", "API server address")
	cityDB         = flag.String("city-db", "", "Path to MaxMind City DB file")
	asnDB          = flag.String("asn-db", "", "Path to MaxMind ASN DB file")
	listDevices    = flag.Bool("list-devices", false, "List available network devices")
	frontendDir    = flag.String("frontend", "../frontend", "Path to frontend directory")
	refreshWeight  = flag.Float64("refresh-weight", 0.3, "Weight for refresh registrations (default: 0.3)")
	autoBlock      = flag.Bool("auto-block", true, "Enable automatic IP blocking")
	blockDuration  = flag.Int("block-duration", 3600, "Block duration in seconds (default: 3600)")
	useIptables    = flag.Bool("use-iptables", false, "Use iptables for blocking (requires root)")
	logDir         = flag.String("log-dir", "./logs", "Directory for log exports")
	maxLogs        = flag.Int("max-logs", 10000, "Maximum number of logs to keep in memory")
)

func main() {
	flag.Parse()

	if *listDevices {
		devices, err := capture.ListDevices()
		if err != nil {
			log.Fatalf("Failed to list devices: %v", err)
		}
		fmt.Println("Available network devices:")
		for i, dev := range devices {
			ips := ""
			for _, addr := range dev.Addresses {
				ips += addr.IP.String() + " "
			}
			fmt.Printf("  %d: %s - %s (%s)\n", i, dev.Name, dev.Description, ips)
		}
		return
	}

	fmt.Println("=" + strings.Repeat("=", 58))
	fmt.Println("  SIP REGISTER Flood Detector")
	fmt.Println("=" + strings.Repeat("=", 58))
	fmt.Printf("  Device:         %s\n", *device)
	fmt.Printf("  Threshold:      %.1f weighted req/s\n", *threshold)
	fmt.Printf("  Window:         %d s\n", *window)
	fmt.Printf("  Slide Interval: 1 s\n", )
	fmt.Printf("  Refresh Weight: %.1f\n", *refreshWeight)
	fmt.Printf("  Auto Block:     %v\n", *autoBlock)
	fmt.Printf("  Block Duration: %d s\n", *blockDuration)
	fmt.Printf("  Use iptables:   %v\n", *useIptables)
	fmt.Printf("  Log Directory:  %s\n", *logDir)
	fmt.Printf("  API Server:     %s\n", *apiAddr)
	if *cityDB != "" {
		fmt.Printf("  City DB:        %s\n", *cityDB)
	}
	if *asnDB != "" {
		fmt.Printf("  ASN DB:         %s\n", *asnDB)
	}
	fmt.Println("=" + strings.Repeat("=", 58))
	fmt.Println()

	var geoLookup *geo.GeoLookup
	var err error
	if *cityDB != "" || *asnDB != "" {
		geoLookup, err = geo.NewGeoLookup(*cityDB, *asnDB)
		if err != nil {
			log.Printf("Warning: Failed to initialize GeoIP: %v", err)
			log.Println("Will use online IP lookup service")
			geoLookup, _ = geo.NewGeoLookup("", "")
		} else {
			log.Println("GeoIP initialized successfully")
		}
	} else {
		log.Println("No GeoIP database provided, will use online IP lookup service")
		geoLookup, _ = geo.NewGeoLookup("", "")
	}
	if geoLookup != nil {
		defer geoLookup.Close()
	}

	det := detector.NewDetector(*threshold, *window)
	det.SetRefreshWeight(*refreshWeight)
	if geoLookup != nil {
		det.SetGeoLookup(func(ip string) (*types.GeoInfo, error) {
			return geoLookup.Lookup(ip)
		})
	}
	det.StartCleanupLoop()
	defer det.Stop()

	blk := blocker.NewBlocker(*autoBlock, time.Duration(*blockDuration)*time.Second, *useIptables)

	atkLogger := logger.NewAttackLogger(*logDir, *maxLogs)

	det.SetOnAlertCallback(func(alert *types.AlertEvent) {
		atkLogger.AddLog("alert", alert.IP, "SIP flood detected", alert.Rate, alert.WeightedRate, alert.GeoInfo, map[string]interface{}{
			"count":          alert.Count,
			"weighted_count": alert.WeightedCount,
			"initial_count": alert.InitialCount,
			"refresh_count": alert.RefreshCount,
			"threshold":    alert.Threshold,
		})

		if *autoBlock {
			reason := fmt.Sprintf("SIP flood: %.2f weighted req/s (threshold: %.2f)", alert.WeightedRate, alert.Threshold)
			if _, err := blk.BlockIP(alert.IP, reason, alert.Rate, alert.WeightedRate, alert.GeoInfo, false); err == nil {
				atkLogger.AddLog("block", alert.IP, "Auto-blocked due to SIP flood", alert.Rate, alert.WeightedRate, alert.GeoInfo, nil)
			}
		}
	})

	go func() {
		for alert := range det.AlertChan() {
			geoStr := ""
			if alert.GeoInfo != nil {
				if alert.GeoInfo.Country != "" {
					geoStr = fmt.Sprintf(" [%s, %s]", alert.GeoInfo.City, alert.GeoInfo.Country)
				}
			}
			log.Printf("ALERT: %s - %.2f weighted req/s (raw: %.2f)%s", alert.IP, alert.WeightedRate, alert.Rate, geoStr)
		}
	}()

	cap := capture.NewSIPCapture(*device)
	if err := cap.Start(); err != nil {
		log.Fatalf("Failed to start capture: %v", err)
	}
	defer cap.Stop()

	go func() {
		for reg := range cap.RegisterChan {
			det.Process(reg)
		}
	}()

	server := api.NewServer(*apiAddr, det, blk, atkLogger)

	go func() {
		feDir, _ := filepath.Abs(*frontendDir)
		if _, err := os.Stat(feDir); err == nil {
			fs := http.FileServer(http.Dir(feDir))
			http.Handle("/frontend/", http.StripPrefix("/frontend/", fs))
			log.Printf("Serving frontend from %s", feDir)
		}

		if err := server.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("\nPress Ctrl+C to stop...")
	fmt.Println()

	<-sigChan
	fmt.Println()
	log.Println("Shutting down...")

	server.Stop()
	cap.Stop()
	det.Stop()

	log.Println("Stopped gracefully")
}
