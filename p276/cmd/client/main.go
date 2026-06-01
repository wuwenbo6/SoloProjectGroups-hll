package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"time"

	"github.com/lisp-mapserver/internal/lisp"
	"github.com/lisp-mapserver/internal/mapserver"
)

var rlocCounter int
var simCounters [10]int

func main() {
	serverAddr := flag.String("server", "127.0.0.1:4342", "LISP Map-Server address")
	mode := flag.String("mode", "query", "Mode: query or register")
	eidStr := flag.String("eid", "10.1.1.1", "EID address")
	maskLen := flag.Int("mask", 32, "EID mask length")
	sourceEIDStr := flag.String("source", "192.168.1.1", "Source EID")
	itrRLOCStr := flag.String("itr", "192.168.1.1", "ITR RLOC")
	rlocStr := flag.String("rloc", "", "RLOC address (for register mode, comma-separated)")
	rlocPriority := flag.String("priority", "1", "RLOC priority (for register, comma-separated)")
	rlocWeight := flag.String("weight", "100", "RLOC weight (for register, comma-separated)")
	ttl := flag.Int("ttl", 1440, "TTL in minutes (for register)")
	wantNotify := flag.Bool("notify", true, "Request Map-Notify (for register)")
	timeout := flag.Int("timeout", 5, "Timeout in seconds")
	flag.Parse()

	udpAddr, err := net.ResolveUDPAddr("udp", *serverAddr)
	if err != nil {
		log.Fatalf("Failed to resolve server address: %v", err)
	}

	conn, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		log.Fatalf("Failed to connect to server: %v", err)
	}
	defer conn.Close()

	switch *mode {
	case "register":
		runRegister(conn, eidStr, maskLen, rlocStr, rlocPriority, rlocWeight, ttl, wantNotify, timeout)
	case "query":
		fallthrough
	default:
		runQuery(conn, eidStr, sourceEIDStr, itrRLOCStr, timeout)
	}
}

func runRegister(conn *net.UDPConn, eidStr *string, maskLen *int, rlocStr *string, rlocPriority *string, rlocWeight *string, ttl *int, wantNotify *bool, timeout *int) {
	eid := net.ParseIP(*eidStr)
	if eid == nil {
		log.Fatalf("Invalid EID address: %s", *eidStr)
	}

	if *rlocStr == "" {
		*rlocStr = "192.168.100.10"
	}

	rlocs := parseRLOCs(*rlocStr, *rlocPriority, *rlocWeight)
	if len(rlocs) == 0 {
		log.Fatalf("No valid RLOCs provided")
	}

	reg := lisp.NewMapRegister(eid, uint8(*maskLen), rlocs, *wantNotify)
	reg.Records[0].TTL = uint32(*ttl)

	log.Printf("Sending Map-Register for EID: %s/%d", eid.String(), *maskLen)
	log.Printf("  Nonce:      0x%x", reg.Nonce)
	log.Printf("  WantNotify: %v", *wantNotify)
	log.Printf("  TTL:        %d minutes", *ttl)
	log.Printf("  RLOCs:      %d", len(rlocs))
	for i, rloc := range rlocs {
		log.Printf("    RLOC %d: %s (P:%d, W:%d)", i, rloc.IP.String(), rloc.Priority, rloc.Weight)
	}

	regData, err := lisp.EncodeMapRegister(reg)
	if err != nil {
		log.Fatalf("Failed to encode Map-Register: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(time.Duration(*timeout) * time.Second))

	start := time.Now()
	_, err = conn.Write(regData)
	if err != nil {
		log.Fatalf("Failed to send Map-Register: %v", err)
	}
	log.Printf("Sent %d bytes in Map-Register", len(regData))

	if *wantNotify {
		respBuf := make([]byte, 2048)
		n, _, err := conn.ReadFromUDP(respBuf)
		if err != nil {
			log.Fatalf("Failed to receive Map-Notify: %v", err)
		}
		rtt := time.Since(start)

		notify, err := lisp.DecodeMapNotify(respBuf[:n])
		if err != nil {
			log.Fatalf("Failed to decode Map-Notify: %v", err)
		}

		log.Printf("Map-Notify received (%d bytes, RTT=%v):", n, rtt)
		log.Printf("  Type:        %d", notify.Type)
		log.Printf("  Nonce:       0x%x", notify.Nonce)
		log.Printf("  RecordCount: %d", notify.RecordCount)

		if notify.Nonce != reg.Nonce {
			log.Printf("  WARNING: Nonce mismatch! Expected 0x%x", reg.Nonce)
		} else {
			log.Printf("  Nonce:       ✓ verified")
		}

		for i, rec := range notify.Records {
			log.Printf("  Record %d:", i)
			log.Printf("    EID:          %s/%d", rec.EIDPrefix.Prefix.String(), rec.EIDMaskLen)
			log.Printf("    TTL:          %d", rec.TTL)
			log.Printf("    LocatorCount: %d", rec.LocatorCount)
		}

		fmt.Println("\n=== Register Summary ===")
		fmt.Printf("EID:       %s/%d\n", eid.String(), *maskLen)
		fmt.Printf("RLOCs:     ")
		for i, rloc := range rlocs {
			if i > 0 {
				fmt.Printf(", ")
			}
			fmt.Printf("%s (P:%d, W:%d)", rloc.IP.String(), rloc.Priority, rloc.Weight)
		}
		fmt.Println()
		fmt.Printf("Status:    REGISTERED ✓\n")
		fmt.Printf("RTT:       %v\n", rtt)
	} else {
		fmt.Println("\n=== Register Summary ===")
		fmt.Printf("EID:       %s/%d\n", eid.String(), *maskLen)
		fmt.Printf("Status:    SENT (no Map-Notify requested)\n")
	}
}

func runQuery(conn *net.UDPConn, eidStr *string, sourceEIDStr *string, itrRLOCStr *string, timeout *int) {
	eid := net.ParseIP(*eidStr)
	if eid == nil {
		log.Fatalf("Invalid EID address: %s", *eidStr)
	}

	sourceEID := net.ParseIP(*sourceEIDStr)
	if sourceEID == nil {
		log.Fatalf("Invalid source EID address: %s", *sourceEIDStr)
	}

	itrRLOC := net.ParseIP(*itrRLOCStr)
	if itrRLOC == nil {
		log.Fatalf("Invalid ITR RLOC address: %s", *itrRLOCStr)
	}

	req := lisp.NewMapRequest(eid, sourceEID, itrRLOC)

	log.Printf("Sending Map-Request for EID: %s", eid.String())
	log.Printf("  Source EID: %s", sourceEID.String())
	log.Printf("  ITR RLOC:   %s", itrRLOC.String())
	log.Printf("  Nonce:      0x%x", req.Nonce)

	reqData, err := lisp.EncodeMapRequest(req)
	if err != nil {
		log.Fatalf("Failed to encode Map-Request: %v", err)
	}

	log.Printf("Sending %d bytes...", len(reqData))

	var reply *lisp.MapReply
	var rtt time.Duration

	maxRetries := 3
	for attempt := 0; attempt < maxRetries; attempt++ {
		conn.SetReadDeadline(time.Now().Add(time.Duration(*timeout) * time.Second))

		start := time.Now()
		_, err = conn.Write(reqData)
		if err != nil {
			log.Fatalf("Failed to send Map-Request: %v", err)
		}

		respBuf := make([]byte, 2048)
		n, _, err := conn.ReadFromUDP(respBuf)
		if err != nil {
			log.Fatalf("Failed to receive Map-Reply: %v", err)
		}
		rtt = time.Since(start)

		log.Printf("Received %d bytes in %v", n, rtt)

		reply, err = lisp.DecodeMapReply(respBuf[:n])
		if err != nil {
			log.Fatalf("Failed to decode Map-Reply: %v", err)
		}

		if reply.Nonce == req.Nonce {
			break
		}

		log.Printf("  Nonce mismatch! Expected 0x%x, got 0x%x — discarding reply (attempt %d/%d)",
			req.Nonce, reply.Nonce, attempt+1, maxRetries)

		if attempt == maxRetries-1 {
			log.Fatalf("All %d attempts returned nonce mismatch. Aborting.", maxRetries)
		}

		reply = nil
	}

	log.Printf("Map-Reply received (nonce verified):")
	log.Printf("  Type:         %d", reply.Type)
	log.Printf("  Nonce:        0x%x ✓", reply.Nonce)
	log.Printf("  RecordCount:  %d", reply.RecordCount)

	for i, rec := range reply.Records {
		log.Printf("  Record %d:", i)
		log.Printf("    TTL:          %d minutes", rec.TTL)
		log.Printf("    LocatorCount: %d", rec.LocatorCount)
		log.Printf("    EID:          %s/%d", rec.EIDPrefix.Prefix.String(), rec.EIDMaskLen)
		log.Printf("    ACT:          %d", rec.ACT)
		log.Printf("    Authoritative:%d", rec.Authoritative)

		if rec.LocatorCount == 0 {
			log.Printf("    (No RLOCs found - EID not registered)")
			continue
		}

		for j, rloc := range rec.Locators {
			log.Printf("    RLOC %d:", j)
			log.Printf("      IP:        %s", rloc.IP.String())
			log.Printf("      Priority:  %d", rloc.Priority)
			log.Printf("      Weight:    %d", rloc.Weight)
			log.Printf("      MPriority: %d", rloc.MulticastPriority)
			log.Printf("      MWeight:   %d", rloc.MulticastWeight)
		}

		selected := mapserver.SelectRLOCByRoundRobin(rec.Locators, eid.String(), &rlocCounter)
		if selected != nil {
			log.Printf("    Selected RLOC (WRR): %s (P:%d, W:%d)", selected.IP.String(), selected.Priority, selected.Weight)
		}
	}

	fmt.Println("\n=== Summary ===")
	fmt.Printf("Query:    %s\n", eid.String())
	fmt.Printf("Status:   ")
	if len(reply.Records) > 0 && reply.Records[0].LocatorCount > 0 {
		fmt.Println("FOUND")
		fmt.Printf("RLOCs:    ")
		for i, rec := range reply.Records {
			for j, rloc := range rec.Locators {
				if i > 0 || j > 0 {
					fmt.Printf(", ")
				}
				fmt.Printf("%s (P:%d, W:%d)", rloc.IP.String(), rloc.Priority, rloc.Weight)
			}
		}
		fmt.Println()

		if len(reply.Records) > 0 && reply.Records[0].LocatorCount > 0 {
			rec := reply.Records[0]
			selected := mapserver.SelectRLOCByRoundRobin(rec.Locators, eid.String(), &rlocCounter)
			if selected != nil {
				fmt.Printf("Selected: %s (P:%d, W:%d) [Weighted Round-Robin]\n", selected.IP.String(), selected.Priority, selected.Weight)
			}

			if rec.LocatorCount > 1 {
				fmt.Println("\n--- WRR Simulation (10 selections) ---")
				for k := 0; k < 10; k++ {
					s := mapserver.SelectRLOCByRoundRobin(rec.Locators, fmt.Sprintf("%s-sim-%d", eid.String(), k), &simCounters[k])
					if s != nil {
						fmt.Printf("  #%d: %s (P:%d, W:%d)\n", k+1, s.IP.String(), s.Priority, s.Weight)
					}
				}
			}
		}
	} else {
		fmt.Println("NOT FOUND")
	}
	fmt.Printf("RTT:      %v\n", rtt)
}

func parseRLOCs(rlocStr, priorityStr, weightStr string) []lisp.RLOC {
	var rlocs []lisp.RLOC

	priorities := parseCSVUint8(priorityStr)
	weights := parseCSVUint8(weightStr)

	for i, ipStr := range splitCSV(rlocStr) {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			log.Printf("Warning: invalid RLOC IP: %s, skipping", ipStr)
			continue
		}

		p := uint8(1)
		if i < len(priorities) {
			p = priorities[i]
		}
		w := uint8(100)
		if i < len(weights) {
			w = weights[i]
		}

		rlocs = append(rlocs, lisp.NewRLOC(ip, p, w))
	}

	return rlocs
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	var result []string
	for _, part := range splitByComma(s) {
		result = append(result, part)
	}
	return result
}

func parseCSVUint8(s string) []uint8 {
	var result []uint8
	for _, part := range splitByComma(s) {
		var v uint8
		fmt.Sscanf(part, "%d", &v)
		if v == 0 {
			v = 1
		}
		result = append(result, v)
	}
	return result
}

func splitByComma(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			part := s[start:i]
			if part != "" {
				result = append(result, part)
			}
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}
