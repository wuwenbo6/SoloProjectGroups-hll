package backend

import (
	"encoding/binary"
	"time"
)

func (s *ModbusSimulator) checkTrap(slaveID, functionCode uint8, data []byte) ([]byte, string) {
	s.trapsMu.RLock()
	defer s.trapsMu.RUnlock()

	transactionID := binary.BigEndian.Uint16(data[0:2])
	protocolID := binary.BigEndian.Uint16(data[2:4])

	for _, trap := range s.Traps {
		if !trap.Enabled {
			continue
		}
		if trap.SlaveID != 0 && trap.SlaveID != slaveID {
			continue
		}
		if trap.FunctionCode != 0 && trap.FunctionCode != functionCode {
			continue
		}

		switch trap.Type {
		case "exception":
			return s.buildTrapException(transactionID, protocolID, slaveID, functionCode, 0x02), trap.Name
		case "slow":
			time.Sleep(30 * time.Second)
			return s.buildTrapException(transactionID, protocolID, slaveID, functionCode, 0x0B), trap.Name
		case "garbage":
			return []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x05, slaveID, functionCode, 0xAA, 0xBB, 0xCC}, trap.Name
		case "wrong_data":
			return s.buildTrapWrongData(transactionID, protocolID, slaveID, functionCode), trap.Name
		}
	}

	return nil, ""
}

func (s *ModbusSimulator) buildTrapException(transactionID, protocolID uint16, unitID, functionCode, exceptionCode uint8) []byte {
	resp := make([]byte, 9)
	binary.BigEndian.PutUint16(resp[0:2], transactionID)
	binary.BigEndian.PutUint16(resp[2:4], protocolID)
	binary.BigEndian.PutUint16(resp[4:6], 3)
	resp[6] = unitID
	resp[7] = functionCode | 0x80
	resp[8] = exceptionCode
	return resp
}

func (s *ModbusSimulator) buildTrapWrongData(transactionID, protocolID uint16, unitID, functionCode uint8) []byte {
	respData := []byte{0x04, 0xDE, 0xAD, 0xBE, 0xEF}
	length := uint16(2 + len(respData))
	resp := make([]byte, 7+len(respData))
	binary.BigEndian.PutUint16(resp[0:2], transactionID)
	binary.BigEndian.PutUint16(resp[2:4], protocolID)
	binary.BigEndian.PutUint16(resp[4:6], length)
	resp[6] = unitID
	resp[7] = functionCode
	copy(resp[8:], respData)
	return resp
}

func (s *ModbusSimulator) GetTraps() []TrapConfig {
	s.trapsMu.RLock()
	defer s.trapsMu.RUnlock()
	traps := make([]TrapConfig, 0, len(s.Traps))
	for _, trap := range s.Traps {
		traps = append(traps, trap)
	}
	return traps
}

func (s *ModbusSimulator) AddTrap(trap TrapConfig) {
	s.trapsMu.Lock()
	defer s.trapsMu.Unlock()
	s.Traps[trap.ID] = trap
}

func (s *ModbusSimulator) UpdateTrap(trap TrapConfig) {
	s.trapsMu.Lock()
	defer s.trapsMu.Unlock()
	s.Traps[trap.ID] = trap
}

func (s *ModbusSimulator) DeleteTrap(id string) {
	s.trapsMu.Lock()
	defer s.trapsMu.Unlock()
	delete(s.Traps, id)
}

func (s *ModbusSimulator) ClearLogs() {
	s.logsMu.Lock()
	defer s.logsMu.Unlock()
	s.logsHead = 0
	s.logsTail = 0
	s.logsCount = 0
	s.nextLogID = 1
}
