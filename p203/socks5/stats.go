package socks5

import (
	"sync/atomic"
)

type Stats struct {
	ActiveConns  atomic.Int64
	TotalConns   atomic.Int64
	BytesSent    atomic.Int64
	BytesRecv    atomic.Int64
	UDPBytesSent atomic.Int64
	UDPBytesRecv atomic.Int64
	UDPConns     atomic.Int64
	TCPConns     atomic.Int64
}

func NewStats() *Stats {
	return &Stats{}
}

func (s *Stats) Snapshot() map[string]interface{} {
	return map[string]interface{}{
		"active_connections": s.ActiveConns.Load(),
		"total_connections":  s.TotalConns.Load(),
		"bytes_sent":         s.BytesSent.Load(),
		"bytes_received":     s.BytesRecv.Load(),
		"udp_bytes_sent":     s.UDPBytesSent.Load(),
		"udp_bytes_received": s.UDPBytesRecv.Load(),
		"udp_connections":    s.UDPConns.Load(),
		"tcp_connections":    s.TCPConns.Load(),
	}
}
