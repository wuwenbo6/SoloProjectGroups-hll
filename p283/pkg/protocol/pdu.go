package protocol

import (
	"encoding/binary"
	"fmt"
)

const (
	NVME_TCP_PDU_TYPE_IC_REQ  = 0x00
	NVME_TCP_PDU_TYPE_IC_RESP = 0x01
	NVME_TCP_PDU_TYPE_CMD     = 0x02
	NVME_TCP_PDU_TYPE_CQE     = 0x04
	NVME_TCP_PDU_TYPE_H2C_DATA = 0x03
	NVME_TCP_PDU_TYPE_C2H_DATA = 0x05
	NVME_TCP_PDU_TYPE_R2T     = 0x09

	NVME_TCP_COMMON_HDR_LEN = 8

	ICREQ_PDU_LEN  = 128
	ICRESP_PDU_LEN = 128

	NVME_CMD_CAPSULE_SIZE = 64
	NVME_CQE_SIZE         = 16

	MAX_ADMIN_QUEUE_SIZE = 256
	MAX_IO_QUEUE_SIZE    = 1024

	CAP_CMD_PDO          = 12
	CAP_RESP_PDO         = 16
	H2C_DATA_PDO         = 16
	C2H_DATA_PDO         = 16

	NVME_TCP_PFV_1_0     = 0x0100
)

type CommonPDUHdr struct {
	PDUType    uint8
	Flags      uint8
	HLen       uint8
	PDO        uint8
	PLen       uint32
}

func (h *CommonPDUHdr) Marshal() []byte {
	b := make([]byte, NVME_TCP_COMMON_HDR_LEN)
	b[0] = h.PDUType
	b[1] = h.Flags
	b[2] = h.HLen
	b[3] = h.PDO
	binary.BigEndian.PutUint32(b[4:8], h.PLen)
	return b
}

func (h *CommonPDUHdr) Unmarshal(b []byte) error {
	if len(b) < NVME_TCP_COMMON_HDR_LEN {
		return fmt.Errorf("common header too short: %d", len(b))
	}
	h.PDUType = b[0]
	h.Flags = b[1]
	h.HLen = b[2]
	h.PDO = b[3]
	h.PLen = binary.BigEndian.Uint32(b[4:8])
	return nil
}

type ICReqPDU struct {
	CommonHdr CommonPDUHdr
	PFV       uint16
	CPDA      uint8
	Digest    uint8
	MAXH2CDATA uint32
	Reserved  [112]byte
}

func NewICReqPDU() *ICReqPDU {
	return &ICReqPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_IC_REQ,
			HLen:    ICREQ_PDU_LEN,
			PLen:    ICREQ_PDU_LEN,
		},
	}
}

func (p *ICReqPDU) Marshal() []byte {
	b := make([]byte, ICREQ_PDU_LEN)
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.PFV)
	b[10] = p.CPDA
	b[11] = p.Digest
	binary.BigEndian.PutUint32(b[12:16], p.MAXH2CDATA)
	return b
}

func (p *ICReqPDU) Unmarshal(b []byte) error {
	if len(b) < ICREQ_PDU_LEN {
		return fmt.Errorf("ICReq PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.PFV = binary.BigEndian.Uint16(b[8:10])
	p.CPDA = b[10]
	p.Digest = b[11]
	p.MAXH2CDATA = binary.BigEndian.Uint32(b[12:16])
	return nil
}

type ICRespPDU struct {
	CommonHdr  CommonPDUHdr
	PFV        uint16
	CPDA       uint8
	Digest     uint8
	MAXH2CDATA uint32
	Reserved   [112]byte
}

func NewICRespPDU() *ICRespPDU {
	return &ICRespPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_IC_RESP,
			HLen:    ICRESP_PDU_LEN,
			PLen:    ICRESP_PDU_LEN,
		},
	}
}

func (p *ICRespPDU) Marshal() []byte {
	b := make([]byte, ICRESP_PDU_LEN)
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.PFV)
	b[10] = p.CPDA
	b[11] = p.Digest
	binary.BigEndian.PutUint32(b[12:16], p.MAXH2CDATA)
	return b
}

func (p *ICRespPDU) Unmarshal(b []byte) error {
	if len(b) < ICRESP_PDU_LEN {
		return fmt.Errorf("ICResp PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.PFV = binary.BigEndian.Uint16(b[8:10])
	p.CPDA = b[10]
	p.Digest = b[11]
	p.MAXH2CDATA = binary.BigEndian.Uint32(b[12:16])
	return nil
}

type CmdPDU struct {
	CommonHdr CommonPDUHdr
	CCID      uint16
	QID       uint16
	Command   [64]byte
}

func NewCmdPDU() *CmdPDU {
	return &CmdPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_CMD,
			HLen:    8 + 4 + NVME_CMD_CAPSULE_SIZE,
			PDO:     CAP_CMD_PDO,
			PLen:    8 + 4 + NVME_CMD_CAPSULE_SIZE,
		},
	}
}

func (p *CmdPDU) Marshal() []byte {
	totalLen := int(p.CommonHdr.PLen)
	b := make([]byte, totalLen)
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.CCID)
	binary.BigEndian.PutUint16(b[10:12], p.QID)
	copy(b[12:12+NVME_CMD_CAPSULE_SIZE], p.Command[:])
	return b
}

func (p *CmdPDU) Unmarshal(b []byte) error {
	if len(b) < 12+NVME_CMD_CAPSULE_SIZE {
		return fmt.Errorf("Cmd PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.CCID = binary.BigEndian.Uint16(b[8:10])
	p.QID = binary.BigEndian.Uint16(b[10:12])
	copy(p.Command[:], b[12:12+NVME_CMD_CAPSULE_SIZE])
	return nil
}

type CQEPDU struct {
	CommonHdr CommonPDUHdr
	CCID      uint16
	QID       uint16
	Status    uint16
	Reserved  uint16
	CQE       [16]byte
}

func NewCQEPDU() *CQEPDU {
	return &CQEPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_CQE,
			HLen:    8 + 4 + 4 + NVME_CQE_SIZE,
			PDO:     CAP_RESP_PDO,
			PLen:    8 + 4 + 4 + NVME_CQE_SIZE,
		},
	}
}

func (p *CQEPDU) Marshal() []byte {
	b := make([]byte, int(p.CommonHdr.PLen))
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.CCID)
	binary.BigEndian.PutUint16(b[10:12], p.QID)
	binary.BigEndian.PutUint16(b[12:14], p.Status)
	binary.BigEndian.PutUint16(b[14:16], p.Reserved)
	copy(b[16:16+NVME_CQE_SIZE], p.CQE[:])
	return b
}

func (p *CQEPDU) Unmarshal(b []byte) error {
	if len(b) < 16+NVME_CQE_SIZE {
		return fmt.Errorf("CQE PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.CCID = binary.BigEndian.Uint16(b[8:10])
	p.QID = binary.BigEndian.Uint16(b[10:12])
	p.Status = binary.BigEndian.Uint16(b[12:14])
	p.Reserved = binary.BigEndian.Uint16(b[14:16])
	copy(p.CQE[:], b[16:16+NVME_CQE_SIZE])
	return nil
}

type H2CDataPDU struct {
	CommonHdr CommonPDUHdr
	CCID      uint16
	Reserved  uint16
	DataOffset uint32
	Data      []byte
}

func NewH2CDataPDU() *H2CDataPDU {
	return &H2CDataPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_H2C_DATA,
			HLen:    16,
			PDO:     H2C_DATA_PDO,
		},
	}
}

func (p *H2CDataPDU) Marshal() []byte {
	totalLen := 16 + len(p.Data)
	p.CommonHdr.PLen = uint32(totalLen)
	b := make([]byte, totalLen)
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.CCID)
	binary.BigEndian.PutUint16(b[10:12], p.Reserved)
	binary.BigEndian.PutUint32(b[12:16], p.DataOffset)
	copy(b[16:], p.Data)
	return b
}

func (p *H2CDataPDU) Unmarshal(b []byte) error {
	if len(b) < 16 {
		return fmt.Errorf("H2C Data PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.CCID = binary.BigEndian.Uint16(b[8:10])
	p.Reserved = binary.BigEndian.Uint16(b[10:12])
	p.DataOffset = binary.BigEndian.Uint32(b[12:16])
	dataLen := int(p.CommonHdr.PLen) - 16
	if dataLen > 0 && len(b) >= 16+dataLen {
		p.Data = make([]byte, dataLen)
		copy(p.Data, b[16:16+dataLen])
	}
	return nil
}

type C2HDataPDU struct {
	CommonHdr CommonPDUHdr
	CCID      uint16
	Reserved  uint16
	DataOffset uint32
	Data      []byte
}

func NewC2HDataPDU() *C2HDataPDU {
	return &C2HDataPDU{
		CommonHdr: CommonPDUHdr{
			PDUType: NVME_TCP_PDU_TYPE_C2H_DATA,
			HLen:    16,
			PDO:     C2H_DATA_PDO,
		},
	}
}

func (p *C2HDataPDU) Marshal() []byte {
	totalLen := 16 + len(p.Data)
	p.CommonHdr.PLen = uint32(totalLen)
	b := make([]byte, totalLen)
	copy(b[0:8], p.CommonHdr.Marshal())
	binary.BigEndian.PutUint16(b[8:10], p.CCID)
	binary.BigEndian.PutUint16(b[10:12], p.Reserved)
	binary.BigEndian.PutUint32(b[12:16], p.DataOffset)
	copy(b[16:], p.Data)
	return b
}

func (p *C2HDataPDU) Unmarshal(b []byte) error {
	if len(b) < 16 {
		return fmt.Errorf("C2H Data PDU too short: %d", len(b))
	}
	if err := p.CommonHdr.Unmarshal(b[0:8]); err != nil {
		return err
	}
	p.CCID = binary.BigEndian.Uint16(b[8:10])
	p.Reserved = binary.BigEndian.Uint16(b[10:12])
	p.DataOffset = binary.BigEndian.Uint32(b[12:16])
	dataLen := int(p.CommonHdr.PLen) - 16
	if dataLen > 0 && len(b) >= 16+dataLen {
		p.Data = make([]byte, dataLen)
		copy(p.Data, b[16:16+dataLen])
	}
	return nil
}
