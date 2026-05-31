package modbus

import (
	"encoding/binary"
	"fmt"
	"leakage-monitor/internal/config"
	"leakage-monitor/internal/database"
	"leakage-monitor/internal/models"
	"log"
	"net"
	"sync"
	"time"
)

type ModbusServer struct {
	listener    net.Listener
	running     bool
	clients     map[net.Conn]bool
	clientsMu   sync.Mutex
	latestData  map[string]*models.SensorData
	dataMu      sync.RWMutex
}

var server *ModbusServer

func StartServer() {
	server = &ModbusServer{
		clients:    make(map[net.Conn]bool),
		latestData: make(map[string]*models.SensorData),
	}

	go server.updateDataLoop()

	addr := fmt.Sprintf(":%d", config.App.Server.ModbusPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("Modbus TCP server error: %v", err)
		return
	}
	server.listener = listener
	server.running = true

	log.Printf("Modbus TCP server started on port %d", config.App.Server.ModbusPort)

	for server.running {
		conn, err := listener.Accept()
		if err != nil {
			if server.running {
				log.Printf("Modbus accept error: %v", err)
			}
			continue
		}
		go server.handleClient(conn)
	}
}

func (s *ModbusServer) updateDataLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		sensors, err := database.GetAllSensors()
		if err != nil {
			continue
		}

		s.dataMu.Lock()
		for _, sensor := range sensors {
			data, err := database.GetSensorData(sensor.ID, 1)
			if err == nil && len(data) > 0 {
				s.latestData[sensor.ID] = &data[0]
			}
		}
		s.dataMu.Unlock()
	}
}

func (s *ModbusServer) handleClient(conn net.Conn) {
	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	buf := make([]byte, 256)
	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			break
		}

		if n < 8 {
			continue
		}

		response := s.handleRequest(buf[:n])
		if response != nil {
			conn.Write(response)
		}
	}
}

func (s *ModbusServer) handleRequest(req []byte) []byte {
	if len(req) < 12 {
		return nil
	}

	transactionID := binary.BigEndian.Uint16(req[0:2])
	protocolID := binary.BigEndian.Uint16(req[2:4])
	unitID := req[6]
	functionCode := req[7]

	if protocolID != 0 {
		return nil
	}

	response := make([]byte, 8)
	binary.BigEndian.PutUint16(response[0:2], transactionID)
	binary.BigEndian.PutUint16(response[2:4], 0)
	response[6] = unitID
	response[7] = functionCode

	switch functionCode {
	case 0x03:
		return s.handleReadHoldingRegisters(req, response)
	default:
		response[7] = functionCode | 0x80
		response = append(response, 0x01)
		binary.BigEndian.PutUint16(response[4:6], 3)
		return response
	}
}

func (s *ModbusServer) handleReadHoldingRegisters(req, response []byte) []byte {
	startAddr := binary.BigEndian.Uint16(req[8:10])
	quantity := binary.BigEndian.Uint16(req[10:12])

	registerCount := int(quantity) * 2
	data := make([]byte, 1+registerCount)
	data[0] = byte(registerCount)

	s.dataMu.RLock()
	defer s.dataMu.RUnlock()

	sensorIndex := int(startAddr / 100)
	sensors := make([]string, 0, len(s.latestData))
	for k := range s.latestData {
		sensors = append(sensors, k)
	}

	if sensorIndex < len(sensors) {
		sensorID := sensors[sensorIndex]
		if dataPoint, ok := s.latestData[sensorID]; ok {
			regOffset := int(startAddr % 100)
			for i := 0; i < int(quantity); i++ {
				reg := regOffset + i
				var value uint16
				switch reg {
				case 0:
					value = uint16(dataPoint.PeakCurrent * 100)
				case 1:
					value = uint16(dataPoint.PulseCount)
				case 2:
					value = uint16(dataPoint.PollutionLevel)
				}
				binary.BigEndian.PutUint16(data[1+i*2:3+i*2], value)
			}
		}
	}

	response = append(response, data...)
	binary.BigEndian.PutUint16(response[4:6], uint16(len(data)+2))

	return response
}

func StopServer() {
	if server != nil && server.running {
		server.running = false
		server.listener.Close()

		server.clientsMu.Lock()
		for client := range server.clients {
			client.Close()
		}
		server.clientsMu.Unlock()
	}
}
