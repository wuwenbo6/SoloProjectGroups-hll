package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stun-bench/loadgen"
	"stun-bench/stats"
	"stun-bench/web"
)

func main() {
	serverAddr := flag.String("addr", "stun.l.google.com:19302", "STUN/TURN server address (host:port)")
	mode := flag.String("mode", "stun", "Bench mode: stun (Binding) or turn (Allocation)")
	clients := flag.Int("clients", 100, "Number of concurrent clients (non-DDoS mode)")
	rate := flag.Int("rate", 10, "Requests per second per client")
	duration := flag.Duration("duration", 0, "Test duration (0 = run until Ctrl+C)")
	timeout := flag.Duration("timeout", 3*time.Second, "Per-request timeout")
	username := flag.String("user", "", "TURN username (for turn mode)")
	password := flag.String("pass", "", "TURN password (for turn mode)")
	realm := flag.String("realm", "", "TURN realm (for turn mode, optional)")
	ddos := flag.Bool("ddos", false, "Enable DDoS mode: continuous new connections")
	connRate := flag.Int("conn-rate", 100, "New connections per second (DDoS mode)")
	httpAddr := flag.String("http", ":8080", "HTTP dashboard address")
	interval := flag.Duration("interval", 1*time.Second, "Stats snapshot interval")
	flag.Parse()

	fmt.Println("╔══════════════════════════════════════════════╗")
	fmt.Println("║          STUN/TURN Bench Tool                ║")
	fmt.Println("╚══════════════════════════════════════════════╝")
	fmt.Printf("  Mode:        %s\n", *mode)
	if *ddos {
		fmt.Printf("  DDoS Mode:   ON (conn/s: %d)\n", *connRate)
	} else {
		fmt.Printf("  Clients:     %d\n", *clients)
	}
	fmt.Printf("  Server:      %s\n", *serverAddr)
	if *mode == "turn" && *username != "" {
		fmt.Printf("  Username:    %s\n", *username)
	}
	fmt.Printf("  Rate/Client: %d rps\n", *rate)
	fmt.Printf("  Timeout:     %s\n", *timeout)
	fmt.Printf("  Dashboard:   http://localhost%s\n", *httpAddr)
	fmt.Println()

	collector := stats.NewCollector()

	cfg := loadgen.Config{
		ServerAddr: *serverAddr,
		NumClients: *clients,
		RatePerSec: *rate,
		Duration:   *duration,
		Timeout:    *timeout,
		Mode:       *mode,
		Username:   *username,
		Password:   *password,
		Realm:      *realm,
		DDoS:       *ddos,
		ConnRate:   *connRate,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	generator := loadgen.New(cfg, collector)
	generator.Start(ctx)

	hub := web.NewHub()
	go hub.Run()

	srv := &web.Server{
		Collector: collector,
		Hub:       hub,
		Interval:  *interval,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", srv.HandleWS)
	mux.HandleFunc("/api/stats", srv.HandleStatsAPI)
	mux.HandleFunc("/api/histogram", srv.HandleHistogramAPI)
	mux.HandleFunc("/api/start", srv.HandleStart)
	mux.HandleFunc("/api/stop", srv.HandleStop)
	mux.HandleFunc("/", srv.HandleDashboard)

	httpServer := &http.Server{
		Addr:    *httpAddr,
		Handler: mux,
	}

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	go srv.StatsLoop(ctx)

	go func() {
		generator.Wait()
		cancel()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
		fmt.Println("\nShutdown signal received...")
		generator.Stop()
	case <-ctx.Done():
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	httpServer.Shutdown(shutdownCtx)

	printFinalReport(collector)
}

func printFinalReport(c *stats.Collector) {
	snap := c.Snapshot()
	fmt.Println("\n══════════════════════════════════════════════")
	fmt.Println("             Final Report")
	fmt.Println("══════════════════════════════════════════════")
	fmt.Printf("  Total Requests:  %d\n", snap.TotalRequests)
	fmt.Printf("  Total Success:   %d\n", snap.TotalSuccess)
	fmt.Printf("  Total Errors:    %d\n", snap.TotalErrors)
	fmt.Printf("  Total Conns:     %d\n", snap.TotalConns)
	if snap.TotalRequests > 0 {
		fmt.Printf("  Success Rate:    %.2f%%\n", float64(snap.TotalSuccess)/float64(snap.TotalRequests)*100)
		fmt.Printf("  Error Rate:      %.2f%%\n", float64(snap.TotalErrors)/float64(snap.TotalRequests)*100)
	}
	fmt.Printf("  Avg Latency:     %.2f ms\n", snap.AvgLatencyMs)
	fmt.Printf("  P50 Latency:     %.2f ms\n", snap.P50LatencyMs)
	fmt.Printf("  P95 Latency:     %.2f ms\n", snap.P95LatencyMs)
	fmt.Printf("  P99 Latency:     %.2f ms\n", snap.P99LatencyMs)
	fmt.Println("══════════════════════════════════════════════")
}
