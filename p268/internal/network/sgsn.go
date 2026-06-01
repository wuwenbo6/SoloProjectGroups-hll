package network

import (
	"fmt"
	"net"
	"sync"
	"time"

	"gtp-simulator/internal/gtpv1"
	"gtp-simulator/internal/pdp"
)

type SGSN struct {
	IP               net.IP
	ControlPort      int
	UserPort         int
	PDPManager       *pdp.PDPManager
	GGSNAddr         *net.UDPAddr
	controlConn      *net.UDPConn
	userConn         *net.UDPConn
	seqNum           uint16
	sequenceManager  *gtpv1.SequenceManager
	mu               sync.Mutex
	enableSeqOrder   bool
}

func NewSGSN(ip string, controlPort, userPort int, ggsnIP string, ggsnControlPort, ggsnUserPort int) (*SGSN, error) {
	sgsnIP := net.ParseIP(ip)
	if sgsnIP == nil {
		return nil, fmt.Errorf("invalid SGSN IP: %s", ip)
	}

	ggsnAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", ggsnIP, ggsnUserPort))
	if err != nil {
		return nil, err
	}

	sgsn := &SGSN{
		IP:             sgsnIP,
		ControlPort:    controlPort,
		UserPort:       userPort,
		PDPManager:     pdp.NewPDPManager(),
		GGSNAddr:       ggsnAddr,
		enableSeqOrder: true,
	}

	sgsn.sequenceManager = gtpv1.NewSequenceManager(32, 100, 5*time.Second)
	sgsn.sequenceManager.SetForwardCallback(sgsn.onPacketForwarded)

	return sgsn, nil
}

func (s *SGSN) Start() error {
	controlAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", s.IP.String(), s.ControlPort))
	if err != nil {
		return err
	}

	userAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", s.IP.String(), s.UserPort))
	if err != nil {
		return err
	}

	s.controlConn, err = net.ListenUDP("udp", controlAddr)
	if err != nil {
		return err
	}

	s.userConn, err = net.ListenUDP("udp", userAddr)
	if err != nil {
		s.controlConn.Close()
		return err
	}

	go s.listenControl()
	go s.listenUser()

	return nil
}

func (s *SGSN) Stop() {
	if s.controlConn != nil {
		s.controlConn.Close()
	}
	if s.userConn != nil {
		s.userConn.Close()
	}
}

func (s *SGSN) nextSeqNum() uint16 {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seqNum++
	return s.seqNum
}

func (s *SGSN) CreatePDPContext(req pdp.CreatePDPRequest) (*pdp.PDPContext, error) {
	req.SGSNIP = s.IP
	pdpCtx, err := s.PDPManager.CreatePDP(req)
	if err != nil {
		return nil, err
	}

	gtpReq := gtpv1.CreatePDPContextRequest{
		IMSI:    req.IMSI,
		TLLI:    0xFFFFFFFF,
		RAI:     "460001234567890",
		PDPType: req.PDPType,
		PDPAddress: gtpv1.PDPAddress{
			PDPTypeOrg: 0xF1,
			PDPTypeNum: 0x21,
			PDPAddress: req.MSIP.To4(),
		},
		APN:        req.APN,
		QoSProfile: req.QoSProfile,
		NSAPI:      req.NSAPI,
	}

	msg, err := gtpv1.BuildCreatePDPContextRequest(s.nextSeqNum(), pdpCtx.TEIDControl, gtpReq)
	if err != nil {
		return nil, err
	}

	controlAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", req.GGSNIP.String(), 3123))
	if err != nil {
		return nil, err
	}

	_, err = s.controlConn.WriteToUDP(msg, controlAddr)
	if err != nil {
		return nil, err
	}

	return pdpCtx, nil
}

func (s *SGSN) DeletePDPContext(id string) error {
	pdpCtx, exists := s.PDPManager.GetPDP(id)
	if !exists {
		return fmt.Errorf("PDP context %s not found", id)
	}

	msg, err := gtpv1.BuildDeletePDPContextRequest(s.nextSeqNum(), pdpCtx.TEIDControl, true)
	if err != nil {
		return err
	}

	controlAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", pdpCtx.GGSNIP.String(), 3123))
	if err != nil {
		return err
	}

	_, err = s.controlConn.WriteToUDP(msg, controlAddr)
	if err != nil {
		return err
	}

	return s.PDPManager.DeletePDP(id)
}

func (s *SGSN) onPacketForwarded(teid uint32, data []byte, seq uint16) {
	pdpCtx, exists := s.PDPManager.GetPDPByTEID(teid)
	if !exists {
		fmt.Printf("SGSN: Forwarded packet with unknown TEID: 0x%x, seq: %d\n", teid, seq)
		return
	}

	pdpCtx.IncrementDownlink(len(data))
	fmt.Printf("SGSN: Forwarded in-order downlink data for PDP %s, TEID: 0x%x, seq: %d, size: %d bytes\n",
		pdpCtx.ID, teid, seq, len(data))
}

func (s *SGSN) SendUplinkData(pdpID string, ipPacket []byte) error {
	pdpCtx, exists := s.PDPManager.GetPDP(pdpID)
	if !exists {
		return fmt.Errorf("PDP context %s not found", pdpID)
	}

	if !pdpCtx.Active {
		return fmt.Errorf("PDP context %s is not active", pdpID)
	}

	packetLen := len(ipPacket)
	if !pdpCtx.CheckUplinkQoS(packetLen) {
		return fmt.Errorf("PDP context %s uplink rate limited by QoS", pdpID)
	}

	gtpPacket, err := gtpv1.EncapsulateIPPacketWithSeq(pdpCtx.TEIDUser, ipPacket, s.nextSeqNum())
	if err != nil {
		return err
	}

	_, err = s.userConn.WriteToUDP(gtpPacket, s.GGSNAddr)
	if err != nil {
		return err
	}

	pdpCtx.IncrementUplink(len(ipPacket))
	return nil
}

func (s *SGSN) GetSequenceManager() *gtpv1.SequenceManager {
	return s.sequenceManager
}

func (s *SGSN) EnableSequenceOrder(enable bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.enableSeqOrder = enable
}

func (s *SGSN) IsSequenceOrderEnabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.enableSeqOrder
}

func (s *SGSN) listenControl() {
	buf := make([]byte, 1500)
	for {
		n, addr, err := s.controlConn.ReadFromUDP(buf)
		if err != nil {
			return
		}

		header, err := gtpv1.UnmarshalHeader(buf[:n])
		if err != nil {
			continue
		}

		switch header.MessageType {
		case gtpv1.MsgTypeCreatePDPContextResponse:
			_, resp, err := gtpv1.ParseCreatePDPContextResponse(buf[:n])
			if err == nil && resp.Cause == 0 {
				fmt.Printf("SGSN: Received Create PDP Context Response (Cause: %d) from %s\n", resp.Cause, addr)
			}
		case gtpv1.MsgTypeEchoRequest:
			resp, _ := gtpv1.BuildEchoResponse(header.SequenceNumber, header.TEID)
			s.controlConn.WriteToUDP(resp, addr)
		}
	}
}

func (s *SGSN) listenUser() {
	buf := make([]byte, 2000)
	for {
		n, addr, err := s.userConn.ReadFromUDP(buf)
		if err != nil {
			return
		}

		teid, seq, ipPacket, err := gtpv1.DecapsulateIPPacketWithSeq(buf[:n])
		if err != nil {
			continue
		}

		pdpCtx, exists := s.PDPManager.GetPDPByTEID(teid)
		if !exists {
			fmt.Printf("SGSN: Received GTP-U packet with unknown TEID: 0x%x from %s\n", teid, addr)
			continue
		}

		if s.enableSeqOrder {
			s.sequenceManager.HandlePacket(teid, seq, ipPacket)
		} else {
			pdpCtx.IncrementDownlink(len(ipPacket))
			fmt.Printf("SGSN: Received downlink data for PDP %s, TEID: 0x%x, seq: %d, size: %d bytes\n",
				pdpCtx.ID, teid, seq, len(ipPacket))
		}
	}
}
