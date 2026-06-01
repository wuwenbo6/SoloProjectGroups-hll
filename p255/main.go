package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	OpRRQ   = uint16(1)
	OpWRQ   = uint16(2)
	OpDATA  = uint16(3)
	OpACK   = uint16(4)
	OpERROR = uint16(5)
	OpOACK  = uint16(6)

	DefaultBlockSize = 512
	MinBlockSize     = 512

	MTU             = 1500
	IPHeader        = 20
	UDPHeader       = 8
	TFTPHeader      = 4
	OptionOverhead  = 48
	MaxBlockSize    = MTU - IPHeader - UDPHeader - TFTPHeader - OptionOverhead

	RetransmitTimeout = 3 * time.Second
	MaxRetransmits    = 5

	TFTPort = ":69"
)

type TransferSession struct {
	Addr         *net.UDPAddr
	Filename     string
	Mode         string
	BlockSize    int
	BlockNum     uint16
	Conn         *net.UDPConn
	File         *os.File
	IsWrite      bool
	FileSize     int64
	TSize        int64
	LastActivity time.Time
	LastData     []byte
	RetransmitCount int
	StopRetransmit chan struct{}
	ReceivedBlocks map[uint16]bool
	mu           sync.Mutex
}

type Server struct {
	conn     *net.UDPConn
	sessions map[string]*TransferSession
	mu       sync.RWMutex
	rootDir  string
}

type NegotiationLog struct {
	Timestamp   string `json:"timestamp"`
	ClientAddr  string `json:"client_addr"`
	Filename    string `json:"filename"`
	Mode        string `json:"mode"`
	ReqBlockSize int   `json:"req_block_size"`
	NegBlockSize int   `json:"neg_block_size"`
	Success     bool   `json:"success"`
	Message     string `json:"message"`
}

var negotiationLogs []NegotiationLog
var logsMu sync.Mutex

func NewServer(rootDir string) (*Server, error) {
	if err := os.MkdirAll(rootDir, 0755); err != nil {
		return nil, err
	}

	addr, err := net.ResolveUDPAddr("udp", TFTPort)
	if err != nil {
		return nil, err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, err
	}

	return &Server{
		conn:     conn,
		sessions: make(map[string]*TransferSession),
		rootDir:  rootDir,
	}, nil
}

func (s *Server) ListenAndServe() error {
	log.Printf("TFTP Server listening on %s", TFTPort)
	log.Printf("MTU=%d, Max blksize=%d (MTU - IP%d - UDP%d - TFTP%d - Option%d)",
		MTU, MaxBlockSize, IPHeader, UDPHeader, TFTPHeader, OptionOverhead)
	buf := make([]byte, 2048)

	for {
		n, addr, err := s.conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("Read error: %v", err)
			continue
		}

		go s.handlePacket(buf[:n], addr)
	}
}

func (s *Server) handlePacket(data []byte, addr *net.UDPAddr) {
	if len(data) < 4 {
		return
	}

	opcode := binary.BigEndian.Uint16(data[0:2])

	switch opcode {
	case OpRRQ, OpWRQ:
		s.handleRequest(data, addr, opcode == OpWRQ)
	default:
		s.handleDataPacket(data, addr, opcode)
	}
}

func (s *Server) handleRequest(data []byte, addr *net.UDPAddr, isWrite bool) {
	parts := strings.Split(string(data[2:]), "\x00")
	if len(parts) < 2 {
		sendError(addr, 4, "Invalid request format")
		return
	}

	filename := parts[0]
	mode := parts[1]

	options := make(map[string]string)
	for i := 2; i+1 < len(parts); i += 2 {
		if parts[i] != "" && parts[i+1] != "" {
			options[strings.ToLower(parts[i])] = parts[i+1]
		}
	}

	blockSize := DefaultBlockSize
	reqBlockSize := DefaultBlockSize
	var tsize int64 = 0
	var negMsg string

	if blksizeStr, ok := options["blksize"]; ok {
		reqSize, err := strconv.Atoi(blksizeStr)
		if err == nil {
			reqBlockSize = reqSize
			if reqSize < MinBlockSize {
				blockSize = MinBlockSize
				negMsg = fmt.Sprintf("Requested blksize %d too small, using minimum %d", reqSize, MinBlockSize)
			} else if reqSize > MaxBlockSize {
				blockSize = MaxBlockSize
				negMsg = fmt.Sprintf("Requested blksize %d too large (MTU=%d), using maximum %d", reqSize, MTU, MaxBlockSize)
			} else {
				blockSize = reqSize
				negMsg = fmt.Sprintf("Accepted blksize %d (MTU-safe)", reqSize)
			}
		}
	} else {
		negMsg = "No blksize option, using default 512"
	}

	sessionConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("0.0.0.0"), Port: 0})
	if err != nil {
		sendError(addr, 0, "Internal server error")
		logNegotiation(addr.String(), filename, mode, reqBlockSize, blockSize, false, "Failed to create session")
		return
	}

	safeFilename := filepath.Base(filename)
	filePath := filepath.Join(s.rootDir, safeFilename)

	var file *os.File
	var fileSize int64 = 0

	if isWrite {
		file, err = os.Create(filePath)
		if tsizeStr, ok := options["tsize"]; ok {
			if reqSize, err := strconv.ParseInt(tsizeStr, 10, 64); err == nil {
				tsize = reqSize
				negMsg += fmt.Sprintf(", tsize %d bytes", tsize)
			}
		}
	} else {
		file, err = os.Open(filePath)
		if err == nil {
			if fi, statErr := file.Stat(); statErr == nil {
				fileSize = fi.Size()
				if _, ok := options["tsize"]; ok {
					tsize = fileSize
					negMsg += fmt.Sprintf(", tsize %d bytes", tsize)
				}
			}
		}
	}

	if err != nil {
		sendError(addr, 1, fmt.Sprintf("File not found: %s", filename))
		sessionConn.Close()
		logNegotiation(addr.String(), filename, mode, reqBlockSize, blockSize, false, err.Error())
		return
	}

	logNegotiation(addr.String(), filename, mode, reqBlockSize, blockSize, true, negMsg)

	log.Printf("Client %s: %s file '%s' (mode: %s), blksize req=%d neg=%d, tsize=%d",
		addr.String(), map[bool]string{true: "WRITE", false: "READ"}[isWrite],
		filename, mode, reqBlockSize, blockSize, tsize)

	session := &TransferSession{
		Addr:           addr,
		Filename:       filename,
		Mode:           mode,
		BlockSize:      blockSize,
		BlockNum:       0,
		Conn:           sessionConn,
		File:           file,
		IsWrite:        isWrite,
		FileSize:       fileSize,
		TSize:          tsize,
		LastActivity:   time.Now(),
		StopRetransmit: make(chan struct{}),
		ReceivedBlocks: make(map[uint16]bool),
	}

	s.mu.Lock()
	s.sessions[addr.String()] = session
	s.mu.Unlock()

	if len(options) > 0 {
		s.sendOACK(session, options)
		go s.startRetransmitTimer(session)
	} else if !isWrite {
		go s.sendNextDataBlock(session)
	}

	go s.monitorSession(session)
}

func (s *Server) sendOACK(session *TransferSession, options map[string]string) {
	session.mu.Lock()
	defer session.mu.Unlock()

	oack := make([]byte, 2)
	binary.BigEndian.PutUint16(oack, OpOACK)

	optionsLog := ""

	if _, hasBlksize := options["blksize"]; hasBlksize {
		oack = append(oack, []byte("blksize")...)
		oack = append(oack, 0)
		oack = append(oack, []byte(strconv.Itoa(session.BlockSize))...)
		oack = append(oack, 0)
		optionsLog += fmt.Sprintf(" blksize=%d", session.BlockSize)
	}

	if _, hasTsize := options["tsize"]; hasTsize {
		oack = append(oack, []byte("tsize")...)
		oack = append(oack, 0)
		oack = append(oack, []byte(strconv.FormatInt(session.TSize, 10))...)
		oack = append(oack, 0)
		optionsLog += fmt.Sprintf(" tsize=%d", session.TSize)
	}

	session.LastData = make([]byte, len(oack))
	copy(session.LastData, oack)
	session.RetransmitCount = 0

	session.Conn.WriteToUDP(oack, session.Addr)
	log.Printf("Sent OACK to %s with%s", session.Addr.String(), optionsLog)
}

func (s *Server) startRetransmitTimer(session *TransferSession) {
	ticker := time.NewTicker(RetransmitTimeout)
	defer ticker.Stop()

	for {
		select {
		case <-session.StopRetransmit:
			return
		case <-ticker.C:
			session.mu.Lock()
			if session.RetransmitCount >= MaxRetransmits {
				session.mu.Unlock()
				log.Printf("Max retransmits reached for %s, closing session", session.Addr.String())
				sendError(session.Addr, 0, "Timeout - max retransmits reached")
				s.closeSession(session)
				return
			}

			if len(session.LastData) > 0 {
				session.RetransmitCount++
				session.Conn.WriteToUDP(session.LastData, session.Addr)

				opcode := binary.BigEndian.Uint16(session.LastData[0:2])
				var blockInfo string
				if opcode == OpDATA {
					blockNum := binary.BigEndian.Uint16(session.LastData[2:4])
					blockInfo = fmt.Sprintf(" block #%d", blockNum)
				}
				log.Printf("Retransmit #%d to %s%s (%d bytes)",
					session.RetransmitCount, session.Addr.String(), blockInfo, len(session.LastData))
			}
			session.mu.Unlock()
		}
	}
}

func (s *Server) handleDataPacket(data []byte, addr *net.UDPAddr, opcode uint16) {
	s.mu.RLock()
	session, exists := s.sessions[addr.String()]
	s.mu.RUnlock()

	if !exists {
		return
	}

	session.LastActivity = time.Now()

	switch opcode {
	case OpACK:
		if len(data) < 4 {
			return
		}
		ackBlock := binary.BigEndian.Uint16(data[2:4])

		session.mu.Lock()
		if ackBlock == session.BlockNum {
			close(session.StopRetransmit)
			session.StopRetransmit = make(chan struct{})
			session.LastData = nil
			session.RetransmitCount = 0
			session.mu.Unlock()

			if !session.IsWrite {
				go s.sendNextDataBlock(session)
			}
		} else {
			session.mu.Unlock()
		}

	case OpDATA:
		if !session.IsWrite {
			return
		}
		if len(data) < 4 {
			return
		}
		blockNum := binary.BigEndian.Uint16(data[2:4])
		blockData := data[4:]

		session.mu.Lock()
		if session.ReceivedBlocks[blockNum] {
			log.Printf("Duplicate block #%d from %s, ignoring (already received)",
				blockNum, session.Addr.String())
		} else {
			session.ReceivedBlocks[blockNum] = true
			session.File.Write(blockData)
			session.BlockNum = blockNum
			log.Printf("Received new block #%d from %s (%d bytes)",
				blockNum, session.Addr.String(), len(blockData))
		}

		ack := make([]byte, 4)
		binary.BigEndian.PutUint16(ack, OpACK)
		binary.BigEndian.PutUint16(ack[2:], blockNum)
		session.Conn.WriteToUDP(ack, session.Addr)
		session.mu.Unlock()

		if len(blockData) < session.BlockSize {
			s.closeSession(session)
		}
	}
}

func (s *Server) sendNextDataBlock(session *TransferSession) {
	session.mu.Lock()
	defer session.mu.Unlock()

	session.BlockNum++

	buf := make([]byte, session.BlockSize)
	n, err := session.File.Read(buf)
	if err != nil {
		s.closeSession(session)
		return
	}

	packet := make([]byte, 4+n)
	binary.BigEndian.PutUint16(packet, OpDATA)
	binary.BigEndian.PutUint16(packet[2:], session.BlockNum)
	copy(packet[4:], buf[:n])

	session.LastData = make([]byte, len(packet))
	copy(session.LastData, packet)
	session.RetransmitCount = 0

	session.Conn.WriteToUDP(packet, session.Addr)
	log.Printf("Sent block #%d to %s (%d bytes)", session.BlockNum, session.Addr.String(), n)

	go s.startRetransmitTimer(session)

	if n < session.BlockSize {
		go s.waitForFinalAck(session)
	}
}

func (s *Server) waitForFinalAck(session *TransferSession) {
	time.Sleep(5 * time.Second)
	s.closeSession(session)
}

func (s *Server) closeSession(session *TransferSession) {
	s.mu.Lock()
	delete(s.sessions, session.Addr.String())
	s.mu.Unlock()

	select {
	case <-session.StopRetransmit:
	default:
		close(session.StopRetransmit)
	}

	session.File.Close()
	session.Conn.Close()
	log.Printf("Session closed for %s, transferred %d blocks", session.Addr.String(), session.BlockNum)
}

func (s *Server) monitorSession(session *TransferSession) {
	for {
		time.Sleep(10 * time.Second)
		if time.Since(session.LastActivity) > 30*time.Second {
			log.Printf("Session timeout for %s", session.Addr.String())
			s.closeSession(session)
			return
		}

		s.mu.RLock()
		_, exists := s.sessions[session.Addr.String()]
		s.mu.RUnlock()

		if !exists {
			return
		}
	}
}

func sendError(addr *net.UDPAddr, code uint16, msg string) {
	conn, _ := net.DialUDP("udp", nil, addr)
	if conn == nil {
		return
	}
	defer conn.Close()

	packet := make([]byte, 4+len(msg)+1)
	binary.BigEndian.PutUint16(packet, OpERROR)
	binary.BigEndian.PutUint16(packet[2:], code)
	copy(packet[4:], msg)
	packet[4+len(msg)] = 0
	conn.Write(packet)
}

func logNegotiation(clientAddr, filename, mode string, reqSize, negSize int, success bool, message string) {
	logsMu.Lock()
	defer logsMu.Unlock()

	negotiationLogs = append(negotiationLogs, NegotiationLog{
		Timestamp:    time.Now().Format(time.RFC3339),
		ClientAddr:   clientAddr,
		Filename:     filename,
		Mode:         mode,
		ReqBlockSize: reqSize,
		NegBlockSize: negSize,
		Success:      success,
		Message:      message,
	})

	if len(negotiationLogs) > 100 {
		negotiationLogs = negotiationLogs[1:]
	}
}

func GetNegotiationLogs() []NegotiationLog {
	logsMu.Lock()
	defer logsMu.Unlock()

	result := make([]NegotiationLog, len(negotiationLogs))
	copy(result, negotiationLogs)
	return result
}
