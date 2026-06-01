package scraper

import (
	"context"
	"log"
	"sync"
	"time"

	"stun-turn-monitor/internal/alert"
	"stun-turn-monitor/internal/config"
	"stun-turn-monitor/internal/store"
)

type Manager struct {
	scrapers []Scraper
	store    *store.Store
	alertMgr *alert.AlertManager
	interval time.Duration
}

func NewManager(cfg *config.Config, s *store.Store, alertMgr *alert.AlertManager) *Manager {
	var scrapers []Scraper
	for _, serverCfg := range cfg.StunServers {
		switch serverCfg.Type {
		case "api":
			scrapers = append(scrapers, NewAPIScraper(serverCfg))
		case "log":
			scrapers = append(scrapers, NewLogScraper(serverCfg))
		default:
			log.Printf("unknown scraper type: %s for server %s", serverCfg.Type, serverCfg.Name)
		}
	}

	return &Manager{
		scrapers: scrapers,
		store:    s,
		alertMgr: alertMgr,
		interval: cfg.Server.ScrapeInterval,
	}
}

func (m *Manager) Start(ctx context.Context) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	m.scrapeAll()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.scrapeAll()
		}
	}
}

func (m *Manager) scrapeAll() {
	var wg sync.WaitGroup
	for _, s := range m.scrapers {
		wg.Add(1)
		go func(scraper Scraper) {
			defer wg.Done()
			metrics, err := scraper.Scrape()
			if err != nil {
				log.Printf("failed to scrape %s: %v", scraper.Name(), err)
				return
			}
			m.store.Add(metrics)
			if m.alertMgr != nil {
				m.alertMgr.Check(metrics)
			}
		}(s)
	}
	wg.Wait()
}
