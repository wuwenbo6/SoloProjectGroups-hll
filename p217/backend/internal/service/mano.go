package service

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"nfv-mano/internal/models"
	"nfv-mano/internal/repository"

	"github.com/google/uuid"
)

type ManoService struct {
	repo *repository.Repository
}

func NewManoService(repo *repository.Repository) *ManoService {
	s := &ManoService{repo: repo}
	go s.startMonitoring()
	return s
}

func (s *ManoService) GetAllVnfds() []*models.Vnfd {
	return s.repo.GetAllVnfds()
}

func (s *ManoService) GetVnfd(id string) *models.Vnfd {
	return s.repo.GetVnfd(id)
}

func (s *ManoService) CreateVnfd(vnfd *models.Vnfd) {
	s.repo.CreateVnfd(vnfd)
	s.addEvent("info", fmt.Sprintf("VNFD %s created (type: %s)", vnfd.Name, vnfd.Type), "")
}

func (s *ManoService) DeleteVnfd(id string) bool {
	return s.repo.DeleteVnfd(id)
}

func (s *ManoService) GetAllVnfs() []*models.VnfInstance {
	return s.repo.GetAllVnfs()
}

func (s *ManoService) GetVnf(id string) *models.VnfInstance {
	return s.repo.GetVnf(id)
}

func (s *ManoService) GetAllLinks() []*models.VirtualLink {
	return s.repo.GetAllLinks()
}

func (s *ManoService) GetEvents() []*models.Event {
	return s.repo.GetEvents(50)
}

func (s *ManoService) GetStats() *models.Stats {
	vnfs := s.repo.GetAllVnfs()
	stats := &models.Stats{}
	for _, v := range vnfs {
		stats.TotalVnfs++
		stats.TotalCpu += v.Cpu
		stats.TotalMemory += v.Memory
		stats.TotalBandwidth += v.Bandwidth
		switch v.Status {
		case "running":
			stats.RunningVnfs++
		case "stopped":
			stats.StoppedVnfs++
		case "error":
			stats.ErrorVnfs++
		}
	}
	return stats
}

func (s *ManoService) TopologySort(requests []models.InstantiateRequest) ([]string, error) {
	nameToReq := make(map[string]*models.InstantiateRequest)
	for i := range requests {
		nameToReq[requests[i].Name] = &requests[i]
	}

	inDegree := make(map[string]int)
	adjList := make(map[string][]string)

	for _, req := range requests {
		inDegree[req.Name] = len(req.DependsOn)
		for _, dep := range req.DependsOn {
			adjList[dep] = append(adjList[dep], req.Name)
		}
	}

	queue := make([]string, 0)
	for name, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, name)
		}
	}

	result := make([]string, 0)
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		result = append(result, curr)

		for _, neighbor := range adjList[curr] {
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	if len(result) != len(requests) {
		return nil, fmt.Errorf("circular dependency detected in VNF graph")
	}

	return result, nil
}

func (s *ManoService) BatchInstantiateVnfs(batchReq *models.BatchInstantiateRequest) ([]*models.VnfInstance, error) {
	sortedNames, err := s.TopologySort(batchReq.Vnfs)
	if err != nil {
		return nil, err
	}

	s.addEvent("info", fmt.Sprintf("Topology sort completed: %d VNFs will be instantiated in order", len(sortedNames)), "")

	nameToReq := make(map[string]*models.InstantiateRequest)
	for i := range batchReq.Vnfs {
		nameToReq[batchReq.Vnfs[i].Name] = &batchReq.Vnfs[i]
	}

	createdVnfs := make([]*models.VnfInstance, 0, len(sortedNames))
	vnfIDMap := make(map[string]string)

	for _, name := range sortedNames {
		req := nameToReq[name]

		vnfd := s.repo.GetVnfd(req.VnfdID)
		if vnfd == nil {
			return nil, fmt.Errorf("VNFD %s not found", req.VnfdID)
		}

		cpu := req.Cpu
		if cpu == 0 {
			cpu = vnfd.DefaultCpu
		}
		memory := req.Memory
		if memory == 0 {
			memory = vnfd.DefaultMemory
		}
		bandwidth := req.Bandwidth
		if bandwidth == 0 {
			bandwidth = vnfd.DefaultBandwidth
		}
		replicaCount := req.ReplicaCount
		if replicaCount == 0 {
			replicaCount = 1
		}

		depIDs := make([]string, 0, len(req.DependsOn))
		for _, depName := range req.DependsOn {
			if id, ok := vnfIDMap[depName]; ok {
				depIDs = append(depIDs, id)
			}
		}

		now := time.Now()
		vnf := &models.VnfInstance{
			ID:           "vnf-" + uuid.New().String()[:8],
			VnfdID:       req.VnfdID,
			Name:         req.Name,
			Type:         vnfd.Type,
			Status:       "waiting",
			Cpu:          cpu,
			Memory:       memory,
			Bandwidth:    bandwidth,
			ReplicaCount: replicaCount,
			PositionX:    req.PositionX,
			PositionY:    req.PositionY,
			CreatedAt:    now,
			UpdatedAt:    now,
			DependsOn:    depIDs,
		}

		s.repo.CreateVnf(vnf)
		vnfIDMap[name] = vnf.ID
		createdVnfs = append(createdVnfs, vnf)
		s.addEvent("info", fmt.Sprintf("VNF %s queued for instantiation (depends on: %d)", vnf.Name, len(depIDs)), vnf.ID)

		go s.simulateOrderedInstantiation(vnf.ID, depIDs)
	}

	return createdVnfs, nil
}

func (s *ManoService) simulateOrderedInstantiation(vnfID string, depIDs []string) {
	maxAttempts := 30
	for attempt := 0; attempt < maxAttempts; attempt++ {
		allReady := true
		for _, depID := range depIDs {
			depVnf := s.repo.GetVnf(depID)
			if depVnf == nil || depVnf.Status != "running" {
				allReady = false
				break
			}
		}
		if allReady {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}
	vnf.Status = "instantiating"
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("info", fmt.Sprintf("VNF %s instantiation started", vnf.Name), vnf.ID)

	time.Sleep(2 * time.Second)

	vnf = s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}
	vnf.Status = "running"
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("info", fmt.Sprintf("VNF %s is now running (replicas: %d)", vnf.Name, vnf.ReplicaCount), vnf.ID)

	s.initializeRouteTable(vnfID)
}

func (s *ManoService) initializeRouteTable(vnfID string) {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}

	entries := make([]models.RouteEntry, 0)
	neighbors := s.repo.GetNeighborVnfs(vnfID)

	for i := range neighbors {
		entries = append(entries, models.RouteEntry{
			DestinationCIDR: fmt.Sprintf("10.%d.%d.0/24", i+1, i+1),
			NextHopIP:       fmt.Sprintf("192.168.%d.%d", i+1, 1),
			InterfaceName:   fmt.Sprintf("eth%d", i),
			Metric:          10,
			Protocol:        "STATIC",
		})
	}

	if len(entries) > 0 {
		s.repo.CreateOrUpdateRouteTable(vnfID, entries)
		s.addEvent("info", fmt.Sprintf("Route table initialized for %s (%d entries)", vnf.Name, len(entries)), vnfID)
	}
}

func (s *ManoService) InstantiateVnf(req *models.InstantiateRequest) (*models.VnfInstance, error) {
	vnfd := s.repo.GetVnfd(req.VnfdID)
	if vnfd == nil {
		return nil, fmt.Errorf("VNFD %s not found", req.VnfdID)
	}

	cpu := req.Cpu
	if cpu == 0 {
		cpu = vnfd.DefaultCpu
	}
	memory := req.Memory
	if memory == 0 {
		memory = vnfd.DefaultMemory
	}
	bandwidth := req.Bandwidth
	if bandwidth == 0 {
		bandwidth = vnfd.DefaultBandwidth
	}
	replicaCount := req.ReplicaCount
	if replicaCount == 0 {
		replicaCount = 1
	}

	now := time.Now()
	vnf := &models.VnfInstance{
		ID:           "vnf-" + uuid.New().String()[:8],
		VnfdID:       req.VnfdID,
		Name:         req.Name,
		Type:         vnfd.Type,
		Status:       "instantiating",
		Cpu:          cpu,
		Memory:       memory,
		Bandwidth:    bandwidth,
		ReplicaCount: replicaCount,
		PositionX:    req.PositionX,
		PositionY:    req.PositionY,
		CreatedAt:    now,
		UpdatedAt:    now,
		DependsOn:    req.DependsOn,
	}

	s.repo.CreateVnf(vnf)
	s.addEvent("info", fmt.Sprintf("VNF %s instantiation initiated (type: %s)", vnf.Name, vnf.Type), vnf.ID)

	go s.simulateInstantiation(vnf.ID)

	return vnf, nil
}

func (s *ManoService) simulateInstantiation(vnfID string) {
	time.Sleep(2 * time.Second)
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}
	vnf.Status = "running"
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("info", fmt.Sprintf("VNF %s is now running (replicas: %d)", vnf.Name, vnf.ReplicaCount), vnf.ID)

	s.initializeRouteTable(vnfID)
}

func (s *ManoService) ScaleVnf(vnfID string, req *models.ScaleRequest) (*models.VnfInstance, error) {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return nil, fmt.Errorf("VNF %s not found", vnfID)
	}
	if vnf.Status != "running" {
		return nil, fmt.Errorf("VNF %s is not running (current status: %s)", vnfID, vnf.Status)
	}

	oldReplicas := vnf.ReplicaCount
	vnf.Status = "scaling"
	if req.Cpu > 0 {
		vnf.Cpu = req.Cpu
	}
	if req.Memory > 0 {
		vnf.Memory = req.Memory
	}
	if req.Bandwidth > 0 {
		vnf.Bandwidth = req.Bandwidth
	}
	if req.ReplicaCount > 0 {
		vnf.ReplicaCount = req.ReplicaCount
	}
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("warning", fmt.Sprintf("VNF %s scaling: replicas %d → %d", vnf.Name, oldReplicas, vnf.ReplicaCount), vnf.ID)

	go s.simulateScaling(vnf.ID)

	return vnf, nil
}

func (s *ManoService) simulateScaling(vnfID string) {
	time.Sleep(3 * time.Second)
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}
	vnf.Status = "running"
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("info", fmt.Sprintf("VNF %s scaling completed (replicas: %d)", vnf.Name, vnf.ReplicaCount), vnf.ID)

	go s.updateNeighborRouteTables(vnfID)
}

func (s *ManoService) updateNeighborRouteTables(vnfID string) {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return
	}

	neighbors := s.repo.GetNeighborVnfs(vnfID)
	s.addEvent("info", fmt.Sprintf("Updating route tables for %d neighbor VNFs of %s", len(neighbors), vnf.Name), vnfID)

	for _, neighbor := range neighbors {
		time.Sleep(300 * time.Millisecond)

		neighborVnf := s.repo.GetVnf(neighbor.ID)
		if neighborVnf == nil || neighborVnf.Status != "running" {
			continue
		}

		existingRT := s.repo.GetRouteTable(neighbor.ID)
		entries := make([]models.RouteEntry, 0)
		if existingRT != nil {
			entries = append(entries, existingRT.Entries...)
		}

		found := false
		for i := range entries {
			if entries[i].DestinationCIDR == fmt.Sprintf("10.0.%s.0/24", vnfID[4:8]) {
				entries[i].Metric = 10 + (vnf.ReplicaCount - 1) * 5
				found = true
				break
			}
		}
		if !found {
			entries = append(entries, models.RouteEntry{
				DestinationCIDR: fmt.Sprintf("10.0.%s.0/24", vnfID[4:8]),
				NextHopIP:       fmt.Sprintf("192.168.1.%d", len(entries)+1),
				InterfaceName:   fmt.Sprintf("eth%d", len(entries)),
				Metric:          10 + (vnf.ReplicaCount - 1) * 5,
				Protocol:        "DYNAMIC",
			})
		}

		s.repo.CreateOrUpdateRouteTable(neighbor.ID, entries)
		s.addEvent("info", fmt.Sprintf("API call: Updated route table on %s (via %s)", neighborVnf.Name, vnf.Name), neighbor.ID)
	}

	s.addEvent("info", fmt.Sprintf("Completed route table updates for %s", vnf.Name), vnfID)
}

func (s *ManoService) TerminateVnf(vnfID string) error {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return fmt.Errorf("VNF %s not found", vnfID)
	}
	if vnf.Status == "terminated" || vnf.Status == "terminating" {
		return fmt.Errorf("VNF %s is already terminating or terminated", vnfID)
	}

	vnf.Status = "terminating"
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)
	s.addEvent("error", fmt.Sprintf("VNF %s termination initiated", vnf.Name), vnf.ID)

	links := s.repo.GetLinksByVnf(vnfID)
	for _, l := range links {
		s.repo.DeleteLink(l.ID)
		s.addEvent("warning", fmt.Sprintf("Link %s removed (VNF termination)", l.ID), vnfID)
	}

	go s.simulateTermination(vnfID)

	return nil
}

func (s *ManoService) simulateTermination(vnfID string) {
	time.Sleep(2 * time.Second)
	s.repo.DeleteVnf(vnfID)
	s.addEvent("info", fmt.Sprintf("VNF %s resources released", vnfID), vnfID)
}

func (s *ManoService) CreateLink(req *models.CreateLinkRequest) (*models.VirtualLink, error) {
	source := s.repo.GetVnf(req.SourceID)
	if source == nil {
		return nil, fmt.Errorf("source VNF %s not found", req.SourceID)
	}
	target := s.repo.GetVnf(req.TargetID)
	if target == nil {
		return nil, fmt.Errorf("target VNF %s not found", req.TargetID)
	}

	link := &models.VirtualLink{
		ID:        "link-" + uuid.New().String()[:8],
		SourceID:  req.SourceID,
		TargetID:  req.TargetID,
		Bandwidth: req.Bandwidth,
		Status:    "active",
		Latency:   5,
	}

	s.repo.CreateLink(link)
	s.addEvent("info", fmt.Sprintf("Link created: %s ↔ %s (%d Mbps)", source.Name, target.Name, link.Bandwidth), "")

	if source.Status == "running" {
		go s.updateNeighborRouteTables(source.ID)
	}
	if target.Status == "running" {
		go s.updateNeighborRouteTables(target.ID)
	}

	return link, nil
}

func (s *ManoService) DeleteLink(linkID string) error {
	link := s.repo.GetLink(linkID)
	if link == nil {
		return fmt.Errorf("link %s not found", linkID)
	}
	s.repo.DeleteLink(linkID)
	s.addEvent("info", fmt.Sprintf("Link %s removed", linkID), "")
	return nil
}

func (s *ManoService) GetRouteTable(vnfID string) *models.RouteTable {
	return s.repo.GetRouteTable(vnfID)
}

func (s *ManoService) GetNeighborVnfs(vnfID string) []*models.VnfInstance {
	return s.repo.GetNeighborVnfs(vnfID)
}

func (s *ManoService) addEvent(eventType, message, vnfID string) {
	event := &models.Event{
		ID:        "evt-" + uuid.New().String()[:8],
		Type:      eventType,
		Message:   message,
		VnfID:     vnfID,
		Timestamp: time.Now(),
	}
	s.repo.AddEvent(event)
}

// AutoScaling operations

func (s *ManoService) startMonitoring() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.collectMetrics()
		s.checkAutoScaling()
	}
}

func (s *ManoService) collectMetrics() {
	vnfs := s.repo.GetAllVnfs()
	for _, vnf := range vnfs {
		if vnf.Status != "running" {
			continue
		}

		baseUsage := 40.0
		if vnf.ReplicaCount > 1 {
			baseUsage = 30.0 + float64(vnf.ReplicaCount)*5
		}
		cpuUsage := baseUsage + rand.Float64()*40
		if cpuUsage > 95 {
			cpuUsage = 95
		}

		metrics := &models.VnfMetrics{
			VnfID:       vnf.ID,
			CpuUsage:    cpuUsage,
			MemoryUsage: 30 + rand.Float64()*40,
			NetworkIn:   rand.Float64() * 100,
			NetworkOut:  rand.Float64() * 100,
			Timestamp:   time.Now(),
		}
		s.repo.AddMetrics(metrics)
	}
}

func (s *ManoService) checkAutoScaling() {
	configs := s.repo.GetAllAutoScalingConfigs()
	for _, config := range configs {
		if !config.Enabled {
			continue
		}

		if time.Since(config.LastScalingAt) < time.Duration(config.CooldownSeconds)*time.Second {
			continue
		}

		vnf := s.repo.GetVnf(config.VnfID)
		if vnf == nil || vnf.Status != "running" {
			continue
		}

		metrics := s.repo.GetMetrics(config.VnfID, 3)
		if len(metrics) < 3 {
			continue
		}

		avgCpu := 0.0
		for _, m := range metrics {
			avgCpu += m.CpuUsage
		}
		avgCpu /= float64(len(metrics))

		if avgCpu > float64(config.ScaleUpThreshold) && vnf.ReplicaCount < config.MaxReplicas {
			s.triggerScaling(config, vnf, vnf.ReplicaCount+1, "scale up")
		} else if avgCpu < float64(config.ScaleDownThreshold) && vnf.ReplicaCount > config.MinReplicas {
			s.triggerScaling(config, vnf, vnf.ReplicaCount-1, "scale down")
		}
	}
}

func (s *ManoService) triggerScaling(config *models.AutoScalingConfig, vnf *models.VnfInstance, targetReplicas int, action string) {
	config.LastScalingAt = time.Now()
	s.repo.UpdateAutoScalingConfig(config.VnfID, config)

	vnf.Status = "scaling"
	vnf.ReplicaCount = targetReplicas
	vnf.UpdatedAt = time.Now()
	s.repo.UpdateVnf(vnf)

	s.addEvent("warning", fmt.Sprintf("Auto-scaling %s triggered: CPU > %d%%, replicas %d → %d",
		action, config.ScaleUpThreshold, vnf.ReplicaCount, targetReplicas), vnf.ID)

	go func() {
		time.Sleep(3 * time.Second)
		vnf.Status = "running"
		vnf.UpdatedAt = time.Now()
		s.repo.UpdateVnf(vnf)
		s.addEvent("info", fmt.Sprintf("Auto-scaling %s completed (replicas: %d)", action, targetReplicas), vnf.ID)
		s.updateNeighborRouteTables(vnf.ID)
	}()
}

func (s *ManoService) GetAutoScalingConfig(vnfID string) *models.AutoScalingConfig {
	return s.repo.GetAutoScalingConfig(vnfID)
}

func (s *ManoService) UpdateAutoScalingConfig(vnfID string, req *models.AutoScalingConfigRequest) (*models.AutoScalingConfig, error) {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return nil, fmt.Errorf("VNF %s not found", vnfID)
	}

	config := s.repo.GetAutoScalingConfig(vnfID)
	if config == nil {
		config = &models.AutoScalingConfig{VnfID: vnfID}
	}

	if req.MinReplicas != nil {
		config.MinReplicas = *req.MinReplicas
	}
	if req.MaxReplicas != nil {
		config.MaxReplicas = *req.MaxReplicas
	}
	if req.ScaleUpThreshold != nil {
		config.ScaleUpThreshold = *req.ScaleUpThreshold
	}
	if req.ScaleDownThreshold != nil {
		config.ScaleDownThreshold = *req.ScaleDownThreshold
	}
	if req.CooldownSeconds != nil {
		config.CooldownSeconds = *req.CooldownSeconds
	}
	if req.Enabled != nil {
		config.Enabled = *req.Enabled
	}

	s.repo.UpdateAutoScalingConfig(vnfID, config)
	s.addEvent("info", fmt.Sprintf("Auto-scaling config updated for %s (enabled: %v)", vnf.Name, config.Enabled), vnfID)
	return config, nil
}

func (s *ManoService) GetMetrics(vnfID string, limit int) []*models.VnfMetrics {
	return s.repo.GetMetrics(vnfID, limit)
}

// TOSCA Export

func (s *ManoService) ExportToscaTemplate(vnfID string) (string, error) {
	vnf := s.repo.GetVnf(vnfID)
	if vnf == nil {
		return "", fmt.Errorf("VNF %s not found", vnfID)
	}

	vnfd := s.repo.GetVnfd(vnf.VnfdID)
	if vnfd == nil {
		return "", fmt.Errorf("VNFD %s not found", vnf.VnfdID)
	}

	neighbors := s.repo.GetNeighborVnfs(vnfID)
	routeTable := s.repo.GetRouteTable(vnfID)

	var sb strings.Builder
	sb.WriteString("tosca_definitions_version: tosca_simple_yaml_1_3\n\n")
	sb.WriteString(fmt.Sprintf("description: TOSCA template for VNF %s (%s)\n\n", vnf.Name, vnf.Type))

	sb.WriteString("metadata:\n")
	sb.WriteString(fmt.Sprintf("  template_name: %s\n", vnf.Name))
	sb.WriteString("  template_author: NFV-MANO\n")
	sb.WriteString("  template_version: 1.0\n\n")

	sb.WriteString("node_types:\n")
	sb.WriteString(fmt.Sprintf("  org.opnfv.nodes.VNF.%s:\n", strings.Title(vnf.Type)))
	sb.WriteString("    derived_from: tosca.nodes.nfv.VNF\n")
	sb.WriteString("    properties:\n")
	sb.WriteString("      descriptor_id:\n")
	sb.WriteString("        type: string\n")
	sb.WriteString(fmt.Sprintf("        default: %s\n", vnf.VnfdID))
	sb.WriteString("      descriptor_version:\n")
	sb.WriteString("        type: string\n")
	sb.WriteString("        default: 1.0\n")
	sb.WriteString("      provider:\n")
	sb.WriteString("        type: string\n")
	sb.WriteString("        default: NFV-MANO\n")
	sb.WriteString("      product_name:\n")
	sb.WriteString("        type: string\n")
	sb.WriteString(fmt.Sprintf("        default: %s\n", vnfd.Name))
	sb.WriteString("      software_version:\n")
	sb.WriteString("        type: string\n")
	sb.WriteString("        default: 1.0\n")
	sb.WriteString("      vnfm_info:\n")
	sb.WriteString("        type: list\n")
	sb.WriteString("        entry_schema:\n")
	sb.WriteString("          type: string\n")
	sb.WriteString("        default: [NFV-MANO-VNFM]\n\n")

	sb.WriteString("topology_template:\n")
	sb.WriteString("  node_templates:\n")
	sb.WriteString(fmt.Sprintf("    %s:\n", vnf.Name))
	sb.WriteString(fmt.Sprintf("      type: org.opnfv.nodes.VNF.%s\n", strings.Title(vnf.Type)))
	sb.WriteString("      properties:\n")
	sb.WriteString(fmt.Sprintf("        name: %s\n", vnf.Name))
	sb.WriteString(fmt.Sprintf("        vnf_id: %s\n", vnf.ID))
	sb.WriteString(fmt.Sprintf("        replica_count: %d\n", vnf.ReplicaCount))
	sb.WriteString("      capabilities:\n")
	sb.WriteString("        virtual_compute:\n")
	sb.WriteString("          properties:\n")
	sb.WriteString(fmt.Sprintf("            num_cpus: %d\n", vnf.Cpu))
	sb.WriteString(fmt.Sprintf("            mem_size: %d MB\n", vnf.Memory))
	sb.WriteString("        virtual_bandwidth:\n")
	sb.WriteString("          properties:\n")
	sb.WriteString(fmt.Sprintf("            bandwidth: %d Mbps\n", vnf.Bandwidth))

	if len(neighbors) > 0 {
		sb.WriteString("      requirements:\n")
		for i, neighbor := range neighbors {
			sb.WriteString(fmt.Sprintf("        - link%d:\n", i+1))
			sb.WriteString("            capability: tosca.capabilities.nfv.VirtualLinkable\n")
			sb.WriteString(fmt.Sprintf("            node: %s\n", neighbor.Name))
			sb.WriteString("            relationship: tosca.relationships.nfv.VirtualLinksTo\n")
		}
	}

	if routeTable != nil && len(routeTable.Entries) > 0 {
		sb.WriteString("\n      artifacts:\n")
		sb.WriteString("        route_table:\n")
		sb.WriteString("          type: tosca.artifacts.nfv.RouteTable\n")
		sb.WriteString("          properties:\n")
		sb.WriteString("            entries:\n")
		for _, entry := range routeTable.Entries {
			sb.WriteString(fmt.Sprintf("              - destination: %s\n", entry.DestinationCIDR))
			sb.WriteString(fmt.Sprintf("                next_hop: %s\n", entry.NextHopIP))
			sb.WriteString(fmt.Sprintf("                interface: %s\n", entry.InterfaceName))
			sb.WriteString(fmt.Sprintf("                metric: %d\n", entry.Metric))
		}
	}

	sb.WriteString("\n  groups:\n")
	sb.WriteString(fmt.Sprintf("    %s_group:\n", vnf.Name))
	sb.WriteString("    type: tosca.groups.nfv.VNFFG\n")
	sb.WriteString("    members:\n")
	sb.WriteString(fmt.Sprintf("      - %s\n", vnf.Name))

	sb.WriteString("\n  policies:\n")
	sb.WriteString("    - scaling:\n")
	sb.WriteString("        type: tosca.policies.Scaling\n")
	sb.WriteString("        targets: [%s]\n")
	sb.WriteString("        properties:\n")
	sb.WriteString("          min_instances: 1\n")
	sb.WriteString("          max_instances: 10\n")
	sb.WriteString("          default_instances: 1\n")

	return sb.String(), nil
}
