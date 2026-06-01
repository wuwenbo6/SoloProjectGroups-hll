package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync/atomic"
	"time"

	"github.com/miekg/dns"

	"dns-proxy/cache"
	"dns-proxy/resolver"
)

const (
	DefaultUDPBufferSize = 512
	MaxUDPBufferSize     = 4096
)

type DNSServer struct {
	udpAddr       string
	tcpAddr       string
	cache         *cache.DNSCache
	resolverMgr   *resolver.Manager
	udpConn       *net.UDPConn
	tcpLn         net.Listener
	stats         ServerStats
}

type ServerStats struct {
	UDPQueries atomic.Uint64
	TCPQueries atomic.Uint64
	Errors     atomic.Uint64
	Truncated  atomic.Uint64
}

func NewDNSServer(udpAddr, tcpAddr string, c *cache.DNSCache, r *resolver.Manager) *DNSServer {
	return &DNSServer{
		udpAddr:     udpAddr,
		tcpAddr:     tcpAddr,
		cache:       c,
		resolverMgr: r,
	}
}

func (s *DNSServer) ListenAndServe(stopCh <-chan struct{}) error {
	errCh := make(chan error, 2)

	go func() {
		if err := s.serveUDP(); err != nil {
			errCh <- fmt.Errorf("UDP server error: %w", err)
		}
	}()

	go func() {
		if err := s.serveTCP(); err != nil {
			errCh <- fmt.Errorf("TCP server error: %w", err)
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-stopCh:
		s.Shutdown()
		return nil
	}
}

func (s *DNSServer) serveUDP() error {
	addr, err := net.ResolveUDPAddr("udp", s.udpAddr)
	if err != nil {
		return fmt.Errorf("failed to resolve UDP address: %w", err)
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP: %w", err)
	}
	s.udpConn = conn
	defer conn.Close()

	log.Printf("DNS UDP server listening on %s", s.udpAddr)

	buf := make([]byte, MaxUDPBufferSize)
	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && !netErr.Temporary() {
				return fmt.Errorf("UDP read error: %w", err)
			}
			log.Printf("UDP read temporary error: %v", err)
			continue
		}

		s.stats.UDPQueries.Add(1)
		go s.handleUDPQuery(buf[:n], remoteAddr)
	}
}

func (s *DNSServer) handleUDPQuery(data []byte, remoteAddr *net.UDPAddr) {
	req := new(dns.Msg)
	if err := req.Unpack(data); err != nil {
		log.Printf("Failed to unpack UDP DNS request: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	maxSize := getMaxUDPSize(req)

	resp := s.processRequest(req)
	if resp == nil {
		return
	}

	respBytes, err := resp.Pack()
	if err != nil {
		log.Printf("Failed to pack DNS response: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	if len(respBytes) > maxSize {
		s.stats.Truncated.Add(1)
		resp.Truncated = true
		resp.Answer = nil
		resp.Ns = nil
		resp.Extra = nil
		if opt := resp.IsEdns0(); opt != nil {
			resp.Extra = []dns.RR{opt}
		}
		respBytes, err = resp.Pack()
		if err != nil {
			log.Printf("Failed to pack truncated DNS response: %v", err)
			s.stats.Errors.Add(1)
			return
		}
	}

	if _, err := s.udpConn.WriteToUDP(respBytes, remoteAddr); err != nil {
		log.Printf("Failed to write UDP response: %v", err)
		s.stats.Errors.Add(1)
	}
}

func (s *DNSServer) serveTCP() error {
	ln, err := net.Listen("tcp", s.tcpAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on TCP: %w", err)
	}
	s.tcpLn = ln
	defer ln.Close()

	log.Printf("DNS TCP server listening on %s", s.tcpAddr)

	for {
		conn, err := ln.Accept()
		if err != nil {
			if netErr, ok := err.(net.Error); ok && !netErr.Temporary() {
				return fmt.Errorf("TCP accept error: %w", err)
			}
			log.Printf("TCP accept temporary error: %v", err)
			continue
		}

		s.stats.TCPQueries.Add(1)
		go s.handleTCPConnection(conn)
	}
}

func (s *DNSServer) handleTCPConnection(conn net.Conn) {
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	lengthBuf := make([]byte, 2)
	if _, err := conn.Read(lengthBuf); err != nil {
		log.Printf("Failed to read TCP length: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	length := int(lengthBuf[0])<<8 | int(lengthBuf[1])
	if length > 65535 || length < 12 {
		log.Printf("Invalid TCP DNS message length: %d", length)
		s.stats.Errors.Add(1)
		return
	}

	msgBuf := make([]byte, length)
	if _, err := conn.Read(msgBuf); err != nil {
		log.Printf("Failed to read TCP DNS message: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	req := new(dns.Msg)
	if err := req.Unpack(msgBuf); err != nil {
		log.Printf("Failed to unpack TCP DNS request: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	resp := s.processRequest(req)
	if resp == nil {
		return
	}

	respBytes, err := resp.Pack()
	if err != nil {
		log.Printf("Failed to pack DNS response: %v", err)
		s.stats.Errors.Add(1)
		return
	}

	respLen := len(respBytes)
	respWithLen := make([]byte, 2+respLen)
	respWithLen[0] = byte(respLen >> 8)
	respWithLen[1] = byte(respLen)
	copy(respWithLen[2:], respBytes)

	if _, err := conn.Write(respWithLen); err != nil {
		log.Printf("Failed to write TCP response: %v", err)
		s.stats.Errors.Add(1)
	}
}

func (s *DNSServer) processRequest(req *dns.Msg) *dns.Msg {
	if len(req.Question) == 0 {
		return s.makeErrorResponse(req, dns.RcodeFormatError)
	}

	cacheKey := cache.GenerateCacheKey(req)
	if cacheKey != "" {
		if cached, ok := s.cache.Get(cacheKey); ok {
			cached.Id = req.Id
			cached = s.copyEDNSOptions(req, cached)
			return cached
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := s.resolverMgr.Query(ctx, req)
	if err != nil {
		log.Printf("Resolver query failed: %v", err)
		s.stats.Errors.Add(1)
		return s.makeErrorResponse(req, dns.RcodeServerFailure)
	}

	resp = s.copyEDNSOptions(req, resp)

	if cacheKey != "" && resp.Rcode == dns.RcodeSuccess {
		ttl := cache.GetMinTTL(resp)
		s.cache.Set(cacheKey, resp, ttl)
	}

	return resp
}

func (s *DNSServer) copyEDNSOptions(req, resp *dns.Msg) *dns.Msg {
	reqOpt := req.IsEdns0()
	if reqOpt == nil {
		return resp
	}

	respOpt := resp.IsEdns0()
	if respOpt == nil {
		respOpt = new(dns.OPT)
		respOpt.Hdr.Name = "."
		respOpt.Hdr.Rrtype = dns.TypeOPT
		resp.Extra = append([]dns.RR{respOpt}, resp.Extra...)
	}

	respOpt.SetUDPSize(reqOpt.UDPSize())
	respOpt.SetDo(reqOpt.Do())

	return resp
}

func (s *DNSServer) makeErrorResponse(req *dns.Msg, rcode int) *dns.Msg {
	resp := new(dns.Msg)
	resp.SetReply(req)
	resp.Rcode = rcode

	if opt := req.IsEdns0(); opt != nil {
		respOpt := new(dns.OPT)
		respOpt.Hdr.Name = "."
		respOpt.Hdr.Rrtype = dns.TypeOPT
		respOpt.SetUDPSize(opt.UDPSize())
		respOpt.SetDo(opt.Do())
		resp.Extra = append(resp.Extra, respOpt)
	}

	return resp
}

func (s *DNSServer) Shutdown() {
	if s.udpConn != nil {
		_ = s.udpConn.Close()
	}
	if s.tcpLn != nil {
		_ = s.tcpLn.Close()
	}
}

func (s *DNSServer) GetStats() map[string]interface{} {
	cacheStats := s.cache.GetStats()
	return map[string]interface{}{
		"udp_queries":        s.stats.UDPQueries.Load(),
		"tcp_queries":        s.stats.TCPQueries.Load(),
		"errors":             s.stats.Errors.Load(),
		"truncated":          s.stats.Truncated.Load(),
		"cache":              cacheStats,
		"hit_rate":           s.cache.HitRate(),
		"effective_hit_rate": s.cache.EffectiveHitRate(),
		"upstreams":          s.resolverMgr.Stats(),
	}
}

func getMaxUDPSize(req *dns.Msg) int {
	if opt := req.IsEdns0(); opt != nil {
		size := int(opt.UDPSize())
		if size < DefaultUDPBufferSize {
			size = DefaultUDPBufferSize
		}
		if size > MaxUDPBufferSize {
			size = MaxUDPBufferSize
		}
		return size
	}
	return DefaultUDPBufferSize
}
