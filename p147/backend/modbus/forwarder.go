package modbus

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"modbus-gateway/stats"
	"modbus-gateway/system"
)

type Forwarder struct {
	router       *Router
	statsMgr     *stats.Manager
	systemStatus *system.Status
	primaryCli   map[int]*RTUClient
	backupCli    map[int]*RTUClient
	activePath   map[int]string
	consecFails  map[int]int
	mu           sync.RWMutex
}

func NewForwarder(router *Router, statsMgr *stats.Manager, systemStatus *system.Status) *Forwarder {
	return &Forwarder{
		router:       router,
		statsMgr:     statsMgr,
		systemStatus: systemStatus,
		primaryCli:   make(map[int]*RTUClient),
		backupCli:    make(map[int]*RTUClient),
		activePath:   make(map[int]string),
		consecFails:  make(map[int]int),
	}
}

func (f *Forwarder) primaryConfig(route *Route) SerialConfig {
	return SerialConfig{
		Port:     route.SerialPort,
		BaudRate: route.BaudRate,
		DataBits: route.DataBits,
		Parity:   route.Parity,
		StopBits: route.StopBits,
	}
}

func (f *Forwarder) backupConfig(route *Route) SerialConfig {
	return SerialConfig{
		Port:     route.Backup.SerialPort,
		BaudRate: route.Backup.BaudRate,
		DataBits: route.Backup.DataBits,
		Parity:   route.Backup.Parity,
		StopBits: route.Backup.StopBits,
	}
}

func (f *Forwarder) getOrCreatePrimary(route *Route) (*RTUClient, error) {
	if client, ok := f.primaryCli[route.ID]; ok {
		return client, nil
	}
	client, err := NewRTUClient(f.primaryConfig(route))
	if err != nil {
		return nil, err
	}
	f.primaryCli[route.ID] = client
	return client, nil
}

func (f *Forwarder) getOrCreateBackup(route *Route) (*RTUClient, error) {
	if client, ok := f.backupCli[route.ID]; ok {
		return client, nil
	}
	if !route.Backup.Enabled || route.Backup.SerialPort == "" {
		return nil, fmt.Errorf("backup not configured")
	}
	client, err := NewRTUClient(f.backupConfig(route))
	if err != nil {
		return nil, err
	}
	f.backupCli[route.ID] = client
	return client, nil
}

func (f *Forwarder) getActiveClient(route *Route) (*RTUClient, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	path := f.activePath[route.ID]
	if path == "" {
		path = "primary"
	}

	if path == "primary" {
		client, err := f.getOrCreatePrimary(route)
		if err != nil {
			if route.Backup.Enabled && route.Backup.SerialPort != "" {
				log.Printf("[Route %d] Primary failed (%v), switching to backup", route.ID, err)
				f.activePath[route.ID] = "backup"
				f.consecFails[route.ID] = 0
				bkClient, bkErr := f.getOrCreateBackup(route)
				if bkErr != nil {
					return nil, "backup", fmt.Errorf("both primary and backup failed: primary=%v, backup=%v", err, bkErr)
				}
				return bkClient, "backup", nil
			}
			return nil, "primary", err
		}
		return client, "primary", nil
	}

	client, err := f.getOrCreateBackup(route)
	if err != nil {
		return nil, "backup", err
	}
	return client, "backup", nil
}

func (f *Forwarder) recordSuccess(routeID int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.consecFails[routeID] = 0
}

func (f *Forwarder) recordFailure(routeID int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.consecFails[routeID]++
}

func (f *Forwarder) tryFailback(route *Route) {
	if !route.Backup.AutoFailback {
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.activePath[route.ID] == "backup" {
		f.consecFails[route.ID]++
		threshold := 3
		if route.Backup.FailbackInterval > 0 {
			threshold = route.Backup.FailbackInterval
		}
		if f.consecFails[route.ID] >= threshold {
			if client, ok := f.primaryCli[route.ID]; ok {
				client.Close()
				delete(f.primaryCli, route.ID)
			}
			f.activePath[route.ID] = "primary"
			f.consecFails[route.ID] = 0
			log.Printf("[Route %d] Attempting failback to primary", route.ID)
		}
	}
}

func (f *Forwarder) RemoveClient(routeID int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if client, ok := f.primaryCli[routeID]; ok {
		client.Close()
		delete(f.primaryCli, routeID)
	}
	if client, ok := f.backupCli[routeID]; ok {
		client.Close()
		delete(f.backupCli, routeID)
	}
	delete(f.activePath, routeID)
	delete(f.consecFails, routeID)
}

func (f *Forwarder) HandleTCPRequest(conn *net.TCPConn, route *Route) {
	defer conn.Close()
	routeID := route.ID
	f.statsMgr.InitRoute(routeID)

	conn.SetDeadline(time.Now().Add(30 * time.Second))

	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil {
		f.statsMgr.RecordError(routeID)
		log.Printf("[Route %d] Read error: %v", routeID, err)
		return
	}
	f.statsMgr.RecordSent(routeID, n)

	if n < 7 {
		f.statsMgr.RecordError(routeID)
		log.Printf("[Route %d] Invalid Modbus TCP frame (too short)", routeID)
		return
	}

	transactionID := binary.BigEndian.Uint16(buf[0:2])
	protocolID := binary.BigEndian.Uint16(buf[2:4])
	length := binary.BigEndian.Uint16(buf[4:6])
	unitID := buf[6]

	f.statsMgr.RecordRequest(routeID, unitID)

	if protocolID != 0 {
		f.statsMgr.RecordError(routeID)
		log.Printf("[Route %d] Invalid protocol ID: %d", routeID, protocolID)
		return
	}

	pdu := buf[7 : 6+length]
	slaveID := route.SlaveID
	if f.activePath[route.ID] == "backup" && route.Backup.SlaveID > 0 {
		slaveID = route.Backup.SlaveID
	}

	rtuFrame := make([]byte, 0, len(pdu)+3)
	rtuFrame = append(rtuFrame, slaveID)
	rtuFrame = append(rtuFrame, pdu...)
	crc := CRC16(rtuFrame)
	rtuFrame = append(rtuFrame, byte(crc&0xFF), byte(crc>>8))

	client, activePath, err := f.getActiveClient(route)
	if err != nil {
		f.statsMgr.RecordError(routeID)
		f.systemStatus.SetSerialError(routeID, err.Error())
		log.Printf("[Route %d] Serial error: %v", routeID, err)
		f.sendTCPError(conn, transactionID, unitID, 0x04)
		return
	}
	f.systemStatus.ClearSerialError(routeID)
	route.ActivePath = activePath

	log.Printf("[Route %d] TCP -> RTU [%s] % X (unitID=%d, slaveID=%d)", routeID, activePath, rtuFrame, unitID, slaveID)

	rtuResponse, err := client.SendAndReceive(rtuFrame, 2*time.Second)
	if err != nil {
		f.statsMgr.RecordError(routeID)
		f.statsMgr.RecordTimeout(routeID, unitID)
		f.recordFailure(routeID)
		log.Printf("[Route %d] RTU send/receive error: %v", routeID, err)

		if err == io.EOF || strings.Contains(err.Error(), "timeout") {
			f.tryFailback(route)
		}

		f.sendTCPError(conn, transactionID, unitID, 0x04)
		return
	}
	f.recordSuccess(routeID)

	f.statsMgr.RecordReceived(routeID, len(rtuResponse))
	log.Printf("[Route %d] RTU -> TCP: % X", routeID, rtuResponse)

	if len(rtuResponse) < 4 {
		f.statsMgr.RecordError(routeID)
		f.sendTCPError(conn, transactionID, unitID, 0x04)
		return
	}

	recvCRC := binary.LittleEndian.Uint16(rtuResponse[len(rtuResponse)-2:])
	calcCRC := CRC16(rtuResponse[:len(rtuResponse)-2])
	if recvCRC != calcCRC {
		log.Printf("[Route %d] CRC mismatch: recv=%04X calc=%04X", routeID, recvCRC, calcCRC)
	}

	responsePDU := rtuResponse[1 : len(rtuResponse)-2]

	tcpResponse := make([]byte, 7+len(responsePDU))
	binary.BigEndian.PutUint16(tcpResponse[0:2], transactionID)
	binary.BigEndian.PutUint16(tcpResponse[2:4], 0)
	binary.BigEndian.PutUint16(tcpResponse[4:6], uint16(len(responsePDU)+1))
	tcpResponse[6] = unitID
	copy(tcpResponse[7:], responsePDU)

	if _, err := conn.Write(tcpResponse); err != nil {
		log.Printf("[Route %d] TCP write error: %v", routeID, err)
	}
}

func (f *Forwarder) sendTCPError(conn *net.TCPConn, transactionID uint16, unitID byte, exceptionCode byte) {
	response := make([]byte, 9)
	binary.BigEndian.PutUint16(response[0:2], transactionID)
	binary.BigEndian.PutUint16(response[2:4], 0)
	binary.BigEndian.PutUint16(response[4:6], 3)
	response[6] = unitID
	response[7] = 0x80
	response[8] = exceptionCode
	conn.Write(response)
}

func (f *Forwarder) StartTCPServer(startPort int, maxAttempts int) (int, error) {
	listener, port, err := system.TryListenTCP(startPort, maxAttempts)
	if err != nil {
		f.systemStatus.SetModbusTCPRunning(false)
		return 0, fmt.Errorf("failed to bind to port %d (tried %d ports): %w", startPort, maxAttempts, err)
	}

	f.systemStatus.SetModbusTCPPort(port)
	f.systemStatus.SetModbusTCPRunning(true)

	log.Printf("Modbus TCP server listening on :%d (attempted from :%d)", port, startPort)

	go func() {
		defer listener.Close()
		for {
			conn, err := listener.Accept()
			if err != nil {
				log.Printf("Accept error: %v", err)
				continue
			}
			tcpConn := conn.(*net.TCPConn)
			remoteAddr := tcpConn.RemoteAddr().(*net.TCPAddr)
			ip := remoteAddr.IP.String()

			route, ok := f.router.GetByIP(ip)
			if !ok || !route.Enabled {
				log.Printf("No enabled route found for IP: %s", ip)
				tcpConn.Close()
				continue
			}

			log.Printf("Accepted connection from %s -> route %d (%s)", ip, route.ID, route.SerialPort)
			go f.HandleTCPRequest(tcpConn, route)
		}
	}()

	return port, nil
}

func (f *Forwarder) DirectTest(route *Route, functionCode byte, address uint16, quantity uint16, value uint16) (interface{}, error) {
	f.statsMgr.InitRoute(route.ID)
	f.statsMgr.RecordRequest(route.ID, route.SlaveID)

	pdu := make([]byte, 0, 6)
	pdu = append(pdu, functionCode)
	addrBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(addrBytes, address)
	pdu = append(pdu, addrBytes...)

	if functionCode == 0x06 {
		valBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(valBytes, value)
		pdu = append(pdu, valBytes...)
	} else if functionCode == 0x03 || functionCode == 0x04 {
		qtyBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(qtyBytes, quantity)
		pdu = append(pdu, qtyBytes...)
	} else if functionCode == 0x10 {
		qtyBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(qtyBytes, quantity)
		pdu = append(pdu, qtyBytes...)
		pdu = append(pdu, byte(quantity*2))
		for i := uint16(0); i < quantity; i++ {
			valBytes := make([]byte, 2)
			binary.BigEndian.PutUint16(valBytes, value)
			pdu = append(pdu, valBytes...)
		}
	}

	slaveID := route.SlaveID
	activePath := f.activePath[route.ID]
	if activePath == "backup" && route.Backup.SlaveID > 0 {
		slaveID = route.Backup.SlaveID
	}

	rtuFrame := make([]byte, 0, len(pdu)+3)
	rtuFrame = append(rtuFrame, slaveID)
	rtuFrame = append(rtuFrame, pdu...)
	crc := CRC16(rtuFrame)
	rtuFrame = append(rtuFrame, byte(crc&0xFF), byte(crc>>8))

	f.statsMgr.RecordSent(route.ID, len(rtuFrame))

	client, _, err := f.getActiveClient(route)
	if err != nil {
		f.statsMgr.RecordError(route.ID)
		return nil, fmt.Errorf("serial error: %w", err)
	}

	rtuResponse, err := client.SendAndReceive(rtuFrame, 3*time.Second)
	if err != nil {
		f.statsMgr.RecordError(route.ID)
		f.statsMgr.RecordTimeout(route.ID, slaveID)
		return nil, fmt.Errorf("RTU error: %w", err)
	}

	f.statsMgr.RecordReceived(route.ID, len(rtuResponse))

	if len(rtuResponse) < 4 {
		return nil, fmt.Errorf("invalid RTU response")
	}

	if rtuResponse[1]&0x80 != 0 {
		return nil, fmt.Errorf("Modbus exception: 0x%02X", rtuResponse[2])
	}

	responsePDU := rtuResponse[1 : len(rtuResponse)-2]

	if functionCode == 0x03 || functionCode == 0x04 {
		if len(responsePDU) < 2 {
			return nil, fmt.Errorf("invalid response length")
		}
		byteCount := int(responsePDU[1])
		registers := make([]uint16, byteCount/2)
		for i := 0; i < len(registers); i++ {
			registers[i] = binary.BigEndian.Uint16(responsePDU[2+i*2 : 4+i*2])
		}
		return registers, nil
	} else if functionCode == 0x06 || functionCode == 0x10 {
		return map[string]interface{}{
			"functionCode": responsePDU[0],
			"address":      binary.BigEndian.Uint16(responsePDU[1:3]),
		}, nil
	}

	return responsePDU, nil
}

func (f *Forwarder) GetActivePath(routeID int) string {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if path, ok := f.activePath[routeID]; ok && path != "" {
		return path
	}
	return "primary"
}

func enhanceSerialError(err error, portName string) string {
	errStr := err.Error()

	if strings.Contains(errStr, "permission denied") || strings.Contains(errStr, "Permission denied") {
		return fmt.Sprintf("无法打开串口 %s: 权限不足。请检查：\n1. 当前用户是否在 dialout 组中（Linux）\n2. 执行: sudo usermod -aG dialout $USER\n3. 然后注销并重新登录\n4. 或使用 sudo 运行程序\n原始错误: %s", portName, errStr)
	}

	if strings.Contains(errStr, "no such file or directory") || strings.Contains(errStr, "not found") {
		return fmt.Sprintf("串口 %s 不存在。请检查：\n1. 设备是否已连接\n2. 串口号是否正确\n3. 使用 dmesg 查看设备挂载情况\n原始错误: %s", portName, errStr)
	}

	if strings.Contains(errStr, "busy") || strings.Contains(errStr, "resource busy") {
		return fmt.Sprintf("串口 %s 已被占用。请检查：\n1. 是否有其他程序正在使用该串口\n2. 关闭其他串口调试助手等程序\n原始错误: %s", portName, errStr)
	}

	return fmt.Sprintf("打开串口 %s 失败: %s", portName, errStr)
}
