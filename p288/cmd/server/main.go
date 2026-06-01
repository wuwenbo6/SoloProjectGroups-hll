package main

import (
	"flag"
	"log"

	"twamp-reflector/internal/api"
	"twamp-reflector/internal/twamp"
)

func main() {
	controlPort := flag.Int("control-port", 862, "TWAMP control port")
	testPort := flag.Int("test-port", 863, "TWAMP test port")
	httpPort := flag.Int("http-port", 8080, "HTTP API port")
	modes := flag.Uint("modes", uint(twamp.ModeUnAuthenticated),
		"Supported modes (bitmask): 2=Unauthenticated, 4=Authenticated, 8=Encrypted")
	flag.Parse()

	twampServer := twamp.NewServer(*controlPort, *testPort)
	twampServer.SetSupportedModes(uint32(*modes))

	defaultSessions := []*twamp.SessionConfig{
		{Name: "EF - Expedited Forwarding", DSCP: twamp.DSCPEF, IntervalMs: 100, Active: true},
		{Name: "Voice Traffic", DSCP: twamp.DSCPVOICE, IntervalMs: 100, Active: true},
		{Name: "Video Traffic", DSCP: twamp.DSCPVIDEO, IntervalMs: 100, Active: true},
		{Name: "AF41 - High Priority", DSCP: twamp.DSCPAF41, IntervalMs: 100, Active: true},
		{Name: "AF31 - Medium Priority", DSCP: twamp.DSCPAF31, IntervalMs: 100, Active: true},
		{Name: "BE - Best Effort", DSCP: twamp.DSCPBE, IntervalMs: 100, Active: true},
		{Name: "CS1 - Low Priority", DSCP: twamp.DSCPCS1, IntervalMs: 100, Active: true},
	}

	for _, cfg := range defaultSessions {
		twampServer.AddSession(cfg)
	}

	if err := twampServer.Start(); err != nil {
		log.Fatalf("Failed to start TWAMP server: %v", err)
	}

	apiServer := api.NewAPIServer(twampServer, *httpPort)
	log.Printf("HTTP API server starting on port %d", *httpPort)
	if err := apiServer.Start(); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}
}
