package main

import (
	"flag"
	"fmt"
	"iec104-simulator/protocol"
	"iec104-simulator/server"
	"iec104-simulator/simulator"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	httpPort := flag.Int("http", 8080, "HTTP server port")
	iecPort := flag.Int("iec", 2404, "IEC 104 server port")
	mode := flag.String("mode", "server", "Run mode: server or client")
	flag.Parse()

	sim := simulator.NewSimulator(protocol.DefaultASDUCommonAddr)
	srv := server.NewServer(sim)

	if *mode == "client" {
		runClient(*iecPort, sim)
		return
	}

	log.Printf("======================================")
	log.Printf("  IEC 104 Simulator - Control Station")
	log.Printf("  HTTP:   :%d", *httpPort)
	log.Printf("  IEC104: :%d", *iecPort)
	log.Printf("======================================")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down...")
		os.Exit(0)
	}()

	if err := srv.Start(*httpPort, *iecPort); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func runClient(iecPort int, sim *simulator.Simulator) {
	addr := fmt.Sprintf("127.0.0.1:%d", iecPort)
	log.Printf("[Client] Connecting to %s ...", addr)

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		log.Fatalf("[Client] Connect error: %v", err)
	}
	defer conn.Close()

	log.Printf("[Client] Connected, sending STARTDT ACT")

	startFrame := protocol.BuildUFrame(protocol.UStartDTACT)
	conn.Write(startFrame)

	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil {
		log.Fatalf("[Client] Read error: %v", err)
	}

	apci, err := protocol.ParseAPCI(buf[:n])
	if err == nil && apci.FrameType == protocol.FrameU && apci.UType == protocol.UStartDTCON {
		log.Printf("[Client] STARTDT CON received, session active")
	}

	log.Printf("[Client] Sending General Interrogation...")
	asduData := protocol.BuildCICNA1(protocol.DefaultASDUCommonAddr, 0, 20)
	iframe := protocol.BuildIFrame(0, 0, asduData)
	conn.Write(iframe)

	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			log.Printf("[Client] Read error: %v", err)
			break
		}

		frameData := buf[:n]
		apci, err := protocol.ParseAPCI(frameData)
		if err != nil {
			continue
		}

		if apci.FrameType == protocol.FrameI && len(frameData) > protocol.APCIHeaderSize {
			asdu, err := protocol.ParseASDU(frameData[protocol.APCIHeaderSize:])
			if err == nil {
				log.Printf("[Client] ASDU: Type=%s Cause=%s Objects=%d",
					asdu.TypeName(), asdu.CauseName(), len(asdu.InformationObjects))
				for _, obj := range asdu.InformationObjects {
					log.Printf("[Client]   IOA=%d Data=%X", obj.IOA, obj.Elements)
				}
			}
		}
	}
}
