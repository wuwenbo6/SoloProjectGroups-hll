package protocol

import (
	"encoding/binary"
	"fmt"
)

const (
	RDMA_CM_TYPE_REQ  = 0x10
	RDMA_CM_TYPE_REP  = 0x11
	RDMA_CM_TYPE_MR   = 0x12
	RDMA_CM_TYPE_DEMR = 0x13

	RDMA_CM_HDR_LEN = 8

	RDMA_PDU_TYPE_SEND  = 0x20
	RDMA_PDU_TYPE_RECV  = 0x21
	RDMA_PDU_TYPE_READ  = 0x22
	RDMA_PDU_TYPE_WRITE = 0x23
	RDMA_PDU_TYPE_ACK   = 0x24

	RDMA_ACCESS_LOCAL_READ   = 0x01
	RDMA_ACCESS_LOCAL_WRITE  = 0x02
	RDMA_ACCESS_REMOTE_READ  = 0x04
	RDMA_ACCESS_REMOTE_WRITE = 0x08

	RDMA_MAX_SGE = 16

	RDMA_SIMULATED_BASE_LATENCY_NS = 2000
)

type RDMACMReq struct {
	PDUType   uint8
	Flags     uint8
	PFV       uint16
	QPN       uint32
	PSN       uint32
	PKey      uint16
	Access    uint32
	SubsysNQN [256]byte
	HostNQN   [256]byte
}

func NewRDMACMReq() *RDMACMReq {
	return &RDMACMReq{
		PDUType: RDMA_CM_TYPE_REQ,
		PFV:     NVME_TCP_PFV_1_0,
	}
}

func (r *RDMACMReq) Marshal() []byte {
	b := make([]byte, 536)
	b[0] = r.PDUType
	b[1] = r.Flags
	binary.BigEndian.PutUint16(b[2:4], r.PFV)
	binary.BigEndian.PutUint32(b[4:8], r.QPN)
	binary.BigEndian.PutUint32(b[8:12], r.PSN)
	binary.BigEndian.PutUint16(b[12:14], r.PKey)
	binary.BigEndian.PutUint32(b[16:20], r.Access)
	copy(b[20:276], r.SubsysNQN[:])
	copy(b[276:532], r.HostNQN[:])
	return b
}

func (r *RDMACMReq) Unmarshal(b []byte) error {
	if len(b) < 536 {
		return fmt.Errorf("RDMA CM Req too short: %d", len(b))
	}
	r.PDUType = b[0]
	r.Flags = b[1]
	r.PFV = binary.BigEndian.Uint16(b[2:4])
	r.QPN = binary.BigEndian.Uint32(b[4:8])
	r.PSN = binary.BigEndian.Uint32(b[8:12])
	r.PKey = binary.BigEndian.Uint16(b[12:14])
	r.Access = binary.BigEndian.Uint32(b[16:20])
	copy(r.SubsysNQN[:], b[20:276])
	copy(r.HostNQN[:], b[276:532])
	return nil
}

type RDMACMRep struct {
	PDUType uint8
	Flags   uint8
	PFV     uint16
	QPN     uint32
	PSN     uint32
	Status  uint32
	MRCount uint32
}

func NewRDMACMRep() *RDMACMRep {
	return &RDMACMRep{
		PDUType: RDMA_CM_TYPE_REP,
		PFV:     NVME_TCP_PFV_1_0,
	}
}

func (r *RDMACMRep) Marshal() []byte {
	b := make([]byte, 20)
	b[0] = r.PDUType
	b[1] = r.Flags
	binary.BigEndian.PutUint16(b[2:4], r.PFV)
	binary.BigEndian.PutUint32(b[4:8], r.QPN)
	binary.BigEndian.PutUint32(b[8:12], r.PSN)
	binary.BigEndian.PutUint32(b[12:16], r.Status)
	binary.BigEndian.PutUint32(b[16:20], r.MRCount)
	return b
}

func (r *RDMACMRep) Unmarshal(b []byte) error {
	if len(b) < 20 {
		return fmt.Errorf("RDMA CM Rep too short: %d", len(b))
	}
	r.PDUType = b[0]
	r.Flags = b[1]
	r.PFV = binary.BigEndian.Uint16(b[2:4])
	r.QPN = binary.BigEndian.Uint32(b[4:8])
	r.PSN = binary.BigEndian.Uint32(b[8:12])
	r.Status = binary.BigEndian.Uint32(b[12:16])
	r.MRCount = binary.BigEndian.Uint32(b[16:20])
	return nil
}

type RDMAMsgHdr struct {
	PDUType uint8
	Flags   uint8
	PLen    uint16
	CCID    uint16
	QID     uint16
}

const RDMA_MSG_HDR_LEN = 8

func (h *RDMAMsgHdr) Marshal() []byte {
	b := make([]byte, RDMA_MSG_HDR_LEN)
	b[0] = h.PDUType
	b[1] = h.Flags
	binary.BigEndian.PutUint16(b[2:4], h.PLen)
	binary.BigEndian.PutUint16(b[4:6], h.CCID)
	binary.BigEndian.PutUint16(b[6:8], h.QID)
	return b
}

func (h *RDMAMsgHdr) Unmarshal(b []byte) error {
	if len(b) < RDMA_MSG_HDR_LEN {
		return fmt.Errorf("RDMA msg header too short: %d", len(b))
	}
	h.PDUType = b[0]
	h.Flags = b[1]
	h.PLen = binary.BigEndian.Uint16(b[2:4])
	h.CCID = binary.BigEndian.Uint16(b[4:6])
	h.QID = binary.BigEndian.Uint16(b[6:8])
	return nil
}

type RDMASendMsg struct {
	Hdr     RDMAMsgHdr
	Command [64]byte
}

func NewRDMASendMsg() *RDMASendMsg {
	return &RDMASendMsg{
		Hdr: RDMAMsgHdr{
			PDUType: RDMA_PDU_TYPE_SEND,
			PLen:    RDMA_MSG_HDR_LEN + NVME_CMD_CAPSULE_SIZE,
		},
	}
}

func (m *RDMASendMsg) Marshal() []byte {
	b := make([]byte, RDMA_MSG_HDR_LEN+NVME_CMD_CAPSULE_SIZE)
	copy(b[0:RDMA_MSG_HDR_LEN], m.Hdr.Marshal())
	copy(b[RDMA_MSG_HDR_LEN:], m.Command[:])
	return b
}

func (m *RDMASendMsg) Unmarshal(b []byte) error {
	if len(b) < RDMA_MSG_HDR_LEN+NVME_CMD_CAPSULE_SIZE {
		return fmt.Errorf("RDMA Send msg too short: %d", len(b))
	}
	if err := m.Hdr.Unmarshal(b[0:RDMA_MSG_HDR_LEN]); err != nil {
		return err
	}
	copy(m.Command[:], b[RDMA_MSG_HDR_LEN:])
	return nil
}

type RDMACmplMsg struct {
	Hdr    RDMAMsgHdr
	Status uint16
	CQE    [16]byte
}

func NewRDMACmplMsg() *RDMACmplMsg {
	return &RDMACmplMsg{
		Hdr: RDMAMsgHdr{
			PDUType: RDMA_PDU_TYPE_ACK,
			PLen:    RDMA_MSG_HDR_LEN + 2 + NVME_CQE_SIZE,
		},
	}
}

func (m *RDMACmplMsg) Marshal() []byte {
	b := make([]byte, RDMA_MSG_HDR_LEN+2+NVME_CQE_SIZE)
	copy(b[0:RDMA_MSG_HDR_LEN], m.Hdr.Marshal())
	binary.BigEndian.PutUint16(b[RDMA_MSG_HDR_LEN:RDMA_MSG_HDR_LEN+2], m.Status)
	copy(b[RDMA_MSG_HDR_LEN+2:], m.CQE[:])
	return b
}

func (m *RDMACmplMsg) Unmarshal(b []byte) error {
	if len(b) < RDMA_MSG_HDR_LEN+2+NVME_CQE_SIZE {
		return fmt.Errorf("RDMA Completion msg too short: %d", len(b))
	}
	if err := m.Hdr.Unmarshal(b[0:RDMA_MSG_HDR_LEN]); err != nil {
		return err
	}
	m.Status = binary.BigEndian.Uint16(b[RDMA_MSG_HDR_LEN : RDMA_MSG_HDR_LEN+2])
	copy(m.CQE[:], b[RDMA_MSG_HDR_LEN+2:])
	return nil
}

type RDMARdmaMsg struct {
	Hdr        RDMAMsgHdr
	MRID       uint32
	RemoteAddr uint64
	RKey       uint32
	DataLen    uint32
	Data       []byte
}

func NewRDMARdmaMsg(pduType uint8) *RDMARdmaMsg {
	return &RDMARdmaMsg{
		Hdr: RDMAMsgHdr{
			PDUType: pduType,
		},
	}
}

func (m *RDMARdmaMsg) Marshal() []byte {
	hdrAndMeta := RDMA_MSG_HDR_LEN + 4 + 8 + 4 + 4
	totalLen := hdrAndMeta + len(m.Data)
	m.Hdr.PLen = uint16(totalLen)

	b := make([]byte, totalLen)
	copy(b[0:RDMA_MSG_HDR_LEN], m.Hdr.Marshal())
	binary.BigEndian.PutUint32(b[RDMA_MSG_HDR_LEN:RDMA_MSG_HDR_LEN+4], m.MRID)
	binary.BigEndian.PutUint64(b[RDMA_MSG_HDR_LEN+4:RDMA_MSG_HDR_LEN+12], m.RemoteAddr)
	binary.BigEndian.PutUint32(b[RDMA_MSG_HDR_LEN+12:RDMA_MSG_HDR_LEN+16], m.RKey)
	binary.BigEndian.PutUint32(b[RDMA_MSG_HDR_LEN+16:RDMA_MSG_HDR_LEN+20], m.DataLen)
	if len(m.Data) > 0 {
		copy(b[hdrAndMeta:], m.Data)
	}
	return b
}

func (m *RDMARdmaMsg) Unmarshal(b []byte) error {
	hdrAndMeta := RDMA_MSG_HDR_LEN + 4 + 8 + 4 + 4
	if len(b) < hdrAndMeta {
		return fmt.Errorf("RDMA RDMA msg too short: %d", len(b))
	}
	if err := m.Hdr.Unmarshal(b[0:RDMA_MSG_HDR_LEN]); err != nil {
		return err
	}
	m.MRID = binary.BigEndian.Uint32(b[RDMA_MSG_HDR_LEN : RDMA_MSG_HDR_LEN+4])
	m.RemoteAddr = binary.BigEndian.Uint64(b[RDMA_MSG_HDR_LEN+4 : RDMA_MSG_HDR_LEN+12])
	m.RKey = binary.BigEndian.Uint32(b[RDMA_MSG_HDR_LEN+12 : RDMA_MSG_HDR_LEN+16])
	m.DataLen = binary.BigEndian.Uint32(b[RDMA_MSG_HDR_LEN+16 : RDMA_MSG_HDR_LEN+20])
	dataLen := int(m.Hdr.PLen) - hdrAndMeta
	if dataLen > 0 && len(b) >= hdrAndMeta+dataLen {
		m.Data = make([]byte, dataLen)
		copy(m.Data, b[hdrAndMeta:hdrAndMeta+dataLen])
	}
	return nil
}

type RDMAMRReq struct {
	PDUType uint8
	Flags   uint8
	MRID    uint32
	Address uint64
	Length  uint32
	Access  uint32
}

func NewRDMAMRReq() *RDMAMRReq {
	return &RDMAMRReq{
		PDUType: RDMA_CM_TYPE_MR,
	}
}

func (r *RDMAMRReq) Marshal() []byte {
	b := make([]byte, 24)
	b[0] = r.PDUType
	b[1] = r.Flags
	binary.BigEndian.PutUint32(b[4:8], r.MRID)
	binary.BigEndian.PutUint64(b[8:16], r.Address)
	binary.BigEndian.PutUint32(b[16:20], r.Length)
	binary.BigEndian.PutUint32(b[20:24], r.Access)
	return b
}

func (r *RDMAMRReq) Unmarshal(b []byte) error {
	if len(b) < 24 {
		return fmt.Errorf("RDMA MR Req too short: %d", len(b))
	}
	r.PDUType = b[0]
	r.Flags = b[1]
	r.MRID = binary.BigEndian.Uint32(b[4:8])
	r.Address = binary.BigEndian.Uint64(b[8:16])
	r.Length = binary.BigEndian.Uint32(b[16:20])
	r.Access = binary.BigEndian.Uint32(b[20:24])
	return nil
}

type RDMAMRRep struct {
	PDUType uint8
	Flags   uint8
	MRID    uint32
	LKey    uint32
	RKey    uint32
	Status  uint32
}

func NewRDMAMRRep() *RDMAMRRep {
	return &RDMAMRRep{
		PDUType: RDMA_CM_TYPE_MR,
	}
}

func (r *RDMAMRRep) Marshal() []byte {
	b := make([]byte, 20)
	b[0] = r.PDUType
	b[1] = r.Flags
	binary.BigEndian.PutUint32(b[4:8], r.MRID)
	binary.BigEndian.PutUint32(b[8:12], r.LKey)
	binary.BigEndian.PutUint32(b[12:16], r.RKey)
	binary.BigEndian.PutUint32(b[16:20], r.Status)
	return b
}

func (r *RDMAMRRep) Unmarshal(b []byte) error {
	if len(b) < 20 {
		return fmt.Errorf("RDMA MR Rep too short: %d", len(b))
	}
	r.PDUType = b[0]
	r.Flags = b[1]
	r.MRID = binary.BigEndian.Uint32(b[4:8])
	r.LKey = binary.BigEndian.Uint32(b[8:12])
	r.RKey = binary.BigEndian.Uint32(b[12:16])
	r.Status = binary.BigEndian.Uint32(b[16:20])
	return nil
}
