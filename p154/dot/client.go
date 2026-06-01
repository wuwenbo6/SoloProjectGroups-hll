package dot

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"github.com/miekg/dns"

	"dns-proxy/resolver"
)

type DoTClient struct {
	resolver.BaseUpstream
	Address    string
	ServerName string
	tlsConfig  *tls.Config
	connPool   *sync.Pool
	timeout    time.Duration
}

type pooledConn struct {
	conn net.Conn
}

func NewDoTClient(name, address, serverName string, timeout time.Duration) *DoTClient {
	c := &DoTClient{
		Address:    address,
		ServerName: serverName,
		timeout:    timeout,
		tlsConfig: &tls.Config{
			ServerName:         serverName,
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: false,
		},
	}
	c.connPool = &sync.Pool{
		New: func() interface{} { return nil },
	}
	c.SetName(name)
	c.SetHealthy(true)
	return c
}

func (c *DoTClient) Type() string { return "DoT" }

func (c *DoTClient) Query(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	if req == nil {
		return nil, fmt.Errorf("nil DNS request")
	}

	packed, err := req.Pack()
	if err != nil {
		return nil, fmt.Errorf("failed to pack DNS request: %w", err)
	}

	conn, err := c.getConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get DoT connection: %w", err)
	}

	deadline := time.Now().Add(c.timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)

	resp, err := c.sendReceive(conn, packed, req.Id)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}

	select {
	case <-ctx.Done():
		_ = conn.Close()
		return nil, ctx.Err()
	default:
		c.putConn(conn)
		return resp, nil
	}
}

func (c *DoTClient) sendReceive(conn net.Conn, packed []byte, id uint16) (*dns.Msg, error) {
	lengthBuf := []byte{byte(len(packed) >> 8), byte(len(packed))}

	if _, err := conn.Write(lengthBuf); err != nil {
		return nil, fmt.Errorf("failed to write DNS length: %w", err)
	}

	if _, err := conn.Write(packed); err != nil {
		return nil, fmt.Errorf("failed to write DNS request: %w", err)
	}

	respLenBuf := make([]byte, 2)
	if _, err := io.ReadFull(conn, respLenBuf); err != nil {
		return nil, fmt.Errorf("failed to read DNS length: %w", err)
	}

	respLen := int(respLenBuf[0])<<8 | int(respLenBuf[1])
	if respLen < 12 || respLen > 65535 {
		return nil, fmt.Errorf("invalid DNS response length: %d", respLen)
	}

	respBuf := make([]byte, respLen)
	if _, err := io.ReadFull(conn, respBuf); err != nil {
		return nil, fmt.Errorf("failed to read DNS response: %w", err)
	}

	resp := new(dns.Msg)
	if err := resp.Unpack(respBuf); err != nil {
		return nil, fmt.Errorf("failed to unpack DNS response: %w", err)
	}

	resp.Id = id
	return resp, nil
}

func (c *DoTClient) getConn(ctx context.Context) (net.Conn, error) {
	if pc := c.connPool.Get(); pc != nil {
		conn := pc.(*pooledConn).conn
		if c.isConnAlive(conn) {
			return conn, nil
		}
		_ = conn.Close()
	}

	dialer := &tls.Dialer{
		NetDialer: &net.Dialer{
			Timeout: c.timeout,
		},
		Config: c.tlsConfig,
	}

	network := "tcp"
	addr := c.Address
	if _, _, err := net.SplitHostPort(addr); err != nil {
		addr = net.JoinHostPort(addr, "853")
	}

	conn, err := dialer.DialContext(ctx, network, addr)
	if err != nil {
		return nil, fmt.Errorf("failed to dial DoT server: %w", err)
	}

	return conn, nil
}

func (c *DoTClient) putConn(conn net.Conn) {
	if !c.isConnAlive(conn) {
		_ = conn.Close()
		return
	}

	if tc, ok := conn.(*tls.Conn); ok {
		state := tc.ConnectionState()
		if !state.HandshakeComplete {
			_ = conn.Close()
			return
		}
	}

	_ = conn.SetDeadline(time.Time{})
	c.connPool.Put(&pooledConn{conn: conn})
}

func (c *DoTClient) isConnAlive(conn net.Conn) bool {
	one := []byte{}
	_ = conn.SetReadDeadline(time.Now().Add(1 * time.Millisecond))
	_, err := conn.Read(one)
	_ = conn.SetReadDeadline(time.Time{})

	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return true
		}
		if err == io.EOF {
			return false
		}
	}

	return false
}

func (c *DoTClient) CheckConnection() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := c.getConn(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if conn != nil {
			_ = conn.Close()
		}
	}()

	req := new(dns.Msg)
	req.SetQuestion(dns.Fqdn("cloudflare.com"), dns.TypeA)

	packed, err := req.Pack()
	if err != nil {
		return err
	}

	_, err = c.sendReceive(conn, packed, req.Id)
	return err
}
