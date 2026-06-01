package server

import (
	"fmt"
	"log"
	"net"
	"sync"

	"github.com/lisp-mapserver/internal/lisp"
	"github.com/lisp-mapserver/internal/mapserver"
)

type UDPServer struct {
	addr       string
	conn       *net.UDPConn
	mapServer  *mapserver.MapServer
	wg         sync.WaitGroup
	shutdown   chan struct{}
}

func NewUDPServer(addr string, ms *mapserver.MapServer) *UDPServer {
	return &UDPServer{
		addr:      addr,
		mapServer: ms,
		shutdown:  make(chan struct{}),
	}
}

func (s *UDPServer) Start() error {
	udpAddr, err := net.ResolveUDPAddr("udp", s.addr)
	if err != nil {
		return fmt.Errorf("resolve UDP address: %v", err)
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return fmt.Errorf("listen UDP: %v", err)
	}
	s.conn = conn

	log.Printf("LISP Map-Server UDP listening on %s", s.addr)

	s.wg.Add(1)
	go s.serve()

	return nil
}

func (s *UDPServer) serve() {
	defer s.wg.Done()

	buf := make([]byte, 2048)

	for {
		select {
		case <-s.shutdown:
			return
		default:
		}

		n, clientAddr, err := s.conn.ReadFromUDP(buf)
		if err != nil {
			select {
			case <-s.shutdown:
				return
			default:
			}
			log.Printf("Error reading UDP: %v", err)
			continue
		}

		go s.handlePacket(buf[:n], clientAddr)
	}
}

func (s *UDPServer) handlePacket(data []byte, clientAddr *net.UDPAddr) {
	log.Printf("Received %d bytes from %s", len(data), clientAddr.String())

	if len(data) < 1 {
		log.Printf("Packet too short")
		return
	}

	msgType := (data[0] >> 4) & 0x0F

	switch msgType {
	case lisp.MessageTypeMapRequest:
		s.handleMapRequest(data, clientAddr)
	case lisp.MessageTypeMapRegister:
		s.handleMapRegister(data, clientAddr)
	default:
		log.Printf("Unsupported message type: %d", msgType)
	}
}

func (s *UDPServer) handleMapRequest(data []byte, clientAddr *net.UDPAddr) {
	req, err := lisp.DecodeMapRequest(data)
	if err != nil {
		log.Printf("Failed to decode Map-Request: %v", err)
		return
	}

	log.Printf("Map-Request received: Nonce=0x%x, RecordCount=%d", req.Nonce, req.RecordCount)
	for i, eid := range req.EIDRecords {
		log.Printf("  EID Record %d: %s/%d", i, eid.Prefix.String(), eid.MaskLen)
	}

	reply, err := s.mapServer.HandleMapRequest(req)
	if err != nil {
		log.Printf("Failed to handle Map-Request: %v", err)
		return
	}

	replyData, err := lisp.EncodeMapReply(reply)
	if err != nil {
		log.Printf("Failed to encode Map-Reply: %v", err)
		return
	}

	_, err = s.conn.WriteToUDP(replyData, clientAddr)
	if err != nil {
		log.Printf("Failed to send Map-Reply: %v", err)
		return
	}

	log.Printf("Map-Reply sent to %s (%d bytes), RecordCount=%d",
		clientAddr.String(), len(replyData), reply.RecordCount)

	for i, rec := range reply.Records {
		log.Printf("  Record %d: EID=%s/%d, TTL=%d, LocatorCount=%d",
			i, rec.EIDPrefix.Prefix.String(), rec.EIDMaskLen, rec.TTL, rec.LocatorCount)
		for j, rloc := range rec.Locators {
			log.Printf("    RLOC %d: %s (priority=%d, weight=%d)",
				j, rloc.IP.String(), rloc.Priority, rloc.Weight)
		}
	}
}

func (s *UDPServer) handleMapRegister(data []byte, clientAddr *net.UDPAddr) {
	reg, err := lisp.DecodeMapRegister(data)
	if err != nil {
		log.Printf("Failed to decode Map-Register: %v", err)
		return
	}

	log.Printf("Map-Register received: Nonce=0x%x, RecordCount=%d, WantNotify=%d",
		reg.Nonce, reg.RecordCount, reg.WantMapNotify)
	for i, rec := range reg.Records {
		log.Printf("  Record %d: EID=%s/%d, TTL=%d, LocatorCount=%d",
			i, rec.EIDPrefix.Prefix.String(), rec.EIDMaskLen, rec.TTL, rec.LocatorCount)
		for j, rloc := range rec.Locators {
			log.Printf("    RLOC %d: %s (priority=%d, weight=%d)",
				j, rloc.IP.String(), rloc.Priority, rloc.Weight)
		}
	}

	notify, err := s.mapServer.HandleMapRegister(reg)
	if err != nil {
		log.Printf("Failed to handle Map-Register: %v", err)
		return
	}

	if reg.WantMapNotify == 1 {
		notifyData, err := lisp.EncodeMapNotify(notify)
		if err != nil {
			log.Printf("Failed to encode Map-Notify: %v", err)
			return
		}

		_, err = s.conn.WriteToUDP(notifyData, clientAddr)
		if err != nil {
			log.Printf("Failed to send Map-Notify: %v", err)
			return
		}

		log.Printf("Map-Notify sent to %s (%d bytes)", clientAddr.String(), len(notifyData))
	}
}

func (s *UDPServer) Stop() error {
	close(s.shutdown)
	if s.conn != nil {
		if err := s.conn.Close(); err != nil {
			log.Printf("Error closing UDP connection: %v", err)
		}
	}
	s.wg.Wait()
	log.Println("UDP server stopped")
	return nil
}
