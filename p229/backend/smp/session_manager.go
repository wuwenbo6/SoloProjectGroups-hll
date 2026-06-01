package smp

import (
	"log"
	"sync"
	"time"

	"ib-subnet-manager/model"
)

type SubnetManagerAPI interface {
	GetAllSwitches() []model.GUID
	GetRouteTable(guid model.GUID) (*model.RouteTable, bool)
	GetAllNodes() map[model.GUID]*model.Node
	AdvanceLinkTraining(guid model.GUID, portNum int) error
	UpdateTopology()
}

type SMPSessionManager struct {
	smAPI         SubnetManagerAPI
	smpHandler    *SMPHandler
	sessions      map[model.GUID]*LFTDistributionSession
	sessionMutex  sync.RWMutex
	stopChan      chan bool
	isRunning     bool
}

type LFTDistributionSession struct {
	SwitchGUID   model.GUID
	CurrentBlock int
	TotalBlocks  int
	Completed    bool
	StartTime    time.Time
	LastActivity time.Time
	Active       bool
}

func NewSMPSessionManager(smAPI SubnetManagerAPI, handler *SMPHandler) *SMPSessionManager {
	return &SMPSessionManager{
		smAPI:      smAPI,
		smpHandler: handler,
		sessions:   make(map[model.GUID]*LFTDistributionSession),
		stopChan:   make(chan bool),
	}
}

func (m *SMPSessionManager) Start() {
	m.sessionMutex.Lock()
	defer m.sessionMutex.Unlock()

	if m.isRunning {
		return
	}
	m.isRunning = true

	go m.run()
	go m.runLinkTraining()
}

func (m *SMPSessionManager) Stop() {
	m.sessionMutex.Lock()
	defer m.sessionMutex.Unlock()

	if !m.isRunning {
		return
	}
	m.stopChan <- true
	m.isRunning = false
}

func (m *SMPSessionManager) run() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			m.distributeLFT()
		}
	}
}

func (m *SMPSessionManager) runLinkTraining() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			m.advanceLinkTrainingForAllPorts()
		}
	}
}

func (m *SMPSessionManager) distributeLFT() {
	switches := m.smAPI.GetAllSwitches()

	for _, swGUID := range switches {
		m.distributeLFTForSwitch(swGUID)
	}
}

func (m *SMPSessionManager) distributeLFTForSwitch(swGUID model.GUID) {
	m.sessionMutex.Lock()
	session, exists := m.sessions[swGUID]
	if !exists {
		session = &LFTDistributionSession{
			SwitchGUID:   swGUID,
			CurrentBlock: 0,
			TotalBlocks:  16,
			Completed:    false,
			StartTime:    time.Now(),
			Active:       true,
		}
		m.sessions[swGUID] = session
	}
	m.sessionMutex.Unlock()

	if session.Completed {
		return
	}

	rt, exists := m.smAPI.GetRouteTable(swGUID)
	if !exists {
		return
	}

	blocksNeeded := make(map[int]bool)
	for lid := range rt.Entries {
		blockNum := int(lid) / 64
		blocksNeeded[blockNum] = true
	}

	if session.CurrentBlock < session.TotalBlocks {
		blockNum := session.CurrentBlock
		if blocksNeeded[blockNum] || blockNum == 0 {
			lftBlock := make([]byte, 64)
			baseLID := blockNum * 64

			for i := 0; i < 64; i++ {
				lid := model.LID(baseLID + i)
				if entry, ok := rt.Entries[lid]; ok {
					lftBlock[i] = byte(entry.OutPort)
				}
			}

			req := BuildSubnAdmSetLFTRequest(0, 0, swGUID, blockNum, lftBlock)

			_, err := m.smpHandler.HandleSMP(req)

			if err != nil {
				log.Printf("SMP Session: SubnAdm(Set LFT) failed for switch %x block %d: %v", swGUID, blockNum, err)
			} else {
				log.Printf("SMP Session: SubnAdm(Set LFT) success for switch %x block %d", swGUID, blockNum)
			}
		}

		m.sessionMutex.Lock()
		session.CurrentBlock++
		session.LastActivity = time.Now()
		if session.CurrentBlock >= session.TotalBlocks {
			session.Completed = true
			log.Printf("SMP Session: LFT distribution completed for switch %x", swGUID)
		}
		m.sessionMutex.Unlock()
	}
}

func (m *SMPSessionManager) advanceLinkTrainingForAllPorts() {
	nodes := m.smAPI.GetAllNodes()

	for guid, node := range nodes {
		for portNum, port := range node.Ports {
			if port.TrainingState != model.LTStateOperational && port.TrainingState != model.LTStateIdle && port.NeighborGUID != 0 {
				err := m.smAPI.AdvanceLinkTraining(guid, portNum)
				if err != nil {
					log.Printf("Link Training: failed to advance training for node %x port %d: %v", guid, portNum, err)
				} else {
					log.Printf("Link Training: advanced training for node %x port %d to %s", guid, portNum, port.TrainingState)
				}
			}
		}
	}

	m.smAPI.UpdateTopology()
}

func (m *SMPSessionManager) GetSessions() map[model.GUID]*LFTDistributionSession {
	m.sessionMutex.RLock()
	defer m.sessionMutex.RUnlock()

	sessions := make(map[model.GUID]*LFTDistributionSession)
	for guid, session := range m.sessions {
		sessions[guid] = session
	}
	return sessions
}

func (m *SMPSessionManager) ResetDistribution() {
	m.sessionMutex.Lock()
	defer m.sessionMutex.Unlock()

	m.sessions = make(map[model.GUID]*LFTDistributionSession)
}
