package models

import (
	"time"

	"gorm.io/gorm"
)

type Node struct {
	ID              string `gorm:"primaryKey"`
	Name            string
	Hostname        string
	IPAddress       string
	Role            string
	Status          string
	CPUCores        int
	MemoryMB        int64
	CPUUsed         float64
	MemoryUsed      int64
	GPUCount        int
	GPUType         string
	GPUUsed         float64
	GPUMemoryUsed   int64
	GPUMemoryTotal  int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
	LastSeen        time.Time
	FailoverAt      *time.Time
	FailoverHandled bool
	Labels          map[string]string `gorm:"serializer:json"`
}

type NodeHistory struct {
	ID            uint `gorm:"primaryKey"`
	NodeID        string
	Status        string
	CPUUsed       float64
	MemoryUsed    int64
	GPUUsed       float64
	GPUMemoryUsed int64
	Timestamp     time.Time
}

type Service struct {
	ID              string `gorm:"primaryKey"`
	Name            string
	Image           string
	Replicas        int
	RunningReplicas int
	Status          string
	NodeID          string
	Priority        int
	GPURequired     bool
	GPUCount        int
	GPUMemory       int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Labels          map[string]string `gorm:"serializer:json"`
	Env             []string          `gorm:"serializer:json"`
	Ports           []PortMapping     `gorm:"serializer:json"`
}

type PortMapping struct {
	HostPort      int
	ContainerPort int
	Protocol      string
}

type DeploymentHistory struct {
	ID         uint `gorm:"primaryKey"`
	ServiceID  string
	ServiceName string
	Action     string
	Status     string
	NodeID     string
	Message    string
	Timestamp  time.Time
}

func MigrateDB(db *gorm.DB) error {
	return db.AutoMigrate(&Node{}, &NodeHistory{}, &Service{}, &DeploymentHistory{})
}
