package vxlan

import (
	"fmt"
	"net"
	"sync"
	"time"

	"bgp-evpn-simulator/internal/bgp"
	"bgp-evpn-simulator/internal/models"
)

type VTEPController struct {
	mu        sync.RWMutex
	vteps     map[string]*models.VTEP
	tunnels   map[string]*models.VXLANTunnel
	evpnCtrls map[string]*bgp.EVPNController
	macTables map[string]*models.MACTable
	peerConns map[string]chan *models.EVPNRoute
}

func NewVTEPController() *VTEPController {
	return &VTEPController{
		vteps:     make(map[string]*models.VTEP),
		tunnels:   make(map[string]*models.VXLANTunnel),
		evpnCtrls: make(map[string]*bgp.EVPNController),
		macTables: make(map[string]*models.MACTable),
		peerConns: make(map[string]chan *models.EVPNRoute),
	}
}

func (vc *VTEPController) CreateVTEP(id, name string, ip, loopbackIP net.IP, l2VNI, l3VNI uint32) (*models.VTEP, error) {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if _, exists := vc.vteps[id]; exists {
		return nil, fmt.Errorf("VTEP %s already exists", id)
	}

	mac := bgp.GenerateRandomMAC()

	vtep := &models.VTEP{
		ID:         id,
		Name:       name,
		IP:         ip,
		L2VNI:      l2VNI,
		L3VNI:      l3VNI,
		LoopbackIP: loopbackIP,
		MAC:        mac,
		Status:     "up",
		Connected:  true,
	}

	macTable := models.NewMACTable()
	evpnCtrl := bgp.NewEVPNController(vtep, macTable)

	vc.vteps[id] = vtep
	vc.macTables[id] = macTable
	vc.evpnCtrls[id] = evpnCtrl
	vc.peerConns[id] = make(chan *models.EVPNRoute, 100)

	go vc.routeListener(id)

	return vtep, nil
}

func (vc *VTEPController) routeListener(vtepID string) {
	vc.mu.RLock()
	ctrl := vc.evpnCtrls[vtepID]
	vc.mu.RUnlock()

	if ctrl == nil {
		return
	}

	for route := range ctrl.RouteChannel() {
		vc.mu.RLock()
		for id, conn := range vc.peerConns {
			if id != vtepID {
				select {
				case conn <- route:
				default:
				}
			}
		}
		vc.mu.RUnlock()
	}
}

func (vc *VTEPController) EstablishVXLANTunnel(sourceVTEPID, destVTEPID string, vni uint32) (*models.VXLANTunnel, error) {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	sourceVTEP, sourceExists := vc.vteps[sourceVTEPID]
	destVTEP, destExists := vc.vteps[destVTEPID]

	if !sourceExists || !destExists {
		return nil, fmt.Errorf("source or destination VTEP not found")
	}

	tunnelID := fmt.Sprintf("%s-%s-%d", sourceVTEPID, destVTEPID, vni)

	if _, exists := vc.tunnels[tunnelID]; exists {
		return vc.tunnels[tunnelID], nil
	}

	tunnel := &models.VXLANTunnel{
		ID:         tunnelID,
		VNI:        vni,
		SourceVTEP: sourceVTEPID,
		DestVTEP:   destVTEPID,
		Status:     "established",
	}

	vc.tunnels[tunnelID] = tunnel

	sourceVTEP.Connected = true
	destVTEP.Connected = true

	sourceCtrl := vc.evpnCtrls[sourceVTEPID]
	destCtrl := vc.evpnCtrls[destVTEPID]

	if sourceCtrl != nil && destCtrl != nil {
		for _, route := range sourceCtrl.GetType2Routes() {
			destCtrl.ProcessType2Route(route)
		}
		for _, route := range destCtrl.GetType2Routes() {
			sourceCtrl.ProcessType2Route(route)
		}
		for _, route := range sourceCtrl.GetType3Routes() {
			destCtrl.ProcessType3Route(route)
		}
		for _, route := range destCtrl.GetType3Routes() {
			sourceCtrl.ProcessType3Route(route)
		}
	}

	go vc.startPeerExchange(sourceVTEPID, destVTEPID)
	go vc.startPeerExchange(destVTEPID, sourceVTEPID)

	return tunnel, nil
}

func (vc *VTEPController) startPeerExchange(fromVTEPID, toVTEPID string) {
	vc.mu.RLock()
	fromChan := vc.peerConns[fromVTEPID]
	toCtrl := vc.evpnCtrls[toVTEPID]
	vc.mu.RUnlock()

	if fromChan == nil || toCtrl == nil {
		return
	}

	for route := range fromChan {
		if route.OriginVTEP != toVTEPID {
			switch route.RouteType {
			case models.EVPNRouteType2:
				toCtrl.ProcessType2Route(route)
			case models.EVPNRouteType3:
				toCtrl.ProcessType3Route(route)
			}
		}
	}
}

func (vc *VTEPController) AdvertiseMAC(vtepID string, mac models.MACAddress, ip net.IP, l2VNI, l3VNI uint32) (*models.EVPNRoute, error) {
	vc.mu.RLock()
	ctrl, exists := vc.evpnCtrls[vtepID]
	vc.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("VTEP %s not found", vtepID)
	}

	return ctrl.AdvertiseLocalMAC(mac, ip, l2VNI, l3VNI)
}

func (vc *VTEPController) AdvertiseRandomMAC(vtepID string, l2VNI, l3VNI uint32) (*models.EVPNRoute, error) {
	mac := bgp.GenerateRandomMAC()
	ip := bgp.GenerateRandomIP()
	return vc.AdvertiseMAC(vtepID, mac, ip, l2VNI, l3VNI)
}

func (vc *VTEPController) AdvertiseMulticastGroup(vtepID string, l2VNI uint32, groupIP, sourceIP net.IP, tunnelType models.PMSITunnelType) (*models.EVPNRoute, error) {
	vc.mu.RLock()
	ctrl, exists := vc.evpnCtrls[vtepID]
	vc.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("VTEP %s not found", vtepID)
	}

	return ctrl.AdvertiseMulticastGroup(l2VNI, groupIP, sourceIP, tunnelType)
}

func (vc *VTEPController) AdvertiseRandomMulticastGroup(vtepID string, l2VNI uint32) (*models.EVPNRoute, error) {
	groupIP := bgp.GenerateRandomMulticastIP()
	sourceIP := bgp.GenerateRandomIP()
	return vc.AdvertiseMulticastGroup(vtepID, l2VNI, groupIP, sourceIP, models.PMSITunnelTypeIngressReplication)
}

func (vc *VTEPController) GetType3Routes(vtepID string) ([]*models.EVPNRoute, error) {
	vc.mu.RLock()
	ctrl, exists := vc.evpnCtrls[vtepID]
	vc.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("VTEP %s not found", vtepID)
	}

	return ctrl.GetType3Routes(), nil
}

func (vc *VTEPController) ExportRoutes(vtepID string, routeType *models.EVPNRouteType) ([]*models.EVPNRoute, error) {
	vc.mu.RLock()
	ctrl, exists := vc.evpnCtrls[vtepID]
	vc.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("VTEP %s not found", vtepID)
	}

	return ctrl.ExportRoutes(routeType), nil
}

func (vc *VTEPController) GetVTEP(id string) (*models.VTEP, bool) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	vtep, exists := vc.vteps[id]
	return vtep, exists
}

func (vc *VTEPController) ListVTEPs() []*models.VTEP {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	vteps := make([]*models.VTEP, 0, len(vc.vteps))
	for _, vtep := range vc.vteps {
		vteps = append(vteps, vtep)
	}
	return vteps
}

func (vc *VTEPController) GetMACTable(vtepID string) (*models.MACTable, bool) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	table, exists := vc.macTables[vtepID]
	return table, exists
}

func (vc *VTEPController) GetEVPNController(vtepID string) (*bgp.EVPNController, bool) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	ctrl, exists := vc.evpnCtrls[vtepID]
	return ctrl, exists
}

func (vc *VTEPController) ListTunnels() []*models.VXLANTunnel {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	tunnels := make([]*models.VXLANTunnel, 0, len(vc.tunnels))
	for _, tunnel := range vc.tunnels {
		tunnels = append(tunnels, tunnel)
	}
	return tunnels
}

func (vc *VTEPController) GetTunnel(id string) (*models.VXLANTunnel, bool) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	tunnel, exists := vc.tunnels[id]
	return tunnel, exists
}

func (vc *VTEPController) StartSimulation(vtepID string, l2VNI, l3VNI uint32, interval time.Duration, stopChan <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			vc.AdvertiseRandomMAC(vtepID, l2VNI, l3VNI)
		case <-stopChan:
			return
		}
	}
}
