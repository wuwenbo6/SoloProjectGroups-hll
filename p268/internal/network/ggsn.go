package network

import (
	"fmt"
	"net"
	"sync"
	"time"

	"gtp-simulator/internal/gtpv1"
	"gtp-simulator/internal/pdp"
)

type GGSN struct {
	IP               net.IP
	ControlPort      int
	UserPort         int
	PDPManager       *pdp.PDPManager
	controlConn      *net.UDPConn
	userConn         *net.UDPConn
	seqNum           uint16
	sequenceManager  *gtpv1.SequenceManager
	mu               sync.Mutex
	enableSeqOrder   bool
}

func NewGGSN(ip string, controlPort, userPort int) (*GGSN, error) {
	ggsnIP := net.ParseIP(ip)
	if ggsnIP == nil {
		return nil, fmt.Errorf("invalid GGSN IP: %s", ip)
	}

	ggsn := &GGSN{
		IP:             ggsnIP,
		ControlPort:    controlPort,
		UserPort:       userPort,
		PDPManager:     pdp.NewPDPManager(),
		enableSeqOrder: true,
	}

	ggsn.sequenceManager = gtpv1.NewSequenceManager(32, 100, 5*time.Second)
	ggsn.sequenceManager.SetForwardCallback(ggsn.onPacketForwarded)

	return ggsn, nil
}

func (g *GGSN) Start() error {
	controlAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", g.IP.String(), g.ControlPort))
	if err != nil {
		return err
	}

	userAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", g.IP.String(), g.UserPort))
	if err != nil {
		return err
	}

	g.controlConn, err = net.ListenUDP("udp", controlAddr)
	if err != nil {
		return err
	}

	g.userConn, err = net.ListenUDP("udp", userAddr)
	if err != nil {
		g.controlConn.Close()
		return err
	}

	go g.listenControl()
	go g.listenUser()

	return nil
}

func (g *GGSN) Stop() {
	if g.controlConn != nil {
		g.controlConn.Close()
	}
	if g.userConn != nil {
		g.userConn.Close()
	}
}

func (g *GGSN) nextSeqNum() uint16 {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.seqNum++
	return g.seqNum
}

func (g *GGSN) onPacketForwarded(teid uint32, data []byte, seq uint16) {
	pdpCtx, exists := g.PDPManager.GetPDPByTEID(teid)
	if !exists {
		fmt.Printf("GGSN: Forwarded packet with unknown TEID: 0x%x, seq: %d\n", teid, seq)
		return
	}

	pdpCtx.IncrementUplink(len(data))
	fmt.Printf("GGSN: Forwarded in-order uplink data for PDP %s, TEID: 0x%x, seq: %d, size: %d bytes\n",
		pdpCtx.ID, teid, seq, len(data))

	g.sendDownlinkData(pdpCtx, data, nil)
}

func (g *GGSN) GetSequenceManager() *gtpv1.SequenceManager {
	return g.sequenceManager
}

func (g *GGSN) EnableSequenceOrder(enable bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.enableSeqOrder = enable
}

func (g *GGSN) IsSequenceOrderEnabled() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.enableSeqOrder
}

func (g *GGSN) listenControl() {
	buf := make([]byte, 1500)
	for {
		n, addr, err := g.controlConn.ReadFromUDP(buf)
		if err != nil {
			return
		}

		header, err := gtpv1.UnmarshalHeader(buf[:n])
		if err != nil {
			continue
		}

		switch header.MessageType {
		case gtpv1.MsgTypeCreatePDPContextRequest:
			g.handleCreatePDPContextRequest(buf[:n], addr)
		case gtpv1.MsgTypeDeletePDPContextRequest:
			g.handleDeletePDPContextRequest(buf[:n], addr)
		case gtpv1.MsgTypeEchoRequest:
			resp, _ := gtpv1.BuildEchoResponse(header.SequenceNumber, header.TEID)
			g.controlConn.WriteToUDP(resp, addr)
		case gtpv1.MsgTypeEchoResponse:
			fmt.Printf("GGSN: Received Echo Response from %s\n", addr)
		}
	}
}

func (g *GGSN) handleCreatePDPContextRequest(data []byte, addr *net.UDPAddr) {
	header, err := gtpv1.UnmarshalHeader(data)
	if err != nil {
		return
	}

	offset := gtpv1.GTPv1HeaderLen
	if header.Ext == 1 || header.SN == 1 || header.PN == 1 {
		offset += 4
	}

	var imsi, apn string
	var nsapi uint8
	var pdpType uint8
	var pdpAddr gtpv1.PDPAddress
	var qosProfile gtpv1.QoSProfile

	for offset < len(data) {
		ie, err := gtpv1.DecodeIE(data[offset:])
		if err != nil {
			break
		}

		switch ie.Type {
		case gtpv1.IEIIMSI:
			imsi = string(ie.Data)
		case gtpv1.IEINSAPI:
			if ie.Length > 0 {
				nsapi = ie.Data[0]
			}
		case gtpv1.IEIPDPType:
			if ie.Length > 0 {
				pdpType = ie.Data[0]
			}
		case gtpv1.IEIPDPAddress:
			pdpAddr, _ = gtpv1.DecodePDPAddress(ie.Data)
		case gtpv1.IEIAccessPointName:
			apn = string(ie.Data)
		case gtpv1.IEIQualityOfServiceProfile:
			qosProfile, _ = gtpv1.DecodeQoSProfile(ie.Data)
		}

		offset += int(3 + ie.Length)
	}

	pdpReq := pdp.CreatePDPRequest{
		IMSI:       imsi,
		NSAPI:      nsapi,
		APN:        apn,
		PDPType:    pdpType,
		MSIP:       pdpAddr.PDPAddress,
		GGSNIP:     g.IP,
		SGSNIP:     addr.IP,
		QoSProfile: qosProfile,
	}

	pdpCtx, err := g.PDPManager.CreatePDP(pdpReq)
	if err != nil {
		fmt.Printf("GGSN: Failed to create PDP context: %v\n", err)
		return
	}

	respHeader := &gtpv1.Header{
		Version:        gtpv1.VersionGTPv1,
		PT:             1,
		MessageType:    gtpv1.MsgTypeCreatePDPContextResponse,
		TEID:           header.TEID,
		SN:             1,
		SequenceNumber: header.SequenceNumber,
	}

	var ies []byte

	causeIE := gtpv1.EncodeIE(gtpv1.InformationElement{
		Type:   gtpv1.IEICause,
		Length: 1,
		Data:   []byte{0},
	})
	ies = append(ies, causeIE...)

	pdpAddrIE := gtpv1.EncodeIE(gtpv1.InformationElement{
		Type:   gtpv1.IEIPDPAddress,
		Length: uint16(len(gtpv1.EncodePDPAddress(gtpv1.PDPAddress{
			PDPTypeOrg: 0xF1,
			PDPTypeNum: 0x21,
			PDPAddress: pdpCtx.MSIP.To4(),
		}))),
		Data: gtpv1.EncodePDPAddress(gtpv1.PDPAddress{
			PDPTypeOrg: 0xF1,
			PDPTypeNum: 0x21,
			PDPAddress: pdpCtx.MSIP.To4(),
		}),
	})
	ies = append(ies, pdpAddrIE...)

	qosIE := gtpv1.EncodeIE(gtpv1.InformationElement{
		Type:   gtpv1.IEIQualityOfServiceProfile,
		Length: 3,
		Data:   gtpv1.EncodeQoSProfile(pdpCtx.QoSProfile),
	})
	ies = append(ies, qosIE...)

	teidIE := gtpv1.EncodeIE(gtpv1.InformationElement{
		Type:   16,
		Length: 4,
		Data: []byte{
			byte(pdpCtx.TEIDControl >> 24),
			byte(pdpCtx.TEIDControl >> 16),
			byte(pdpCtx.TEIDControl >> 8),
			byte(pdpCtx.TEIDControl),
		},
	})
	ies = append(ies, teidIE...)

	teidUserIE := gtpv1.EncodeIE(gtpv1.InformationElement{
		Type:   17,
		Length: 4,
		Data: []byte{
			byte(pdpCtx.TEIDUser >> 24),
			byte(pdpCtx.TEIDUser >> 16),
			byte(pdpCtx.TEIDUser >> 8),
			byte(pdpCtx.TEIDUser),
		},
	})
	ies = append(ies, teidUserIE...)

	respHeader.Length = uint16(8 + len(ies))

	respBytes, err := gtpv1.MarshalHeader(respHeader)
	if err != nil {
		return
	}

	respBytes = append(respBytes, ies...)
	g.controlConn.WriteToUDP(respBytes, addr)

	fmt.Printf("GGSN: Created PDP context %s for IMSI %s, TEID Control: 0x%x, TEID User: 0x%x\n",
		pdpCtx.ID, imsi, pdpCtx.TEIDControl, pdpCtx.TEIDUser)
}

func (g *GGSN) handleDeletePDPContextRequest(data []byte, addr *net.UDPAddr) {
	header, err := gtpv1.UnmarshalHeader(data)
	if err != nil {
		return
	}

	pdpCtx, exists := g.PDPManager.GetPDPByTEID(header.TEID)
	if exists {
		g.PDPManager.DeletePDP(pdpCtx.ID)
		fmt.Printf("GGSN: Deleted PDP context %s\n", pdpCtx.ID)
	}

	resp, _ := gtpv1.BuildDeletePDPContextResponse(header.SequenceNumber, header.TEID, 0)
	g.controlConn.WriteToUDP(resp, addr)
}

func (g *GGSN) listenUser() {
	buf := make([]byte, 2000)
	for {
		n, addr, err := g.userConn.ReadFromUDP(buf)
		if err != nil {
			return
		}

		teid, seq, ipPacket, err := gtpv1.DecapsulateIPPacketWithSeq(buf[:n])
		if err != nil {
			continue
		}

		pdpCtx, exists := g.PDPManager.GetPDPByTEID(teid)
		if !exists {
			fmt.Printf("GGSN: Received GTP-U packet with unknown TEID: 0x%x from %s\n", teid, addr)
			continue
		}

		if g.enableSeqOrder {
			g.sequenceManager.HandlePacket(teid, seq, ipPacket)
		} else {
			pdpCtx.IncrementUplink(len(ipPacket))
			fmt.Printf("GGSN: Received uplink data for PDP %s, TEID: 0x%x, seq: %d, size: %d bytes\n",
				pdpCtx.ID, teid, seq, len(ipPacket))
			g.sendDownlinkData(pdpCtx, ipPacket, addr)
		}
	}
}

func (g *GGSN) sendDownlinkData(pdpCtx *pdp.PDPContext, ipPacket []byte, sgsnAddr *net.UDPAddr) {
	packetLen := len(ipPacket)
	if !pdpCtx.CheckDownlinkQoS(packetLen) {
		fmt.Printf("GGSN: Downlink rate limited for PDP %s\n", pdpCtx.ID)
		return
	}

	respPacket := make([]byte, len(ipPacket))
	copy(respPacket, ipPacket)

	if len(respPacket) >= 20 {
		respPacket[12], respPacket[13], respPacket[14], respPacket[15] = respPacket[16], respPacket[17], respPacket[18], respPacket[19]
		respPacket[16], respPacket[17], respPacket[18], respPacket[19] = ipPacket[12], ipPacket[13], ipPacket[14], ipPacket[15]
	}

	gtpPacket, err := gtpv1.EncapsulateIPPacketWithSeq(pdpCtx.TEIDUser, respPacket, g.nextSeqNum())
	if err != nil {
		return
	}

	var downlinkAddr *net.UDPAddr
	if sgsnAddr != nil {
		downlinkAddr = &net.UDPAddr{
			IP:   sgsnAddr.IP,
			Port: 2152,
		}
	} else {
		downlinkAddr = &net.UDPAddr{
			IP:   pdpCtx.SGSNIP,
			Port: 2152,
		}
	}

	_, err = g.userConn.WriteToUDP(gtpPacket, downlinkAddr)
	if err != nil {
		return
	}

	pdpCtx.IncrementDownlink(len(respPacket))
}

func (g *GGSN) SendTestDownlinkData(pdpID string, ipPacket []byte) error {
	pdpCtx, exists := g.PDPManager.GetPDP(pdpID)
	if !exists {
		return fmt.Errorf("PDP context %s not found", pdpID)
	}

	if !pdpCtx.Active {
		return fmt.Errorf("PDP context %s is not active", pdpID)
	}

	gtpPacket, err := gtpv1.EncapsulateIPPacketWithSeq(pdpCtx.TEIDUser, ipPacket, g.nextSeqNum())
	if err != nil {
		return err
	}

	downlinkAddr := &net.UDPAddr{
		IP:   pdpCtx.SGSNIP,
		Port: 2152,
	}

	_, err = g.userConn.WriteToUDP(gtpPacket, downlinkAddr)
	if err != nil {
		return err
	}

	pdpCtx.IncrementDownlink(len(ipPacket))
	return nil
}
