package dhcp

import (
	"fmt"
	"log"
	"net"
	"time"
)

type ServerConfig struct {
	ListenAddr    string
	ServerIP      net.IP
	SubnetMask    net.IP
	Gateway       net.IP
	DNSServers    []net.IP
	LeaseTime     uint32
	TFTPServer    string
	BootFile      string
	BootFileBIOS  string
	BootFileEFI   string
	IPXEBootFile  string
	LeaseStart    string
	LeaseEnd      string
}

type Server struct {
	config   ServerConfig
	pool     *LeasePool
	conn     *net.UDPConn
}

func NewServer(cfg ServerConfig) (*Server, error) {
	pool, err := NewLeasePool(cfg.LeaseStart, cfg.LeaseEnd, cfg.SubnetMask.String(), cfg.Gateway.String())
	if err != nil {
		return nil, fmt.Errorf("failed to create lease pool: %w", err)
	}

	return &Server{
		config: cfg,
		pool:   pool,
	}, nil
}

func (s *Server) ListenAndServe() error {
	addr, err := net.ResolveUDPAddr("udp", s.config.ListenAddr)
	if err != nil {
		return fmt.Errorf("failed to resolve UDP address: %w", err)
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP: %w", err)
	}
	s.conn = conn
	defer conn.Close()

	log.Printf("DHCP server listening on %s", s.config.ListenAddr)

	buf := make([]byte, 1500)
	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("Error reading from UDP: %v", err)
			continue
		}

		data := make([]byte, n)
		copy(data, buf[:n])

		go s.handlePacket(data, remoteAddr)
	}
}

func (s *Server) handlePacket(data []byte, remoteAddr *net.UDPAddr) {
	pkt, err := ParsePacket(data)
	if err != nil {
		log.Printf("Failed to parse DHCP packet from %s: %v", remoteAddr, err)
		return
	}

	msgType, ok := pkt.MessageType()
	if !ok {
		log.Printf("DHCP packet without message type from %s", remoteAddr)
		return
	}

	clientMAC := pkt.CHAddr
	if len(clientMAC) == 0 {
		log.Printf("DHCP packet without client MAC from %s", remoteAddr)
		return
	}

	log.Printf("Received DHCP message type %d from MAC %s", msgType, clientMAC)

	switch msgType {
	case MsgDiscover:
		s.handleDiscover(pkt, remoteAddr)
	case MsgRequest:
		s.handleRequest(pkt, remoteAddr)
	default:
		log.Printf("Unhandled DHCP message type %d from %s", msgType, clientMAC)
	}
}

func (s *Server) handleDiscover(pkt *Packet, remoteAddr *net.UDPAddr) {
	clientIP := s.pool.Allocate(pkt.CHAddr)
	if clientIP == nil {
		log.Printf("No IP available for MAC %s", pkt.CHAddr)
		return
	}

	arch := pkt.ClientArch()
	bootFile := s.selectBootFile(pkt)

	reply := BuildReply(pkt, s.config.ServerIP, clientIP, s.config.SubnetMask, s.config.Gateway, s.config.DNSServers, s.config.LeaseTime, s.config.TFTPServer, bootFile)

	s.sendReply(reply, remoteAddr, pkt)

	log.Printf("Sent DHCPOFFER to MAC %s => IP %s, arch=%s, bootfile=%s", pkt.CHAddr, clientIP, ArchName(arch), bootFile)
}

func (s *Server) handleRequest(pkt *Packet, remoteAddr *net.UDPAddr) {
	clientIP := s.pool.Allocate(pkt.CHAddr)
	if clientIP == nil {
		log.Printf("No IP available for MAC %s on REQUEST", pkt.CHAddr)
		return
	}

	arch := pkt.ClientArch()
	bootFile := s.selectBootFile(pkt)

	reply := BuildReply(pkt, s.config.ServerIP, clientIP, s.config.SubnetMask, s.config.Gateway, s.config.DNSServers, s.config.LeaseTime, s.config.TFTPServer, bootFile)

	s.sendReply(reply, remoteAddr, pkt)

	log.Printf("Sent DHCPACK to MAC %s => IP %s, arch=%s, bootfile=%s", pkt.CHAddr, clientIP, ArchName(arch), bootFile)
}

func (s *Server) selectBootFile(pkt *Packet) string {
	if pkt.IsiPXE() {
		log.Printf("Client %s is iPXE, using HTTP boot script", pkt.CHAddr)
		return s.config.IPXEBootFile
	}

	arch := pkt.ClientArch()
	archName := ArchName(arch)

	log.Printf("Client %s architecture: %s (0x%x)", pkt.CHAddr, archName, arch)

	switch arch {
	case ArchBIOS:
		if s.config.BootFileBIOS != "" {
			log.Printf("Client %s is BIOS, using BIOS boot file: %s", pkt.CHAddr, s.config.BootFileBIOS)
			return s.config.BootFileBIOS
		}
	case ArchEFIx64, ArchEFIx86, ArchEFIBC, ArchEFIARM, ArchEFIARM64:
		if s.config.BootFileEFI != "" {
			log.Printf("Client %s is %s, using EFI boot file: %s", pkt.CHAddr, archName, s.config.BootFileEFI)
			return s.config.BootFileEFI
		}
	}

	log.Printf("Client %s using default boot file: %s", pkt.CHAddr, s.config.BootFile)
	return s.config.BootFile
}

func (s *Server) sendReply(reply []byte, remoteAddr *net.UDPAddr, pkt *Packet) {
	var targetAddr *net.UDPAddr

	if !pkt.GIAddr.Equal(net.IPv4zero) {
		targetAddr = &net.UDPAddr{IP: pkt.GIAddr, Port: 67}
	} else if !pkt.CIAddr.Equal(net.IPv4zero) {
		targetAddr = &net.UDPAddr{IP: pkt.CIAddr, Port: 68}
	} else {
		targetAddr = &net.UDPAddr{IP: net.IPv4bcast, Port: 68}
	}

	_, err := s.conn.WriteToUDP(reply, targetAddr)
	if err != nil {
		log.Printf("Failed to send DHCP reply to %s: %v", targetAddr, err)
		return
	}
}

func (s *Server) Close() {
	if s.conn != nil {
		s.conn.Close()
	}
}

func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		ListenAddr:   "0.0.0.0:67",
		ServerIP:     net.ParseIP("192.168.1.1"),
		SubnetMask:   net.ParseIP("255.255.255.0"),
		Gateway:      net.ParseIP("192.168.1.1"),
		DNSServers:   []net.IP{net.ParseIP("8.8.8.8"), net.ParseIP("8.8.4.4")},
		LeaseTime:    uint32(24 * time.Hour / time.Second),
		TFTPServer:   "192.168.1.1",
		BootFile:     "undionly.kpxe",
		BootFileBIOS: "undionly.kpxe",
		BootFileEFI:  "ipxe.efi",
		IPXEBootFile: "http://192.168.1.1:8080/boot.ipxe",
		LeaseStart:   "192.168.1.100",
		LeaseEnd:     "192.168.1.200",
	}
}
