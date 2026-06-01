package main

import (
	"encoding/json"
	"flag"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

type StatusResponse struct {
	SessionCount   int64            `json:"session_count"`
	TotalBytesIn   int64            `json:"total_bytes_in"`
	TotalBytesOut  int64            `json:"total_bytes_out"`
	IPDistribution map[string]int64 `json:"ip_distribution"`
}

var (
	mu           sync.Mutex
	sessionCount int64
	bytesIn      int64
	bytesOut     int64
	ipDist       = make(map[string]int64)
	ipPool       = []string{
		"192.168.1.100", "192.168.1.101", "192.168.1.102",
		"10.0.0.50", "10.0.0.51", "10.0.0.52",
		"172.16.0.10", "172.16.0.11", "172.16.0.12",
		"8.8.8.8", "8.8.4.4", "1.1.1.1",
	}
)

func statusHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	action := r.URL.Query().Get("action")
	switch action {
	case "spike":
		sessionCount = 12000
	case "reset":
		sessionCount = 10
	case "medium":
		sessionCount = 6000
	case "high":
		sessionCount = 15000
	default:
		sessionCount += int64(rand.Intn(5) - 2)
		if sessionCount < 0 {
			sessionCount = 0
		}
	}

	bytesIn += int64(rand.Intn(100000))
	bytesOut += int64(rand.Intn(150000))

	ip := ipPool[rand.Intn(len(ipPool))]
	ipDist[ip]++

	resp := StatusResponse{
		SessionCount:   sessionCount,
		TotalBytesIn:   bytesIn,
		TotalBytesOut:  bytesOut,
		IPDistribution: make(map[string]int64),
	}

	for k, v := range ipDist {
		resp.IPDistribution[k] = v
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	addr := flag.String("addr", ":3478", "listen address")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())

	sessionCount = 10
	bytesIn = 1024 * 1024 * 50
	bytesOut = 1024 * 1024 * 100

	http.HandleFunc("/status", statusHandler)

	log.Printf("mock STUN/TURN server starting on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
