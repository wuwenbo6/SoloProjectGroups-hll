package socks5

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

type UDPAssociation struct {
	conn         *net.UDPConn
	clientAddr   *net.UDPAddr
	closed       bool
	mu           sync.Mutex
	targetConns  map[string]*net.UDPConn
	targetMutex  sync.RWMutex
	shutdownChan chan struct{}
}

func NewUDPAssociation(bindAddr string) (*UDPAssociation, error) {
	addr, err := net.ResolveUDPAddr("udp", bindAddr)
	if err != nil {
		return nil, err
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, err
	}
	ua := &UDPAssociation{
		conn:         conn,
		targetConns:  make(map[string]*net.UDPConn),
		shutdownChan: make(chan struct{}),
	}
	return ua, nil
}

func (ua *UDPAssociation) LocalAddr() net.Addr {
	return ua.conn.LocalAddr()
}

func (ua *UDPAssociation) Close() {
	ua.mu.Lock()
	defer ua.mu.Unlock()
	if ua.closed {
		return
	}
	ua.closed = true
	close(ua.shutdownChan)
	ua.conn.Close()
	ua.targetMutex.Lock()
	defer ua.targetMutex.Unlock()
	for _, c := range ua.targetConns {
		c.Close()
	}
}

func (ua *UDPAssociation) getTargetConn(targetAddr *net.UDPAddr, rl *RateLimiter) (*net.UDPConn, error) {
	key := targetAddr.String()
	ua.targetMutex.RLock()
	conn, ok := ua.targetConns[key]
	ua.targetMutex.RUnlock()
	if ok {
		return conn, nil
	}
	ua.targetMutex.Lock()
	defer ua.targetMutex.Unlock()
	if conn, ok := ua.targetConns[key]; ok {
		return conn, nil
	}
	conn, err := net.DialUDP("udp", nil, targetAddr)
	if err != nil {
		return nil, err
	}
	ua.targetConns[key] = conn
	go ua.relayFromTarget(conn, targetAddr, rl)
	return conn, nil
}

func (ua *UDPAssociation) relayFromTarget(targetConn *net.UDPConn, targetAddr *net.UDPAddr, rl *RateLimiter) {
	buf := make([]byte, 65535)
	for {
		select {
		case <-ua.shutdownChan:
			return
		default:
		}
		targetConn.SetReadDeadline(time.Now().Add(5 * time.Second))
		n, _, err := targetConn.ReadFromUDP(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			return
		}
		ua.targetMutex.RLock()
		clientAddr := ua.clientAddr
		ua.targetMutex.RUnlock()
		if clientAddr == nil {
			continue
		}
		addrBytes := buildTargetAddrBytes(targetAddr)
		reply := buildUDPReply(addrBytes, buf[:n])
		if rl != nil {
			limited, wait := rl.LimitDownload(len(reply))
			if wait > 0 {
				time.Sleep(wait)
			}
			if limited < len(reply) {
				reply = reply[:limited]
			}
		}
		_, err = ua.conn.WriteToUDP(reply, clientAddr)
		if err != nil {
			return
		}
	}
}

func (ua *UDPAssociation) Serve(stats *Stats, tcpConn io.Reader, blacklist *Blacklist, rl *RateLimiter) {
	buf := make([]byte, 65535)
	go func() {
		dummy := make([]byte, 1)
		tcpConn.Read(dummy)
		ua.Close()
	}()
	for {
		select {
		case <-ua.shutdownChan:
			return
		default:
		}
		ua.conn.SetReadDeadline(time.Now().Add(1 * time.Second))
		n, clientAddr, err := ua.conn.ReadFromUDP(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			return
		}
		ua.targetMutex.Lock()
		ua.clientAddr = clientAddr
		ua.targetMutex.Unlock()
		if n < 10 {
			continue
		}
		frag := buf[2]
		if frag != 0 {
			continue
		}
		addrRaw, host, port, err := parseUDPAddr(buf[3:n])
		if err != nil {
			continue
		}
		_ = addrRaw
		if blacklist != nil && blacklist.Contains(host) {
			log.Printf("UDP to %s blocked by blacklist", host)
			continue
		}
		payloadStart := 3
		switch buf[3] {
		case 0x01:
			payloadStart += 7
		case 0x03:
			payloadStart += 4 + int(buf[4])
		case 0x04:
			payloadStart += 19
		}
		if payloadStart >= n {
			continue
		}
		payload := buf[payloadStart:n]
		stats.UDPConns.Add(1)
		stats.UDPBytesRecv.Add(int64(len(payload)))
		if rl != nil {
			limited, wait := rl.LimitUpload(len(payload))
			if wait > 0 {
				time.Sleep(wait)
			}
			if limited < len(payload) {
				payload = payload[:limited]
			}
		}
		targetUDPAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", host, port))
		if err != nil {
			continue
		}
		targetConn, err := ua.getTargetConn(targetUDPAddr, rl)
		if err != nil {
			continue
		}
		_, err = targetConn.Write(payload)
		if err != nil {
			continue
		}
		stats.UDPBytesSent.Add(int64(len(payload)))
	}
}

func (s *Server) handleUDPAssociate(conn *Conn, addr *Address) {
	bindHost := "0.0.0.0"
	if s.config.UDPListenAddr != "" {
		if h, _, err := net.SplitHostPort(s.config.UDPListenAddr); err == nil {
			bindHost = h
		}
	}
	ua, err := NewUDPAssociation(fmt.Sprintf("%s:0", bindHost))
	if err != nil {
		log.Printf("UDP associate error: %v", err)
		conn.Write(BuildReply(RepGeneralFailure, nil))
		return
	}
	defer ua.Close()
	localAddr := ua.LocalAddr()
	bindAddr, err := parseAddr(localAddr.String())
	if err != nil {
		conn.Write(BuildReply(RepGeneralFailure, nil))
		return
	}
	conn.Write(BuildReply(RepSucceeded, bindAddr))
	log.Printf("UDP association bound on %s", localAddr.String())
	ua.Serve(s.stats, conn, s.config.Blacklist, s.config.RateLimiter)
}

func parseUDPAddr(data []byte) (raw []byte, host string, port uint16, err error) {
	if len(data) < 1 {
		return nil, "", 0, fmt.Errorf("too short")
	}
	addrType := data[0]
	switch addrType {
	case 0x01:
		if len(data) < 7 {
			return nil, "", 0, fmt.Errorf("ipv4 too short")
		}
		host = net.IP(data[1:5]).String()
		port = binary.BigEndian.Uint16(data[5:7])
		raw = data[:7]
	case 0x03:
		if len(data) < 2 {
			return nil, "", 0, fmt.Errorf("domain too short")
		}
		domainLen := int(data[1])
		if len(data) < 2+domainLen+2 {
			return nil, "", 0, fmt.Errorf("domain data too short")
		}
		host = string(data[2 : 2+domainLen])
		port = binary.BigEndian.Uint16(data[2+domainLen : 4+domainLen])
		raw = data[:4+domainLen]
	case 0x04:
		if len(data) < 19 {
			return nil, "", 0, fmt.Errorf("ipv6 too short")
		}
		host = net.IP(data[1:17]).String()
		port = binary.BigEndian.Uint16(data[17:19])
		raw = data[:19]
	default:
		return nil, "", 0, fmt.Errorf("unsupported addr type: %d", addrType)
	}
	return raw, host, port, nil
}

func buildTargetAddrBytes(addr *net.UDPAddr) []byte {
	ip := addr.IP
	if ip4 := ip.To4(); ip4 != nil {
		buf := make([]byte, 7)
		buf[0] = 0x01
		copy(buf[1:5], ip4)
		binary.BigEndian.PutUint16(buf[5:7], uint16(addr.Port))
		return buf
	}
	buf := make([]byte, 19)
	buf[0] = 0x04
	copy(buf[1:17], ip.To16())
	binary.BigEndian.PutUint16(buf[17:19], uint16(addr.Port))
	return buf
}

func buildUDPReply(addr []byte, payload []byte) []byte {
	rsv := []byte{0x00, 0x00}
	frag := []byte{0x00}
	result := make([]byte, 0, len(rsv)+len(frag)+len(addr)+len(payload))
	result = append(result, rsv...)
	result = append(result, frag...)
	result = append(result, addr...)
	result = append(result, payload...)
	return result
}
