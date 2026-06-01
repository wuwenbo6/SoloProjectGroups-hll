package pcep

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"pcep-server/pkg/cspf"
	"pcep-server/pkg/topology"
)

type Server struct {
	addr      string
	topo      *topology.Topology
	cspf      *cspf.CSPF
	lspMgr    *LSPManager
	listener  net.Listener
	clients   map[string]*PCEPClient
	clientsMu sync.RWMutex
	stopChan  chan struct{}
}

type PCEPClient struct {
	conn        net.Conn
	server      *Server
	sessionID   uint8
	keepalive   time.Duration
	deadTimer   time.Duration
	lastActive  time.Time
	closeOnce   sync.Once
}

type PathComputationResult struct {
	RequestID uint32
	Success   bool
	Path      *cspf.PathResult
	Message   string
}

func NewServer(addr string, topo *topology.Topology) *Server {
	lspMgr := NewLSPManager("logs/compute.log")

	return &Server{
		addr:     addr,
		topo:     topo,
		cspf:     cspf.NewCSPF(topo),
		lspMgr:   lspMgr,
		clients:  make(map[string]*PCEPClient),
		stopChan: make(chan struct{}),
	}
}

func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	s.listener = listener

	log.Printf("PCEP Server listening on %s", s.addr)

	go s.acceptConnections()
	go s.keepaliveCheck()

	return nil
}

func (s *Server) Stop() {
	close(s.stopChan)
	if s.listener != nil {
		s.listener.Close()
	}

	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	for _, client := range s.clients {
		client.Close()
	}

	s.lspMgr.Close()
}

func (s *Server) acceptConnections() {
	for {
		select {
		case <-s.stopChan:
			return
		default:
			conn, err := s.listener.Accept()
			if err != nil {
				select {
				case <-s.stopChan:
					return
				default:
					log.Printf("Accept error: %v", err)
					continue
				}
			}

			client := &PCEPClient{
				conn:       conn,
				server:     s,
				keepalive:  30 * time.Second,
				deadTimer:  120 * time.Second,
				lastActive: time.Now(),
			}

			s.clientsMu.Lock()
			s.clients[conn.RemoteAddr().String()] = client
			s.clientsMu.Unlock()

			log.Printf("New PCEP client connected: %s", conn.RemoteAddr())

			go client.handleConnection()
		}
	}
}

func (s *Server) keepaliveCheck() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.clientsMu.RLock()
			for _, client := range s.clients {
				if time.Since(client.lastActive) > client.deadTimer {
					log.Printf("Client %s timed out", client.conn.RemoteAddr())
					client.Close()
				}
			}
			s.clientsMu.RUnlock()
		}
	}
}

func (c *PCEPClient) handleConnection() {
	defer c.Close()

	buf := make([]byte, 4096)
	for {
		c.conn.SetReadDeadline(time.Now().Add(c.deadTimer))
		n, err := c.conn.Read(buf)
		if err != nil {
			log.Printf("Read error from %s: %v", c.conn.RemoteAddr(), err)
			return
		}

		c.lastActive = time.Now()

		if n < 4 {
			continue
		}

		hdr, err := ParseCommonHeader(buf[:n])
		if err != nil {
			log.Printf("Parse header error: %v", err)
			continue
		}

		switch hdr.MessageType {
		case MSG_OPEN:
			c.handleOpen(buf[:n])
		case MSG_KEEPALIVE:
			c.handleKeepalive()
		case MSG_PCREQ:
			c.handlePCReq(buf[:n])
		case MSG_CLOSE:
			log.Printf("Received close from %s", c.conn.RemoteAddr())
			return
		default:
			log.Printf("Unknown message type: %d", hdr.MessageType)
		}
	}
}

func (c *PCEPClient) handleOpen(data []byte) {
	openMsg, err := ParseOpenMessage(data)
	if err != nil {
		log.Printf("Parse open error: %v", err)
		c.sendClose(1)
		return
	}

	if openMsg.Version != PCEP_VERSION {
		log.Printf("Unsupported PCEP version: %d", openMsg.Version)
		c.sendClose(2)
		return
	}

	c.sessionID = openMsg.SID
	if openMsg.Keepalive > 0 {
		c.keepalive = time.Duration(openMsg.Keepalive) * time.Second
	}
	if openMsg.DeadTimer > 0 {
		c.deadTimer = time.Duration(openMsg.DeadTimer) * time.Second
	}

	openResp := BuildOpenMessage(uint8(c.keepalive.Seconds()), uint8(c.deadTimer.Seconds()))
	c.conn.Write(openResp)

	keepalive := BuildKeepaliveMessage()
	c.conn.Write(keepalive)

	log.Printf("PCEP session established with %s", c.conn.RemoteAddr())
}

func (c *PCEPClient) handleKeepalive() {
	log.Printf("Received keepalive from %s", c.conn.RemoteAddr())
}

func (c *PCEPClient) handlePCReq(data []byte) {
	reqMsg, err := ParsePCReqMessage(data)
	if err != nil {
		log.Printf("Parse PCReq error: %v", err)
		return
	}

	log.Printf("Received PCReq with %d requests", len(reqMsg.Requests))

	for _, req := range reqMsg.Requests {
		result := c.computePath(req)

		if req.RP.Reoptimization {
			c.handleReoptimization(req, result)
		}

		resp := Response{
			RequestID: req.RP.RequestID,
			RP:        req.RP,
			NoPath:    !result.Success,
		}

		if result.Success && result.Path != nil {
			ero := &EROObject{}
			for _, nodeID := range result.Path.Nodes {
				node := c.server.topo.GetNode(nodeID)
				if node != nil {
					ip := net.ParseIP(node.IP)
					if ip != nil {
						ipv4 := ip.To4()
						if ipv4 != nil {
							subobj := EROSubobject{
								Loose:  false,
								Type:   1,
								Prefix: 32,
							}
							copy(subobj.IP[:], ipv4)
							ero.Subobjects = append(ero.Subobjects, subobj)
						}
					}
				}
			}
			resp.ERO = ero

			if req.Bandwidth != nil {
				resp.Bandwidth = req.Bandwidth
			}

			resp.Metric = &MetricObject{
				Type:  1,
				Value: float32(result.Path.Metric),
			}
		}

		repMsg := BuildPCRepMessage(resp)
		c.conn.Write(repMsg)
	}

	keepalive := BuildKeepaliveMessage()
	c.conn.Write(keepalive)
}

func (c *PCEPClient) handleReoptimization(req Request, result PathComputationResult) {
	if !result.Success {
		return
	}

	lspMgr := c.server.lspMgr
	allLSPs := lspMgr.GetAllLSPs()

	for _, lsp := range allLSPs {
		if lsp.Source == result.Path.Nodes[0] && lsp.Target == result.Path.Nodes[len(result.Path.Nodes)-1] {
			if result.Path.Cost < lsp.Cost {
				c.server.topo.ReleaseBandwidth(lsp.Links, lsp.Bandwidth)

				newPath := result.Path
				success := c.server.topo.ReserveBandwidth(newPath.Links, lsp.Bandwidth)
				if !success {
					c.server.topo.ReserveBandwidth(lsp.Links, lsp.Bandwidth)
					continue
				}

				lspMgr.UpdateLSPPATH(lsp.ID, newPath, "reoptimization")
				log.Printf("Reoptimized LSP %s: cost %.2f -> %.2f", lsp.ID, lsp.Cost, newPath.Cost)
			}
			break
		}
	}
}

func (c *PCEPClient) computePath(req Request) PathComputationResult {
	if req.Endpoints == nil {
		return PathComputationResult{
			RequestID: req.RP.RequestID,
			Success:   false,
			Message:   "no endpoints specified",
		}
	}

	sourceIP := net.IP(req.Endpoints.SourceIP[:]).String()
	destIP := net.IP(req.Endpoints.DestIP[:]).String()

	sourceNode := c.findNodeByIP(sourceIP)
	destNode := c.findNodeByIP(destIP)

	if sourceNode == "" || destNode == "" {
		return PathComputationResult{
			RequestID: req.RP.RequestID,
			Success:   false,
			Message:   fmt.Sprintf("node not found: source=%s, dest=%s", sourceIP, destIP),
		}
	}

	constraints := cspf.Constraints{
		Bandwidth: 0,
		Metric:    0,
		Exclude:   []string{},
		Affinity:  cspf.Affinity{},
		Weights:   cspf.DefaultWeightConfig(),
	}

	if req.Bandwidth != nil {
		constraints.Bandwidth = float64(req.Bandwidth.Bandwidth)
	}

	if req.LSPA != nil {
		constraints.Affinity = cspf.Affinity{
			IncludeAny: req.LSPA.IncludeAny,
			IncludeAll: req.LSPA.IncludeAll,
			Exclude:    req.LSPA.Exclude,
		}
	}

	for _, m := range req.Metrics {
		switch m.Type {
		case 1:
			constraints.Weights.MetricWeight = 1.0
			if m.Bound && m.Value > 0 {
				constraints.Metric = int(m.Value)
			}
		case 12:
			constraints.Weights.LatencyWeight = 1.0
		}
	}

	start := time.Now()
	path, err := c.server.cspf.ComputePath(sourceNode, destNode, constraints)
	duration := time.Since(start)

	if err != nil {
		c.server.lspMgr.LogCompute(sourceNode, destNode, constraints.Bandwidth, constraints.Affinity, constraints.Weights, false, nil, err.Error(), duration)
		return PathComputationResult{
			RequestID: req.RP.RequestID,
			Success:   false,
			Message:   err.Error(),
		}
	}

	c.server.lspMgr.LogCompute(sourceNode, destNode, constraints.Bandwidth, constraints.Affinity, constraints.Weights, true, path, "", duration)

	return PathComputationResult{
		RequestID: req.RP.RequestID,
		Success:   true,
		Path:      path,
	}
}

func (c *PCEPClient) findNodeByIP(ip string) string {
	nodes := c.server.topo.GetNodes()
	for id, node := range nodes {
		if node.IP == ip {
			return id
		}
	}
	return ""
}

func (c *PCEPClient) sendClose(reason uint8) {
	closeMsg := BuildCloseMessage(reason)
	c.conn.Write(closeMsg)
}

func (c *PCEPClient) Close() {
	c.closeOnce.Do(func() {
		c.conn.Close()
		c.server.clientsMu.Lock()
		delete(c.server.clients, c.conn.RemoteAddr().String())
		c.server.clientsMu.Unlock()
		log.Printf("Client %s disconnected", c.conn.RemoteAddr())
	})
}

func (s *Server) GetTopology() *topology.Topology {
	return s.topo
}

func (s *Server) GetLSPManager() *LSPManager {
	return s.lspMgr
}

func (s *Server) ComputePathREST(source, target string, bandwidth float64, affinity cspf.Affinity, weights cspf.WeightConfig) (*PathResponse, error) {
	constraints := cspf.Constraints{
		Bandwidth: bandwidth,
		Metric:    0,
		Exclude:   []string{},
		Affinity:  affinity,
		Weights:   weights,
	}

	start := time.Now()
	path, err := s.cspf.ComputePath(source, target, constraints)
	duration := time.Since(start)

	if err != nil {
		s.lspMgr.LogCompute(source, target, bandwidth, affinity, weights, false, nil, err.Error(), duration)
		return &PathResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	s.lspMgr.LogCompute(source, target, bandwidth, affinity, weights, true, path, "", duration)

	return &PathResponse{
		Success:      true,
		Nodes:        path.Nodes,
		Links:        path.Links,
		Metric:       path.Metric,
		Cost:         path.Cost,
		TotalLatency: path.TotalLatency,
		MinBandwidth: path.MinBandwidth,
	}, nil
}

func (s *Server) CreateLSPREST(name, source, target string, bandwidth float64, affinity cspf.Affinity, weights cspf.WeightConfig) (*LSP, error) {
	constraints := cspf.Constraints{
		Bandwidth: bandwidth,
		Metric:    0,
		Exclude:   []string{},
		Affinity:  affinity,
		Weights:   weights,
	}

	path, err := s.cspf.ComputePath(source, target, constraints)
	if err != nil {
		s.lspMgr.LogCompute(source, target, bandwidth, affinity, weights, false, nil, err.Error(), 0)
		return nil, fmt.Errorf("path computation failed: %w", err)
	}

	s.lspMgr.LogCompute(source, target, bandwidth, affinity, weights, true, path, "", 0)

	success := s.topo.ReserveBandwidth(path.Links, bandwidth)
	if !success {
		return nil, fmt.Errorf("failed to reserve bandwidth on computed path")
	}

	s.lspMgr.LogReserve(path.Links, bandwidth, true)

	lsp := s.lspMgr.CreateLSP(name, source, target, bandwidth, affinity, weights, path)
	return lsp, nil
}

func (s *Server) DeleteLSPREST(id string) error {
	lsp := s.lspMgr.GetLSP(id)
	if lsp == nil {
		return fmt.Errorf("LSP %s not found", id)
	}

	s.topo.ReleaseBandwidth(lsp.Links, lsp.Bandwidth)
	s.lspMgr.LogReserve(lsp.Links, lsp.Bandwidth, true)

	s.lspMgr.DeleteLSP(id)
	return nil
}

type ReoptimizeResult struct {
	TotalLSPs     int               `json:"total_lsps"`
	Reoptimized   int               `json:"reoptimized"`
	Unchanged     int               `json:"unchanged"`
	Failed        int               `json:"failed"`
	Details       []ReoptimizeDetail `json:"details"`
}

type ReoptimizeDetail struct {
	LSPID       string  `json:"lsp_id"`
	LSPName     string  `json:"lsp_name"`
	OldMetric   int     `json:"old_metric"`
	NewMetric   int     `json:"new_metric,omitempty"`
	OldCost     float64 `json:"old_cost"`
	NewCost     float64 `json:"new_cost,omitempty"`
	OldNodes    []string `json:"old_nodes"`
	NewNodes    []string `json:"new_nodes,omitempty"`
	Optimized   bool    `json:"optimized"`
	Reason      string  `json:"reason,omitempty"`
}

func (s *Server) ReoptimizeAll() (*ReoptimizeResult, error) {
	allLSPs := s.lspMgr.GetAllLSPs()

	result := &ReoptimizeResult{
		TotalLSPs: len(allLSPs),
		Details:   make([]ReoptimizeDetail, 0, len(allLSPs)),
	}

	sortedLSPs := make([]*LSP, len(allLSPs))
	copy(sortedLSPs, allLSPs)

	for i := 0; i < len(sortedLSPs); i++ {
		for j := i + 1; j < len(sortedLSPs); j++ {
			if sortedLSPs[j].Cost < sortedLSPs[i].Cost {
				sortedLSPs[i], sortedLSPs[j] = sortedLSPs[j], sortedLSPs[i]
			}
		}
	}

	for _, lsp := range sortedLSPs {
		s.topo.ReleaseBandwidth(lsp.Links, lsp.Bandwidth)
		s.lspMgr.LogReserve(lsp.Links, lsp.Bandwidth, true)
	}

	for _, lsp := range sortedLSPs {
		detail := ReoptimizeDetail{
			LSPID:     lsp.ID,
			LSPName:   lsp.Name,
			OldMetric: lsp.Metric,
			OldCost:   lsp.Cost,
			OldNodes:  lsp.Nodes,
		}

		constraints := cspf.Constraints{
			Bandwidth: lsp.Bandwidth,
			Affinity:  lsp.Affinity,
			Weights:   lsp.Weights,
			Exclude:   []string{},
		}

		start := time.Now()
		newPath, err := s.cspf.ComputePath(lsp.Source, lsp.Target, constraints)
		duration := time.Since(start)

		if err != nil {
			s.topo.ReserveBandwidth(lsp.Links, lsp.Bandwidth)
			s.lspMgr.LogCompute(lsp.Source, lsp.Target, lsp.Bandwidth, lsp.Affinity, lsp.Weights, false, nil, err.Error(), duration)
			detail.Optimized = false
			detail.Reason = "reoptimization failed, keeping old path"
			result.Failed++
			result.Details = append(result.Details, detail)
			continue
		}

		s.lspMgr.LogCompute(lsp.Source, lsp.Target, lsp.Bandwidth, lsp.Affinity, lsp.Weights, true, newPath, "", duration)

		success := s.topo.ReserveBandwidth(newPath.Links, lsp.Bandwidth)
		if !success {
			s.topo.ReserveBandwidth(lsp.Links, lsp.Bandwidth)
			detail.Optimized = false
			detail.Reason = "bandwidth reservation failed on new path, keeping old path"
			result.Failed++
			result.Details = append(result.Details, detail)
			continue
		}

		s.lspMgr.LogReserve(newPath.Links, lsp.Bandwidth, true)

		detail.NewMetric = newPath.Metric
		detail.NewCost = newPath.Cost
		detail.NewNodes = newPath.Nodes

		if newPath.Cost < lsp.Cost {
			s.lspMgr.UpdateLSPPATH(lsp.ID, newPath, "global_reoptimization")
			detail.Optimized = true
			detail.Reason = fmt.Sprintf("cost improved: %.2f -> %.2f", lsp.Cost, newPath.Cost)
			result.Reoptimized++
		} else {
			s.topo.ReleaseBandwidth(newPath.Links, lsp.Bandwidth)
			s.topo.ReserveBandwidth(lsp.Links, lsp.Bandwidth)
			detail.Optimized = false
			detail.Reason = "no better path found, keeping current path"
			result.Unchanged++
		}

		result.Details = append(result.Details, detail)
	}

	s.lspMgr.addLog(ComputeLog{
		Type:    LogTypeReoptimize,
		Success: true,
		Message: fmt.Sprintf("Global reoptimization: %d reoptimized, %d unchanged, %d failed", result.Reoptimized, result.Unchanged, result.Failed),
	})

	return result, nil
}
