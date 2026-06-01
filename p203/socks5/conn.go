package socks5

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"net"
)

const (
	Socks5Version = 0x05
)

const (
	CmdConnect = 0x01
	CmdBind    = 0x02
	CmdUDP     = 0x03
)

const (
	AddrIPv4   = 0x01
	AddrDomain = 0x03
	AddrIPv6   = 0x04
)

const (
	RepSucceeded           = 0x00
	RepGeneralFailure     = 0x01
	RepConnectionNotAllowed = 0x02
	RepNetworkUnreachable = 0x03
	RepHostUnreachable    = 0x04
	RepConnectionRefused   = 0x05
	RepTTLExpired         = 0x06
	RepCommandNotSupported = 0x07
	RepAddrNotSupported   = 0x08
)

type Conn struct {
	reader   *bufio.Reader
	conn     net.Conn
	Username string
}

func NewConn(c net.Conn) *Conn {
	return &Conn{
		reader: bufio.NewReader(c),
		conn:   c,
	}
}

func (c *Conn) ReadBuf(buf []byte) (int, error) {
	return io.ReadFull(c.reader, buf)
}

func (c *Conn) Read(p []byte) (int, error) {
	return c.reader.Read(p)
}

func (c *Conn) Write(b []byte) (int, error) {
	return c.conn.Write(b)
}

func (c *Conn) Close() error {
	return c.conn.Close()
}

func (c *Conn) RemoteAddr() net.Addr {
	return c.conn.RemoteAddr()
}

type Address struct {
	Type byte
	Host string
	Port uint16
}

func (c *Conn) ReadAddress() (*Address, error) {
	addrTypeBuf := make([]byte, 1)
	if _, err := c.ReadBuf(addrTypeBuf); err != nil {
		return nil, err
	}
	addr := &Address{Type: addrTypeBuf[0]}
	switch addr.Type {
	case AddrIPv4:
		ipBuf := make([]byte, 4)
		if _, err := c.ReadBuf(ipBuf); err != nil {
			return nil, err
		}
		addr.Host = net.IP(ipBuf).String()
	case AddrDomain:
		lenBuf := make([]byte, 1)
		if _, err := c.ReadBuf(lenBuf); err != nil {
			return nil, err
		}
		domainBuf := make([]byte, lenBuf[0])
		if _, err := c.ReadBuf(domainBuf); err != nil {
			return nil, err
		}
		addr.Host = string(domainBuf)
	case AddrIPv6:
		ipBuf := make([]byte, 16)
		if _, err := c.ReadBuf(ipBuf); err != nil {
			return nil, err
		}
		addr.Host = net.IP(ipBuf).String()
	default:
		return nil, fmt.Errorf("unsupported address type: %d", addr.Type)
	}
	portBuf := make([]byte, 2)
	if _, err := c.ReadBuf(portBuf); err != nil {
		return nil, err
	}
	addr.Port = binary.BigEndian.Uint16(portBuf)
	return addr, nil
}

func (a *Address) String() string {
	if a.Type == AddrIPv6 {
		return fmt.Sprintf("[%s]:%d", a.Host, a.Port)
	}
	return fmt.Sprintf("%s:%d", a.Host, a.Port)
}

func (a *Address) Bytes() []byte {
	buf := make([]byte, 0, 64)
	buf = append(buf, a.Type)
	switch a.Type {
	case AddrIPv4:
		ip := net.ParseIP(a.Host).To4()
		buf = append(buf, ip...)
	case AddrDomain:
		buf = append(buf, byte(len(a.Host)))
		buf = append(buf, []byte(a.Host)...)
	case AddrIPv6:
		ip := net.ParseIP(a.Host).To16()
		buf = append(buf, ip...)
	}
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, a.Port)
	buf = append(buf, portBytes...)
	return buf
}

func BuildReply(rep byte, addr *Address) []byte {
	reply := []byte{Socks5Version, rep, 0x00}
	if addr != nil {
		reply = append(reply, addr.Bytes()...)
	} else {
		reply = append(reply, AddrIPv4, 0, 0, 0, 0, 0, 0)
	}
	return reply
}
