package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

const (
	NTPOffset int64 = 2208988800

	ModeUnAuthenticated uint32 = 1 << 1
	ModeAuthenticated   uint32 = 1 << 2
	ModeEncrypted       uint32 = 1 << 3

	DSCPDefault uint8 = 0x00
	DSCPEF      uint8 = 0x2E
	DSCPAF41    uint8 = 0x22
	DSCPAF31    uint8 = 0x1A
	DSCPAF21    uint8 = 0x12
	DSCPAF11    uint8 = 0x0A
	DSCPCS1     uint8 = 0x08
	DSCPVOICE   uint8 = 0xB8
	DSCPVIDEO   uint8 = 0x88
)

type NTPTimestamp struct {
	Seconds  uint32
	Fraction uint32
}

type SessionConfig struct {
	Name     string
	DSCP     uint8
	Interval int
	Count    int
}

func TimeToNTP(t time.Time) NTPTimestamp {
	secs := t.Unix() + NTPOffset
	frac := uint64(t.Nanosecond()) * (1 << 32) / 1e9
	return NTPTimestamp{
		Seconds:  uint32(secs),
		Fraction: uint32(frac),
	}
}

func NTPSub(a, b NTPTimestamp) float64 {
	secs := int64(a.Seconds) - int64(b.Seconds)
	frac := int64(a.Fraction) - int64(b.Fraction)
	if frac < 0 {
		secs--
		frac += 1 << 32
	}
	return float64(secs) + float64(frac)/(1<<32)
}

func main() {
	target := flag.String("target", "127.0.0.1", "Target address")
	controlPort := flag.Int("control-port", 862, "TWAMP control port")
	testPort := flag.Int("test-port", 863, "TWAMP test port")
	interval := flag.Int("interval", 100, "Default packet interval in milliseconds")
	count := flag.Int("count", 0, "Number of packets per session (0 = infinite)")
	mode := flag.Uint("mode", uint(ModeUnAuthenticated), "TWAMP mode (2=Unauthenticated, 4=Authenticated, 8=Encrypted)")
	noControl := flag.Bool("no-control", false, "Skip control connection")
	multiSession := flag.Bool("multi", true, "Enable multi-session testing with different DSCP")
	flag.Parse()

	if !*noControl {
		err := performControlHandshake(*target, *controlPort, uint32(*mode))
		if err != nil {
			log.Printf("Control handshake warning: %v", err)
		}
	}

	var sessions []SessionConfig
	if *multiSession {
		sessions = []SessionConfig{
			{Name: "EF", DSCP: DSCPEF, Interval: *interval, Count: *count},
			{Name: "Voice", DSCP: DSCPVOICE, Interval: *interval, Count: *count},
			{Name: "Video", DSCP: DSCPVIDEO, Interval: *interval, Count: *count},
			{Name: "AF41", DSCP: DSCPAF41, Interval: *interval, Count: *count},
			{Name: "AF31", DSCP: DSCPAF31, Interval: *interval, Count: *count},
			{Name: "BE", DSCP: DSCPDefault, Interval: *interval, Count: *count},
			{Name: "CS1", DSCP: DSCPCS1, Interval: *interval, Count: *count},
		}
	} else {
		sessions = []SessionConfig{
			{Name: "Default", DSCP: DSCPDefault, Interval: *interval, Count: *count},
		}
	}

	log.Printf("Starting multi-session TWAMP test with %d sessions", len(sessions))
	for _, s := range sessions {
		log.Printf("  - %s (DSCP 0x%02x, interval: %dms)", s.Name, s.DSCP, s.Interval)
	}

	var wg sync.WaitGroup
	for _, cfg := range sessions {
		wg.Add(1)
		go func(sessionCfg SessionConfig) {
			defer wg.Done()
			runSession(*target, *testPort, sessionCfg)
		}(cfg)
	}

	wg.Wait()
	log.Println("All sessions completed")
}

func runSession(target string, testPort int, cfg SessionConfig) {
	testAddr := fmt.Sprintf("%s:%d", target, testPort)
	udpAddr, err := net.ResolveUDPAddr("udp", testAddr)
	if err != nil {
		log.Printf("[%s] Failed to resolve UDP address: %v", cfg.Name, err)
		return
	}

	conn, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		log.Printf("[%s] Failed to connect to test port: %v", cfg.Name, err)
		return
	}
	defer conn.Close()

	seq := uint32(0)
	buf := make([]byte, 48)
	lastRTT := float64(0)

	log.Printf("[%s] Session started - DSCP 0x%02x", cfg.Name, cfg.DSCP)

	for {
		seq++
		now := TimeToNTP(time.Now())

		binary.BigEndian.PutUint32(buf[0:4], seq)
		binary.BigEndian.PutUint32(buf[4:8], now.Seconds)
		binary.BigEndian.PutUint32(buf[8:12], now.Fraction)
		binary.BigEndian.PutUint16(buf[12:14], 0)
		binary.BigEndian.PutUint16(buf[14:16], 0)

		_, err := conn.Write(buf)
		if err != nil {
			log.Printf("[%s] Write error: %v", cfg.Name, err)
		}

		conn.SetReadDeadline(time.Now().Add(1 * time.Second))
		recvBuf := make([]byte, 48)
		n, _, err := conn.ReadFromUDP(recvBuf)
		if err == nil && n >= 48 {
			recvTime := TimeToNTP(time.Now())
			sentSecs := binary.BigEndian.Uint32(recvBuf[4:8])
			sentFrac := binary.BigEndian.Uint32(recvBuf[8:12])
			sentTime := NTPTimestamp{Seconds: sentSecs, Fraction: sentFrac}
			rtt := NTPSub(recvTime, sentTime) * 1000

			jitter := 0.0
			if lastRTT > 0 {
				jitter = abs(rtt - lastRTT)
			}
			lastRTT = rtt

			if seq%50 == 0 {
				log.Printf("[%s] Seq %d: RTT=%.3fms, Jitter=%.3fms", cfg.Name, seq, rtt, jitter)
			}
		}

		if cfg.Count > 0 && int(seq) >= cfg.Count {
			break
		}

		time.Sleep(time.Duration(cfg.Interval) * time.Millisecond)
	}

	log.Printf("[%s] Session completed - sent %d packets", cfg.Name, seq)
}

func performControlHandshake(target string, controlPort int, clientMode uint32) error {
	addr := fmt.Sprintf("%s:%d", target, controlPort)
	log.Printf("Performing control handshake with %s", addr)

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect to control port: %v", err)
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	greeting := make([]byte, 64)
	n, err := conn.Read(greeting)
	if err != nil {
		return fmt.Errorf("failed to read greeting: %v", err)
	}

	if n < 5 || greeting[0] != 1 {
		return fmt.Errorf("invalid greeting message")
	}

	serverModes := binary.BigEndian.Uint32(greeting[1:5])
	log.Printf("Server supported modes: 0x%x", serverModes)

	negotiatedMode := clientMode & serverModes
	if negotiatedMode == 0 {
		return fmt.Errorf("no compatible mode found (client: 0x%x, server: 0x%x)", clientMode, serverModes)
	}

	log.Printf("Negotiated mode: 0x%x", negotiatedMode)

	setup := make([]byte, 256)
	setup[0] = 2
	binary.BigEndian.PutUint32(setup[1:5], negotiatedMode)
	_, err = conn.Write(setup)
	if err != nil {
		return fmt.Errorf("failed to send setup response: %v", err)
	}

	resp := make([]byte, 32)
	n, err = conn.Read(resp)
	if err != nil {
		return fmt.Errorf("failed to read ack: %v", err)
	}

	if n < 5 || resp[0] != 4 {
		return fmt.Errorf("invalid ack message")
	}

	status := binary.BigEndian.Uint32(resp[1:5])
	if status != 0 {
		return fmt.Errorf("server rejected session with status: %d", status)
	}

	log.Println("Control handshake completed successfully")
	return nil
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
