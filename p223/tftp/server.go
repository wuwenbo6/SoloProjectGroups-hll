package tftp

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	OpcodeRRQ   = 1
	OpcodeWRQ   = 2
	OpcodeDATA  = 3
	OpcodeACK   = 4
	OpcodeERROR = 5
	OpcodeOACK  = 6

	BlockSize = 512
	MaxBlock  = 65535
)

type Server struct {
	addr      string
	directory string
	conn      *net.UDPConn
}

func NewServer(addr, directory string) *Server {
	return &Server{
		addr:      addr,
		directory: directory,
	}
}

func (s *Server) ListenAndServe() error {
	addr, err := net.ResolveUDPAddr("udp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to resolve UDP address: %w", err)
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP: %w", err)
	}
	s.conn = conn
	defer conn.Close()

	log.Printf("TFTP server listening on %s, serving from %s", s.addr, s.directory)

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
	if len(data) < 4 {
		return
	}

	opcode := binary.BigEndian.Uint16(data[0:2])

	switch opcode {
	case OpcodeRRQ:
		s.handleRRQ(data, remoteAddr)
	case OpcodeWRQ:
		s.sendError(remoteAddr, 4, "Write requests not supported")
	default:
		s.sendError(remoteAddr, 4, "Invalid operation")
	}
}

func (s *Server) handleRRQ(data []byte, remoteAddr *net.UDPAddr) {
	parts := bytes.Split(data[2:], []byte{0})
	if len(parts) < 2 {
		s.sendError(remoteAddr, 4, "Malformed request")
		return
	}

	filename := string(parts[0])
	mode := strings.ToLower(string(parts[1]))

	if mode != "octet" && mode != "netascii" {
		s.sendError(remoteAddr, 4, "Unsupported mode")
		return
	}

	cleanPath := filepath.Clean(filepath.Join(s.directory, filename))
	if !strings.HasPrefix(cleanPath, filepath.Clean(s.directory)) {
		s.sendError(remoteAddr, 2, "Access violation")
		return
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			s.sendError(remoteAddr, 1, "File not found")
		} else {
			s.sendError(remoteAddr, 2, "Access violation")
		}
		return
	}
	defer file.Close()

	log.Printf("TFTP: Sending %s to %s", filename, remoteAddr)

	s.sendFile(file, remoteAddr)
}

func (s *Server) sendFile(file io.Reader, remoteAddr *net.UDPAddr) {
	conn, err := net.DialUDP("udp", nil, remoteAddr)
	if err != nil {
		log.Printf("Failed to dial UDP for TFTP transfer: %v", err)
		return
	}
	defer conn.Close()

	buf := make([]byte, BlockSize)
	blockNum := uint16(1)

	for {
		n, err := file.Read(buf)
		if err != nil && err != io.EOF {
			s.sendError(remoteAddr, 3, "Unknown error")
			return
		}

		if n == 0 {
			return
		}

		dataPkt := make([]byte, 4+n)
		binary.BigEndian.PutUint16(dataPkt[0:2], OpcodeDATA)
		binary.BigEndian.PutUint16(dataPkt[2:4], blockNum)
		copy(dataPkt[4:], buf[:n])

		ackReceived := false
		for retry := 0; retry < 5; retry++ {
			_, err := conn.Write(dataPkt)
			if err != nil {
				log.Printf("Failed to send TFTP DATA: %v", err)
				return
			}

			conn.SetReadDeadline(time.Now().Add(5 * time.Second))

			ackBuf := make([]byte, 1500)
			ackN, err := conn.Read(ackBuf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				return
			}

			if ackN < 4 {
				continue
			}

			ackOpcode := binary.BigEndian.Uint16(ackBuf[0:2])
			ackBlock := binary.BigEndian.Uint16(ackBuf[2:4])

			if ackOpcode == OpcodeACK && ackBlock == blockNum {
				ackReceived = true
				break
			}

			if ackOpcode == OpcodeERROR {
				return
			}
		}

		if !ackReceived {
			log.Printf("TFTP transfer timeout for block %d to %s", blockNum, remoteAddr)
			return
		}

		blockNum++

		if n < BlockSize {
			return
		}
	}
}

func (s *Server) sendError(remoteAddr *net.UDPAddr, code uint16, message string) {
	conn, err := net.DialUDP("udp", nil, remoteAddr)
	if err != nil {
		log.Printf("Failed to dial UDP for TFTP error: %v", err)
		return
	}
	defer conn.Close()

	pkt := make([]byte, 4+len(message)+1)
	binary.BigEndian.PutUint16(pkt[0:2], OpcodeERROR)
	binary.BigEndian.PutUint16(pkt[2:4], code)
	copy(pkt[4:], message)
	pkt[len(pkt)-1] = 0

	conn.Write(pkt)
}

func (s *Server) Close() {
	if s.conn != nil {
		s.conn.Close()
	}
}
