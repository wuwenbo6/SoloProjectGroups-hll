package socks5

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"time"
)

type Config struct {
	ListenAddr    string
	UDPListenAddr string
	HTTPAddr      string
	Credentials   StaticCredentials
	Blacklist     *Blacklist
	RateLimiter   *RateLimiter
}

type Server struct {
	config         *Config
	stats          *Stats
	authenticators []Authenticator
}

func NewServer(cfg *Config) *Server {
	s := &Server{
		config:      cfg,
		stats:       NewStats(),
	}
	s.authenticators = append(s.authenticators, NoAuthAuthenticator{})
	if len(cfg.Credentials) > 0 {
		s.authenticators = append(s.authenticators, PasswordAuthenticator{Credentials: cfg.Credentials})
	}
	return s
}

func (s *Server) Stats() *Stats {
	return s.stats
}

func (s *Server) ListenAndServe() error {
	go s.startHTTP()
	listener, err := net.Listen("tcp", s.config.ListenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", s.config.ListenAddr, err)
	}
	defer listener.Close()
	log.Printf("SOCKS5 server listening on %s", s.config.ListenAddr)
	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("accept error: %v", err)
			continue
		}
		go s.handleConn(conn)
	}
}

func (s *Server) handleConn(netConn net.Conn) {
	conn := NewConn(netConn)
	defer func() {
		conn.Close()
		s.stats.ActiveConns.Add(-1)
	}()
	s.stats.ActiveConns.Add(1)
	s.stats.TotalConns.Add(1)
	versionBuf := make([]byte, 1)
	if _, err := conn.ReadBuf(versionBuf); err != nil {
		return
	}
	if versionBuf[0] != Socks5Version {
		return
	}
	nmethodsBuf := make([]byte, 1)
	if _, err := conn.ReadBuf(nmethodsBuf); err != nil {
		return
	}
	methodsBuf := make([]byte, nmethodsBuf[0])
	if _, err := conn.ReadBuf(methodsBuf); err != nil {
		return
	}
	selectedMethod := byte(AuthNoAcceptable)
	for _, method := range methodsBuf {
		for _, auth := range s.authenticators {
			for _, m := range auth.Methods() {
				if m == method {
					selectedMethod = method
					break
				}
			}
			if selectedMethod != AuthNoAcceptable {
				break
			}
		}
		if selectedMethod != AuthNoAcceptable {
			break
		}
	}
	if _, err := conn.Write([]byte{Socks5Version, selectedMethod}); err != nil {
		return
	}
	if selectedMethod == AuthNoAcceptable {
		return
	}
	var chosenAuth Authenticator
	for _, auth := range s.authenticators {
		for _, m := range auth.Methods() {
			if m == selectedMethod {
				chosenAuth = auth
				break
			}
		}
		if chosenAuth != nil {
			break
		}
	}
	if chosenAuth != nil {
		ok, err := chosenAuth.Authenticate(conn)
		if err != nil || !ok {
			return
		}
	}
	cmdBuf := make([]byte, 1)
	if _, err := conn.ReadBuf(cmdBuf); err != nil {
		return
	}
	rsvBuf := make([]byte, 1)
	if _, err := conn.ReadBuf(rsvBuf); err != nil {
		return
	}
	addr, err := conn.ReadAddress()
	if err != nil {
		return
	}
	switch cmdBuf[0] {
	case CmdConnect:
		s.handleTCP(conn, addr)
	case CmdUDP:
		s.handleUDPAssociate(conn, addr)
	default:
		conn.Write(BuildReply(RepCommandNotSupported, nil))
	}
}

func (s *Server) handleTCP(conn *Conn, addr *Address) {
	if s.config.Blacklist != nil && s.config.Blacklist.Contains(addr.Host) {
		log.Printf("Connection to %s blocked by blacklist", addr.Host)
		conn.Write(BuildReply(RepConnectionNotAllowed, nil))
		return
	}
	target, err := net.Dial("tcp", addr.String())
	if err != nil {
		conn.Write(BuildReply(RepGeneralFailure, nil))
		return
	}
	defer target.Close()
	s.stats.TCPConns.Add(1)
	localAddr := target.LocalAddr()
	bindAddr, err := parseAddr(localAddr.String())
	if err != nil {
		conn.Write(BuildReply(RepGeneralFailure, nil))
		return
	}
	conn.Write(BuildReply(RepSucceeded, bindAddr))
	go func() {
		n, _ := rateLimitedCopy(target, conn, s.config.RateLimiter, true, s.stats)
		s.stats.BytesRecv.Add(n)
	}()
	n, _ := rateLimitedCopy(conn, target, s.config.RateLimiter, false, s.stats)
	s.stats.BytesSent.Add(n)
}

func rateLimitedCopy(dst, src io.Writer, rl *RateLimiter, isUpload bool, stats *Stats) (int64, error) {
	buf := make([]byte, 32*1024)
	var total int64
	for {
		nr, err := src.(io.Reader).Read(buf)
		if nr > 0 {
			if rl != nil {
				var limited int
				var wait time.Duration
				if isUpload {
					limited, wait = rl.LimitUpload(nr)
				} else {
					limited, wait = rl.LimitDownload(nr)
				}
				if wait > 0 {
					time.Sleep(wait)
				}
				if limited < nr {
					_, err := dst.Write(buf[:limited])
					if err != nil {
						return total, err
					}
					total += int64(limited)
					remaining := nr - limited
					offset := limited
					for remaining > 0 {
						var chunk int
						var wait time.Duration
						if isUpload {
							chunk, wait = rl.LimitUpload(remaining)
						} else {
							chunk, wait = rl.LimitDownload(remaining)
						}
						if wait > 0 {
							time.Sleep(wait)
						}
						if chunk > 0 {
							_, err := dst.Write(buf[offset : offset+chunk])
							if err != nil {
								return total, err
							}
							total += int64(chunk)
							offset += chunk
							remaining -= chunk
						}
					}
					continue
				}
			}
			nw, err := dst.Write(buf[:nr])
			if nw > 0 {
				total += int64(nw)
			}
			if err != nil {
				return total, err
			}
			if nr != nw {
				return total, io.ErrShortWrite
			}
		}
		if err != nil {
			if err == io.EOF {
				return total, nil
			}
			return total, err
		}
	}
}

func (s *Server) startHTTP() {
	if s.config.HTTPAddr == "" {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(s.stats.Snapshot())
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(dashboardHTML))
	})
	log.Printf("HTTP dashboard listening on %s", s.config.HTTPAddr)
	http.ListenAndServe(s.config.HTTPAddr, mux)
}

func parseAddr(addrStr string) (*Address, error) {
	host, portStr, err := net.SplitHostPort(addrStr)
	if err != nil {
		return nil, err
	}
	port := 0
	fmt.Sscanf(portStr, "%d", &port)
	ip := net.ParseIP(host)
	addr := &Address{Port: uint16(port)}
	if ip == nil {
		addr.Type = AddrDomain
		addr.Host = host
	} else if ip.To4() != nil {
		addr.Type = AddrIPv4
		addr.Host = host
	} else {
		addr.Type = AddrIPv6
		addr.Host = host
	}
	return addr, nil
}
