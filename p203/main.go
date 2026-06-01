package main

import (
	"flag"
	"log"
	"socks5-proxy/socks5"
	"strings"
)

func main() {
	listen := flag.String("listen", ":1080", "SOCKS5 listen address")
	udp := flag.String("udp", ":1081", "UDP relay listen address")
	http := flag.String("http", ":8080", "HTTP dashboard address")
	user := flag.String("user", "", "Username for auth (empty = no auth required)")
	pass := flag.String("pass", "", "Password for auth")
	blacklist := flag.String("blacklist", "", "Comma-separated list of blocked IPs/CIDRs (e.g., 10.0.0.0/8,192.168.1.1)")
	uploadSpeed := flag.Int64("upload-speed", 0, "Upload speed limit in bytes per second (0 = unlimited)")
	downloadSpeed := flag.Int64("download-speed", 0, "Download speed limit in bytes per second (0 = unlimited)")
	flag.Parse()
	creds := make(socks5.StaticCredentials)
	if *user != "" {
		creds[*user] = *pass
	}
	cfg := &socks5.Config{
		ListenAddr:    *listen,
		UDPListenAddr: *udp,
		HTTPAddr:      *http,
		Credentials:   creds,
	}
	if *blacklist != "" {
		bl := socks5.NewBlacklist()
		for _, entry := range strings.Split(*blacklist, ",") {
			entry = strings.TrimSpace(entry)
			if strings.Contains(entry, "/") {
				if err := bl.AddCIDR(entry); err != nil {
					log.Printf("Failed to add CIDR to blacklist: %v", err)
				} else {
					log.Printf("Added CIDR to blacklist: %s", entry)
				}
			} else {
				bl.AddIP(entry)
				log.Printf("Added IP to blacklist: %s", entry)
			}
		}
		cfg.Blacklist = bl
	}
	if *uploadSpeed > 0 || *downloadSpeed > 0 {
		us := *uploadSpeed
		ds := *downloadSpeed
		if us == 0 {
			us = 1024 * 1024 * 100
		}
		if ds == 0 {
			ds = 1024 * 1024 * 100
		}
		cfg.RateLimiter = socks5.NewRateLimiter(us, ds)
		log.Printf("Rate limiting enabled: upload=%d B/s, download=%d B/s", us, ds)
	}
	srv := socks5.NewServer(cfg)
	log.Printf("Starting SOCKS5 proxy - TCP:%s UDP:%s Dashboard:http://%s", *listen, *udp, *http)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
