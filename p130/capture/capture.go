package capture

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"sync"
	"time"

	"sip-analyzer/alerts"
	"sip-analyzer/database"
	"sip-analyzer/hep"
	"sip-analyzer/rtp"
	"sip-analyzer/sip"
)

type Server struct {
	db            *database.Database
	udpListener   *net.UDPConn
	tcpListener   *net.TCPListener
	rtpAnalyzer   *rtp.Analyzer
	alertDetector *alerts.Detector
	callIDMap     map[string]bool
	mediaPortMap  map[string]string
	mu            sync.RWMutex
	wg            sync.WaitGroup
	done          chan struct{}
}

type tcpBuffer struct {
	data []byte
	mu   sync.Mutex
}

func NewServer(db *database.Database) *Server {
	return &Server{
		db:            db,
		rtpAnalyzer:   rtp.NewAnalyzer(db),
		alertDetector: alerts.NewDetector(db),
		callIDMap:     make(map[string]bool),
		mediaPortMap:  make(map[string]string),
		done:          make(chan struct{}),
	}
}

func (s *Server) Start(udpPort, tcpPort int) error {
	if err := s.startUDP(udpPort); err != nil {
		return err
	}
	if err := s.startTCP(tcpPort); err != nil {
		s.stopUDP()
		return err
	}
	log.Printf("Capture server started: UDP :%d, TCP :%d", udpPort, tcpPort)
	return nil
}

func (s *Server) startUDP(port int) error {
	addr, err := net.ResolveUDPAddr("udp", ":"+itoa(port))
	if err != nil {
		return err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	s.udpListener = conn

	s.wg.Add(1)
	go s.handleUDP()
	return nil
}

func (s *Server) handleUDP() {
	defer s.wg.Done()

	buf := make([]byte, 65535)
	for {
		select {
		case <-s.done:
			return
		default:
		}

		s.udpListener.SetReadDeadline(time.Now().Add(1 * time.Second))
		n, _, err := s.udpListener.ReadFromUDP(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			select {
			case <-s.done:
				return
			default:
			}
			log.Printf("UDP read error: %v", err)
			continue
		}

		go s.processPacket(buf[:n])
	}
}

func (s *Server) startTCP(port int) error {
	addr, err := net.ResolveTCPAddr("tcp", ":"+itoa(port))
	if err != nil {
		return err
	}

	listener, err := net.ListenTCP("tcp", addr)
	if err != nil {
		return err
	}
	s.tcpListener = listener

	s.wg.Add(1)
	go s.handleTCP()
	return nil
}

func (s *Server) handleTCP() {
	defer s.wg.Done()

	for {
		select {
		case <-s.done:
			return
		default:
		}

		s.tcpListener.SetDeadline(time.Now().Add(1 * time.Second))
		conn, err := s.tcpListener.AcceptTCP()
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			select {
			case <-s.done:
				return
			default:
			}
			log.Printf("TCP accept error: %v", err)
			continue
		}

		s.wg.Add(1)
		go s.handleTCPConnection(conn)
	}
}

func (s *Server) handleTCPConnection(conn *net.TCPConn) {
	defer s.wg.Done()
	defer conn.Close()

	buf := &tcpBuffer{
		data: make([]byte, 0, 131072),
	}

	readBuf := make([]byte, 65535)
	for {
		select {
		case <-s.done:
			return
		default:
		}

		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(readBuf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				buf.mu.Lock()
				if len(buf.data) > 0 {
					log.Printf("TCP timeout with %d unprocessed bytes remaining", len(buf.data))
				}
				buf.mu.Unlock()
				return
			}
			return
		}

		buf.mu.Lock()
		buf.data = append(buf.data, readBuf[:n]...)

		for {
			if len(buf.data) < 6 {
				break
			}

			if buf.data[0] != 0x02 && buf.data[0] != 0x03 {
				log.Printf("Invalid HEP version: %d, searching for next valid header", buf.data[0])
				idx := findHEPHeader(buf.data)
				if idx < 0 {
					buf.data = buf.data[:0]
					break
				}
				buf.data = buf.data[idx:]
				continue
			}

			packetLen := binary.BigEndian.Uint32(buf.data[2:6])
			if packetLen < 6 || packetLen > 1048576 {
				log.Printf("Invalid HEP packet length: %d, resetting buffer", packetLen)
				buf.data = buf.data[:0]
				break
			}

			if uint32(len(buf.data)) < packetLen {
				break
			}

			packet := make([]byte, packetLen)
			copy(packet, buf.data[:packetLen])
			buf.data = buf.data[packetLen:]

			go s.processPacket(packet)
		}
		buf.mu.Unlock()
	}
}

func findHEPHeader(data []byte) int {
	for i := 0; i < len(data)-5; i++ {
		if (data[i] == 0x02 || data[i] == 0x03) && data[i+1] < 10 {
			length := binary.BigEndian.Uint32(data[i+2 : i+6])
			if length >= 6 && length < 1048576 {
				return i
			}
		}
	}
	return -1
}

func (s *Server) processPacket(data []byte) {
	hepPacket, err := hep.ParseHEP(data)
	if err != nil {
		log.Printf("HEP parse error: %v", err)
		return
	}

	if len(hepPacket.Payload) == 0 {
		return
	}

	switch {
	case hepPacket.IsSIP():
		s.processSIP(hepPacket)
	case hepPacket.IsRTP():
		s.processRTP(hepPacket)
	}
}

func (s *Server) processSIP(hepPacket *hep.HEPPacket) {
	sipMsg, err := sip.ParseSIP(hepPacket.Payload)
	if err != nil {
		log.Printf("SIP parse error: %v", err)
		return
	}

	dbMsg := sipMsg.ToDatabaseMessage(
		hepPacket.SrcIP(),
		hepPacket.DstIP(),
		int(hepPacket.SrcPort),
		int(hepPacket.DstPort),
	)

	if hepPacket.Timestamp > 0 {
		dbMsg.Timestamp = time.Unix(int64(hepPacket.Timestamp), int64(hepPacket.TimestampMicro)*1000)
	} else {
		dbMsg.Timestamp = time.Now()
	}

	id, err := s.db.InsertMessage(dbMsg)
	if err != nil {
		log.Printf("Database insert error: %v", err)
		return
	}

	s.alertDetector.ProcessSIPMessage(dbMsg)

	s.mu.Lock()
	s.callIDMap[dbMsg.CallID] = true
	s.extractMediaPorts(dbMsg)
	s.mu.Unlock()

	log.Printf("Stored SIP message #%d: Call-ID=%s Method=%s Status=%d",
		id, dbMsg.CallID, dbMsg.Method, dbMsg.StatusCode)
}

func (s *Server) extractMediaPorts(msg *database.SIPMessage) {
	mediaPortRegex := regexp.MustCompile(`m=audio\s+(\d+)\s+RTP`)
	matches := mediaPortRegex.FindAllStringSubmatch(msg.RawMessage, -1)
	
	for _, match := range matches {
		if len(match) >= 2 {
			port, err := strconv.Atoi(match[1])
			if err == nil && port > 0 {
				srcKey := fmt.Sprintf("%s:%d", msg.SourceIP, port)
				dstKey := fmt.Sprintf("%s:%d", msg.DestIP, port)
				s.mediaPortMap[srcKey] = msg.CallID
				s.mediaPortMap[dstKey] = msg.CallID
			}
		}
	}
	
	connRegex := regexp.MustCompile(`c=IN IP4\s+([\d.]+)`)
	connMatches := connRegex.FindAllStringSubmatch(msg.RawMessage, -1)
	
	for i, connMatch := range connMatches {
		if len(connMatch) >= 2 && i < len(matches) {
			ip := connMatch[1]
			if len(matches) > i {
				portMatch := matches[i]
				if len(portMatch) >= 2 {
					port, err := strconv.Atoi(portMatch[1])
					if err == nil && port > 0 {
						key := fmt.Sprintf("%s:%d", ip, port)
						s.mediaPortMap[key] = msg.CallID
					}
				}
			}
		}
	}
}

func (s *Server) processRTP(hepPacket *hep.HEPPacket) {
	callID := s.findCallID(hepPacket)
	if callID == "" {
		callID = fmt.Sprintf("rtp-%d-%d", hepPacket.SrcPort, hepPacket.DstPort)
	}

	arrivalTime := time.Now()
	if hepPacket.Timestamp > 0 {
		arrivalTime = time.Unix(int64(hepPacket.Timestamp), int64(hepPacket.TimestampMicro)*1000)
	}

	err := s.rtpAnalyzer.ProcessPacket(
		callID,
		hepPacket.SrcIP(),
		hepPacket.DstIP(),
		int(hepPacket.SrcPort),
		int(hepPacket.DstPort),
		hepPacket.Payload,
		arrivalTime,
	)
	if err != nil {
		log.Printf("RTP analysis error: %v", err)
		return
	}

	streams, err := s.db.GetRTPStreamsByCallID(callID)
	if err == nil && len(streams) > 0 {
		for _, stream := range streams {
			s.alertDetector.CheckRTPQuality(stream)
		}
	}
}

func (s *Server) findCallID(hepPacket *hep.HEPPacket) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	srcKey := fmt.Sprintf("%s:%d", hepPacket.SrcIP(), hepPacket.SrcPort)
	dstKey := fmt.Sprintf("%s:%d", hepPacket.DstIP(), hepPacket.DstPort)

	if callID, ok := s.mediaPortMap[srcKey]; ok {
		return callID
	}
	if callID, ok := s.mediaPortMap[dstKey]; ok {
		return callID
	}

	for callID := range s.callIDMap {
		messages, err := s.db.GetMessagesByCallID(callID)
		if err != nil {
			continue
		}
		for _, msg := range messages {
			msgSrc := fmt.Sprintf("%s:%d", msg.SourceIP, msg.SourcePort)
			msgDst := fmt.Sprintf("%s:%d", msg.DestIP, msg.DestPort)
			if (msgSrc == srcKey || msgDst == dstKey) ||
				(msgSrc == dstKey || msgDst == srcKey) {
				return callID
			}
		}
	}
	return ""
}

func (s *Server) stopUDP() {
	if s.udpListener != nil {
		s.udpListener.Close()
	}
}

func (s *Server) Stop() {
	close(s.done)

	if s.udpListener != nil {
		s.udpListener.Close()
	}
	if s.tcpListener != nil {
		s.tcpListener.Close()
	}

	s.wg.Wait()
	log.Println("Capture server stopped")
}

func (s *Server) RTPAnalyzer() *rtp.Analyzer {
	return s.rtpAnalyzer
}

func (s *Server) AlertDetector() *alerts.Detector {
	return s.alertDetector
}

func itoa(i int) string {
	return strconv.Itoa(i)
}

var fmtSprintf = fmt.Sprintf
