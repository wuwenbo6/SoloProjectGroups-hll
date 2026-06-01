package pdp

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"gtp-simulator/internal/gtpv1"
)

type PDPContext struct {
	ID             string
	IMSI           string
	MSISDN         string
	NSAPI          uint8
	APN            string
	PDPType        uint8
	MSIP           net.IP
	GGSNIP         net.IP
	SGSNIP         net.IP
	TEIDControl    uint32
	TEIDUser       uint32
	QoSProfile     gtpv1.QoSProfile
	QoSParams      gtpv1.QoSParameters
	QoSController  *gtpv1.QoSController
	QoSStats       gtpv1.QoSStatistics
	CreatedAt      time.Time
	Active         bool
	Stats          PDPStats
}

type PDPStats struct {
	UplinkPackets   atomic.Uint64
	DownlinkPackets atomic.Uint64
	UplinkBytes     atomic.Uint64
	DownlinkBytes   atomic.Uint64
}

type PDPManager struct {
	contexts        map[string]*PDPContext
	mu              sync.RWMutex
	teidControlPool *gtpv1.TEIDPool
	teidUserPool    *gtpv1.TEIDPool
	ipGen           uint32
}

func NewPDPManager() *PDPManager {
	return &PDPManager{
		contexts:        make(map[string]*PDPContext),
		teidControlPool: gtpv1.NewTEIDPool("control", 0x1000),
		teidUserPool:    gtpv1.NewTEIDPool("user", 0x2000),
		ipGen:           1,
	}
}

func (m *PDPManager) GetControlTEIDPool() *gtpv1.TEIDPool {
	return m.teidControlPool
}

func (m *PDPManager) GetUserTEIDPool() *gtpv1.TEIDPool {
	return m.teidUserPool
}

func (m *PDPManager) generateIP() net.IP {
	m.ipGen++
	return net.IPv4(10, 0, 0, byte(m.ipGen))
}

func (m *PDPManager) CreatePDP(req CreatePDPRequest) (*PDPContext, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := fmt.Sprintf("%s-%d", req.IMSI, req.NSAPI)
	if _, exists := m.contexts[id]; exists {
		return nil, fmt.Errorf("PDP context already exists for IMSI %s, NSAPI %d", req.IMSI, req.NSAPI)
	}

	msIP := req.MSIP
	if msIP == nil {
		msIP = m.generateIP()
	}

	teidControl, err := m.teidControlPool.Allocate(id)
	if err != nil {
		return nil, fmt.Errorf("failed to allocate control TEID: %w", err)
	}

	teidUser, err := m.teidUserPool.Allocate(id)
	if err != nil {
		m.teidControlPool.Release(id)
		return nil, fmt.Errorf("failed to allocate user TEID: %w", err)
	}

	qci := req.QCI
	if qci == 0 {
		qci = 9
	}
	qosParams := gtpv1.QCItoQoSParameters(qci)

	pdp := &PDPContext{
		ID:            id,
		IMSI:          req.IMSI,
		MSISDN:        req.MSISDN,
		NSAPI:         req.NSAPI,
		APN:           req.APN,
		PDPType:        req.PDPType,
		MSIP:           msIP,
		GGSNIP:         req.GGSNIP,
		SGSNIP:         req.SGSNIP,
		TEIDControl:    teidControl,
		TEIDUser:       teidUser,
		QoSProfile:     req.QoSProfile,
		QoSParams:      qosParams,
		QoSController:  gtpv1.NewQoSController(qosParams),
		CreatedAt:      time.Now(),
		Active:         true,
	}

	m.contexts[id] = pdp
	return pdp, nil
}

func (m *PDPManager) DeletePDP(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	_, exists := m.contexts[id]
	if !exists {
		return fmt.Errorf("PDP context %s not found", id)
	}

	delete(m.contexts, id)

	m.teidControlPool.Release(id)
	m.teidUserPool.Release(id)

	return nil
}

func (m *PDPManager) GetPDP(id string) (*PDPContext, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pdp, exists := m.contexts[id]
	return pdp, exists
}

func (m *PDPManager) GetPDPByTEID(teid uint32) (*PDPContext, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if pdpID, exists := m.teidControlPool.GetPDP(teid); exists {
		pdp, found := m.contexts[pdpID]
		return pdp, found
	}

	if pdpID, exists := m.teidUserPool.GetPDP(teid); exists {
		pdp, found := m.contexts[pdpID]
		return pdp, found
	}

	return nil, false
}

func (m *PDPManager) GetAllPDPs() []*PDPContext {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pdps := make([]*PDPContext, 0, len(m.contexts))
	for _, pdp := range m.contexts {
		pdps = append(pdps, pdp)
	}
	return pdps
}

func (p *PDPContext) IncrementUplink(packetLen int) {
	p.Stats.UplinkPackets.Add(1)
	p.Stats.UplinkBytes.Add(uint64(packetLen))
}

func (p *PDPContext) IncrementDownlink(packetLen int) {
	p.Stats.DownlinkPackets.Add(1)
	p.Stats.DownlinkBytes.Add(uint64(packetLen))
}

type CreatePDPRequest struct {
	IMSI       string
	MSISDN     string
	NSAPI      uint8
	APN        string
	PDPType    uint8
	MSIP       net.IP
	GGSNIP     net.IP
	SGSNIP     net.IP
	QoSProfile gtpv1.QoSProfile
	QCI        uint8
}

type TEIDPoolStats struct {
	AllocatedCount int    `json:"allocatedCount"`
	FreeCount      int    `json:"freeCount"`
	PoolType       string `json:"poolType"`
}

type PDPContextDTO struct {
	ID              string                 `json:"id"`
	IMSI            string                 `json:"imsi"`
	MSISDN          string                 `json:"msisdn"`
	NSAPI           uint8                  `json:"nsapi"`
	APN             string                 `json:"apn"`
	MSIP            string                 `json:"msip"`
	GGSNIP          string                 `json:"ggsnip"`
	SGSNIP          string                 `json:"sgsnip"`
	TEIDControl     uint32                 `json:"teidControl"`
	TEIDUser        uint32                 `json:"teidUser"`
	CreatedAt       string                 `json:"createdAt"`
	Active          bool                   `json:"active"`
	UplinkPackets   uint64                 `json:"uplinkPackets"`
	DownlinkPackets uint64                 `json:"downlinkPackets"`
	UplinkBytes     uint64                 `json:"uplinkBytes"`
	DownlinkBytes   uint64                 `json:"downlinkBytes"`
	QoS             gtpv1.QoSParameters    `json:"qos"`
	QoSStats        gtpv1.QoSStatistics   `json:"qosStats"`
}

func (p *PDPContext) ToDTO() PDPContextDTO {
	return PDPContextDTO{
		ID:              p.ID,
		IMSI:            p.IMSI,
		MSISDN:          p.MSISDN,
		NSAPI:           p.NSAPI,
		APN:             p.APN,
		MSIP:            p.MSIP.String(),
		GGSNIP:          p.GGSNIP.String(),
		SGSNIP:          p.SGSNIP.String(),
		TEIDControl:     p.TEIDControl,
		TEIDUser:        p.TEIDUser,
		CreatedAt:       p.CreatedAt.Format(time.RFC3339),
		Active:          p.Active,
		UplinkPackets:   p.Stats.UplinkPackets.Load(),
		DownlinkPackets: p.Stats.DownlinkPackets.Load(),
		UplinkBytes:     p.Stats.UplinkBytes.Load(),
		DownlinkBytes:   p.Stats.DownlinkBytes.Load(),
		QoS:             p.QoSParams,
		QoSStats:        p.QoSStats,
	}
}

func (p *PDPContext) CheckUplinkQoS(packetLen int) bool {
	if p.QoSController == nil {
		return true
	}
	allowed := p.QoSController.CheckUplink(uint64(packetLen))
	p.QoSStats.IncrementUplink(uint64(packetLen), !allowed)
	return allowed
}

func (p *PDPContext) CheckDownlinkQoS(packetLen int) bool {
	if p.QoSController == nil {
		return true
	}
	allowed := p.QoSController.CheckDownlink(uint64(packetLen))
	p.QoSStats.IncrementDownlink(uint64(packetLen), !allowed)
	return allowed
}
