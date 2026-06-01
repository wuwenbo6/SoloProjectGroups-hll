package bgp

import (
	"fmt"
	"math/rand"
	"net"
	"sync"
	"time"

	"bgp-evpn-simulator/internal/models"
)

type EVPNController struct {
	mu                 sync.RWMutex
	routes             []*models.EVPNRoute
	routeChan          chan *models.EVPNRoute
	localVTEP          *models.VTEP
	macTable           *models.MACTable
	multicastGroupTable *models.MulticastGroupTable
	handlers           []func(*models.EVPNRoute)
	rdCounter          uint32
}

func NewEVPNController(vtep *models.VTEP, macTable *models.MACTable) *EVPNController {
	return &EVPNController{
		routes:             make([]*models.EVPNRoute, 0),
		routeChan:          make(chan *models.EVPNRoute, 100),
		localVTEP:          vtep,
		macTable:           macTable,
		multicastGroupTable: models.NewMulticastGroupTable(),
		rdCounter:          1,
	}
}

func (c *EVPNController) nextRD() string {
	rd := fmt.Sprintf("%s:%d", c.localVTEP.LoopbackIP.String(), c.rdCounter)
	c.rdCounter++
	return rd
}

func (c *EVPNController) GenerateType2Route(mac models.MACAddress, ip net.IP, l2VNI, l3VNI uint32) (*models.EVPNRoute, error) {
	rd := c.nextRD()
	esi := "00:00:00:00:00:00:00:00:00:00"

	return c.generateType2RouteWithRD(rd, mac, ip, l2VNI, l3VNI, esi)
}

func (c *EVPNController) generateType2RouteWithRD(rd string, mac models.MACAddress, ip net.IP, l2VNI, l3VNI uint32, esi string) (*models.EVPNRoute, error) {
	route := &models.EVPNRoute{
		RouteType:  models.EVPNRouteType2,
		RD:         rd,
		ESI:        esi,
		EthTag:     0,
		MACAddress: mac,
		IPAddress:  ip,
		L2VNI:      l2VNI,
		L3VNI:      l3VNI,
		NextHop:    c.localVTEP.LoopbackIP,
		OriginVTEP: c.localVTEP.ID,
		Timestamp:  time.Now(),
	}

	c.mu.Lock()
	c.routes = append(c.routes, route)
	c.mu.Unlock()

	select {
	case c.routeChan <- route:
	default:
	}

	c.notifyHandlers(route)

	return route, nil
}

func (c *EVPNController) ProcessType2Route(route *models.EVPNRoute) error {
	if route.RouteType != models.EVPNRouteType2 {
		return fmt.Errorf("invalid route type: expected 2, got %d", route.RouteType)
	}

	c.mu.Lock()
	c.routes = append(c.routes, route)
	c.mu.Unlock()

	entry := &models.MACEntry{
		RD:      route.RD,
		MAC:     route.MACAddress,
		IP:      route.IPAddress,
		L2VNI:   route.L2VNI,
		L3VNI:   route.L3VNI,
		Local:   false,
		NextHop: route.NextHop,
		VTEPID:  route.OriginVTEP,
		Age:     time.Now(),
	}

	c.macTable.Add(entry)

	c.notifyHandlers(route)

	return nil
}

func (c *EVPNController) AdvertiseLocalMAC(mac models.MACAddress, ip net.IP, l2VNI, l3VNI uint32) (*models.EVPNRoute, error) {
	rd := c.nextRD()

	entry := &models.MACEntry{
		RD:      rd,
		MAC:     mac,
		IP:      ip,
		L2VNI:   l2VNI,
		L3VNI:   l3VNI,
		Local:   true,
		NextHop: c.localVTEP.LoopbackIP,
		VTEPID:  c.localVTEP.ID,
		Age:     time.Now(),
	}

	c.macTable.Add(entry)

	return c.generateType2RouteWithRD(rd, mac, ip, l2VNI, l3VNI, "00:00:00:00:00:00:00:00:00:00")
}

func (c *EVPNController) GetRoutes() []*models.EVPNRoute {
	c.mu.RLock()
	defer c.mu.RUnlock()
	routes := make([]*models.EVPNRoute, len(c.routes))
	copy(routes, c.routes)
	return routes
}

func (c *EVPNController) GetType2Routes() []*models.EVPNRoute {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var type2Routes []*models.EVPNRoute
	for _, r := range c.routes {
		if r.RouteType == models.EVPNRouteType2 {
			type2Routes = append(type2Routes, r)
		}
	}
	return type2Routes
}

func (c *EVPNController) GenerateType3Route(l2VNI uint32, multicastGroup *models.MulticastGroup, tunnelType models.PMSITunnelType, tunnelID net.IP) (*models.EVPNRoute, error) {
	rd := c.nextRD()

	pmsiTunnel := &models.PMSITunnelAttribute{
		TunnelType:    tunnelType,
		Label:         l2VNI,
		TunnelID:      tunnelID,
		IsLeafInfoReq: tunnelType == models.PMSITunnelTypeIngressReplication,
	}

	route := &models.EVPNRoute{
		RouteType:      models.EVPNRouteType3,
		RD:             rd,
		EthTag:         0,
		L2VNI:          l2VNI,
		NextHop:        c.localVTEP.LoopbackIP,
		OriginVTEP:     c.localVTEP.ID,
		Timestamp:      time.Now(),
		PMSITunnel:     pmsiTunnel,
		MulticastGroup: multicastGroup,
	}

	c.mu.Lock()
	c.routes = append(c.routes, route)
	c.mu.Unlock()

	if multicastGroup != nil {
		c.multicastGroupTable.Add(l2VNI, multicastGroup)
	}

	select {
	case c.routeChan <- route:
	default:
	}

	c.notifyHandlers(route)

	return route, nil
}

func (c *EVPNController) ProcessType3Route(route *models.EVPNRoute) error {
	if route.RouteType != models.EVPNRouteType3 {
		return fmt.Errorf("invalid route type: expected 3, got %d", route.RouteType)
	}

	c.mu.Lock()
	c.routes = append(c.routes, route)
	c.mu.Unlock()

	if route.MulticastGroup != nil {
		c.multicastGroupTable.Add(route.L2VNI, route.MulticastGroup)
	}

	c.notifyHandlers(route)

	return nil
}

func (c *EVPNController) AdvertiseMulticastGroup(l2VNI uint32, groupIP, sourceIP net.IP, tunnelType models.PMSITunnelType) (*models.EVPNRoute, error) {
	multicastGroup := &models.MulticastGroup{
		GroupIP:  groupIP,
		SourceIP: sourceIP,
		L2VNI:    l2VNI,
	}

	return c.GenerateType3Route(l2VNI, multicastGroup, tunnelType, c.localVTEP.LoopbackIP)
}

func (c *EVPNController) GetType3Routes() []*models.EVPNRoute {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var type3Routes []*models.EVPNRoute
	for _, r := range c.routes {
		if r.RouteType == models.EVPNRouteType3 {
			type3Routes = append(type3Routes, r)
		}
	}
	return type3Routes
}

func (c *EVPNController) GetRoutesByType(routeType models.EVPNRouteType) []*models.EVPNRoute {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var result []*models.EVPNRoute
	for _, r := range c.routes {
		if r.RouteType == routeType {
			result = append(result, r)
		}
	}
	return result
}

func (c *EVPNController) GetMulticastGroups() map[uint32][]*models.MulticastGroup {
	return c.multicastGroupTable.List()
}

func (c *EVPNController) ExportRoutes(routeType *models.EVPNRouteType) []*models.EVPNRoute {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if routeType == nil {
		routes := make([]*models.EVPNRoute, len(c.routes))
		copy(routes, c.routes)
		return routes
	}

	var result []*models.EVPNRoute
	for _, r := range c.routes {
		if r.RouteType == *routeType {
			result = append(result, r)
		}
	}
	return result
}

func (c *EVPNController) RouteChannel() <-chan *models.EVPNRoute {
	return c.routeChan
}

func (c *EVPNController) RegisterHandler(handler func(*models.EVPNRoute)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers = append(c.handlers, handler)
}

func (c *EVPNController) notifyHandlers(route *models.EVPNRoute) {
	c.mu.RLock()
	handlers := make([]func(*models.EVPNRoute), len(c.handlers))
	copy(handlers, c.handlers)
	c.mu.RUnlock()

	for _, h := range handlers {
		go h(route)
	}
}

func (c *EVPNController) WithdrawRoute(rd string, vni uint32) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var remaining []*models.EVPNRoute
	for _, r := range c.routes {
		if !(r.RD == rd && r.L2VNI == vni) {
			remaining = append(remaining, r)
		}
	}
	c.routes = remaining

	c.macTable.Remove(rd, vni)
}

func GenerateRandomMAC() models.MACAddress {
	mac := models.MACAddress{
		0x00, 0x11, 0x22,
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
	}
	return mac
}

func GenerateRandomIP() net.IP {
	return net.IPv4(
		10,
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
	)
}

func GenerateRandomMulticastIP() net.IP {
	return net.IPv4(
		239,
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
		byte(rand.Intn(256)),
	)
}

func PMSITunnelTypeName(tunnelType models.PMSITunnelType) string {
	switch tunnelType {
	case models.PMSITunnelTypeIngressReplication:
		return "Ingress Replication"
	case models.PMSITunnelTypePIMSM:
		return "PIM-SM"
	case models.PMSITunnelTypePIMSSM:
		return "PIM-SSM"
	default:
		return fmt.Sprintf("Unknown (%d)", tunnelType)
	}
}
