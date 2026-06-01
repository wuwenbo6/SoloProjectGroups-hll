package target

import (
	"fmt"
	"io"
	"log"
	"net"
	"sync"

	"nvme-tcp-target/pkg/protocol"
)

type TCPServer struct {
	addr        string
	listener    net.Listener
	controller  *Controller
	connections map[string]*TCPConnection
	mu          sync.Mutex
	wg          sync.WaitGroup
	shutdown    bool
}

type Queue struct {
	QID      uint16
	SQSize   uint16
	CQSize   uint16
	SQHead   uint16
	SQTail   uint16
	CQHead   uint16
	CQTail   uint16
	Commands []*protocol.NVMeCommand
	mu       sync.Mutex
}

type ConnectionQueues struct {
	adminQueue *Queue
	ioQueues   map[uint16]*Queue
	mu         sync.Mutex
}

func NewConnectionQueues() *ConnectionQueues {
	return &ConnectionQueues{
		adminQueue: NewQueue(0, protocol.MAX_ADMIN_QUEUE_SIZE, protocol.MAX_ADMIN_QUEUE_SIZE),
		ioQueues:   make(map[uint16]*Queue),
	}
}

func (cq *ConnectionQueues) GetQueue(qid uint16) *Queue {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	if qid == 0 {
		return cq.adminQueue
	}
	return cq.ioQueues[qid]
}

func (cq *ConnectionQueues) CreateIOQueue(qid uint16, sqSize uint16, cqSize uint16) *Queue {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	queue := NewQueue(qid, sqSize, cqSize)
	cq.ioQueues[qid] = queue
	return queue
}

func (cq *ConnectionQueues) DeleteQueue(qid uint16) {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	delete(cq.ioQueues, qid)
}

func (cq *ConnectionQueues) GetQueueCount() int {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	return 1 + len(cq.ioQueues)
}

func NewQueue(qid uint16, sqSize uint16, cqSize uint16) *Queue {
	return &Queue{
		QID:      qid,
		SQSize:   sqSize,
		CQSize:   cqSize,
		Commands: make([]*protocol.NVMeCommand, sqSize),
	}
}

func (q *Queue) EnqueueCommand(cmd *protocol.NVMeCommand) uint16 {
	q.mu.Lock()
	defer q.mu.Unlock()

	q.Commands[q.SQTail] = cmd
	idx := q.SQTail
	q.SQTail = (q.SQTail + 1) % q.SQSize
	return idx
}

func (q *Queue) DequeueCommand() (*protocol.NVMeCommand, uint16) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.SQHead == q.SQTail {
		return nil, 0
	}

	cmd := q.Commands[q.SQHead]
	idx := q.SQHead
	q.SQHead = (q.SQHead + 1) % q.SQSize
	return cmd, idx
}

func (q *Queue) EnqueueCQE() uint16 {
	q.mu.Lock()
	defer q.mu.Unlock()

	idx := q.CQTail
	q.CQTail = (q.CQTail + 1) % q.CQSize
	return idx
}

type TCPConnection struct {
	conn         net.Conn
	server       *TCPServer
	controller   *Controller
	initialized  bool
	ccidCounter  uint16
	mu           sync.Mutex
	pendingData  map[uint16]*PendingWrite
	queues       *ConnectionQueues
	connectionID string
	hostNQN      string
	subsysNQN    string
	cntrlID      uint16
	stats        *ConnStats
}

type PendingWrite struct {
	NSID      uint32
	LBA       uint64
	NumBlocks uint16
	TotalLen  uint32
	RecvLen   uint32
	Data      []byte
}

func NewTCPServer(addr string, controller *Controller) *TCPServer {
	return &TCPServer{
		addr:        addr,
		controller:  controller,
		connections: make(map[string]*TCPConnection),
	}
}

func (s *TCPServer) Start() error {
	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	s.listener = listener

	log.Printf("NVMe-TCP target server listening on %s", s.addr)

	s.wg.Add(1)
	go s.acceptLoop()

	return nil
}

func (s *TCPServer) acceptLoop() {
	defer s.wg.Done()

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			if s.shutdown {
				return
			}
			log.Printf("Accept error: %v", err)
			continue
		}

		connID := conn.RemoteAddr().String()
		log.Printf("New connection from %s", connID)

		tcpConn := &TCPConnection{
			conn:         conn,
			server:       s,
			controller:   s.controller,
			pendingData:  make(map[uint16]*PendingWrite),
			queues:       NewConnectionQueues(),
			connectionID: connID,
			cntrlID:      s.controller.GetNextControllerID(),
			stats:        NewConnStats("tcp"),
		}

		s.mu.Lock()
		s.connections[connID] = tcpConn
		s.mu.Unlock()

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			tcpConn.handleConnection()
		}()
	}
}

func (s *TCPServer) Stop() {
	s.shutdown = true
	if s.listener != nil {
		s.listener.Close()
	}

	s.mu.Lock()
	for _, conn := range s.connections {
		conn.conn.Close()
	}
	s.mu.Unlock()

	s.wg.Wait()
}

func (c *TCPConnection) handleConnection() {
	defer func() {
		c.conn.Close()
		c.server.mu.Lock()
		delete(c.server.connections, c.connectionID)
		c.server.mu.Unlock()
		log.Printf("Connection closed from %s, queues cleaned up: %d",
			c.connectionID, c.queues.GetQueueCount())
	}()

	for {
		hdr, err := c.readCommonHeader()
		if err != nil {
			if err != io.EOF {
				log.Printf("Error reading header: %v", err)
			}
			return
		}

		pduData := make([]byte, hdr.PLen)
		copy(pduData[0:8], hdr.Marshal())

		if hdr.PLen > 8 {
			_, err := io.ReadFull(c.conn, pduData[8:])
			if err != nil {
				log.Printf("Error reading PDU data: %v", err)
				return
			}
		}

		if err := c.handlePDU(hdr, pduData); err != nil {
			log.Printf("Error handling PDU: %v", err)
			return
		}
	}
}

func (c *TCPConnection) readCommonHeader() (*protocol.CommonPDUHdr, error) {
	hdrData := make([]byte, protocol.NVME_TCP_COMMON_HDR_LEN)
	_, err := io.ReadFull(c.conn, hdrData)
	if err != nil {
		return nil, err
	}

	hdr := &protocol.CommonPDUHdr{}
	if err := hdr.Unmarshal(hdrData); err != nil {
		return nil, err
	}

	return hdr, nil
}

func (c *TCPConnection) handlePDU(hdr *protocol.CommonPDUHdr, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	switch hdr.PDUType {
	case protocol.NVME_TCP_PDU_TYPE_IC_REQ:
		return c.handleICReq(data)
	case protocol.NVME_TCP_PDU_TYPE_CMD:
		return c.handleCmd(data)
	case protocol.NVME_TCP_PDU_TYPE_H2C_DATA:
		return c.handleH2CData(data)
	default:
		log.Printf("Unknown PDU type: 0x%02x", hdr.PDUType)
		return fmt.Errorf("unknown PDU type: 0x%02x", hdr.PDUType)
	}
}

func (c *TCPConnection) handleICReq(data []byte) error {
	icReq := &protocol.ICReqPDU{}
	if err := icReq.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse ICReq: %w", err)
	}

	log.Printf("[Conn %s] Received ICReq: PFV=0x%04x, MAXH2CDATA=%d, CAP_CMD PDO expected",
		c.connectionID, icReq.PFV, icReq.MAXH2CDATA)

	icResp := protocol.NewICRespPDU()
	icResp.PFV = protocol.NVME_TCP_PFV_1_0
	icResp.CPDA = 0
	icResp.Digest = 0
	icResp.MAXH2CDATA = 131072

	respData := icResp.Marshal()

	_, err := c.conn.Write(respData)
	if err != nil {
		return fmt.Errorf("failed to send ICResp: %w", err)
	}

	c.initialized = true
	log.Printf("[Conn %s] ICResp sent with CAP_CMD PDO=%d, connection initialized",
		c.connectionID, protocol.CAP_CMD_PDO)

	return nil
}

func (c *TCPConnection) handleCmd(data []byte) error {
	if !c.initialized {
		return fmt.Errorf("connection not initialized")
	}

	cmdPDU := &protocol.CmdPDU{}
	if err := cmdPDU.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse Cmd PDU: %w", err)
	}

	nvmeCmd, err := protocol.ParseNVMeCommand(cmdPDU.Command[:])
	if err != nil {
		return fmt.Errorf("failed to parse NVMe command: %w", err)
	}

	log.Printf("[Conn %s] Received command: Opcode=0x%02x, NSID=%d, QID=%d, CCID=%d, PDO=%d",
		c.connectionID, nvmeCmd.Opcode, nvmeCmd.NSID, cmdPDU.QID, cmdPDU.CCID, cmdPDU.CommonHdr.PDO)

	c.stats.CommandStart(cmdPDU.CCID)

	queue := c.queues.GetQueue(cmdPDU.QID)
	if queue != nil {
		queue.EnqueueCommand(nvmeCmd)
	}

	if cmdPDU.QID != protocol.NVME_QUEUE_ADMIN && nvmeCmd.Opcode == protocol.NVME_IO_OPC_WRITE {
		numBlocks := uint16(nvmeCmd.CDW12 & 0xFFFF)
		numBlocks++
		c.pendingData[cmdPDU.CCID] = &PendingWrite{
			NSID:      nvmeCmd.NSID,
			LBA:       uint64(nvmeCmd.CDW10) | (uint64(nvmeCmd.CDW11) << 32),
			NumBlocks: numBlocks,
			TotalLen:  uint32(numBlocks) * 512,
		}
		return nil
	}

	if nvmeCmd.Opcode == protocol.NVME_FABRIC_OPC_CONNECT {
		qid := uint16(nvmeCmd.CDW11 & 0xFFFF)
		sqsize := uint16(nvmeCmd.CDW10 & 0xFFFF)
		if qid != 0 {
			c.queues.CreateIOQueue(qid, sqsize, sqsize)
			log.Printf("[Conn %s] Created IO Queue QID=%d, SQSize=%d, total queues: %d",
				c.connectionID, qid, sqsize, c.queues.GetQueueCount())
		}
	}

	cqe, dataOut, err := c.controller.ProcessCommand(nvmeCmd, cmdPDU.QID)
	if err != nil {
		log.Printf("[Conn %s] Command processing error: %v", c.connectionID, err)
	}

	cqe.SQID = cmdPDU.QID

	if dataOut != nil && len(dataOut) > 0 {
		c.sendC2HData(cmdPDU.CCID, cmdPDU.QID, 0, dataOut)
	}

	c.sendCQE(cmdPDU.CCID, cmdPDU.QID, cqe)

	dataLen := 0
	if dataOut != nil {
		dataLen = len(dataOut)
	}
	c.stats.CommandDone(cmdPDU.CCID, cmdPDU.QID, nvmeCmd.Opcode, dataLen)

	return nil
}

func (c *TCPConnection) handleH2CData(data []byte) error {
	if !c.initialized {
		return fmt.Errorf("connection not initialized")
	}

	dataPDU := &protocol.H2CDataPDU{}
	if err := dataPDU.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse H2C Data PDU: %w", err)
	}

	pending, ok := c.pendingData[dataPDU.CCID]
	if !ok {
		return fmt.Errorf("no pending write for CCID %d", dataPDU.CCID)
	}

	if pending.Data == nil {
		pending.Data = make([]byte, pending.TotalLen)
	}

	copy(pending.Data[dataPDU.DataOffset:], dataPDU.Data)
	pending.RecvLen += uint32(len(dataPDU.Data))

	log.Printf("[Conn %s] Received H2C Data: CCID=%d, Offset=%d, Len=%d, Total=%d/%d",
		c.connectionID, dataPDU.CCID, dataPDU.DataOffset, len(dataPDU.Data), pending.RecvLen, pending.TotalLen)

	if pending.RecvLen >= pending.TotalLen {
		err := c.controller.ProcessWriteData(
			dataPDU.CCID,
			pending.NSID,
			pending.LBA,
			pending.NumBlocks,
			pending.Data,
		)

		cqe := protocol.NewNVMeCQE()
		cqe.CID = 0
		cqe.SQID = 1

		if err != nil {
			log.Printf("[Conn %s] Write error: %v", c.connectionID, err)
			cqe.Status = protocol.NVME_STATUS_DATA_TRANSFER_ERR
		}

		c.sendCQE(dataPDU.CCID, 1, cqe)
		delete(c.pendingData, dataPDU.CCID)
		c.stats.CommandDone(dataPDU.CCID, 1, 0x01, len(pending.Data))
	}

	return nil
}

func (c *TCPConnection) sendC2HData(ccid uint16, qid uint16, offset uint32, data []byte) {
	dataPDU := protocol.NewC2HDataPDU()
	dataPDU.CCID = ccid
	dataPDU.DataOffset = offset
	dataPDU.Data = data

	respData := dataPDU.Marshal()
	_, err := c.conn.Write(respData)
	if err != nil {
		log.Printf("[Conn %s] Failed to send C2H Data: %v", c.connectionID, err)
	}

	log.Printf("[Conn %s] Sent C2H Data: CCID=%d, QID=%d, Offset=%d, Len=%d, PDO=%d",
		c.connectionID, ccid, qid, offset, len(data), protocol.C2H_DATA_PDO)
}

func (c *TCPConnection) sendCQE(ccid uint16, qid uint16, cqe *protocol.NVMeCQE) {
	queue := c.queues.GetQueue(qid)
	if queue != nil {
		queue.EnqueueCQE()
	}

	cqePDU := protocol.NewCQEPDU()
	cqePDU.CCID = ccid
	cqePDU.QID = qid
	cqePDU.Status = cqe.Status
	copy(cqePDU.CQE[:], cqe.Marshal())

	respData := cqePDU.Marshal()
	_, err := c.conn.Write(respData)
	if err != nil {
		log.Printf("[Conn %s] Failed to send CQE: %v", c.connectionID, err)
	}

	log.Printf("[Conn %s] Sent CQE: CCID=%d, QID=%d, Status=0x%04x, PDO=%d",
		c.connectionID, ccid, qid, cqe.Status, protocol.CAP_RESP_PDO)
}

func (s *TCPServer) GetControllerInfo() map[string]interface{} {
	info := make(map[string]interface{})
	info["model"] = string(s.controller.ctrlInfo.MN[:])
	info["serial"] = string(s.controller.ctrlInfo.SN[:])
	info["firmware"] = string(s.controller.ctrlInfo.FR[:])
	info["num_namespaces"] = s.controller.ctrlInfo.NN

	s.mu.Lock()
	connInfo := make([]map[string]interface{}, 0, len(s.connections))
	for connID, conn := range s.connections {
		connInfo = append(connInfo, map[string]interface{}{
			"connection_id": connID,
			"initialized":   conn.initialized,
			"queue_count":   conn.queues.GetQueueCount(),
			"controller_id": conn.cntrlID,
		})
	}
	s.mu.Unlock()
	info["connections"] = connInfo

	nss := s.controller.GetNamespaces()
	nsInfo := make([]map[string]interface{}, 0, len(nss))
	for _, ns := range nss {
		nsInfo = append(nsInfo, map[string]interface{}{
			"nsid":   ns.NSID,
			"size":   ns.Size * 512,
			"active": ns.Active,
		})
	}
	info["namespaces"] = nsInfo

	return info
}

func (s *TCPServer) GetConnectionCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.connections)
}

func (s *TCPServer) GetConnectionStats() []map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	stats := make([]map[string]interface{}, 0, len(s.connections))
	for connID, conn := range s.connections {
		snap := conn.stats.Snapshot()
		snap["connection_id"] = connID
		snap["controller_id"] = conn.cntrlID
		snap["queue_count"] = conn.queues.GetQueueCount()
		snap["initialized"] = conn.initialized
		stats = append(stats, snap)
	}
	return stats
}
