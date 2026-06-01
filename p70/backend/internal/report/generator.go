package report

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"swarm-manager/internal/models"

	"gorm.io/gorm"
)

type ClusterReport struct {
	GeneratedAt     time.Time       `json:"generated_at"`
	Summary         ClusterSummary  `json:"summary"`
	Nodes           []NodeReport    `json:"nodes"`
	Services        []ServiceReport `json:"services"`
	Deployments     []DeploymentReport `json:"recent_deployments"`
	Recommendations []string        `json:"recommendations"`
}

type ClusterSummary struct {
	TotalNodes        int     `json:"total_nodes"`
	ActiveNodes       int     `json:"active_nodes"`
	InactiveNodes     int     `json:"inactive_nodes"`
	TotalServices     int     `json:"total_services"`
	RunningServices   int     `json:"running_services"`
	TotalCPUCores     int     `json:"total_cpu_cores"`
	TotalMemoryGB     float64 `json:"total_memory_gb"`
	UsedCPUPercent    float64 `json:"used_cpu_percent"`
	UsedMemoryPercent float64 `json:"used_memory_percent"`
	TotalGPUs         int     `json:"total_gpus"`
	UsedGPUPercent    float64 `json:"used_gpu_percent"`
}

type NodeReport struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Hostname        string  `json:"hostname"`
	Role            string  `json:"role"`
	Status          string  `json:"status"`
	CPUCores        int     `json:"cpu_cores"`
	CPUUsed         float64 `json:"cpu_used_percent"`
	MemoryGB        float64 `json:"memory_gb"`
	MemoryUsedGB    float64 `json:"memory_used_gb"`
	MemoryUsedPercent float64 `json:"memory_used_percent"`
	GPUCount        int     `json:"gpu_count"`
	GPUType         string  `json:"gpu_type"`
	GPUUsed         float64 `json:"gpu_used_percent"`
	GPUMemoryTotalGB float64 `json:"gpu_memory_total_gb"`
	GPUMemoryUsedGB float64 `json:"gpu_memory_used_gb"`
	LastSeen        string  `json:"last_seen"`
	Uptime          string  `json:"uptime"`
}

type ServiceReport struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Image           string   `json:"image"`
	Replicas        int      `json:"replicas"`
	RunningReplicas int      `json:"running_replicas"`
	Status          string   `json:"status"`
	Priority        int      `json:"priority"`
	GPURequired     bool     `json:"gpu_required"`
	GPUCount        int      `json:"gpu_count"`
	NodeID          string   `json:"node_id"`
	CreatedAt       string   `json:"created_at"`
	Env             []string `json:"env,omitempty"`
}

type DeploymentReport struct {
	ID          uint   `json:"id"`
	ServiceID   string `json:"service_id"`
	ServiceName string `json:"service_name"`
	Action      string `json:"action"`
	Status      string `json:"status"`
	NodeID      string `json:"node_id"`
	Message     string `json:"message"`
	Timestamp   string `json:"timestamp"`
}

type Generator struct {
	db *gorm.DB
}

func NewGenerator(db *gorm.DB) *Generator {
	return &Generator{db: db}
}

func (g *Generator) GenerateReport() (*ClusterReport, error) {
	report := &ClusterReport{
		GeneratedAt: time.Now(),
	}

	var nodes []models.Node
	if err := g.db.Find(&nodes).Error; err != nil {
		return nil, err
	}

	var services []models.Service
	if err := g.db.Find(&services).Error; err != nil {
		return nil, err
	}

	var deployments []models.DeploymentHistory
	if err := g.db.Order("timestamp desc").Limit(20).Find(&deployments).Error; err != nil {
		return nil, err
	}

	report.Summary = g.calculateSummary(nodes, services)
	report.Nodes = g.generateNodeReports(nodes)
	report.Services = g.generateServiceReports(services)
	report.Deployments = g.generateDeploymentReports(deployments)
	report.Recommendations = g.generateRecommendations(nodes, services)

	return report, nil
}

func (g *Generator) calculateSummary(nodes []models.Node, services []models.Service) ClusterSummary {
	summary := ClusterSummary{
		TotalNodes:    len(nodes),
		TotalServices: len(services),
	}

	var totalCPUUsed, totalGPUs, totalGPUUsed float64
	var totalMemory, totalMemoryUsed, totalGPUMemory, totalGPUMemoryUsed int64

	for _, node := range nodes {
		if node.Status == "active" {
			summary.ActiveNodes++
		} else {
			summary.InactiveNodes++
		}

		summary.TotalCPUCores += node.CPUCores
		totalCPUUsed += node.CPUUsed
		totalMemory += node.MemoryMB
		totalMemoryUsed += node.MemoryUsed
		totalGPUs += float64(node.GPUCount)
		totalGPUUsed += node.GPUUsed
		totalGPUMemory += node.GPUMemoryTotal
		totalGPUMemoryUsed += node.GPUMemoryUsed
	}

	for _, service := range services {
		if service.RunningReplicas > 0 || service.Status == "running" {
			summary.RunningServices++
		}
	}

	if summary.TotalNodes > 0 {
		summary.UsedCPUPercent = totalCPUUsed / float64(summary.TotalNodes)
	}
	if totalMemory > 0 {
		summary.UsedMemoryPercent = float64(totalMemoryUsed) / float64(totalMemory) * 100
	}
	if totalGPUs > 0 {
		summary.UsedGPUPercent = totalGPUUsed / totalGPUs
	}

	summary.TotalMemoryGB = float64(totalMemory) / 1024
	summary.TotalGPUs = int(totalGPUs)

	return summary
}

func (g *Generator) generateNodeReports(nodes []models.Node) []NodeReport {
	var reports []NodeReport

	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].CreatedAt.After(nodes[j].CreatedAt)
	})

	for _, node := range nodes {
		uptime := ""
		if !node.CreatedAt.IsZero() {
			uptime = time.Since(node.CreatedAt).Round(time.Second).String()
		}

		memoryUsedPercent := 0.0
		if node.MemoryMB > 0 {
			memoryUsedPercent = float64(node.MemoryUsed) / float64(node.MemoryMB) * 100
		}

		reports = append(reports, NodeReport{
			ID:               node.ID,
			Name:             node.Name,
			Hostname:         node.Hostname,
			Role:             node.Role,
			Status:           node.Status,
			CPUCores:         node.CPUCores,
			CPUUsed:          node.CPUUsed,
			MemoryGB:         float64(node.MemoryMB) / 1024,
			MemoryUsedGB:     float64(node.MemoryUsed) / 1024,
			MemoryUsedPercent: memoryUsedPercent,
			GPUCount:         node.GPUCount,
			GPUType:          node.GPUType,
			GPUUsed:          node.GPUUsed,
			GPUMemoryTotalGB: float64(node.GPUMemoryTotal) / 1024,
			GPUMemoryUsedGB:  float64(node.GPUMemoryUsed) / 1024,
			LastSeen:         node.LastSeen.Format(time.RFC3339),
			Uptime:           uptime,
		})
	}

	return reports
}

func (g *Generator) generateServiceReports(services []models.Service) []ServiceReport {
	var reports []ServiceReport

	sort.Slice(services, func(i, j int) bool {
		if services[i].Priority != services[j].Priority {
			return services[i].Priority > services[j].Priority
		}
		return services[i].CreatedAt.After(services[j].CreatedAt)
	})

	for _, service := range services {
		reports = append(reports, ServiceReport{
			ID:              service.ID,
			Name:            service.Name,
			Image:           service.Image,
			Replicas:        service.Replicas,
			RunningReplicas: service.RunningReplicas,
			Status:          service.Status,
			Priority:        service.Priority,
			GPURequired:     service.GPURequired,
			GPUCount:        service.GPUCount,
			NodeID:          service.NodeID,
			CreatedAt:       service.CreatedAt.Format(time.RFC3339),
			Env:             service.Env,
		})
	}

	return reports
}

func (g *Generator) generateDeploymentReports(deployments []models.DeploymentHistory) []DeploymentReport {
	var reports []DeploymentReport

	for _, d := range deployments {
		reports = append(reports, DeploymentReport{
			ID:          d.ID,
			ServiceID:   d.ServiceID,
			ServiceName: d.ServiceName,
			Action:      d.Action,
			Status:      d.Status,
			NodeID:      d.NodeID,
			Message:     d.Message,
			Timestamp:   d.Timestamp.Format(time.RFC3339),
		})
	}

	return reports
}

func (g *Generator) generateRecommendations(nodes []models.Node, services []models.Service) []string {
	var recommendations []string

	activeNodes := 0
	highLoadNodes := 0
	gpuNodes := 0

	for _, node := range nodes {
		if node.Status == "active" {
			activeNodes++
			if node.CPUUsed > 80 || (node.MemoryMB > 0 && float64(node.MemoryUsed)/float64(node.MemoryMB)*100 > 80) {
				highLoadNodes++
			}
			if node.GPUCount > 0 {
				gpuNodes++
			}
		}
	}

	if activeNodes == 0 {
		recommendations = append(recommendations, "⚠️ 没有活跃节点，请添加节点到集群")
	} else if activeNodes < 3 {
		recommendations = append(recommendations, "💡 建议增加至少3个节点以提高高可用性")
	}

	if highLoadNodes > 0 {
		recommendations = append(recommendations, fmt.Sprintf("⚠️ 有 %d 个节点资源使用率超过80%%，考虑扩容", highLoadNodes))
	}

	gpuServices := 0
	for _, s := range services {
		if s.GPURequired {
			gpuServices++
		}
	}

	if gpuServices > 0 && gpuNodes == 0 {
		recommendations = append(recommendations, "⚠️ 存在GPU需求的服务但没有可用GPU节点")
	}

	pendingServices := 0
	for _, s := range services {
		if s.RunningReplicas < s.Replicas {
			pendingServices++
		}
	}
	if pendingServices > 0 {
		recommendations = append(recommendations, fmt.Sprintf("⚠️ 有 %d 个服务副本未完全启动", pendingServices))
	}

	if len(recommendations) == 0 {
		recommendations = append(recommendations, "✅ 集群状态良好")
	}

	return recommendations
}

func (g *Generator) ExportJSON(report *ClusterReport) ([]byte, error) {
	return json.MarshalIndent(report, "", "  ")
}

func (g *Generator) ExportMarkdown(report *ClusterReport) string {
	md := "# 集群状态报告\n\n"
	md += fmt.Sprintf("**生成时间**: %s\n\n", report.GeneratedAt.Format(time.RFC3339))

	md += "## 集群概览\n\n"
	md += "| 指标 | 值 |\n"
	md += "|------|----|\n"
	md += fmt.Sprintf("| 总节点数 | %d |\n", report.Summary.TotalNodes)
	md += fmt.Sprintf("| 活跃节点 | %d |\n", report.Summary.ActiveNodes)
	md += fmt.Sprintf("| 离线节点 | %d |\n", report.Summary.InactiveNodes)
	md += fmt.Sprintf("| 总服务数 | %d |\n", report.Summary.TotalServices)
	md += fmt.Sprintf("| 运行中服务 | %d |\n", report.Summary.RunningServices)
	md += fmt.Sprintf("| CPU 总核心数 | %d |\n", report.Summary.TotalCPUCores)
	md += fmt.Sprintf("| 内存总量 | %.2f GB |\n", report.Summary.TotalMemoryGB)
	md += fmt.Sprintf("| CPU 使用率 | %.1f%% |\n", report.Summary.UsedCPUPercent)
	md += fmt.Sprintf("| 内存使用率 | %.1f%% |\n", report.Summary.UsedMemoryPercent)
	md += fmt.Sprintf("| GPU 总数 | %d |\n", report.Summary.TotalGPUs)
	if report.Summary.TotalGPUs > 0 {
		md += fmt.Sprintf("| GPU 使用率 | %.1f%% |\n", report.Summary.UsedGPUPercent)
	}
	md += "\n"

	md += "## 建议\n\n"
	for _, rec := range report.Recommendations {
		md += fmt.Sprintf("- %s\n", rec)
	}
	md += "\n"

	md += "## 节点列表\n\n"
	md += "| 名称 | 角色 | 状态 | CPU | 内存 | GPU | 最后心跳 |\n"
	md += "|------|------|------|-----|------|-----|----------|\n"
	for _, node := range report.Nodes {
		gpuInfo := "-"
		if node.GPUCount > 0 {
			gpuInfo = fmt.Sprintf("%d x %s", node.GPUCount, node.GPUType)
		}
		md += fmt.Sprintf("| %s | %s | %s | %d核 (%.1f%%) | %.1fGB (%.1f%%) | %s | %s |\n",
			node.Name, node.Role, node.Status,
			node.CPUCores, node.CPUUsed,
			node.MemoryGB, node.MemoryUsedPercent,
			gpuInfo, node.LastSeen)
	}
	md += "\n"

	md += "## 服务列表\n\n"
	md += "| 名称 | 镜像 | 副本 | 状态 | 优先级 | GPU | 创建时间 |\n"
	md += "|------|------|------|------|--------|-----|----------|\n"
	for _, svc := range report.Services {
		gpuInfo := "否"
		if svc.GPURequired {
			gpuInfo = fmt.Sprintf("是 (%d)", svc.GPUCount)
		}
		md += fmt.Sprintf("| %s | %s | %d/%d | %s | %d | %s | %s |\n",
			svc.Name, svc.Image,
			svc.RunningReplicas, svc.Replicas,
			svc.Status, svc.Priority,
			gpuInfo, svc.CreatedAt)
	}

	return md
}
