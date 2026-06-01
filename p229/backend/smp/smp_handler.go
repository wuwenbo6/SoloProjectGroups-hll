package smp

import (
	"encoding/binary"
	"fmt"
	"log"
	"sync"
	"time"

	"ib-subnet-manager/model"
	"ib-subnet-manager/sm"
)

type SMPHandler struct {
	subnetManager *sm.SubnetManager
	eventLog      []*model.SMPEvent
	eventMutex    sync.RWMutex
}

func NewSMPHandler(sm *sm.SubnetManager) *SMPHandler {
	return &SMPHandler{
		subnetManager: sm,
		eventLog:      make([]*model.SMPEvent, 0, 1000),
	}
}

func (h *SMPHandler) AddEvent(typ, message string, nodeGUID model.GUID, portNum int) {
	h.eventMutex.Lock()
	defer h.eventMutex.Unlock()

	event := &model.SMPEvent{
		Timestamp: time.Now(),
		Type:      typ,
		Message:   message,
		NodeGUID:  nodeGUID,
		PortNum:   portNum,
	}
	h.eventLog = append(h.eventLog, event)

	if len(h.eventLog) > 1000 {
		h.eventLog = h.eventLog[1:]
	}
}

func (h *SMPHandler) GetEvents() []*model.SMPEvent {
	h.eventMutex.RLock()
	defer h.eventMutex.RUnlock()

	events := make([]*model.SMPEvent, len(h.eventLog))
	copy(events, h.eventLog)
	return events
}

func (h *SMPHandler) HandleSMP(request []byte) ([]byte, error) {
	if len(request) < 24 {
		return nil, fmt.Errorf("SMP message too short")
	}

	msg := &model.SMPMessage{}
	msg.Version = request[0]
	msg.MsgType = request[1]
	msg.Status = binary.BigEndian.Uint16(request[2:4])
	msg.ClassVersion = request[4]
	msg.Method = request[5]
	msg.Status2 = request[6]
	msg.HOpbits = request[7]
	msg.AttributeID = binary.BigEndian.Uint16(request[8:10])
	msg.AttributeModifier = binary.BigEndian.Uint32(request[16:20])

	return h.processAttribute(msg, request[20:])
}

func (h *SMPHandler) processAttribute(msg *model.SMPMessage, data []byte) ([]byte, error) {
	switch msg.AttributeID {
	case model.SubnGetNodeInfo:
		return h.handleSubnGetNodeInfo(msg, data)
	case model.SubnGetPortInfo:
		return h.handleSubnGetPortInfo(msg, data)
	case model.SubnGetLFT:
		return h.handleSubnGetLFT(msg, data)
	case model.SubnAdmSetLFT:
		return h.handleSubnAdmSetLFT(msg, data)
	case model.SubnGetPKeyTable:
		return h.handleSubnGetPKeyTable(msg, data)
	default:
		return h.buildErrorResponse(msg, 0x0002)
	}
}

func (h *SMPHandler) handleSubnGetNodeInfo(msg *model.SMPMessage, data []byte) ([]byte, error) {
	guid := model.GUID(binary.BigEndian.Uint64(data[0:8]))

	nodeInfo, err := h.subnetManager.GetNodeInfo(guid)
	if err != nil {
		return h.buildErrorResponse(msg, 0x0008)
	}

	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, 0x0000)

	offset := 20
	binary.BigEndian.PutUint64(response[offset:offset+8], uint64(nodeInfo.GUID))
	offset += 8
	response[offset] = nodeTypeToByte(nodeInfo.NodeType)
	offset++
	response[offset] = uint8(nodeInfo.NumPorts)
	offset++
	binary.BigEndian.PutUint16(response[offset:offset+2], nodeInfo.DeviceID)
	offset += 2
	response[offset] = nodeInfo.Revision
	offset++
	response[offset+1] = nodeInfo.LocalPortNum
	offset += 2
	copy(response[offset:offset+3], nodeInfo.VendorOUI[:])
	offset += 3
	binary.BigEndian.PutUint16(response[offset:offset+2], nodeInfo.VendorID)
	offset += 2
	binary.BigEndian.PutUint16(response[offset:offset+2], uint16(nodeInfo.LID))
	offset += 2
	binary.BigEndian.PutUint64(response[offset:offset+8], uint64(nodeInfo.SystemImageGUID))

	nameBytes := []byte(nodeInfo.Name)
	copy(response[64:64+64], nameBytes)

	return response, nil
}

func (h *SMPHandler) handleSubnGetPortInfo(msg *model.SMPMessage, data []byte) ([]byte, error) {
	guid := model.GUID(binary.BigEndian.Uint64(data[0:8]))
	portNum := int(msg.AttributeModifier & 0xFF)

	portInfo, err := h.subnetManager.GetPortInfo(guid, portNum)
	if err != nil {
		return h.buildErrorResponse(msg, 0x0008)
	}

	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, 0x0000)

	offset := 20
	binary.BigEndian.PutUint64(response[offset:offset+8], uint64(portInfo.MKey))
	offset += 8
	binary.BigEndian.PutUint32(response[offset:offset+4], portInfo.MKeyLeasePeriod)
	offset += 4
	response[offset] = portStateToByte(portInfo.State)
	offset++
	response[offset] = 0x05
	offset++
	response[offset] = 0
	offset++
	response[offset] = 0
	offset++
	binary.BigEndian.PutUint32(response[offset:offset+4], portInfo.CapabilityMask)
	offset += 4
	binary.BigEndian.PutUint16(response[offset:offset+2], uint16(portInfo.LID))
	offset += 2
	binary.BigEndian.PutUint16(response[offset:offset+2], uint16(portInfo.MasterSM_LID))

	return response, nil
}

func (h *SMPHandler) handleSubnGetLFT(msg *model.SMPMessage, data []byte) ([]byte, error) {
	guid := model.GUID(binary.BigEndian.Uint64(data[0:8]))
	blockNum := int(msg.AttributeModifier & 0xFFFF)

	rt, exists := h.subnetManager.GetRouteTable(guid)
	if !exists {
		return h.buildErrorResponse(msg, 0x0008)
	}

	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, 0x0000)

	lftBlock := make([]uint8, 64)
	baseLID := blockNum * 64

	for i := 0; i < 64; i++ {
		lid := model.LID(baseLID + i)
		if entry, ok := rt.Entries[lid]; ok {
			lftBlock[i] = uint8(entry.OutPort)
		} else {
			lftBlock[i] = 0
		}
	}

	copy(response[20:84], lftBlock)

	log.Printf("SMP: SubnGet(LFT) for node %x block %d, %d entries", binary.BigEndian.Uint64(data[0:8]), blockNum, len(rt.Entries))
	h.AddEvent("SubnGet(LFT)", fmt.Sprintf("读取LFT块 %d", blockNum), model.GUID(binary.BigEndian.Uint64(data[0:8])), 0)

	return response, nil
}

func (h *SMPHandler) handleSubnAdmSetLFT(msg *model.SMPMessage, data []byte) ([]byte, error) {
	guid := model.GUID(binary.BigEndian.Uint64(data[0:8]))
	blockNum := int(msg.AttributeModifier & 0xFFFF)

	log.Printf("SMP: SubnAdm(Set LFT) for node %x block %d", guid, blockNum)
	h.AddEvent("SubnAdm(Set)", fmt.Sprintf("配置LFT块 %d", blockNum), guid, 0)

	err := h.subnetManager.SetLFTBlock(guid, blockNum, data[8:72])
	if err != nil {
		log.Printf("SMP: SubnAdm(Set LFT) failed: %v", err)
		return h.buildErrorResponse(msg, 0x0008)
	}

	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, 0x0000)
	copy(response[20:84], data[8:72])

	return response, nil
}

func (h *SMPHandler) handleSubnGetPKeyTable(msg *model.SMPMessage, data []byte) ([]byte, error) {
	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, 0x0000)

	pkeyBlock := make([]uint16, 32)
	for i := range pkeyBlock {
		if i == 0 {
			pkeyBlock[i] = 0xFFFF
		} else {
			pkeyBlock[i] = 0x0000
		}
	}

	for i, pkey := range pkeyBlock {
		binary.BigEndian.PutUint16(response[20+i*2:22+i*2], pkey)
	}

	return response, nil
}

func (h *SMPHandler) fillResponseHeader(response []byte, msg *model.SMPMessage, status uint16) {
	response[0] = msg.Version
	response[1] = msg.MsgType
	binary.BigEndian.PutUint16(response[2:4], status)
	response[4] = msg.ClassVersion
	response[5] = msg.Method
	response[6] = 0
	response[7] = msg.HOpbits
	binary.BigEndian.PutUint16(response[8:10], msg.AttributeID)
	binary.BigEndian.PutUint32(response[16:20], msg.AttributeModifier)
}

func (h *SMPHandler) buildErrorResponse(msg *model.SMPMessage, status uint16) ([]byte, error) {
	response := make([]byte, 256)
	h.fillResponseHeader(response, msg, status)
	return response, nil
}

func nodeTypeToByte(nt model.NodeType) uint8 {
	switch nt {
	case model.NodeTypeHCA:
		return 0x01
	case model.NodeTypeSwitch:
		return 0x02
	case model.NodeTypeRouter:
		return 0x03
	default:
		return 0xFF
	}
}

func portStateToByte(ps model.PortState) uint8 {
	switch ps {
	case model.PortStateDown:
		return 0x01
	case model.PortStateInit:
		return 0x02
	case model.PortStateArmed:
		return 0x03
	case model.PortStateActive:
		return 0x04
	default:
		return 0x00
	}
}

func BuildSubnGetNodeInfoRequest(drPath byte, destinationLID model.LID, targetGUID model.GUID) []byte {
	request := make([]byte, 256)

	request[0] = 0x01
	request[1] = 0x01
	request[4] = 0x01
	request[5] = 0x01
	request[7] = drPath
	binary.BigEndian.PutUint16(request[8:10], model.SubnGetNodeInfo)

	guidBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(guidBytes, uint64(targetGUID))
	copy(request[20:28], guidBytes)

	return request
}

func BuildSubnGetPortInfoRequest(drPath byte, destinationLID model.LID, targetGUID model.GUID, portNum int) []byte {
	request := make([]byte, 256)

	request[0] = 0x01
	request[1] = 0x01
	request[4] = 0x01
	request[5] = 0x01
	request[7] = drPath
	binary.BigEndian.PutUint16(request[8:10], model.SubnGetPortInfo)
	binary.BigEndian.PutUint32(request[16:20], uint32(portNum))

	guidBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(guidBytes, uint64(targetGUID))
	copy(request[20:28], guidBytes)

	return request
}

func BuildSubnGetLFTRequest(drPath byte, destinationLID model.LID, targetGUID model.GUID, blockNum int) []byte {
	request := make([]byte, 256)

	request[0] = 0x01
	request[1] = 0x01
	request[4] = 0x01
	request[5] = 0x01
	request[7] = drPath
	binary.BigEndian.PutUint16(request[8:10], model.SubnGetLFT)
	binary.BigEndian.PutUint32(request[16:20], uint32(blockNum))

	guidBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(guidBytes, uint64(targetGUID))
	copy(request[20:28], guidBytes)

	return request
}

func BuildSubnAdmSetLFTRequest(drPath byte, destinationLID model.LID, targetGUID model.GUID, blockNum int, lftBlock []byte) []byte {
	request := make([]byte, 256)

	request[0] = 0x01
	request[1] = 0x01
	request[4] = 0x01
	request[5] = 0x02
	request[7] = drPath
	binary.BigEndian.PutUint16(request[8:10], model.SubnAdmSetLFT)
	binary.BigEndian.PutUint32(request[16:20], uint32(blockNum))

	guidBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(guidBytes, uint64(targetGUID))
	copy(request[20:28], guidBytes)

	if len(lftBlock) >= 64 {
		copy(request[28:92], lftBlock[:64])
	}

	return request
}

func BuildSubnGetReply(originalMsg *model.SMPMessage, status uint16) []byte {
	reply := make([]byte, 256)

	reply[0] = originalMsg.Version
	reply[1] = originalMsg.MsgType
	binary.BigEndian.PutUint16(reply[2:4], status)
	reply[4] = originalMsg.ClassVersion
	reply[5] = originalMsg.Method
	reply[6] = 0
	reply[7] = originalMsg.HOpbits
	binary.BigEndian.PutUint16(reply[8:10], model.SubnGetReply)
	binary.BigEndian.PutUint32(reply[16:20], originalMsg.AttributeModifier)

	return reply
}
