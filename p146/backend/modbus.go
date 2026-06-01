package backend

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

var functionCodeNames = map[uint8]string{
	0x01: "Read Coils",
	0x02: "Read Discrete Inputs",
	0x03: "Read Holding Registers",
	0x04: "Read Input Registers",
	0x05: "Write Single Coil",
	0x06: "Write Single Register",
	0x0F: "Write Multiple Coils",
	0x10: "Write Multiple Registers",
}

func NewModbusSimulator(config *SimulatorConfig) *ModbusSimulator {
	sim := &ModbusSimulator{
		config:        config,
		slaves:        make(map[uint8]*ModbusSlave),
		logs:          make([]ModbusRequest, MaxLogBufferSize),
		logQueue:      make(chan ModbusRequest, LogQueueSize),
		Traps:         make(map[string]TrapConfig),
		stopLogWorker: make(chan struct{}),
		nextLogID:     1,
	}

	sim.Fingerprint = NewFingerprintEngine(sim)
	sim.Honeypot = NewHoneypotManager(sim.Fingerprint)

	for _, slaveConfig := range config.Slaves {
		sim.slaves[slaveConfig.ID] = &ModbusSlave{
			config:    slaveConfig,
			simulator: sim,
		}
	}

	go sim.logWorker()

	return sim
}

func (s *ModbusSimulator) Start() error {
	var wg sync.WaitGroup
	errChan := make(chan error, len(s.slaves))

	for id, slave := range s.slaves {
		wg.Add(1)
		go func(slaveID uint8, ms *ModbusSlave) {
			defer wg.Done()
			if err := ms.Start(); err != nil {
				errChan <- fmt.Errorf("slave %d: %w", slaveID, err)
			}
		}(id, slave)
	}

	go func() {
		wg.Wait()
		close(errChan)
	}()

	for err := range errChan {
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *ModbusSimulator) logWorker() {
	for {
		select {
		case req := <-s.logQueue:
			s.writeLog(req)
		case <-s.stopLogWorker:
			return
		}
	}
}

func (s *ModbusSimulator) writeLog(req ModbusRequest) {
	s.logsMu.Lock()

	req.LogID = s.nextLogID
	s.nextLogID++

	s.logs[s.logsTail] = req
	s.logsTail = (s.logsTail + 1) % MaxLogBufferSize

	if s.logsCount < MaxLogBufferSize {
		s.logsCount++
	} else {
		s.logsHead = (s.logsHead + 1) % MaxLogBufferSize
	}

	s.logsMu.Unlock()

	if s.Fingerprint != nil {
		s.Fingerprint.TrackRequest(req)
	}

	if s.Honeypot != nil {
		s.Honeypot.ProcessRequest(req)
	}
}

func (s *ModbusSimulator) AddLog(req ModbusRequest) {
	select {
	case s.logQueue <- req:
	default:
	}
}

func (s *ModbusSimulator) GetLogs() []ModbusRequest {
	s.logsMu.RLock()
	defer s.logsMu.RUnlock()

	logs := make([]ModbusRequest, s.logsCount)
	for i := uint64(0); i < s.logsCount; i++ {
		idx := (s.logsHead + int(i)) % MaxLogBufferSize
		logs[i] = s.logs[idx]
	}
	return logs
}

func (s *ModbusSimulator) GetLogsSince(sinceLogID uint64, limit int) ([]ModbusRequest, uint64) {
	s.logsMu.RLock()
	defer s.logsMu.RUnlock()

	if s.logsCount == 0 {
		return []ModbusRequest{}, s.nextLogID
	}

	firstLogID := s.logs[s.logsHead].LogID
	if firstLogID == 0 {
		return []ModbusRequest{}, s.nextLogID
	}

	if sinceLogID < firstLogID {
		sinceLogID = firstLogID - 1
	}

	startIdx := -1
	for i := uint64(0); i < s.logsCount; i++ {
		idx := (s.logsHead + int(i)) % MaxLogBufferSize
		if s.logs[idx].LogID > sinceLogID {
			startIdx = int(i)
			break
		}
	}

	if startIdx == -1 {
		return []ModbusRequest{}, s.nextLogID
	}

	remaining := int(s.logsCount) - startIdx
	count := remaining
	if limit > 0 && limit < count {
		count = limit
	}

	logs := make([]ModbusRequest, count)
	for i := 0; i < count; i++ {
		idx := (s.logsHead + startIdx + i) % MaxLogBufferSize
		logs[i] = s.logs[idx]
	}

	return logs, s.nextLogID
}

func (s *ModbusSimulator) GetLogStats() (count uint64, nextID uint64) {
	s.logsMu.RLock()
	defer s.logsMu.RUnlock()
	return s.logsCount, s.nextLogID
}

func (s *ModbusSimulator) GetSlaveStatus() []SlaveStatus {
	statuses := make([]SlaveStatus, 0, len(s.slaves))
	for id, slave := range s.slaves {
		slave.mu.RLock()
		statuses = append(statuses, SlaveStatus{
			ID:           id,
			Name:         slave.config.Name,
			Port:         slave.config.Port,
			Running:      slave.running,
			RequestCount: slave.requestCount,
		})
		slave.mu.RUnlock()
	}
	return statuses
}

func (ms *ModbusSlave) Start() error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", ms.config.Port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", ms.config.Port, err)
	}

	ms.listener = listener
	ms.running = true

	log.Printf("Modbus slave %d (%s) listening on port %d", ms.config.ID, ms.config.Name, ms.config.Port)

	go ms.acceptConnections()

	return nil
}

func (ms *ModbusSlave) acceptConnections() {
	for ms.running {
		conn, err := ms.listener.Accept()
		if err != nil {
			if ms.running {
				log.Printf("Accept error for slave %d: %v", ms.config.ID, err)
			}
			continue
		}
		go ms.handleConnection(conn)
	}
}

func (ms *ModbusSlave) handleConnection(conn net.Conn) {
	defer conn.Close()
	remoteAddr := conn.RemoteAddr().(*net.TCPAddr)

	buf := make([]byte, 260)
	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			return
		}

		if n < 8 {
			continue
		}

		response := ms.processModbusRequest(buf[:n], remoteAddr.IP.String())
		if response != nil {
			conn.Write(response)
		}
	}
}

func (ms *ModbusSlave) processModbusRequest(data []byte, sourceIP string) []byte {
	ms.mu.Lock()
	ms.requestCount++
	ms.mu.Unlock()

	transactionID := binary.BigEndian.Uint16(data[0:2])
	protocolID := binary.BigEndian.Uint16(data[2:4])
	length := binary.BigEndian.Uint16(data[4:6])
	unitID := data[6]
	functionCode := data[7]

	funcName := functionCodeNames[functionCode]
	if funcName == "" {
		funcName = fmt.Sprintf("Unknown (0x%02X)", functionCode)
	}

	req := ModbusRequest{
		Timestamp:    time.Now(),
		SourceIP:     sourceIP,
		SlaveID:      unitID,
		SlaveName:    ms.config.Name,
		FunctionCode: functionCode,
		FunctionName: funcName,
		Data:         data[8 : 6+length],
		TrapTriggered: false,
	}

	if trapResponse, trapName := ms.simulator.checkTrap(unitID, functionCode, data); trapResponse != nil {
		req.TrapTriggered = true
		req.TrapName = trapName
		ms.simulator.AddLog(req)
		return trapResponse
	}

	ms.simulator.AddLog(req)

	response := ms.buildNormalResponse(transactionID, protocolID, unitID, functionCode, data)
	return response
}

func (ms *ModbusSlave) buildNormalResponse(transactionID, protocolID uint16, unitID, functionCode uint8, data []byte) []byte {
	switch functionCode {
	case 0x01, 0x02:
		startAddr := binary.BigEndian.Uint16(data[8:10])
		quantity := binary.BigEndian.Uint16(data[10:12])
		byteCount := (quantity + 7) / 8
		respData := make([]byte, 1+byteCount)
		respData[0] = byte(byteCount)
		for i := range respData[1:] {
			respData[1+i] = 0xFF
		}
		return ms.buildResponse(transactionID, protocolID, unitID, functionCode, respData)

	case 0x03, 0x04:
		startAddr := binary.BigEndian.Uint16(data[8:10])
		quantity := binary.BigEndian.Uint16(data[10:12])
		byteCount := quantity * 2
		respData := make([]byte, 1+byteCount)
		respData[0] = byte(byteCount)
		for i := uint16(0); i < quantity; i++ {
			val := uint16(startAddr + i + 100)
			binary.BigEndian.PutUint16(respData[1+i*2:], val)
		}
		return ms.buildResponse(transactionID, protocolID, unitID, functionCode, respData)

	case 0x05, 0x06:
		return data

	case 0x0F, 0x10:
		return data[:12]
	}

	return ms.buildExceptionResponse(transactionID, protocolID, unitID, functionCode, 0x01)
}

func (ms *ModbusSlave) buildResponse(transactionID, protocolID uint16, unitID, functionCode uint8, data []byte) []byte {
	length := uint16(2 + len(data))
	resp := make([]byte, 7+len(data))
	binary.BigEndian.PutUint16(resp[0:2], transactionID)
	binary.BigEndian.PutUint16(resp[2:4], protocolID)
	binary.BigEndian.PutUint16(resp[4:6], length)
	resp[6] = unitID
	resp[7] = functionCode
	copy(resp[8:], data)
	return resp
}

func (ms *ModbusSlave) buildExceptionResponse(transactionID, protocolID uint16, unitID, functionCode, exceptionCode uint8) []byte {
	resp := make([]byte, 9)
	binary.BigEndian.PutUint16(resp[0:2], transactionID)
	binary.BigEndian.PutUint16(resp[2:4], protocolID)
	binary.BigEndian.PutUint16(resp[4:6], 3)
	resp[6] = unitID
	resp[7] = functionCode | 0x80
	resp[8] = exceptionCode
	return resp
}
