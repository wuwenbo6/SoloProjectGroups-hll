package nvme

import (
	"encoding/binary"
	"fmt"
)

const (
	AdminOpcodeIdentify          = 0x06
	AdminOpcodeCreateIOSQ        = 0x01
	AdminOpcodeDeleteIOSQ        = 0x00
	AdminOpcodeCreateIOCQ        = 0x05
	AdminOpcodeDeleteIOCQ        = 0x04
	AdminOpcodeGetLogPage        = 0x02

	NVMOpcodeRead               = 0x82
	NVMOpcodeWrite              = 0x81

	IdentifyCNSController        = 0x01
	IdentifyCNSNamespace         = 0x00

	LogPageSMART                 = 0x02

	StatusSuccess                = 0x00
	StatusInvalidQueueIdentifier = 0x01
	StatusQueueAlreadyExists     = 0x02
	StatusQueueNotFound          = 0x03
	StatusInvalidCommand         = 0x04
	StatusInvalidField           = 0x05
	StatusInvalidNamespace       = 0x06
	StatusOutOfRange             = 0x07

	DefaultNamespaceSize         = 1024 * 1024
	SectorSize                   = 512
)

type Command struct {
	Opcode     uint8    `json:"opcode"`
	Flags      uint8    `json:"flags"`
	CID        uint16   `json:"cid"`
	NSID       uint32   `json:"nsid"`
	MPTR       uint64   `json:"mptr"`
	PRP1       uint64   `json:"prp1"`
	PRP2       uint64   `json:"prp2"`
	CDW10      uint32   `json:"cdw10"`
	CDW11      uint32   `json:"cdw11"`
	CDW12      uint32   `json:"cdw12"`
	CDW13      uint32   `json:"cdw13"`
	CDW14      uint32   `json:"cdw14"`
	CDW15      uint32   `json:"cdw15"`
}

type Response struct {
	CID        uint16   `json:"cid"`
	Status     uint16   `json:"status"`
	Data       []byte   `json:"data,omitempty"`
}

type IdentifyController struct {
	VID        uint16
	SSVID      uint16
	SN         [20]byte
	MN         [40]byte
	FR         [8]byte
	RAB        uint8
	IEEE       [3]byte
	CMIC       uint8
	MDTS       uint8
	CNTLID     uint16
	VER        uint32
	RTD3R      uint32
	RTD3E      uint32
	OAES       uint32
	CTRATT     uint32
	RRLS       uint16
	Reserved1  [9]byte
	CNTNLTYPE  uint8
	Reserved2  [256]byte
	OACS       uint16
	ACL        uint8
	AERL       uint8
	FRMW       uint8
	LPA        uint8
	ELPE       uint8
	NPSS       uint8
	AVSCC      uint8
	APSTA      uint8
	WCTEMP     uint16
	NFWST      uint16
	FNA        uint8
	VWC        uint8
	AWUN       uint16
	AWUPF      uint16
	NVSCC      uint8
	Reserved3  [2793]byte
}

type CreateIOSQCommand struct {
	Command
}

func (c *CreateIOSQCommand) QueueID() uint16 {
	return uint16(c.CDW10 & 0xFFFF)
}

func (c *CreateIOSQCommand) QueueSize() uint16 {
	return uint16(c.CDW10 >> 16)
}

func (c *CreateIOSQCommand) PC() bool {
	return (c.CDW11 & 0x1) != 0
}

func (c *CreateIOSQCommand) QPRIO() uint8 {
	return uint8((c.CDW11 >> 1) & 0x3)
}

func (c *CreateIOSQCommand) CQID() uint16 {
	return uint16(c.CDW11 >> 16)
}

type DeleteIOSQCommand struct {
	Command
}

func (c *DeleteIOSQCommand) QueueID() uint16 {
	return uint16(c.CDW10 & 0xFFFF)
}

type SMARTHealthInfo struct {
	CriticalWarning       uint8
	Temperature           uint16
	AvailableSpare        uint8
	AvailableSpareThreshold uint8
	PercentageUsed        uint8
	Reserved1            [26]byte
	DataUnitsRead        [16]byte
	DataUnitsWritten     [16]byte
	HostReadCommands     [16]byte
	HostWriteCommands    [16]byte
	ControllerBusyTime   [16]byte
	PowerCycles          [16]byte
	PowerOnHours         [16]byte
	UnsafeShutdowns      [16]byte
	MediaErrors          [16]byte
	NumErrLogEntries     [16]byte
	Reserved2            [176]byte
}

type Namespace struct {
	ID   uint32
	Data []byte
	Size uint64
}

func NewSMARTHealthInfo() *SMARTHealthInfo {
	smart := &SMARTHealthInfo{
		CriticalWarning:         0x00,
		Temperature:             300,
		AvailableSpare:          100,
		AvailableSpareThreshold: 10,
		PercentageUsed:          0,
	}
	putInt128(smart.DataUnitsRead[:], 1000)
	putInt128(smart.DataUnitsWritten[:], 500)
	putInt128(smart.HostReadCommands[:], 50000)
	putInt128(smart.HostWriteCommands[:], 25000)
	putInt128(smart.ControllerBusyTime[:], 1200)
	putInt128(smart.PowerCycles[:], 30)
	putInt128(smart.PowerOnHours[:], 8760)
	putInt128(smart.UnsafeShutdowns[:], 2)
	putInt128(smart.MediaErrors[:], 0)
	putInt128(smart.NumErrLogEntries[:], 1)
	return smart
}

func putInt128(buf []byte, val uint64) {
	for i := 0; i < 8; i++ {
		buf[i] = byte(val >> (i * 8))
	}
}

func (s *SMARTHealthInfo) Bytes() []byte {
	buf := make([]byte, 512)
	buf[0] = s.CriticalWarning
	binary.LittleEndian.PutUint16(buf[1:3], s.Temperature)
	buf[3] = s.AvailableSpare
	buf[4] = s.AvailableSpareThreshold
	buf[5] = s.PercentageUsed
	copy(buf[6:32], s.Reserved1[:])
	copy(buf[32:48], s.DataUnitsRead[:])
	copy(buf[48:64], s.DataUnitsWritten[:])
	copy(buf[64:80], s.HostReadCommands[:])
	copy(buf[80:96], s.HostWriteCommands[:])
	copy(buf[96:112], s.ControllerBusyTime[:])
	copy(buf[112:128], s.PowerCycles[:])
	copy(buf[128:144], s.PowerOnHours[:])
	copy(buf[144:160], s.UnsafeShutdowns[:])
	copy(buf[160:176], s.MediaErrors[:])
	copy(buf[176:192], s.NumErrLogEntries[:])
	copy(buf[192:368], s.Reserved2[:])
	return buf
}

func (s *SMARTHealthInfo) IncrementHostReads() {
	val := GetInt128(s.HostReadCommands[:])
	putInt128(s.HostReadCommands[:], val+1)
}

func (s *SMARTHealthInfo) IncrementHostWrites() {
	val := GetInt128(s.HostWriteCommands[:])
	putInt128(s.HostWriteCommands[:], val+1)
}

func (s *SMARTHealthInfo) AddDataUnitsWritten(count uint64) {
	val := GetInt128(s.DataUnitsWritten[:])
	putInt128(s.DataUnitsWritten[:], val+count)
}

func (s *SMARTHealthInfo) AddDataUnitsRead(count uint64) {
	val := GetInt128(s.DataUnitsRead[:])
	putInt128(s.DataUnitsRead[:], val+count)
}

func GetInt128(buf []byte) uint64 {
	var val uint64
	for i := 0; i < 8; i++ {
		val |= uint64(buf[i]) << (i * 8)
	}
	return val
}

func NewNamespace(id uint32, size uint64) *Namespace {
	return &Namespace{
		ID:   id,
		Data: make([]byte, size),
		Size: size,
	}
}

func (c *Command) String() string {
	return fmt.Sprintf("Opcode=0x%02x, CID=%d, NSID=%d, CDW10=0x%08x", c.Opcode, c.CID, c.NSID, c.CDW10)
}

func (r *Response) String() string {
	if r.Status == StatusSuccess {
		return fmt.Sprintf("CID=%d, Status=Success", r.CID)
	}
	return fmt.Sprintf("CID=%d, Status=0x%04x", r.CID, r.Status)
}

func (ic *IdentifyController) SerialNumber() string {
	return string(ic.SN[:])
}

func (ic *IdentifyController) ModelNumber() string {
	return string(ic.MN[:])
}

func (ic *IdentifyController) FirmwareRevision() string {
	return string(ic.FR[:])
}

func NewIdentifyController() *IdentifyController {
	ic := &IdentifyController{
		VID:    0x8086,
		SSVID:  0x8086,
		RAB:    0x06,
		MDTS:   0x06,
		CNTLID: 0x0001,
		VER:    0x00010300,
		OACS:   0x0007,
		ACL:    0x03,
		AERL:   0x07,
		NPSS:   0x01,
		AWUN:   0x0007,
	}
	for i := range ic.SN {
		ic.SN[i] = ' '
	}
	for i := range ic.MN {
		ic.MN[i] = ' '
	}
	copy(ic.SN[:], "NVME0000000000001")
	copy(ic.MN[:], "NVMe Simulator Controller")
	copy(ic.FR[:], "1.0.0")
	copy(ic.IEEE[:], []byte{0x00, 0x11, 0x22})
	return ic
}

func (ic *IdentifyController) Bytes() []byte {
	buf := make([]byte, 4096)
	binary.LittleEndian.PutUint16(buf[0:2], ic.VID)
	binary.LittleEndian.PutUint16(buf[2:4], ic.SSVID)
	copy(buf[4:24], ic.SN[:])
	copy(buf[24:64], ic.MN[:])
	copy(buf[64:72], ic.FR[:])
	buf[72] = ic.RAB
	copy(buf[73:76], ic.IEEE[:])
	buf[76] = ic.CMIC
	buf[77] = ic.MDTS
	binary.LittleEndian.PutUint16(buf[78:80], ic.CNTLID)
	binary.LittleEndian.PutUint32(buf[80:84], ic.VER)
	binary.LittleEndian.PutUint32(buf[84:88], ic.RTD3R)
	binary.LittleEndian.PutUint32(buf[88:92], ic.RTD3E)
	binary.LittleEndian.PutUint32(buf[92:96], ic.OAES)
	binary.LittleEndian.PutUint32(buf[96:100], ic.CTRATT)
	binary.LittleEndian.PutUint16(buf[100:102], ic.RRLS)
	buf[111] = ic.CNTNLTYPE
	binary.LittleEndian.PutUint16(buf[352:354], ic.OACS)
	buf[354] = ic.ACL
	buf[355] = ic.AERL
	buf[356] = ic.FRMW
	buf[357] = ic.LPA
	buf[358] = ic.ELPE
	buf[359] = ic.NPSS
	buf[360] = ic.AVSCC
	buf[361] = ic.APSTA
	binary.LittleEndian.PutUint16(buf[362:364], ic.WCTEMP)
	binary.LittleEndian.PutUint16(buf[364:366], ic.NFWST)
	buf[366] = ic.FNA
	buf[367] = ic.VWC
	binary.LittleEndian.PutUint16(buf[368:370], ic.AWUN)
	binary.LittleEndian.PutUint16(buf[370:372], ic.AWUPF)
	buf[372] = ic.NVSCC
	return buf
}

type WebSocketCommand struct {
	Type    string  `json:"type"`
	Command Command `json:"command"`
}

type WebSocketResponse struct {
	Type     string   `json:"type"`
	Response Response `json:"response"`
	Error    string   `json:"error,omitempty"`
}
