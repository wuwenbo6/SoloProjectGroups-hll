package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"dns-proxy/cache"
	"dns-proxy/doh"
	"dns-proxy/dot"
	"dns-proxy/resolver"
	"dns-proxy/server"
	"dns-proxy/web"
)

type stringSlice []string

func (s *stringSlice) String() string {
	return strings.Join(*s, ",")
}

func (s *stringSlice) Set(value string) error {
	*s = append(*s, value)
	return nil
}

type upstreamConfig struct {
	typ        string
	name       string
	endpoint   string
	serverName string
}

func main() {
	udpAddr := flag.String("udp", ":53", "UDP DNS server address")
	tcpAddr := flag.String("tcp", ":53", "TCP DNS server address")
	webAddr := flag.String("web", ":8080", "Web dashboard address")
	cacheSize := flag.Int("cache-size", 10000, "Maximum cache entries")
	timeout := flag.Duration("timeout", 5*time.Second, "Upstream query timeout")
	cleanupInterval := flag.Duration("cleanup", 5*time.Minute, "Cache cleanup interval")
	strategy := flag.String("strategy", resolver.StrategyFailover,
		fmt.Sprintf("Load balancing strategy: %s, %s, %s, %s",
			resolver.StrategyFailover, resolver.StrategyRoundRobin,
			resolver.StrategyRandom, resolver.StrategyLatency))
	healthCheck := flag.Bool("healthcheck", true, "Enable upstream health checks")
	healthCheckInterval := flag.Duration("hc-interval", 30*time.Second, "Health check interval")
	testDomain := flag.String("hc-domain", "cloudflare.com.", "Health check test domain")

	var dohEndpoints stringSlice
	flag.Var(&dohEndpoints, "doh", "DoH endpoint (name=url), can be specified multiple times")

	var dotServers stringSlice
	flag.Var(&dotServers, "dot", "DoT server (name=host[:port]@servername), can be specified multiple times")

	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Println("Starting DNS Proxy...")

	upstreams := parseUpstreams(dohEndpoints, dotServers)
	if len(upstreams) == 0 {
		log.Println("No upstreams specified, using defaults")
		upstreams = getDefaultUpstreams()
	}

	resolverMgr := resolver.NewManager(*strategy)

	for _, up := range upstreams {
		switch up.typ {
		case "doh":
			client := doh.NewDoHClient(up.name, up.endpoint, *timeout)
			resolverMgr.AddUpstream(client)
			log.Printf("Added DoH upstream: %s -> %s", up.name, up.endpoint)
		case "dot":
			client := dot.NewDoTClient(up.name, up.endpoint, up.serverName, *timeout)
			resolverMgr.AddUpstream(client)
			log.Printf("Added DoT upstream: %s -> %s (SNI: %s)", up.name, up.endpoint, up.serverName)
		}
	}

	if *healthCheck {
		resolverMgr.StartHealthCheck(*healthCheckInterval, *testDomain)
		log.Printf("Health check enabled: interval=%s, domain=%s", *healthCheckInterval, *testDomain)
	}

	dnsCache := cache.NewDNSCache(*cacheSize)
	dnsServer := server.NewDNSServer(*udpAddr, *tcpAddr, dnsCache, resolverMgr)

	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("Failed to get working directory: %v", err)
	}
	templatesDir := filepath.Join(cwd, "templates")

	webServer, err := web.NewWebServer(*webAddr, dnsServer, templatesDir)
	if err != nil {
		log.Fatalf("Failed to create web server: %v", err)
	}

	stopCh := make(chan struct{})
	errCh := make(chan error, 3)

	go func() {
		if err := dnsServer.ListenAndServe(stopCh); err != nil {
			errCh <- err
		}
	}()

	go func() {
		if err := webServer.ListenAndServe(stopCh); err != nil {
			errCh <- err
		}
	}()

	go func() {
		ticker := time.NewTicker(*cleanupInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				evicted := dnsCache.CleanExpired()
				if evicted > 0 {
					log.Printf("Cache cleanup: evicted %d expired entries", evicted)
				}
			case <-stopCh:
				return
			}
		}
	}()

	go func() {
		statsTicker := time.NewTicker(30 * time.Second)
		defer statsTicker.Stop()

		for {
			select {
			case <-statsTicker.C:
				stats := dnsCache.GetStats()
				rate := dnsCache.HitRate()
				effectiveRate := dnsCache.EffectiveHitRate()
				log.Printf("Cache stats: size=%d/%d, hits=%d, misses=%d, expired=%d, evictions=%d, rate=%.2f%%, effective=%.2f%%",
					stats.Size, stats.MaxSize, stats.Hits, stats.Misses, stats.ExpiredHits, stats.Evictions, rate, effectiveRate)

				upStats := resolverMgr.Stats()
				for _, us := range upStats {
					status := "HEALTHY"
					if !us.Healthy {
						status = "UNHEALTHY"
					}
					log.Printf("Upstream %s (%s): %s, success=%d, errors=%d, avg_latency=%s",
						us.Name, us.Type, status, us.Success, us.Errors, us.AvgLatency)
				}
			case <-stopCh:
				return
			}
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	log.Printf("Configuration:")
	log.Printf("  UDP DNS server: %s", *udpAddr)
	log.Printf("  TCP DNS server: %s", *tcpAddr)
	log.Printf("  Web dashboard: http://localhost%s", *webAddr)
	log.Printf("  Strategy: %s", *strategy)
	log.Printf("  Cache size: %d entries", *cacheSize)
	log.Printf("  Upstreams (%d):", len(upstreams))
	for _, up := range upstreams {
		log.Printf("    - %s (%s): %s", up.name, strings.ToUpper(up.typ), up.endpoint)
	}
	log.Println("DNS Proxy is running. Press Ctrl+C to stop.")

	select {
	case err := <-errCh:
		log.Printf("Server error: %v", err)
	case sig := <-sigCh:
		log.Printf("Received signal: %v", sig)
	}

	log.Println("Shutting down...")
	close(stopCh)

	time.Sleep(500 * time.Millisecond)
	log.Println("DNS Proxy stopped.")
}

func parseUpstreams(dohEndpoints, dotServers []string) []upstreamConfig {
	var upstreams []upstreamConfig

	for i, ep := range dohEndpoints {
		parts := strings.SplitN(ep, "=", 2)
		name := fmt.Sprintf("doh-%d", i+1)
		url := ep
		if len(parts) == 2 {
			name = parts[0]
			url = parts[1]
		}
		upstreams = append(upstreams, upstreamConfig{
			typ:      "doh",
			name:     name,
			endpoint: url,
		})
	}

	for i, srv := range dotServers {
		parts := strings.SplitN(srv, "=", 2)
		name := fmt.Sprintf("dot-%d", i+1)
		addr := srv
		serverName := ""
		if len(parts) == 2 {
			name = parts[0]
			addr = parts[1]
		}

		if at := strings.Index(addr, "@"); at > 0 {
			serverName = addr[at+1:]
			addr = addr[:at]
		}

		if serverName == "" {
			if host, _, err := splitHostPort(addr); err == nil {
				serverName = host
			} else {
				serverName = addr
			}
		}

		upstreams = append(upstreams, upstreamConfig{
			typ:        "dot",
			name:       name,
			endpoint:   addr,
			serverName: serverName,
		})
	}

	return upstreams
}

func getDefaultUpstreams() []upstreamConfig {
	return []upstreamConfig{
		{typ: "doh", name: "cloudflare", endpoint: "https://cloudflare-dns.com/dns-query"},
		{typ: "doh", name: "google", endpoint: "https://dns.google/dns-query"},
		{typ: "dot", name: "cloudflare-dot", endpoint: "1.1.1.1:853", serverName: "cloudflare-dns.com"},
	}
}

func splitHostPort(hostport string) (host, port string, err error) {
	host, port, err = net.SplitHostPort(hostport)
	return
}
