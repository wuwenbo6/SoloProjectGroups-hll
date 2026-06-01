package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"time"

	"github.com/owamp-client/pkg/protocol"
)

func main() {
	port := flag.Int("port", protocol.OWAMP_PORT, "UDP port to listen on")
	symmetric := flag.Bool("symmetric", true, "Enable symmetric mode (bidirectional timestamps)")
	flag.Parse()

	addr := net.UDPAddr{
		Port: *port,
		IP:   net.ParseIP("0.0.0.0"),
	}

	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		log.Fatalf("Failed to start echo server: %v", err)
	}
	defer conn.Close()

	mode := "basic"
	if *symmetric {
		mode = "symmetric"
	}
	fmt.Printf("OWAMP Echo Server running on :%d (mode: %s)\n", *port, mode)
	fmt.Println("Press Ctrl+C to stop")

	buf := make([]byte, protocol.MAX_PAYLOAD_SIZE)

	for {
		n, clientAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("Error reading: %v", err)
			continue
		}

		serverReceiveTime := time.Now()

		packet := protocol.Unmarshal(buf[:n])
		if packet == nil {
			log.Printf("Received invalid packet from %s", clientAddr)
			continue
		}

		if *symmetric {
			resp := protocol.NewSymmetricResponse(buf[:n], serverReceiveTime)
			if resp != nil {
				respData := resp.Marshal()
				_, err = conn.WriteToUDP(respData, clientAddr)
				fmt.Printf("[SYM] Packet #%d from %s: fwd_delay=%.3fms\n",
					packet.SequenceNumber, clientAddr,
					float64(serverReceiveTime.Sub(packet.SendTimestamp).Nanoseconds())/1e6)
			} else {
				_, err = conn.WriteToUDP(buf[:n], clientAddr)
			}
		} else {
			_, err = conn.WriteToUDP(buf[:n], clientAddr)
			fmt.Printf("[BASIC] Packet #%d from %s, echoing back\n",
				packet.SequenceNumber, clientAddr)
		}

		if err != nil {
			log.Printf("Error writing: %v", err)
		}
	}
}
