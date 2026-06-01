package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"time"
)

var (
	target   = flag.String("target", "127.0.0.1:5060", "Target SIP server address")
	count    = flag.Int("count", 100, "Number of REGISTER requests to send")
	interval = flag.Int("interval", 10, "Interval between requests (milliseconds)")
	sourceIP = flag.String("source-ip", "", "Source IP to simulate (for testing)")
	expires  = flag.Int("expires", 3600, "Expires value (initial: >=600, refresh: <600)")
	mode     = flag.String("mode", "initial", "Test mode: initial, refresh, mixed")
)

func main() {
	flag.Parse()

	fmt.Println("SIP REGISTER Flood Test Tool")
	fmt.Println("=" + stringRepeat("=", 50))
	fmt.Printf("Target:     %s\n", *target)
	fmt.Printf("Count:      %d\n", *count)
	fmt.Printf("Interval:   %d ms\n", *interval)
	fmt.Printf("Expires:    %d\n", *expires)
	fmt.Printf("Mode:       %s\n", *mode)
	fmt.Printf("Source IP:  %s\n", *sourceIP)
	fmt.Println("=" + stringRepeat("=", 50))
	fmt.Println()

	conn, err := net.Dial("udp", *target)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	successCount := 0
	failCount := 0

	for i := 0; i < *count; i++ {
		callID := fmt.Sprintf("test-call-%d-%d", time.Now().UnixNano(), i)
		fromUser := fmt.Sprintf("100%d", i%100)

		contactUser := fromUser
		expiresValue := *expires

		switch *mode {
		case "refresh":
			expiresValue = 120
			contactUser = "1000"
		case "mixed":
			if i%2 == 0 {
				expiresValue = 120
				contactUser = "1000"
			} else {
				expiresValue = 3600
			}
		}

		sipMessage := fmt.Sprintf(
			"REGISTER sip:example.com SIP/2.0\r\n"+
				"Via: SIP/2.0/UDP 192.168.1.%d:5060;branch=z9hG4bK%d\r\n"+
				"From: <sip:%s@example.com>;tag=%d\r\n"+
				"To: <sip:%s@example.com>\r\n"+
				"Call-ID: %s@192.168.1.%d\r\n"+
				"CSeq: %d REGISTER\r\n"+
				"User-Agent: Test-SIP-Client/1.0\r\n"+
				"Contact: <sip:%s@192.168.1.%d:5060>\r\n"+
				"Expires: %d\r\n"+
				"Max-Forwards: 70\r\n"+
				"Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, SUBSCRIBE, NOTIFY, INFO, PUBLISH, MESSAGE\r\n"+
				"Supported: replaces, timer\r\n"+
				"Content-Length: 0\r\n"+
				"\r\n",
			i%255, time.Now().UnixNano(),
			fromUser, time.Now().UnixNano(),
			fromUser,
			callID, i%255,
			i+1,
			contactUser, i%255,
			expiresValue,
		)

		_, err := conn.Write([]byte(sipMessage))
		if err != nil {
			log.Printf("Failed to send packet %d: %v", i+1, err)
			failCount++
		} else {
			successCount++
		}

		if (i+1)%10 == 0 {
			fmt.Printf("Sent %d/%d packets...\n", i+1, *count)
		}

		time.Sleep(time.Duration(*interval) * time.Millisecond)
	}

	fmt.Println()
	fmt.Println("=" + stringRepeat("=", 50))
	fmt.Println("Test Complete!")
	fmt.Printf("Success: %d\n", successCount)
	fmt.Printf("Failed:  %d\n", failCount)
	fmt.Printf("Rate:    %.2f packets/sec\n", float64(successCount)/(float64(*count**interval)/1000.0))
	fmt.Println("=" + stringRepeat("=", 50))
}

func stringRepeat(s string, count int) string {
	result := ""
	for i := 0; i < count; i++ {
		result += s
	}
	return result
}
