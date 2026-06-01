package nvme

import (
	"fmt"
	"sync"
)

type IOQueue struct {
	ID       uint16
	Size     uint16
	PC       bool
	QPRIO    uint8
	CQID     uint16
	Entries  []uint64
}

type Controller struct {
	mu              sync.RWMutex
	identifyData    *IdentifyController
	smartData       *SMARTHealthInfo
	ioSubmissionQueues map[uint16]*IOQueue
	ioCompletionQueues map[uint16]*IOQueue
	namespaces      map[uint32]*Namespace
	nextCID         uint16
}

func NewController() *Controller {
	c := &Controller{
		identifyData:         NewIdentifyController(),
		smartData:            NewSMARTHealthInfo(),
		ioSubmissionQueues:   make(map[uint16]*IOQueue),
		ioCompletionQueues:   make(map[uint16]*IOQueue),
		namespaces:           make(map[uint32]*Namespace),
		nextCID:              1,
	}
	c.namespaces[1] = NewNamespace(1, DefaultNamespaceSize)
	return c
}

func (c *Controller) GetNextCID() uint16 {
	c.mu.Lock()
	defer c.mu.Unlock()
	cid := c.nextCID
	c.nextCID++
	return cid
}

func (c *Controller) ProcessCommand(cmd *Command) *Response {
	c.mu.Lock()
	defer c.mu.Unlock()

	resp := &Response{
		CID:    cmd.CID,
		Status: StatusSuccess,
	}

	switch cmd.Opcode {
	case AdminOpcodeIdentify:
		resp = c.handleIdentify(cmd, resp)
	case AdminOpcodeCreateIOSQ:
		resp = c.handleCreateIOSQ(cmd, resp)
	case AdminOpcodeDeleteIOSQ:
		resp = c.handleDeleteIOSQ(cmd, resp)
	case AdminOpcodeCreateIOCQ:
		resp = c.handleCreateIOCQ(cmd, resp)
	case AdminOpcodeDeleteIOCQ:
		resp = c.handleDeleteIOCQ(cmd, resp)
	case AdminOpcodeGetLogPage:
		resp = c.handleGetLogPage(cmd, resp)
	case NVMOpcodeRead:
		resp = c.handleNVMRead(cmd, resp)
	case NVMOpcodeWrite:
		resp = c.handleNVMWrite(cmd, resp)
	default:
		resp.Status = StatusInvalidCommand
	}

	return resp
}

func (c *Controller) ProcessAdminCommand(cmd *Command) *Response {
	return c.ProcessCommand(cmd)
}

func (c *Controller) handleIdentify(cmd *Command, resp *Response) *Response {
	cns := cmd.CDW10 & 0xFF

	switch cns {
	case IdentifyCNSController:
		resp.Data = c.identifyData.Bytes()
	case IdentifyCNSNamespace:
		nsData := make([]byte, 4096)
		nsData[0] = 0x01
		resp.Data = nsData
	default:
		resp.Status = StatusInvalidCommand
	}

	return resp
}

func (c *Controller) handleCreateIOSQ(cmd *Command, resp *Response) *Response {
	createCmd := &CreateIOSQCommand{Command: *cmd}
	qid := createCmd.QueueID()
	size := createCmd.QueueSize()

	if qid == 0 {
		resp.Status = StatusInvalidQueueIdentifier
		return resp
	}

	if _, exists := c.ioSubmissionQueues[qid]; exists {
		resp.Status = StatusQueueAlreadyExists
		return resp
	}

	if _, exists := c.ioCompletionQueues[createCmd.CQID()]; !exists {
		resp.Status = StatusInvalidField
		return resp
	}

	queue := &IOQueue{
		ID:      qid,
		Size:    size + 1,
		PC:      createCmd.PC(),
		QPRIO:   createCmd.QPRIO(),
		CQID:    createCmd.CQID(),
		Entries: make([]uint64, size+1),
	}

	c.ioSubmissionQueues[qid] = queue
	return resp
}

func (c *Controller) handleDeleteIOSQ(cmd *Command, resp *Response) *Response {
	deleteCmd := &DeleteIOSQCommand{Command: *cmd}
	qid := deleteCmd.QueueID()

	if qid == 0 {
		resp.Status = StatusInvalidQueueIdentifier
		return resp
	}

	if _, exists := c.ioSubmissionQueues[qid]; !exists {
		resp.Status = StatusQueueNotFound
		return resp
	}

	delete(c.ioSubmissionQueues, qid)
	return resp
}

func (c *Controller) handleCreateIOCQ(cmd *Command, resp *Response) *Response {
	qid := uint16(cmd.CDW10 & 0xFFFF)
	size := uint16(cmd.CDW10 >> 16)

	if qid == 0 {
		resp.Status = StatusInvalidQueueIdentifier
		return resp
	}

	if _, exists := c.ioCompletionQueues[qid]; exists {
		resp.Status = StatusQueueAlreadyExists
		return resp
	}

	queue := &IOQueue{
		ID:      qid,
		Size:    size + 1,
		PC:      (cmd.CDW11 & 0x1) != 0,
		Entries: make([]uint64, size+1),
	}

	c.ioCompletionQueues[qid] = queue
	return resp
}

func (c *Controller) handleDeleteIOCQ(cmd *Command, resp *Response) *Response {
	qid := uint16(cmd.CDW10 & 0xFFFF)

	if qid == 0 {
		resp.Status = StatusInvalidQueueIdentifier
		return resp
	}

	if _, exists := c.ioCompletionQueues[qid]; !exists {
		resp.Status = StatusQueueNotFound
		return resp
	}

	for sqid, sq := range c.ioSubmissionQueues {
		if sq.CQID == qid {
			delete(c.ioSubmissionQueues, sqid)
		}
	}

	delete(c.ioCompletionQueues, qid)
	return resp
}

func (c *Controller) handleGetLogPage(cmd *Command, resp *Response) *Response {
	lid := cmd.CDW10 & 0xFF
	numd := uint32(cmd.CDW10>>16) + 1
	numBytes := numd * 4

	switch lid {
	case LogPageSMART:
		if cmd.NSID == 0xFFFFFFFF || cmd.NSID == 1 {
			smartBytes := c.smartData.Bytes()
			if int(numBytes) > len(smartBytes) {
				numBytes = uint32(len(smartBytes))
			}
			resp.Data = make([]byte, numBytes)
			copy(resp.Data, smartBytes[:numBytes])
		} else {
			resp.Status = StatusInvalidNamespace
		}
	default:
		resp.Status = StatusInvalidField
	}

	return resp
}

func (c *Controller) handleNVMRead(cmd *Command, resp *Response) *Response {
	ns, exists := c.namespaces[cmd.NSID]
	if !exists {
		resp.Status = StatusInvalidNamespace
		return resp
	}

	slba := uint64(cmd.CDW10) | (uint64(cmd.CDW11&0xFFFFFFFF) << 32)
	nlb := uint16(cmd.CDW12&0xFFFF) + 1
	byteCount := uint64(nlb) * SectorSize

	if slba*SectorSize+byteCount > ns.Size {
		resp.Status = StatusOutOfRange
		return resp
	}

	offset := slba * SectorSize
	if offset+byteCount > uint64(len(ns.Data)) {
		resp.Status = StatusOutOfRange
		return resp
	}

	resp.Data = make([]byte, byteCount)
	copy(resp.Data, ns.Data[offset:offset+byteCount])

	c.smartData.IncrementHostReads()
	c.smartData.AddDataUnitsRead(uint64(nlb))

	return resp
}

func (c *Controller) handleNVMWrite(cmd *Command, resp *Response) *Response {
	ns, exists := c.namespaces[cmd.NSID]
	if !exists {
		resp.Status = StatusInvalidNamespace
		return resp
	}

	slba := uint64(cmd.CDW10) | (uint64(cmd.CDW11&0xFFFFFFFF) << 32)
	nlb := uint16(cmd.CDW12&0xFFFF) + 1
	byteCount := uint64(nlb) * SectorSize

	if slba*SectorSize+byteCount > ns.Size {
		resp.Status = StatusOutOfRange
		return resp
	}

	offset := slba * SectorSize
	if offset+byteCount > uint64(len(ns.Data)) {
		resp.Status = StatusOutOfRange
		return resp
	}

	writeData := make([]byte, byteCount)
	if cmd.PRP1 != 0 && len(writeData) > 0 {
		for i := range writeData {
			writeData[i] = byte(cmd.PRP1)
		}
	}

	copy(ns.Data[offset:offset+byteCount], writeData)

	c.smartData.IncrementHostWrites()
	c.smartData.AddDataUnitsWritten(uint64(nlb))

	return resp
}

func (c *Controller) GetIOSubmissionQueues() map[uint16]*IOQueue {
	c.mu.RLock()
	defer c.mu.RUnlock()

	queues := make(map[uint16]*IOQueue)
	for k, v := range c.ioSubmissionQueues {
		queues[k] = v
	}
	return queues
}

func (c *Controller) GetIOCompletionQueues() map[uint16]*IOQueue {
	c.mu.RLock()
	defer c.mu.RUnlock()

	queues := make(map[uint16]*IOQueue)
	for k, v := range c.ioCompletionQueues {
		queues[k] = v
	}
	return queues
}

func (c *Controller) GetIdentifyData() *IdentifyController {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.identifyData
}

func (c *Controller) StatusToString(status uint16) string {
	switch status {
	case StatusSuccess:
		return "Success"
	case StatusInvalidQueueIdentifier:
		return "Invalid Queue Identifier"
	case StatusQueueAlreadyExists:
		return "Queue Already Exists"
	case StatusQueueNotFound:
		return "Queue Not Found"
	case StatusInvalidCommand:
		return "Invalid Command"
	case StatusInvalidField:
		return "Invalid Field in Command"
	case StatusInvalidNamespace:
		return "Invalid Namespace or Format"
	case StatusOutOfRange:
		return "LBA Out of Range"
	default:
		return fmt.Sprintf("Unknown Status: 0x%04x", status)
	}
}

func (c *Controller) OpcodeToString(opcode uint8) string {
	switch opcode {
	case AdminOpcodeIdentify:
		return "Identify"
	case AdminOpcodeCreateIOSQ:
		return "Create IO SQ"
	case AdminOpcodeDeleteIOSQ:
		return "Delete IO SQ"
	case AdminOpcodeCreateIOCQ:
		return "Create IO CQ"
	case AdminOpcodeDeleteIOCQ:
		return "Delete IO CQ"
	case AdminOpcodeGetLogPage:
		return "Get Log Page"
	case NVMOpcodeRead:
		return "NVM Read"
	case NVMOpcodeWrite:
		return "NVM Write"
	default:
		return fmt.Sprintf("Unknown Opcode: 0x%02x", opcode)
	}
}

func (c *Controller) GetSMARTData() *SMARTHealthInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.smartData
}

func (c *Controller) GetNamespace(id uint32) *Namespace {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.namespaces[id]
}
