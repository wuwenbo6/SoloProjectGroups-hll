package session

import (
	"iec104-simulator/protocol"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

type SessionState int

const (
	StateConnecting SessionState = iota
	StateConnected
	StateStartDTSent
	StateStartDTCon
	StateActive
	StateStopped
)

type EventHandler interface {
	OnFrameReceived(sess *Session, apci *protocol.APCI, asdu *protocol.ASDU)
	OnSessionStateChanged(sess *Session, oldState, newState SessionState)
}

type Session struct {
	conn         net.Conn
	state        SessionState
	mu           sync.Mutex
	sendSeq      uint16
	recvSeq      uint16
	lastReceived time.Time
	handler      EventHandler
	done         chan struct{}
	wg           sync.WaitGroup
	t1           time.Duration
	t2           time.Duration
	t3           time.Duration
	outbound     chan []byte
}

func NewSession(conn net.Conn, handler EventHandler) *Session {
	return &Session{
		conn:     conn,
		state:    StateConnected,
		handler:  handler,
		done:     make(chan struct{}),
		t1:       15 * time.Second,
		t2:       10 * time.Second,
		t3:       20 * time.Second,
		outbound: make(chan []byte, 256),
	}
}

func (s *Session) State() SessionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *Session) setState(newState SessionState) {
	s.mu.Lock()
	oldState := s.state
	s.state = newState
	s.mu.Unlock()
	if s.handler != nil && oldState != newState {
		s.handler.OnSessionStateChanged(s, oldState, newState)
	}
}

func (s *Session) Start() {
	s.setState(StateConnected)
	s.lastReceived = time.Now()

	s.wg.Add(3)
	go s.readLoop()
	go s.writeLoop()
	go s.timerLoop()
}

func (s *Session) Stop() {
	close(s.done)
	s.conn.Close()
	s.wg.Wait()
	s.setState(StateStopped)
}

func (s *Session) SendUFrame(uType protocol.UFrameType) {
	frame := protocol.BuildUFrame(uType)
	s.outbound <- frame
}

func (s *Session) SendIFrame(asduData []byte) {
	s.mu.Lock()
	ss := s.sendSeq
	rs := s.recvSeq
	s.sendSeq++
	s.mu.Unlock()

	frame := protocol.BuildIFrame(ss, rs, asduData)
	s.outbound <- frame
}

func (s *Session) SendSFrame() {
	s.mu.Lock()
	rs := s.recvSeq
	s.mu.Unlock()
	frame := protocol.BuildSFrame(rs)
	s.outbound <- frame
}

func (s *Session) readLoop() {
	defer s.wg.Done()

	buf := make([]byte, 2048)
	var frameBuf []byte

	for {
		select {
		case <-s.done:
			return
		default:
		}

		s.conn.SetReadDeadline(time.Now().Add(s.t1))
		n, err := s.conn.Read(buf)
		if err != nil {
			if err == io.EOF {
				log.Printf("[Session] Connection closed by peer")
			} else {
				log.Printf("[Session] Read error: %v", err)
			}
			close(s.done)
			s.setState(StateStopped)
			return
		}

		frameBuf = append(frameBuf, buf[:n]...)

		for len(frameBuf) >= protocol.APCIHeaderSize {
			if frameBuf[0] != protocol.StartByte {
				frameBuf = frameBuf[1:]
				continue
			}
			frameLen := int(frameBuf[1]) + 2
			if len(frameBuf) < frameLen {
				break
			}

			frame := make([]byte, frameLen)
			copy(frame, frameBuf[:frameLen])
			frameBuf = frameBuf[frameLen:]

			s.handleFrame(frame)
		}
	}
}

func (s *Session) handleFrame(data []byte) {
	apci, err := protocol.ParseAPCI(data)
	if err != nil {
		log.Printf("[Session] Parse APCI error: %v", err)
		return
	}
	s.lastReceived = time.Now()

	switch apci.FrameType {
	case protocol.FrameI:
		s.mu.Lock()
		s.recvSeq++
		s.mu.Unlock()

		if len(data) > protocol.APCIHeaderSize {
			asdu, err := protocol.ParseASDU(data[protocol.APCIHeaderSize:])
			if err != nil {
				log.Printf("[Session] Parse ASDU error: %v", err)
				return
			}
			if s.handler != nil {
				s.handler.OnFrameReceived(s, apci, asdu)
			}
		}

	case protocol.FrameS:
		s.mu.Lock()
		s.mu.Unlock()

	case protocol.FrameU:
		switch apci.UType {
		case protocol.UStartDTACT:
			log.Printf("[Session] Received STARTDT ACT")
			s.setState(StateStartDTSent)
			s.SendUFrame(protocol.UStartDTCON)
			s.setState(StateActive)
		case protocol.UStartDTCON:
			log.Printf("[Session] Received STARTDT CON")
			s.setState(StateActive)
		case protocol.UStopDTACT:
			log.Printf("[Session] Received STOPDT ACT")
			s.SendUFrame(protocol.UStopDTCON)
			s.setState(StateConnected)
		case protocol.UTestFRACT:
			log.Printf("[Session] Received TESTFR ACT")
			s.SendUFrame(protocol.UTestFRCON)
		case protocol.UTestFRCON:
			log.Printf("[Session] Received TESTFR CON")
		}
	}
}

func (s *Session) writeLoop() {
	defer s.wg.Done()

	for {
		select {
		case <-s.done:
			return
		case frame := <-s.outbound:
			_, err := s.conn.Write(frame)
			if err != nil {
				log.Printf("[Session] Write error: %v", err)
				return
			}
		}
	}
}

func (s *Session) timerLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			elapsed := time.Since(s.lastReceived)
			if elapsed >= s.t3 && s.State() == StateActive {
				log.Printf("[Session] T3 timeout, sending TESTFR")
				s.SendUFrame(protocol.UTestFRACT)
			}
		}
	}
}
