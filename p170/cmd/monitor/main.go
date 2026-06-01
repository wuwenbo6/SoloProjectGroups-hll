package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"stun-turn-monitor/internal/alert"
	"stun-turn-monitor/internal/config"
	"stun-turn-monitor/internal/scraper"
	"stun-turn-monitor/internal/server"
	"stun-turn-monitor/internal/store"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	store := store.New(cfg.InfluxDB.URL, cfg.InfluxDB.Token, cfg.InfluxDB.Org, cfg.InfluxDB.Bucket)
	defer store.Close()

	var alertMgr *alert.AlertManager
	if cfg.Alert.Enabled {
		var rules []alert.AlertRule
		for _, r := range cfg.Alert.Rules {
			rules = append(rules, alert.AlertRule{
				ServerName:      r.ServerName,
				SessionThreshold: r.SessionThreshold,
				Level:           alert.AlertLevel(r.Level),
				Duration:        r.Duration,
				Cooldown:        r.Cooldown,
			})
		}
		alertMgr = alert.NewManager(rules, cfg.Alert.MaxAlerts)
		log.Printf("alert manager enabled with %d rules", len(rules))
	}

	scraperMgr := scraper.NewManager(cfg, store, alertMgr)
	handler := server.NewHandler(store, alertMgr)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go scraperMgr.Start(ctx)

	mux := http.NewServeMux()
	mux.Handle("/api/", handler)

	if cfg.Frontend.Enable {
		fs := http.FileServer(http.Dir(cfg.Frontend.StaticDir))
		mux.Handle("/", fs)
	}

	srv := &http.Server{
		Addr:    cfg.Server.ListenAddr,
		Handler: mux,
	}

	go func() {
		log.Printf("server starting on %s", cfg.Server.ListenAddr)
		log.Printf("InfluxDB: %s (org: %s, bucket: %s)", cfg.InfluxDB.URL, cfg.InfluxDB.Org, cfg.InfluxDB.Bucket)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("shutting down...")
	cancel()
	store.Flush()
	srv.Shutdown(context.Background())
}
