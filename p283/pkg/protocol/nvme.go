package protocol

import (
	"encoding/binary"
	"fmt"
)

const (
	NVME_ADMIN_OPC_IDENTIFY     = 0x06
	NVME_ADMIN_OPC_GET_LOG_PAGE = 0x02
	NVME_ADMIN_OPC_SET_FEATURES = 0x09
	NVME_ADMIN_OPC_GET_FEATURES = 0x0A
	NVME_ADMIN_OPC_ASYNC_EVENT  = 0x0C

	NVME_FABRIC_OPC_CONNECT      = 0x01
	NVME_FABRIC_OPC_PROPERTY_GET = 0x04
	NVME_FABRIC_OPC_PROPERTY_SET = 0x05

	NVME_IO_OPC_READ  = 0x02
	NVME_IO_OPC_WRITE = 0x01
	NVME_IO_OPC_FLUSH = 0x00

	NVME_STATUS_SUCCESS           = 0x00
	NVME_STATUS_INVALID_OPCODE    = 0x01
	NVME_STATUS_INVALID_FIELD     = 0x02
	NVME_STATUS_DATA_TRANSFER_ERR = 0x04
	NVME_STATUS_ABORTED           = 0x07
	NVME_STATUS_NOT_FOUND         = 0x0B

	NVME_IDENTIFY_CNS_CONTROLLER     = 0x01
	NVME_IDENTIFY_CNS_NAMESPACE      = 0x00
	NVME_IDENTIFY_CNS_NAMESPACE_LIST = 0x02

	NVME_PROP_CAP  = 0x00
	NVME_PROP_VS   = 0x08
	NVME_PROP_CC   = 0x14
	NVME_PROP_CSTS = 0x1C
	NVME_PROP_AQA  = 0x24
	NVME_PROP_ASQ  = 0x28
	NVME_PROP_ACQ  = 0x30

	NVME_QUEUE_ADMIN = 0x0000

	NVME_MAX_NAMESPACES = 256
)

type NVMeCommand struct {
	Opcode    uint8
	Fuse      uint8
	CID       uint16
	NSID      uint32
	Reserved0 uint32
	MPTR      uint64
	PRP1      uint64
	PRP2      uint64
	CDW10     uint32
	CDW11     uint32
	CDW12     uint32
	CDW13     uint32
	CDW14     uint32
	CDW15     uint32
}

func ParseNVMeCommand(data []byte) (*NVMeCommand, error) {
	if len(data) < 64 {
		return nil, fmt.Errorf("command too short: %d", len(data))
	}
	cmd := &NVMeCommand{
		Opcode:    data[0],
		Fuse:      data[1],
		CID:       binary.LittleEndian.Uint16(data[2:4]),
		NSID:      binary.LittleEndian.Uint32(data[4:8]),
		Reserved0: binary.LittleEndian.Uint32(data[8:12]),
		MPTR:      binary.LittleEndian.Uint64(data[16:24]),
		PRP1:      binary.LittleEndian.Uint64(data[24:32]),
		PRP2:      binary.LittleEndian.Uint64(data[32:40]),
		CDW10:     binary.LittleEndian.Uint32(data[40:44]),
		CDW11:     binary.LittleEndian.Uint32(data[44:48]),
		CDW12:     binary.LittleEndian.Uint32(data[48:52]),
		CDW13:     binary.LittleEndian.Uint32(data[52:56]),
		CDW14:     binary.LittleEndian.Uint32(data[56:60]),
		CDW15:     binary.LittleEndian.Uint32(data[60:64]),
	}
	return cmd, nil
}

func (c *NVMeCommand) Marshal() []byte {
	b := make([]byte, 64)
	b[0] = c.Opcode
	b[1] = c.Fuse
	binary.LittleEndian.PutUint16(b[2:4], c.CID)
	binary.LittleEndian.PutUint32(b[4:8], c.NSID)
	binary.LittleEndian.PutUint32(b[8:12], c.Reserved0)
	binary.LittleEndian.PutUint64(b[16:24], c.MPTR)
	binary.LittleEndian.PutUint64(b[24:32], c.PRP1)
	binary.LittleEndian.PutUint64(b[32:40], c.PRP2)
	binary.LittleEndian.PutUint32(b[40:44], c.CDW10)
	binary.LittleEndian.PutUint32(b[44:48], c.CDW11)
	binary.LittleEndian.PutUint32(b[48:52], c.CDW12)
	binary.LittleEndian.PutUint32(b[52:56], c.CDW13)
	binary.LittleEndian.PutUint32(b[56:60], c.CDW14)
	binary.LittleEndian.PutUint32(b[60:64], c.CDW15)
	return b
}

type NVMeCQE struct {
	CommandSpecific [16]byte
	SQID            uint16
	SQHD            uint16
	CID             uint16
	Status          uint16
}

func NewNVMeCQE() *NVMeCQE {
	return &NVMeCQE{}
}

func (c *NVMeCQE) Marshal() []byte {
	b := make([]byte, 16)
	copy(b[0:16], c.CommandSpecific[:])
	binary.LittleEndian.PutUint16(b[12:14], c.SQID)
	binary.LittleEndian.PutUint16(b[14:16], c.Status)
	binary.LittleEndian.PutUint16(b[10:12], c.SQHD)
	binary.LittleEndian.PutUint16(b[8:10], c.CID)
	return b
}

type NVMeController struct {
	VID   uint16
	SSVID uint16
	SN    [20]byte
	MN    [40]byte
	FR    [8]byte
	ONCS  uint16
	CMBSZ uint32
	NN    uint32
	CAP   uint64
	VS    uint32
	CC    uint32
	CSTS  uint32
	AQA   uint32
	ASQ   uint64
	ACQ   uint64
}

func NewNVMeController() *NVMeController {
	c := &NVMeController{
		VID:   0x8086,
		SSVID: 0x8086,
		VS:    0x00010400,
		CAP:   0x0028030FFF010000,
		NN:    1,
	}
	copy(c.SN[:], []byte("SN0000000000001"))
	copy(c.MN[:], []byte("NVMe-TCP Simulated Controller"))
	copy(c.FR[:], []byte("1.0.0"))
	return c
}

type NVMeNamespace struct {
	NSID   uint32
	Size   uint64
	Cap    uint64
	LBAF0  uint64
	Data   []byte
	Active bool
}

func NewNVMeNamespace(nsid uint32, sizeBytes uint64) *NVMeNamespace {
	lbaSize := uint64(512)
	numLBA := sizeBytes / lbaSize
	return &NVMeNamespace{
		NSID:   nsid,
		Size:   numLBA,
		Cap:    numLBA,
		LBAF0:  0x0200000000000,
		Data:   make([]byte, sizeBytes),
		Active: true,
	}
}

func (ns *NVMeNamespace) Read(lba uint64, numBlocks uint16, lbaSize uint32) ([]byte, error) {
	offset := lba * uint64(lbaSize)
	length := uint64(numBlocks) * uint64(lbaSize)
	if offset+length > uint64(len(ns.Data)) {
		return nil, fmt.Errorf("read out of bounds: offset=%d, len=%d, dataLen=%d", offset, length, len(ns.Data))
	}
	data := make([]byte, length)
	copy(data, ns.Data[offset:offset+length])
	return data, nil
}

func (ns *NVMeNamespace) Write(lba uint64, numBlocks uint16, lbaSize uint32, data []byte) error {
	offset := lba * uint64(lbaSize)
	length := uint64(numBlocks) * uint64(lbaSize)
	if offset+length > uint64(len(ns.Data)) {
		return fmt.Errorf("write out of bounds: offset=%d, len=%d, dataLen=%d", offset, length, len(ns.Data))
	}
	if uint64(len(data)) < length {
		return fmt.Errorf("data too short: %d, need %d", len(data), length)
	}
	copy(ns.Data[offset:offset+length], data[:length])
	return nil
}

type IdentifyControllerData struct {
	VID       uint16
	SSVID     uint16
	SN        [20]byte
	MN        [40]byte
	FR        [8]byte
	Reserved1 [180]byte
	NN        uint32
	Reserved2 [2836]byte
}

type IdentifyNamespaceData struct {
	NSZE      uint64
	NCAP      uint64
	NUSE      uint64
	Reserved1 [88]byte
	LBAF0     uint64
	LBAF1     uint64
	LBAF2     uint64
	LBAF3     uint64
	Reserved2 [192]byte
}
