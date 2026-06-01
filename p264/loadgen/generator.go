package loadgen

import (
	"context"
	"fmt"
	"net"
	"sync"
	"syscall"
	"time"

	"stun-bench/stats"
	"stun-bench/stun"

	"golang.org/x/sys/unix"
)

const (
	MaxRetries = 3
)

type Config struct {
	ServerAddr string
	NumClients int
	RatePerSec int
	Duration   time.Duration
	Timeout    time.Duration
	Mode       string
	Username   string
	Password   string
	Realm      string
	DDoS       bool
	ConnRate   int
}

type Generator struct {
	cfg       Config
	collector *stats.Collector
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

func New(cfg Config, collector *stats.Collector) *Generator {
	return &Generator{cfg: cfg, collector: collector}
}

func (g *Generator) Start(ctx context.Context) {
	ctx, g.cancel = context.WithCancel(ctx)

	interval := time.Second
	if g.cfg.RatePerSec > 0 {
		interval = time.Second / time.Duration(g.cfg.RatePerSec)
	}

	if !g.cfg.DDoS {
		for i := 0; i < g.cfg.NumClients; i++ {
			g.wg.Add(1)
			go g.runClient(ctx, i, interval)
		}
	}

	if g.cfg.DDoS && g.cfg.ConnRate > 0 {
		g.wg.Add(1)
		go g.runDDoS(ctx)
	}

	if g.cfg.Duration > 0 {
		go func() {
			select {
			case <-time.After(g.cfg.Duration):
				g.Stop()
			case <-ctx.Done():
			}
		}()
	}
}

func (g *Generator) Stop() {
	if g.cancel != nil {
		g.cancel()
	}
	g.wg.Wait()
}

func (g *Generator) Wait() {
	g.wg.Wait()
}

func dialUDPWithReuse(laddr, raddr *net.UDPAddr) (*net.UDPConn, error) {
	lc := net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			var opErr error
			err := c.Control(func(fd uintptr) {
				opErr = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_REUSEADDR, 1)
				if opErr != nil {
					return
				}
				_ = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_REUSEPORT, 1)
			})
			if err != nil {
				return err
			}
			return opErr
		},
	}

	conn, err := lc.ListenPacket(context.Background(), "udp4", laddr.String())
	if err != nil {
		return nil, err
	}

	udpConn, ok := conn.(*net.UDPConn)
	if !ok {
		conn.Close()
		return nil, fmt.Errorf("not a UDP conn")
	}
	return udpConn, nil
}

func (g *Generator) runClient(ctx context.Context, id int, interval time.Duration) {
	defer g.wg.Done()

	raddr, err := net.ResolveUDPAddr("udp", g.cfg.ServerAddr)
	if err != nil {
		fmt.Printf("[client %d] resolve addr error: %v\n", id, err)
		return
	}

	laddr := &net.UDPAddr{IP: net.IPv4zero, Port: 0}

	conn, err := dialUDPWithReuse(laddr, raddr)
	if err != nil {
		fmt.Printf("[client %d] dial error: %v\n", id, err)
		return
	}
	defer conn.Close()

	g.collector.IncConn()
	defer g.collector.DecConn()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	buf := make([]byte, 1500)

	var cachedRealm, cachedNonce string
	if g.cfg.Realm != "" {
		cachedRealm = g.cfg.Realm
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			start := time.Now()
			success := false

			if g.cfg.Mode == "turn" {
				success = g.tryAllocation(conn, raddr, buf, &cachedRealm, &cachedNonce)
			} else {
				success = g.tryBinding(conn, raddr, buf)
			}

			latency := time.Since(start)
			if success {
				g.collector.RecordSuccess(latency)
			} else {
				g.collector.RecordError()
			}
		}
	}
}

func (g *Generator) tryBinding(conn *net.UDPConn, raddr *net.UDPAddr, buf []byte) bool {
	req := stun.NewBindingRequest()
	data := req.Encode()

	for attempt := 0; attempt < MaxRetries; attempt++ {
		_, err := conn.WriteTo(data, raddr)
		if err != nil {
			continue
		}

		conn.SetReadDeadline(time.Now().Add(g.cfg.Timeout))
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			continue
		}

		resp, err := stun.Decode(buf[:n])
		if err != nil {
			continue
		}

		if resp.IsSuccess() {
			return true
		}
	}
	return false
}

func (g *Generator) tryAllocation(conn *net.UDPConn, raddr *net.UDPAddr, buf []byte, cachedRealm, cachedNonce *string) bool {
	nonce := stun.GenerateNonce()
	var lastCode int

	for attempt := 0; attempt < MaxRetries; attempt++ {
		var data []byte
		if *cachedRealm != "" && *cachedNonce != "" {
			req := stun.NewAllocateRequest(g.cfg.Username, 600)
			req.AddAttr(stun.AttrNonce, stun.Padded([]byte(*cachedNonce)))
			req.AddAttr(stun.AttrRealm, stun.Padded([]byte(*cachedRealm)))
			data = req.EncodeWithIntegrity(g.cfg.Username, *cachedRealm, g.cfg.Password)
		} else {
			req := stun.NewAllocateRequest("", 600)
			req.AddAttr(stun.AttrNonce, stun.Padded([]byte(nonce)))
			data = req.Encode()
		}

		_, err := conn.WriteTo(data, raddr)
		if err != nil {
			continue
		}

		conn.SetReadDeadline(time.Now().Add(g.cfg.Timeout))
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			continue
		}

		resp, err := stun.Decode(buf[:n])
		if err != nil {
			continue
		}

		if resp.IsAllocateSuccess() {
			return true
		}

		if resp.IsError() {
			code, _ := resp.GetErrorCode()
			lastCode = code

			if code == stun.CodeUnauthorized || code == stun.CodeStaleNonce {
				if realm, ok := resp.GetAttrString(stun.AttrRealm); ok {
					*cachedRealm = realm
				}
				if newNonce, ok := resp.GetAttrString(stun.AttrNonce); ok {
					*cachedNonce = newNonce
				}
				continue
			}
		}
	}

	if lastCode == stun.CodeUnauthorized || lastCode == stun.CodeStaleNonce {
		*cachedNonce = ""
	}
	return false
}

func (g *Generator) runDDoS(ctx context.Context) {
	defer g.wg.Done()

	interval := time.Second / time.Duration(g.cfg.ConnRate)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	raddr, err := net.ResolveUDPAddr("udp", g.cfg.ServerAddr)
	if err != nil {
		fmt.Printf("[ddos] resolve addr error: %v\n", err)
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g.wg.Add(1)
			go g.ddosWorker(ctx, raddr)
		}
	}
}

func (g *Generator) ddosWorker(ctx context.Context, raddr *net.UDPAddr) {
	defer g.wg.Done()

	laddr := &net.UDPAddr{IP: net.IPv4zero, Port: 0}
	conn, err := dialUDPWithReuse(laddr, raddr)
	if err != nil {
		g.collector.RecordError()
		return
	}
	defer conn.Close()

	g.collector.IncConn()
	defer g.collector.DecConn()

	buf := make([]byte, 1500)
	start := time.Now()
	success := false

	if g.cfg.Mode == "turn" {
		var realm, nonce string
		if g.cfg.Realm != "" {
			realm = g.cfg.Realm
		}
		success = g.tryAllocation(conn, raddr, buf, &realm, &nonce)
	} else {
		success = g.tryBinding(conn, raddr, buf)
	}

	latency := time.Since(start)
	if success {
		g.collector.RecordSuccess(latency)
	} else {
		g.collector.RecordError()
	}
}
