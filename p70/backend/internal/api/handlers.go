package api

import (
	"context"
	"net/http"
	"strconv"

	"swarm-manager/internal/docker"
	"swarm-manager/internal/failover"
	"swarm-manager/internal/health"
	"swarm-manager/internal/models"
	"swarm-manager/internal/report"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	healthManager   *health.Manager
	failoverManager *failover.Manager
	dockerClient    *docker.Client
	reportGenerator *report.Generator
}

func NewHandler(hm *health.Manager, fm *failover.Manager, dc *docker.Client, rg *report.Generator) *Handler {
	return &Handler{
		healthManager:   hm,
		failoverManager: fm,
		dockerClient:    dc,
		reportGenerator: rg,
	}
}

type RegisterNodeRequest struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Hostname       string            `json:"hostname"`
	IPAddress      string            `json:"ip_address"`
	Role           string            `json:"role"`
	CPUCores       int               `json:"cpu_cores"`
	MemoryMB       int64             `json:"memory_mb"`
	CPUUsed        float64           `json:"cpu_used"`
	MemoryUsed     int64             `json:"memory_used"`
	GPUCount       int               `json:"gpu_count"`
	GPUType        string            `json:"gpu_type"`
	GPUUsed        float64           `json:"gpu_used"`
	GPUMemoryUsed  int64             `json:"gpu_memory_used"`
	GPUMemoryTotal int64             `json:"gpu_memory_total"`
	Labels         map[string]string `json:"labels"`
}

func (h *Handler) RegisterNode(c *gin.Context) {
	var req RegisterNodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	node := &models.Node{
		ID:             req.ID,
		Name:           req.Name,
		Hostname:       req.Hostname,
		IPAddress:      req.IPAddress,
		Role:           req.Role,
		CPUCores:       req.CPUCores,
		MemoryMB:       req.MemoryMB,
		CPUUsed:        req.CPUUsed,
		MemoryUsed:     req.MemoryUsed,
		GPUCount:       req.GPUCount,
		GPUType:        req.GPUType,
		GPUUsed:        req.GPUUsed,
		GPUMemoryUsed:  req.GPUMemoryUsed,
		GPUMemoryTotal: req.GPUMemoryTotal,
		Labels:         req.Labels,
	}

	if err := h.healthManager.RegisterNode(context.Background(), node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Node registered successfully", "node_id": node.ID})
}

type HeartbeatRequest struct {
	NodeID         string  `json:"node_id" binding:"required"`
	CPUUsed        float64 `json:"cpu_used"`
	MemoryUsed     int64   `json:"memory_used"`
	GPUUsed        float64 `json:"gpu_used"`
	GPUMemoryUsed  int64   `json:"gpu_memory_used"`
}

func (h *Handler) Heartbeat(c *gin.Context) {
	var req HeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.healthManager.Heartbeat(context.Background(), req.NodeID, req.CPUUsed, req.MemoryUsed, req.GPUUsed, req.GPUMemoryUsed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Heartbeat received"})
}

func (h *Handler) GetNodes(c *gin.Context) {
	nodes, err := h.healthManager.GetNodeStatus(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, nodes)
}

func (h *Handler) GetNode(c *gin.Context) {
	nodeID := c.Param("id")
	node, err := h.healthManager.GetNodeByID(context.Background(), nodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}

	c.JSON(http.StatusOK, node)
}

func (h *Handler) GetNodeHistory(c *gin.Context) {
	nodeID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	history, err := h.healthManager.GetNodeHistory(context.Background(), nodeID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, history)
}

func (h *Handler) DeleteNode(c *gin.Context) {
	nodeID := c.Param("id")
	if err := h.healthManager.RemoveNode(context.Background(), nodeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Node removed successfully"})
}

type CreateServiceRequest struct {
	Name        string            `json:"name" binding:"required"`
	Image       string            `json:"image" binding:"required"`
	Replicas    int               `json:"replicas" binding:"required,min=1"`
	Priority    int               `json:"priority"`
	GPURequired bool              `json:"gpu_required"`
	GPUCount    int               `json:"gpu_count"`
	GPUMemory   int64             `json:"gpu_memory"`
	Env         []string          `json:"env"`
	Labels      map[string]string `json:"labels"`
	Ports       []PortMapping     `json:"ports"`
	NodeID      string            `json:"node_id"`
}

type PortMapping struct {
	HostPort      int    `json:"host_port"`
	ContainerPort int    `json:"container_port"`
	Protocol      string `json:"protocol"`
}

func (h *Handler) CreateService(c *gin.Context) {
	var req CreateServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ports := make([]docker.PortConfig, len(req.Ports))
	for i, p := range req.Ports {
		ports[i] = docker.PortConfig{
			HostPort:      p.HostPort,
			ContainerPort: p.ContainerPort,
			Protocol:      p.Protocol,
		}
	}

	config := docker.ServiceConfig{
		Name:     req.Name,
		Image:    req.Image,
		Replicas: req.Replicas,
		Env:      req.Env,
		Labels:   req.Labels,
		Ports:    ports,
	}

	if req.NodeID != "" {
		config.Constraints = []string{"node.id == " + req.NodeID}
	}

	if req.GPURequired && req.GPUCount > 0 {
		config.GPU = &docker.GPUConfig{
			Count:     req.GPUCount,
			GPUMemory: req.GPUMemory,
		}
	}

	serviceID, err := h.dockerClient.CreateService(context.Background(), config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Service created successfully", "service_id": serviceID})
}

func (h *Handler) GetServices(c *gin.Context) {
	var services []models.Service
	if err := h.healthManager.DB().Find(&services).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, services)
}

func (h *Handler) GetService(c *gin.Context) {
	serviceID := c.Param("id")
	service, err := h.dockerClient.GetService(context.Background(), serviceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Service not found"})
		return
	}

	c.JSON(http.StatusOK, service)
}

func (h *Handler) DeleteService(c *gin.Context) {
	serviceID := c.Param("id")
	if err := h.dockerClient.RemoveService(context.Background(), serviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Service removed successfully"})
}

func (h *Handler) SyncSwarm(c *gin.Context) {
	if err := h.healthManager.SyncSwarmNodes(context.Background()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := h.failoverManager.SyncServices(context.Background()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Swarm sync completed"})
}

func (h *Handler) GetDeploymentHistory(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	var history []models.DeploymentHistory

	if err := h.healthManager.DB().Order("timestamp desc").Limit(limit).Find(&history).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, history)
}

func (h *Handler) TriggerFailover(c *gin.Context) {
	nodeID := c.Param("node_id")
	if err := h.failoverManager.TriggerManualFailover(context.Background(), nodeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Failover triggered, services will be rescheduled"})
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func (h *Handler) GetClusterReport(c *gin.Context) {
	report, err := h.reportGenerator.GenerateReport()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

func (h *Handler) ExportClusterReport(c *gin.Context) {
	format := c.DefaultQuery("format", "json")

	report, err := h.reportGenerator.GenerateReport()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	switch format {
	case "json":
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", "attachment; filename=cluster-report.json")
		jsonData, err := h.reportGenerator.ExportJSON(report)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Data(http.StatusOK, "application/json", jsonData)
	case "markdown", "md":
		c.Header("Content-Type", "text/markdown")
		c.Header("Content-Disposition", "attachment; filename=cluster-report.md")
		mdData := h.reportGenerator.ExportMarkdown(report)
		c.String(http.StatusOK, mdData)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported format. Use json or markdown"})
	}
}
