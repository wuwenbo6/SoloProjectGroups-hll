package models

import "time"

type Vnfd struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Type             string   `json:"type"`
	Description      string   `json:"description"`
	DefaultCpu       int      `json:"defaultCpu"`
	DefaultMemory    int      `json:"defaultMemory"`
	DefaultBandwidth int      `json:"defaultBandwidth"`
	Icon             string   `json:"icon"`
	DependsOn        []string `json:"dependsOn,omitempty"`
}

type VnfInstance struct {
	ID           string    `json:"id"`
	VnfdID       string    `json:"vnfdId"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	Status       string    `json:"status"`
	Cpu          int       `json:"cpu"`
	Memory       int       `json:"memory"`
	Bandwidth    int       `json:"bandwidth"`
	ReplicaCount int       `json:"replicaCount"`
	PositionX    float64   `json:"positionX"`
	PositionY    float64   `json:"positionY"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	DependsOn    []string  `json:"dependsOn,omitempty"`
}

type RouteEntry struct {
	DestinationCIDR string `json:"destinationCidr"`
	NextHopIP       string `json:"nextHopIp"`
	InterfaceName   string `json:"interfaceName"`
	Metric          int    `json:"metric"`
	Protocol        string `json:"protocol"`
}

type RouteTable struct {
	VnfID       string       `json:"vnfId"`
	Entries     []RouteEntry `json:"entries"`
	Version     int          `json:"version"`
	LastUpdated time.Time    `json:"lastUpdated"`
}

type VirtualLink struct {
	ID        string `json:"id"`
	SourceID  string `json:"sourceId"`
	TargetID  string `json:"targetId"`
	Bandwidth int    `json:"bandwidth"`
	Status    string `json:"status"`
	Latency   int    `json:"latency"`
}

type Event struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	VnfID     string    `json:"vnfId,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type Stats struct {
	TotalVnfs      int `json:"totalVnfs"`
	RunningVnfs    int `json:"runningVnfs"`
	StoppedVnfs    int `json:"stoppedVnfs"`
	ErrorVnfs      int `json:"errorVnfs"`
	TotalCpu       int `json:"totalCpu"`
	TotalMemory    int `json:"totalMemory"`
	TotalBandwidth int `json:"totalBandwidth"`
}

type InstantiateRequest struct {
	VnfdID       string   `json:"vnfdId"`
	Name         string   `json:"name"`
	Cpu          int      `json:"cpu,omitempty"`
	Memory       int      `json:"memory,omitempty"`
	Bandwidth    int      `json:"bandwidth,omitempty"`
	ReplicaCount int      `json:"replicaCount,omitempty"`
	PositionX    float64  `json:"positionX"`
	PositionY    float64  `json:"positionY"`
	DependsOn    []string `json:"dependsOn,omitempty"`
}

type BatchInstantiateRequest struct {
	Vnfs []InstantiateRequest `json:"vnfs"`
}

type ScaleRequest struct {
	ReplicaCount int `json:"replicaCount"`
	Cpu          int `json:"cpu,omitempty"`
	Memory       int `json:"memory,omitempty"`
	Bandwidth    int `json:"bandwidth,omitempty"`
}

type CreateLinkRequest struct {
	SourceID  string `json:"sourceId"`
	TargetID  string `json:"targetId"`
	Bandwidth int    `json:"bandwidth"`
}

type TopologySortResult struct {
	Order        []string          `json:"order"`
	Dependencies map[string]string `json:"dependencies"`
}

type UpdateRouteRequest struct {
	Entries []RouteEntry `json:"entries"`
}

type AutoScalingConfig struct {
	VnfID              string    `json:"vnfId"`
	MinReplicas        int       `json:"minReplicas"`
	MaxReplicas        int       `json:"maxReplicas"`
	ScaleUpThreshold   int       `json:"scaleUpThreshold"`
	ScaleDownThreshold int       `json:"scaleDownThreshold"`
	CooldownSeconds    int       `json:"cooldownSeconds"`
	Enabled            bool      `json:"enabled"`
	LastScalingAt      time.Time `json:"lastScalingAt"`
}

type VnfMetrics struct {
	VnfID         string  `json:"vnfId"`
	CpuUsage      float64 `json:"cpuUsage"`
	MemoryUsage   float64 `json:"memoryUsage"`
	NetworkIn     float64 `json:"networkIn"`
	NetworkOut    float64 `json:"networkOut"`
	Timestamp     time.Time `json:"timestamp"`
}

type AutoScalingConfigRequest struct {
	MinReplicas        *int `json:"minReplicas,omitempty"`
	MaxReplicas        *int `json:"maxReplicas,omitempty"`
	ScaleUpThreshold   *int `json:"scaleUpThreshold,omitempty"`
	ScaleDownThreshold *int `json:"scaleDownThreshold,omitempty"`
	CooldownSeconds    *int `json:"cooldownSeconds,omitempty"`
	Enabled            *bool `json:"enabled,omitempty"`
}
