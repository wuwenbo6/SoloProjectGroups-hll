package target

import (
	"encoding/binary"
	"fmt"
	"sync"

	"nvme-tcp-target/pkg/protocol"
)

type Controller struct {
	mu           sync.Mutex
	ctrlInfo     *protocol.NVMeController
	namespaces   map[uint32]*protocol.NVMeNamespace
	controllerID uint16
	nextCntrlID  uint16
	subsysNQN    string
}

func NewController(subsysNQN string, cntrlID uint16) *Controller {
	c := &Controller{
		ctrlInfo:     protocol.NewNVMeController(),
		namespaces:   make(map[uint32]*protocol.NVMeNamespace),
		subsysNQN:    subsysNQN,
		controllerID: cntrlID,
		nextCntrlID:  cntrlID + 1,
	}

	ns1 := protocol.NewNVMeNamespace(1, 1024*1024*1024)
	c.namespaces[1] = ns1

	ns2 := protocol.NewNVMeNamespace(2, 512*1024*1024)
	c.namespaces[2] = ns2

	c.ctrlInfo.NN = uint32(len(c.namespaces))

	return c
}

func (c *Controller) GetNextControllerID() uint16 {
	c.mu.Lock()
	defer c.mu.Unlock()
	id := c.nextCntrlID
	c.nextCntrlID++
	return id
}

func (c *Controller) GetNamespaces() []*protocol.NVMeNamespace {
	c.mu.Lock()
	defer c.mu.Unlock()

	nss := make([]*protocol.NVMeNamespace, 0, len(c.namespaces))
	for _, ns := range c.namespaces {
		if ns.Active {
			nss = append(nss, ns)
		}
	}
	return nss
}

func (c *Controller) GetNamespace(nsid uint32) *protocol.NVMeNamespace {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.namespaces[nsid]
}

func (c *Controller) AddNamespace(ns *protocol.NVMeNamespace) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.namespaces[ns.NSID] = ns
	c.ctrlInfo.NN = uint32(len(c.namespaces))
}

func (c *Controller) ProcessCommand(cmd *protocol.NVMeCommand, qid uint16) (*protocol.NVMeCQE, []byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	cqe := protocol.NewNVMeCQE()
	cqe.CID = cmd.CID
	cqe.SQID = qid

	var dataOut []byte
	var err error

	if qid == protocol.NVME_QUEUE_ADMIN {
		dataOut, err = c.processAdminCommand(cmd, cqe)
	} else {
		dataOut, err = c.processIOCommand(cmd, cqe)
	}

	if err != nil {
		cqe.Status = protocol.NVME_STATUS_INVALID_FIELD
	}

	return cqe, dataOut, nil
}

func (c *Controller) processAdminCommand(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	switch cmd.Opcode {
	case protocol.NVME_ADMIN_OPC_IDENTIFY:
		return c.handleIdentify(cmd, cqe)
	case protocol.NVME_ADMIN_OPC_GET_LOG_PAGE:
		return c.handleGetLogPage(cmd, cqe)
	case protocol.NVME_ADMIN_OPC_SET_FEATURES:
		return c.handleSetFeatures(cmd, cqe)
	case protocol.NVME_ADMIN_OPC_GET_FEATURES:
		return c.handleGetFeatures(cmd, cqe)
	case protocol.NVME_FABRIC_OPC_CONNECT:
		return c.handleFabricConnect(cmd, cqe)
	case protocol.NVME_FABRIC_OPC_PROPERTY_GET:
		return c.handlePropertyGet(cmd, cqe)
	case protocol.NVME_FABRIC_OPC_PROPERTY_SET:
		return c.handlePropertySet(cmd, cqe)
	default:
		cqe.Status = protocol.NVME_STATUS_INVALID_OPCODE
		return nil, fmt.Errorf("unsupported admin opcode: 0x%02x", cmd.Opcode)
	}
}

func (c *Controller) processIOCommand(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	switch cmd.Opcode {
	case protocol.NVME_IO_OPC_READ:
		return c.handleRead(cmd, cqe)
	case protocol.NVME_IO_OPC_WRITE:
		return c.handleWrite(cmd, cqe)
	case protocol.NVME_IO_OPC_FLUSH:
		return c.handleFlush(cmd, cqe)
	default:
		cqe.Status = protocol.NVME_STATUS_INVALID_OPCODE
		return nil, fmt.Errorf("unsupported IO opcode: 0x%02x", cmd.Opcode)
	}
}

func (c *Controller) handleIdentify(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	cns := cmd.CDW10 & 0xFF

	switch cns {
	case protocol.NVME_IDENTIFY_CNS_CONTROLLER:
		data := make([]byte, 4096)
		binary.LittleEndian.PutUint16(data[0:2], c.ctrlInfo.VID)
		binary.LittleEndian.PutUint16(data[2:4], c.ctrlInfo.SSVID)
		copy(data[4:24], c.ctrlInfo.SN[:])
		copy(data[24:64], c.ctrlInfo.MN[:])
		copy(data[64:72], c.ctrlInfo.FR[:])
		binary.LittleEndian.PutUint32(data[520:524], c.ctrlInfo.NN)
		binary.LittleEndian.PutUint16(data[524:526], c.ctrlInfo.ONCS)
		return data, nil

	case protocol.NVME_IDENTIFY_CNS_NAMESPACE:
		nsid := cmd.NSID
		ns := c.namespaces[nsid]
		if ns == nil || !ns.Active {
			cqe.Status = protocol.NVME_STATUS_NOT_FOUND
			return nil, fmt.Errorf("namespace %d not found", nsid)
		}
		data := make([]byte, 4096)
		binary.LittleEndian.PutUint64(data[0:8], ns.Size)
		binary.LittleEndian.PutUint64(data[8:16], ns.Cap)
		binary.LittleEndian.PutUint64(data[16:24], ns.Size)
		binary.LittleEndian.PutUint64(data[128:136], ns.LBAF0)
		return data, nil

	case protocol.NVME_IDENTIFY_CNS_NAMESPACE_LIST:
		data := make([]byte, 4096)
		offset := 0
		for nsid, ns := range c.namespaces {
			if ns.Active {
				binary.LittleEndian.PutUint32(data[offset:offset+4], nsid)
				offset += 4
			}
		}
		return data, nil

	default:
		cqe.Status = protocol.NVME_STATUS_INVALID_FIELD
		return nil, fmt.Errorf("unsupported CNS: 0x%02x", cns)
	}
}

func (c *Controller) handleGetLogPage(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	data := make([]byte, 4096)
	return data, nil
}

func (c *Controller) handleSetFeatures(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	return nil, nil
}

func (c *Controller) handleGetFeatures(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	data := make([]byte, 4)
	return data, nil
}

func (c *Controller) handleFabricConnect(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	_ = uint16(cmd.CDW11 & 0xFFFF)

	data := make([]byte, 16)
	binary.LittleEndian.PutUint16(data[0:2], c.controllerID)
	copy(cqe.CommandSpecific[:], data)

	return nil, nil
}

func (c *Controller) handlePropertyGet(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	offset := cmd.CDW10
	size := uint8(cmd.CDW11 & 0xFF)

	var value uint64
	switch offset {
	case protocol.NVME_PROP_CAP:
		value = c.ctrlInfo.CAP
	case protocol.NVME_PROP_VS:
		value = uint64(c.ctrlInfo.VS)
	case protocol.NVME_PROP_CC:
		value = uint64(c.ctrlInfo.CC)
	case protocol.NVME_PROP_CSTS:
		value = uint64(c.ctrlInfo.CSTS)
	case protocol.NVME_PROP_AQA:
		value = uint64(c.ctrlInfo.AQA)
	case protocol.NVME_PROP_ASQ:
		value = c.ctrlInfo.ASQ
	case protocol.NVME_PROP_ACQ:
		value = c.ctrlInfo.ACQ
	default:
		cqe.Status = protocol.NVME_STATUS_INVALID_FIELD
		return nil, fmt.Errorf("unsupported property offset: 0x%x", offset)
	}

	data := make([]byte, 8)
	if size == 4 {
		binary.LittleEndian.PutUint32(data[0:4], uint32(value))
	} else {
		binary.LittleEndian.PutUint64(data[0:8], value)
	}
	copy(cqe.CommandSpecific[:], data[:size])

	return nil, nil
}

func (c *Controller) handlePropertySet(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	offset := cmd.CDW10
	size := uint8(cmd.CDW11 & 0xFF)
	var value uint64

	if size == 4 {
		value = uint64(cmd.CDW12)
	} else {
		value = uint64(cmd.CDW12) | (uint64(cmd.CDW13) << 32)
	}

	switch offset {
	case protocol.NVME_PROP_CC:
		c.ctrlInfo.CC = uint32(value)
		if c.ctrlInfo.CC&0x1 == 1 {
			c.ctrlInfo.CSTS = 0x1
		}
	case protocol.NVME_PROP_AQA:
		c.ctrlInfo.AQA = uint32(value)
	case protocol.NVME_PROP_ASQ:
		c.ctrlInfo.ASQ = value
	case protocol.NVME_PROP_ACQ:
		c.ctrlInfo.ACQ = value
	default:
		cqe.Status = protocol.NVME_STATUS_INVALID_FIELD
		return nil, fmt.Errorf("unsupported property offset: 0x%x", offset)
	}

	return nil, nil
}

func (c *Controller) handleRead(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	nsid := cmd.NSID
	ns := c.namespaces[nsid]
	if ns == nil || !ns.Active {
		cqe.Status = protocol.NVME_STATUS_NOT_FOUND
		return nil, fmt.Errorf("namespace %d not found", nsid)
	}

	lba := uint64(cmd.CDW10) | (uint64(cmd.CDW11) << 32)
	numBlocks := uint16(cmd.CDW12 & 0xFFFF)
	numBlocks++
	lbaSize := uint32(512)

	data, err := ns.Read(lba, numBlocks, lbaSize)
	if err != nil {
		cqe.Status = protocol.NVME_STATUS_DATA_TRANSFER_ERR
		return nil, err
	}

	return data, nil
}

func (c *Controller) handleWrite(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	nsid := cmd.NSID
	ns := c.namespaces[nsid]
	if ns == nil || !ns.Active {
		cqe.Status = protocol.NVME_STATUS_NOT_FOUND
		return nil, fmt.Errorf("namespace %d not found", nsid)
	}

	return nil, nil
}

func (c *Controller) handleFlush(cmd *protocol.NVMeCommand, cqe *protocol.NVMeCQE) ([]byte, error) {
	return nil, nil
}

func (c *Controller) ProcessWriteData(ccid uint16, nsid uint32, lba uint64, numBlocks uint16, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	ns := c.namespaces[nsid]
	if ns == nil || !ns.Active {
		return fmt.Errorf("namespace %d not found", nsid)
	}

	lbaSize := uint32(512)
	return ns.Write(lba, numBlocks, lbaSize, data)
}
