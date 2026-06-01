package health

import (
	"context"
	"fmt"
	"log"
	"time"

	"swarm-manager/internal/docker"
	"swarm-manager/internal/models"
	"swarm-manager/pkg/config"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Manager struct {
	db          *gorm.DB
	docker      *docker.Client
	config      *config.Config
	nodeTimeout time.Duration
}

func NewManager(db *gorm.DB, dockerClient *docker.Client, cfg *config.Config) *Manager {
	return &Manager{
		db:          db,
		docker:      dockerClient,
		config:      cfg,
		nodeTimeout: time.Duration(cfg.NodeTimeout) * time.Second,
	}
}

func (m *Manager) RegisterNode(ctx context.Context, node *models.Node) error {
	var existing models.Node
	result := m.db.Where("id = ?", node.ID).First(&existing)
	
	if result.Error == gorm.ErrRecordNotFound {
		node.CreatedAt = time.Now()
		node.ID = uuid.New().String()
		node.LastSeen = time.Now()
		return m.db.Create(node).Error
	}

	existing.Name = node.Name
	existing.Hostname = node.Hostname
	existing.IPAddress = node.IPAddress
	existing.Role = node.Role
	existing.Status = "active"
	existing.CPUCores = node.CPUCores
	existing.MemoryMB = node.MemoryMB
	existing.CPUUsed = node.CPUUsed
	existing.MemoryUsed = node.MemoryUsed
	existing.GPUCount = node.GPUCount
	existing.GPUType = node.GPUType
	existing.GPUUsed = node.GPUUsed
	existing.GPUMemoryUsed = node.GPUMemoryUsed
	existing.GPUMemoryTotal = node.GPUMemoryTotal
	existing.LastSeen = time.Now()
	existing.UpdatedAt = time.Now()
	existing.Labels = node.Labels

	if node.GPUCount > 0 {
		if existing.Labels == nil {
			existing.Labels = make(map[string]string)
		}
		existing.Labels["gpu"] = "true"
		existing.Labels["gpu_count"] = fmt.Sprintf("%d", node.GPUCount)
		existing.Labels["gpu_type"] = node.GPUType
	}

	if err := m.db.Save(&existing).Error; err != nil {
		return err
	}

	return m.recordNodeHistory(&existing)
}

func (m *Manager) recordNodeHistory(node *models.Node) error {
	history := &models.NodeHistory{
		NodeID:        node.ID,
		Status:        node.Status,
		CPUUsed:       node.CPUUsed,
		MemoryUsed:    node.MemoryUsed,
		GPUUsed:       node.GPUUsed,
		GPUMemoryUsed: node.GPUMemoryUsed,
		Timestamp:     time.Now(),
	}
	return m.db.Create(history).Error
}

func (m *Manager) Heartbeat(ctx context.Context, nodeID string, cpuUsed float64, memoryUsed int64, gpuUsed float64, gpuMemoryUsed int64) error {
	var node models.Node
	if err := m.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return fmt.Errorf("node not found: %w", err)
	}

	node.Status = "active"
	node.CPUUsed = cpuUsed
	node.MemoryUsed = memoryUsed
	node.GPUUsed = gpuUsed
	node.GPUMemoryUsed = gpuMemoryUsed
	node.LastSeen = time.Now()
	node.UpdatedAt = time.Now()

	if err := m.db.Save(&node).Error; err != nil {
		return err
	}

	return m.recordNodeHistory(&node)
}

func (m *Manager) CheckNodeStatus(ctx context.Context) error {
	var nodes []models.Node
	if err := m.db.Find(&nodes).Error; err != nil {
		return err
	}

	now := time.Now()
	for i := range nodes {
		node := &nodes[i]
		if now.Sub(node.LastSeen) > m.nodeTimeout {
			if node.Status != "inactive" {
				node.Status = "inactive"
				node.UpdatedAt = now
				if err := m.db.Save(node).Error; err != nil {
					log.Printf("Failed to update node status: %v", err)
				}
				if err := m.recordNodeHistory(node); err != nil {
					log.Printf("Failed to record node history: %v", err)
				}
				log.Printf("Node %s marked as inactive due to timeout", node.ID)
			}
		}
	}
	return nil
}

func (m *Manager) GetNodeStatus(ctx context.Context) ([]models.Node, error) {
	var nodes []models.Node
	if err := m.db.Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

func (m *Manager) GetNodeByID(ctx context.Context, nodeID string) (*models.Node, error) {
	var node models.Node
	if err := m.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}
	return &node, nil
}

func (m *Manager) GetNodeHistory(ctx context.Context, nodeID string, limit int) ([]models.NodeHistory, error) {
	var history []models.NodeHistory
	if err := m.db.Where("node_id = ?", nodeID).Order("timestamp desc").Limit(limit).Find(&history).Error; err != nil {
		return nil, err
	}
	return history, nil
}

func (m *Manager) RemoveNode(ctx context.Context, nodeID string) error {
	return m.db.Where("id = ?", nodeID).Delete(&models.Node{}).Error
}

func (m *Manager) DB() *gorm.DB {
	return m.db
}

func (m *Manager) StartHealthCheck(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(m.config.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := m.CheckNodeStatus(ctx); err != nil {
				log.Printf("Health check failed: %v", err)
			}
		}
	}
}

func (m *Manager) SyncSwarmNodes(ctx context.Context) error {
	swarmNodes, err := m.docker.ListNodes(ctx)
	if err != nil {
		return fmt.Errorf("failed to list swarm nodes: %w", err)
	}

	for _, sn := range swarmNodes {
		node := &models.Node{
			ID:        sn.ID,
			Name:      sn.Spec.Name,
			Hostname:  sn.Description.Hostname,
			Role:      string(sn.Spec.Role),
			Status:    string(sn.Status.State),
			CPUCores:  int(sn.Description.Resources.NanoCPUs / 1e9),
			MemoryMB:  int64(sn.Description.Resources.MemoryBytes / 1024 / 1024),
			LastSeen:  time.Now(),
			CreatedAt: sn.Meta.CreatedAt,
			UpdatedAt: sn.Meta.UpdatedAt,
			Labels:    sn.Spec.Labels,
		}

		if sn.ManagerStatus != nil {
			node.IPAddress = sn.ManagerStatus.Addr
		}

		if err := m.RegisterNode(ctx, node); err != nil {
			log.Printf("Failed to register swarm node %s: %v", sn.ID, err)
		}
	}

	return nil
}
