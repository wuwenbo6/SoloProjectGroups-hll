package target

import (
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"nvme-tcp-target/pkg/protocol"
)

type RDMAServer struct {
	addr        string
	listener    net.Listener
	controller  *Controller
	connections map[string]*RDMAConnection
	mu          sync.Mutex
	wg          sync.WaitGroup
	shutdown    bool
	qpnCounter  uint32
}

type RDMAConnection struct {
	conn         net.Conn
	server       *RDMAServer
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
	qpn          uint32
	psn          uint32
	memRegistry  *MemoryRegistry
	stats        *ConnStats
}

func NewRDMAServer(addr string, controller *Controller) *RDMAServer {
	return &RDMAServer{
		addr:        addr,
		controller:  controller,
		connections: make(map[string]*RDMAConnection),
		qpnCounter:  1,
	}
}

func (s *RDMAServer) Start() error {
	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	s.listener = listener

	log.Printf("NVMe-RDMA (simulated) target server listening on %s", s.addr)

	s.wg.Add(1)
	go s.acceptLoop()

	return nil
}

func (s *RDMAServer) acceptLoop() {
	defer s.wg.Done()

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			if s.shutdown {
				return
			}
			log.Printf("[RDMA] Accept error: %v", err)
			continue
		}

		connID := conn.RemoteAddr().String()
		log.Printf("[RDMA] New connection from %s", connID)

		s.mu.Lock()
		qpn := s.qpnCounter
		s.qpnCounter++
		s.mu.Unlock()

		rdmaConn := &RDMAConnection{
			conn:         conn,
			server:       s,
			controller:   s.controller,
			pendingData:  make(map[uint16]*PendingWrite),
			queues:       NewConnectionQueues(),
			connectionID: connID,
			cntrlID:      s.controller.GetNextControllerID(),
			qpn:          qpn,
			psn:          1,
			memRegistry:  NewMemoryRegistry(),
			stats:        NewConnStats("rdma"),
		}

		s.mu.Lock()
		s.connections[connID] = rdmaConn
		s.mu.Unlock()

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			rdmaConn.handleConnection()
		}()
	}
}

func (s *RDMAServer) Stop() {
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

func (s *RDMAServer) GetConnectionCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.connections)
}

func (s *RDMAServer) GetConnectionStats() []map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	stats := make([]map[string]interface{}, 0, len(s.connections))
	for connID, conn := range s.connections {
		snap := conn.stats.Snapshot()
		snap["connection_id"] = connID
		snap["controller_id"] = conn.cntrlID
		snap["queue_count"] = conn.queues.GetQueueCount()
		snap["qpn"] = conn.qpn
		snap["memory_regions"] = conn.memRegistry.Count()
		stats = append(stats, snap)
	}
	return stats
}

func (c *RDMAConnection) handleConnection() {
	defer func() {
		c.conn.Close()
		c.server.mu.Lock()
		delete(c.server.connections, c.connectionID)
		c.server.mu.Unlock()
		log.Printf("[RDMA] Connection closed from %s, MRs cleaned: %d, queues: %d",
			c.connectionID, c.memRegistry.Count(), c.queues.GetQueueCount())
	}()

	cmReqData := make([]byte, 536)
	_, err := io.ReadFull(c.conn, cmReqData)
	if err != nil {
		log.Printf("[RDMA] Error reading CM Req: %v", err)
		return
	}

	cmReq := &protocol.RDMACMReq{}
	if err := cmReq.Unmarshal(cmReqData); err != nil {
		log.Printf("[RDMA] Error parsing CM Req: %v", err)
		return
	}

	c.hostNQN = string(cmReq.HostNQN[:])
	log.Printf("[RDMA] [Conn %s] CM Req: PFV=0x%04x, QPN=%d, PSN=%d",
		c.connectionID, cmReq.PFV, cmReq.QPN, cmReq.PSN)

	cmRep := protocol.NewRDMACMRep()
	cmRep.QPN = c.qpn
	cmRep.PSN = c.psn
	cmRep.Status = 0
	cmRep.MRCount = 0

	_, err = c.conn.Write(cmRep.Marshal())
	if err != nil {
		log.Printf("[RDMA] Error sending CM Rep: %v", err)
		return
	}

	c.initialized = true
	log.Printf("[RDMA] [Conn %s] CM Rep sent: QPN=%d, connection established (simulated RDMA)",
		c.connectionID, c.qpn)

	for {
		hdrData := make([]byte, protocol.RDMA_MSG_HDR_LEN)
		_, err := io.ReadFull(c.conn, hdrData)
		if err != nil {
			if err != io.EOF {
				log.Printf("[RDMA] [Conn %s] Error reading msg header: %v", c.connectionID, err)
			}
			return
		}

		hdr := &protocol.RDMAMsgHdr{}
		if err := hdr.Unmarshal(hdrData); err != nil {
			log.Printf("[RDMA] [Conn %s] Error parsing msg header: %v", c.connectionID, err)
			return
		}

		remaining := int(hdr.PLen) - protocol.RDMA_MSG_HDR_LEN
		if remaining > 0 {
			restData := make([]byte, remaining)
			_, err := io.ReadFull(c.conn, restData)
			if err != nil {
				log.Printf("[RDMA] [Conn %s] Error reading msg data: %v", c.connectionID, err)
				return
			}
			hdrData = append(hdrData, restData...)
		}

		if err := c.handleMessage(hdr, hdrData); err != nil {
			log.Printf("[RDMA] [Conn %s] Error handling msg: %v", c.connectionID, err)
			return
		}
	}
}

func (c *RDMAConnection) handleMessage(hdr *protocol.RDMAMsgHdr, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	switch hdr.PDUType {
	case protocol.RDMA_PDU_TYPE_SEND:
		return c.handleSend(data)
	case protocol.RDMA_PDU_TYPE_WRITE:
		return c.handleRdmaWrite(data)
	case protocol.RDMA_CM_TYPE_MR:
		return c.handleMRReq(data)
	default:
		log.Printf("[RDMA] [Conn %s] Unknown msg type: 0x%02x", c.connectionID, hdr.PDUType)
		return fmt.Errorf("unknown RDMA msg type: 0x%02x", hdr.PDUType)
	}
}

func (c *RDMAConnection) handleSend(data []byte) error {
	sendMsg := &protocol.RDMASendMsg{}
	if err := sendMsg.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse RDMA Send: %w", err)
	}

	nvmeCmd, err := protocol.ParseNVMeCommand(sendMsg.Command[:])
	if err != nil {
		return fmt.Errorf("failed to parse NVMe command: %w", err)
	}

	c.stats.CommandStart(sendMsg.Hdr.CCID)

	log.Printf("[RDMA] [Conn %s] Recv Send: Opcode=0x%02x, NSID=%d, QID=%d, CCID=%d",
		c.connectionID, nvmeCmd.Opcode, nvmeCmd.NSID, sendMsg.Hdr.QID, sendMsg.Hdr.CCID)

	queue := c.queues.GetQueue(sendMsg.Hdr.QID)
	if queue != nil {
		queue.EnqueueCommand(nvmeCmd)
	}

	if sendMsg.Hdr.QID != protocol.NVME_QUEUE_ADMIN && nvmeCmd.Opcode == protocol.NVME_IO_OPC_WRITE {
		numBlocks := uint16(nvmeCmd.CDW12 & 0xFFFF)
		numBlocks++
		c.pendingData[sendMsg.Hdr.CCID] = &PendingWrite{
			NSID:      nvmeCmd.NSID,
			LBA:       uint64(nvmeCmd.CDW10) | (uint64(nvmeCmd.CDW11) << 32),
			NumBlocks: numBlocks,
			TotalLen:  uint32(numBlocks) * 512,
		}
		c.sendRdmaWriteReady(sendMsg.Hdr.CCID, sendMsg.Hdr.QID)
		return nil
	}

	if nvmeCmd.Opcode == protocol.NVME_FABRIC_OPC_CONNECT {
		qid := uint16(nvmeCmd.CDW11 & 0xFFFF)
		sqsize := uint16(nvmeCmd.CDW10 & 0xFFFF)
		if qid != 0 {
			c.queues.CreateIOQueue(qid, sqsize, sqsize)
			log.Printf("[RDMA] [Conn %s] Created IO Queue QID=%d, SQSize=%d, total queues: %d",
				c.connectionID, qid, sqsize, c.queues.GetQueueCount())
		}
	}

	cqe, dataOut, cmdErr := c.controller.ProcessCommand(nvmeCmd, sendMsg.Hdr.QID)
	if cmdErr != nil {
		log.Printf("[RDMA] [Conn %s] Command error: %v", c.connectionID, cmdErr)
	}

	cqe.SQID = sendMsg.Hdr.QID

	dataLen := 0
	if dataOut != nil {
		dataLen = len(dataOut)
	}

	if dataOut != nil && len(dataOut) > 0 {
		c.sendRdmaReadData(sendMsg.Hdr.CCID, sendMsg.Hdr.QID, dataOut)
	}

	c.sendCompletion(sendMsg.Hdr.CCID, sendMsg.Hdr.QID, cqe)

	c.stats.CommandDone(sendMsg.Hdr.CCID, sendMsg.Hdr.QID, nvmeCmd.Opcode, dataLen)

	return nil
}

func (c *RDMAConnection) handleRdmaWrite(data []byte) error {
	rdmaMsg := protocol.NewRDMARdmaMsg(protocol.RDMA_PDU_TYPE_WRITE)
	if err := rdmaMsg.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse RDMA Write: %w", err)
	}

	pending, ok := c.pendingData[rdmaMsg.Hdr.CCID]
	if !ok {
		return fmt.Errorf("no pending write for CCID %d", rdmaMsg.Hdr.CCID)
	}

	if pending.Data == nil {
		pending.Data = make([]byte, pending.TotalLen)
	}

	copy(pending.Data[rdmaMsg.RemoteAddr:], rdmaMsg.Data)
	pending.RecvLen += uint32(len(rdmaMsg.Data))

	log.Printf("[RDMA] [Conn %s] RDMA Write: CCID=%d, Offset=%d, Len=%d, MR=%d, Total=%d/%d",
		c.connectionID, rdmaMsg.Hdr.CCID, rdmaMsg.RemoteAddr, len(rdmaMsg.Data),
		rdmaMsg.MRID, pending.RecvLen, pending.TotalLen)

	if pending.RecvLen >= pending.TotalLen {
		err := c.controller.ProcessWriteData(
			rdmaMsg.Hdr.CCID,
			pending.NSID,
			pending.LBA,
			pending.NumBlocks,
			pending.Data,
		)

		cqe := protocol.NewNVMeCQE()
		cqe.SQID = 1

		if err != nil {
			cqe.Status = protocol.NVME_STATUS_DATA_TRANSFER_ERR
		}

		c.sendCompletion(rdmaMsg.Hdr.CCID, 1, cqe)
		delete(c.pendingData, rdmaMsg.Hdr.CCID)

		c.stats.CommandDone(rdmaMsg.Hdr.CCID, 1, 0x01, len(pending.Data))
	}

	return nil
}

func (c *RDMAConnection) handleMRReq(data []byte) error {
	mrReq := &protocol.RDMAMRReq{}
	if err := mrReq.Unmarshal(data); err != nil {
		return fmt.Errorf("failed to parse MR Req: %w", err)
	}

	region := c.memRegistry.Register(mrReq.Address, mrReq.Length, mrReq.Access)

	mrRep := protocol.NewRDMAMRRep()
	mrRep.MRID = region.ID
	mrRep.LKey = region.LKey
	mrRep.RKey = region.RKey
	mrRep.Status = 0

	_, err := c.conn.Write(mrRep.Marshal())
	if err != nil {
		return fmt.Errorf("failed to send MR Rep: %w", err)
	}

	log.Printf("[RDMA] [Conn %s] MR Registered: ID=%d, Addr=0x%x, Len=%d, LKey=%d, RKey=%d, total MRs=%d",
		c.connectionID, region.ID, region.Address, region.Length, region.LKey, region.RKey, c.memRegistry.Count())

	return nil
}

func (c *RDMAConnection) sendRdmaReadData(ccid uint16, qid uint16, data []byte) {
	rdmaMsg := protocol.NewRDMARdmaMsg(protocol.RDMA_PDU_TYPE_READ)
	rdmaMsg.Hdr.CCID = ccid
	rdmaMsg.Hdr.QID = qid
	rdmaMsg.DataLen = uint32(len(data))
	rdmaMsg.Data = data

	_, err := c.conn.Write(rdmaMsg.Marshal())
	if err != nil {
		log.Printf("[RDMA] [Conn %s] Failed to send RDMA Read Data: %v", c.connectionID, err)
	}

	log.Printf("[RDMA] [Conn %s] RDMA Read Data sent: CCID=%d, QID=%d, Len=%d (zero-copy simulated)",
		c.connectionID, ccid, qid, len(data))
}

func (c *RDMAConnection) sendRdmaWriteReady(ccid uint16, qid uint16) {
	rdmaMsg := protocol.NewRDMARdmaMsg(protocol.RDMA_PDU_TYPE_RECV)
	rdmaMsg.Hdr.CCID = ccid
	rdmaMsg.Hdr.QID = qid
	rdmaMsg.DataLen = 0

	_, err := c.conn.Write(rdmaMsg.Marshal())
	if err != nil {
		log.Printf("[RDMA] [Conn %s] Failed to send RDMA Recv (write ready): %v", c.connectionID, err)
	}

	log.Printf("[RDMA] [Conn %s] RDMA Recv (write ready) sent: CCID=%d, QID=%d",
		c.connectionID, ccid, qid)
}

func (c *RDMAConnection) sendCompletion(ccid uint16, qid uint16, cqe *protocol.NVMeCQE) {
	queue := c.queues.GetQueue(qid)
	if queue != nil {
		queue.EnqueueCQE()
	}

	cmplMsg := protocol.NewRDMACmplMsg()
	cmplMsg.Hdr.CCID = ccid
	cmplMsg.Hdr.QID = qid
	cmplMsg.Status = cqe.Status
	copy(cmplMsg.CQE[:], cqe.Marshal())

	_, err := c.conn.Write(cmplMsg.Marshal())
	if err != nil {
		log.Printf("[RDMA] [Conn %s] Failed to send completion: %v", c.connectionID, err)
	}

	log.Printf("[RDMA] [Conn %s] Completion sent: CCID=%d, QID=%d, Status=0x%04x",
		c.connectionID, ccid, qid, cqe.Status)
}

func SimulateRDMALatency() time.Duration {
	base := time.Duration(protocol.RDMA_SIMULATED_BASE_LATENCY_NS) * time.Nanosecond
	jitter := time.Duration(int64(float64(base) * 0.1))
	return base + jitter
}
