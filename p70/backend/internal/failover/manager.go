package failover

import (
	"context"
	"log"
	"strconv"
	"sync"
	"time"

	"swarm-manager/internal/docker"
	"swarm-manager/internal/health"
	"swarm-manager/internal/models"
	"swarm-manager/pkg/config"

	"gorm.io/gorm"
)

type Manager struct {
	db            *gorm.DB
	docker        *docker.Client
	healthManager *health.Manager
	config        *config.Config
	mu            sync.Mutex
	processing    map[string]bool
}

func NewManager(db *gorm.DB, dockerClient *docker.Client, healthManager *health.Manager, cfg *config.Config) *Manager {
	return &Manager{
		db:            db,
		docker:        dockerClient,
		healthManager: healthManager,
		config:        cfg,
		processing:    make(map[string]bool),
	}
}

func (m *Manager) CheckAndFailover(ctx context.Context) error {
	nodes, err := m.healthManager.GetNodeStatus(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	failoverDelay := time.Duration(m.config.HeartbeatInterval*3) * time.Second

	for i := range nodes {
		node := &nodes[i]

		if node.Status == "inactive" {
			m.handleInactiveNode(ctx, node, now, failoverDelay)
		} else if node.Status == "active" {
			m.handleRecoveredNode(ctx, node)
		}
	}

	return nil
}

func (m *Manager) handleInactiveNode(ctx context.Context, node *models.Node, now time.Time, failoverDelay time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.processing[node.ID] {
		log.Printf("Node %s failover already in progress, skipping", node.ID)
		return
	}

	if node.FailoverHandled {
		log.Printf("Node %s failover already handled, skipping", node.ID)
		return
	}

	if node.FailoverAt == nil {
		log.Printf("Node %s detected as inactive, marking for failover (delay: %v)", node.ID, failoverDelay)
		node.FailoverAt = &now
		node.FailoverHandled = false
		if err := m.db.Save(node).Error; err != nil {
			log.Printf("Failed to update node failover time: %v", err)
		}
		return
	}

	if now.Sub(*node.FailoverAt) < failoverDelay {
		remaining := failoverDelay - now.Sub(*node.FailoverAt)
		log.Printf("Node %s in failover grace period, remaining: %v", node.ID, remaining)
		return
	}

	m.processing[node.ID] = true
	go func() {
		defer func() {
			m.mu.Lock()
			delete(m.processing, node.ID)
			m.mu.Unlock()
		}()

		if err := m.handleNodeFailure(ctx, node); err != nil {
			log.Printf("Failed to handle node failure for %s: %v", node.ID, err)
		} else {
			node.FailoverHandled = true
			if err := m.db.Save(node).Error; err != nil {
				log.Printf("Failed to mark node failover handled: %v", err)
			}
		}
	}()
}

func (m *Manager) handleRecoveredNode(ctx context.Context, node *models.Node) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if node.FailoverAt != nil || node.FailoverHandled {
		log.Printf("Node %s recovered, resetting failover state", node.ID)
		node.FailoverAt = nil
		node.FailoverHandled = false
		if err := m.db.Save(node).Error; err != nil {
			log.Printf("Failed to reset node failover state: %v", err)
		}
	}
}

func (m *Manager) handleNodeFailure(ctx context.Context, node *models.Node) error {
	log.Printf("=== Starting failover for node: %s (%s) ===", node.ID, node.Name)

	services, err := m.getServicesOnNode(ctx, node.ID)
	if err != nil {
		return err
	}

	log.Printf("Found %d services on failed node", len(services))

	if len(services) == 0 {
		log.Printf("No services to migrate on node %s", node.ID)
		m.recordDeploymentHistory("", "system", "failover_check", "success", node.ID, "Node offline, no services to migrate")
		return nil
	}

	successCount := 0
	for i := range services {
		service := &services[i]
		if err := m.migrateService(ctx, service, node); err != nil {
			log.Printf("Failed to migrate service %s: %v", service.ID, err)
			m.recordDeploymentHistory(service.ID, service.Name, "failover", "failed", node.ID, err.Error())
		} else {
			successCount++
			m.recordDeploymentHistory(service.ID, service.Name, "failover", "success", node.ID, "Service migrated using Swarm orchestration")
		}
	}

	log.Printf("=== Failover complete for node %s: %d/%d services migrated ===", node.ID, successCount, len(services))
	return nil
}

func (m *Manager) getServicesOnNode(ctx context.Context, nodeID string) ([]models.Service, error) {
	var services []models.Service
	if err := m.db.Where("node_id = ?", nodeID).Find(&services).Error; err != nil {
		return nil, err
	}
	return services, nil
}

func (m *Manager) migrateService(ctx context.Context, service *models.Service, failedNode *models.Node) error {
	log.Printf("Migrating service %s from failed node %s", service.Name, failedNode.ID)

	if m.docker == nil {
		log.Printf("Docker client not available, updating service node assignment in database only")
		healthyNodes, err := m.getHealthyNodes(ctx)
		if err != nil || len(healthyNodes) == 0 {
			return err
		}
		targetNode := m.selectBestNode(healthyNodes, service)
		if targetNode == nil {
			return nil
		}
		service.NodeID = targetNode.ID
		service.Status = "pending"
		service.UpdatedAt = time.Now()
		return m.db.Save(service).Error
	}

	return m.migrateWithSwarm(ctx, service, failedNode)
}

func (m *Manager) migrateWithSwarm(ctx context.Context, service *models.Service, failedNode *models.Node) error {
	log.Printf("Using Docker Swarm to reschedule service %s", service.Name)

	swarmService, err := m.docker.GetService(ctx, service.ID)
	if err != nil {
		log.Printf("Service %s not found in Swarm, may have been removed: %v", service.ID, err)
		return err
	}

	currentConstraints := swarmService.Spec.TaskTemplate.Placement.Constraints
	newConstraints := make([]string, 0)

	for _, constraint := range currentConstraints {
		if constraint != "node.id == "+failedNode.ID {
			newConstraints = append(newConstraints, constraint)
		}
	}

	newConstraints = append(newConstraints, "node.id != "+failedNode.ID)

	swarmService.Spec.TaskTemplate.Placement.Constraints = newConstraints

	version := swarmService.Version
	if err := m.docker.UpdateService(ctx, service.ID, docker.ServiceConfig{
		Name:        swarmService.Spec.Name,
		Image:       swarmService.Spec.TaskTemplate.ContainerSpec.Image,
		Replicas:    getServiceReplicas(swarmService),
		Env:         swarmService.Spec.TaskTemplate.ContainerSpec.Env,
		Labels:      swarmService.Spec.Labels,
		Constraints: newConstraints,
	}); err != nil {
		log.Printf("Failed to update service constraints via Swarm API: %v", err)
		return err
	}

	log.Printf("Service %s updated in Swarm, removing failed node constraint", service.Name)

	service.NodeID = ""
	service.Status = "rescheduled"
	service.UpdatedAt = time.Now()
	if err := m.db.Save(service).Error; err != nil {
		log.Printf("Failed to update service in database: %v", err)
	}

	return nil
}

func getServiceReplicas(swarmService interface{}) int {
	return 1
}

func (m *Manager) getHealthyNodes(ctx context.Context) ([]models.Node, error) {
	var nodes []models.Node
	if err := m.db.Where("status = ?", "active").Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

func (m *Manager) selectBestNode(nodes []models.Node, service *models.Service) *models.Node {
	type nodeScore struct {
		node  models.Node
		score float64
	}

	var candidates []nodeScore

	for i := range nodes {
		node := nodes[i]

		if service.GPURequired && node.GPUCount < service.GPUCount {
			continue
		}

		if service.GPUMemory > 0 && (node.GPUMemoryTotal-node.GPUMemoryUsed) < service.GPUMemory {
			continue
		}

		cpuLoad := node.CPUUsed
		memLoad := 0.0
		if node.MemoryMB > 0 {
			memLoad = float64(node.MemoryUsed) / float64(node.MemoryMB) * 100
		}

		gpuLoad := 0.0
		if node.GPUCount > 0 {
			gpuLoad = node.GPUUsed
		}

		combinedLoad := (cpuLoad + memLoad + gpuLoad) / 3

		priorityWeight := float64(service.Priority) * 0.1
		finalScore := combinedLoad - priorityWeight

		candidates = append(candidates, nodeScore{node: node, score: finalScore})
	}

	if len(candidates) == 0 {
		return nil
	}

	minScore := float64(100)
	var bestNode *models.Node
	for i := range candidates {
		if candidates[i].score < minScore {
			minScore = candidates[i].score
			bestNode = &candidates[i].node
		}
	}

	return bestNode
}

func (m *Manager) recordDeploymentHistory(serviceID, serviceName, action, status, nodeID, message string) {
	history := &models.DeploymentHistory{
		ServiceID:   serviceID,
		ServiceName: serviceName,
		Action:      action,
		Status:      status,
		NodeID:      nodeID,
		Message:     message,
		Timestamp:   time.Now(),
	}
	if err := m.db.Create(history).Error; err != nil {
		log.Printf("Failed to record deployment history: %v", err)
	}
}

func (m *Manager) StartFailoverMonitor(ctx context.Context) {
	if !m.config.FailoverEnabled {
		log.Println("Failover is disabled")
		return
	}

	checkInterval := time.Duration(m.config.HeartbeatInterval*2) * time.Second
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	log.Printf("Failover monitor started, check interval: %v", checkInterval)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := m.CheckAndFailover(ctx); err != nil {
				log.Printf("Failover check failed: %v", err)
			}
		}
	}
}

func (m *Manager) SyncServices(ctx context.Context) error {
	if m.docker == nil {
		log.Println("Docker client not available, skipping Swarm sync")
		return nil
	}

	swarmServices, err := m.docker.ListServices(ctx)
	if err != nil {
		return err
	}

	for _, ss := range swarmServices {
		var replicas int
		if ss.Spec.Mode.Replicated != nil && ss.Spec.Mode.Replicated.Replicas != nil {
			replicas = int(*ss.Spec.Mode.Replicated.Replicas)
		}

		tasks, err := m.docker.GetServiceTasks(ctx, ss.ID)
		if err != nil {
			log.Printf("Failed to get tasks for service %s: %v", ss.ID, err)
			continue
		}

		runningReplicas := 0
		nodeID := ""
		for _, task := range tasks {
			if task.Status.State == "running" {
				runningReplicas++
				nodeID = task.NodeID
			}
		}

		status := string(ss.ServiceStatus.UpdateState)
		if status == "" && runningReplicas > 0 {
			status = "running"
		} else if status == "" {
			status = "pending"
		}

		priority := 5
		if p, ok := ss.Spec.Labels["priority"]; ok {
			if pi, err := strconv.Atoi(p); err == nil {
				priority = pi
			}
		}

		gpuRequired := false
		gpuCount := 0
		if gr, ok := ss.Spec.Labels["gpu_required"]; ok && gr == "true" {
			gpuRequired = true
		}
		if gc, ok := ss.Spec.Labels["gpu_count"]; ok {
			if gcn, err := strconv.Atoi(gc); err == nil {
				gpuCount = gcn
			}
		}

		service := &models.Service{
			ID:              ss.ID,
			Name:            ss.Spec.Name,
			Image:           ss.Spec.TaskTemplate.ContainerSpec.Image,
			Replicas:        replicas,
			RunningReplicas: runningReplicas,
			Status:          status,
			Priority:        priority,
			GPURequired:     gpuRequired,
			GPUCount:        gpuCount,
			NodeID:          nodeID,
			CreatedAt:       ss.Meta.CreatedAt,
			UpdatedAt:       ss.Meta.UpdatedAt,
			Labels:          ss.Spec.Labels,
			Env:             ss.Spec.TaskTemplate.ContainerSpec.Env,
		}

		var existing models.Service
		if err := m.db.Where("id = ?", ss.ID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			m.db.Create(service)
		} else {
			existing.RunningReplicas = runningReplicas
			existing.Status = status
			existing.NodeID = nodeID
			existing.UpdatedAt = time.Now()
			m.db.Save(&existing)
		}
	}

	return nil
}

func (m *Manager) TriggerManualFailover(ctx context.Context, nodeID string) error {
	node, err := m.healthManager.GetNodeByID(ctx, nodeID)
	if err != nil {
		return err
	}

	now := time.Now()
	node.Status = "inactive"
	node.FailoverAt = &now
	node.FailoverHandled = false

	if err := m.db.Save(node).Error; err != nil {
		return err
	}

	go func() {
		time.Sleep(1 * time.Second)
		m.CheckAndFailover(ctx)
	}()

	return nil
}
