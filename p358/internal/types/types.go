package types

import "sync"

type Partition struct {
	ID     int32  `json:"id"`
	Topic  string `json:"topic"`
	Leader int32  `json:"leader"`
}

type Consumer struct {
	ID       string             `json:"id"`
	GroupID  string             `json:"groupId"`
	MemberID string             `json:"memberId"`
	Topics   []string           `json:"topics"`
	Assigned map[string][]int32 `json:"assigned"`
	JoinedAt int64              `json:"joinedAt"`
}

type ConsumerGroup struct {
	ID              string               `json:"id"`
	State           string               `json:"state"`
	Consumers       map[string]*Consumer `json:"consumers"`
	Topics          []string             `json:"topics"`
	Protocol        string               `json:"protocol"`
	Generation      int32                `json:"generation"`
	RebalanceCount  int64                `json:"rebalanceCount"`
	LastRebalanceAt int64                `json:"lastRebalanceAt"`
	mu              sync.RWMutex
}

type Assignment struct {
	ConsumerID string             `json:"consumerId"`
	MemberID   string             `json:"memberId"`
	Topics     map[string][]int32 `json:"topics"`
}

type PartitionMovement struct {
	Topic        string `json:"topic"`
	Partition    int32  `json:"partition"`
	FromConsumer string `json:"fromConsumer"`
	ToConsumer   string `json:"toConsumer"`
}

type RebalanceEvent struct {
	Timestamp     int64               `json:"timestamp"`
	GroupID       string              `json:"groupId"`
	EventType     string              `json:"eventType"`
	Generation    int32               `json:"generation"`
	Reason        string              `json:"reason"`
	Assignments   []Assignment        `json:"assignments"`
	ConsumerIDs   []string            `json:"consumerIds"`
	IsIncremental bool                `json:"isIncremental"`
	BatchNum      int                 `json:"batchNum,omitempty"`
	TotalBatches  int                 `json:"totalBatches,omitempty"`
	Movements     []PartitionMovement `json:"movements,omitempty"`
}

type Topic struct {
	Name       string      `json:"name"`
	Partitions []Partition `json:"partitions"`
	CreatedAt  int64       `json:"createdAt"`
}

type Broker struct {
	ID   int32  `json:"id"`
	Host string `json:"host"`
	Port int    `json:"port"`
}

type CustomAssignor struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Script      string `json:"script"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
	IsBuiltIn   bool   `json:"isBuiltIn"`
}

type AssignorTestInput struct {
	Topics    map[string][]int32 `json:"topics"`
	Consumers []string           `json:"consumers"`
}

type AssignorTestResult struct {
	Success bool                          `json:"success"`
	Result  map[string]map[string][]int32 `json:"result,omitempty"`
	Error   string                        `json:"error,omitempty"`
}

type ExportRecord struct {
	Timestamp   int64               `json:"timestamp"`
	GroupID     string              `json:"groupId"`
	Generation  int32               `json:"generation"`
	Reason      string              `json:"reason"`
	Assignments []ExportAssignment  `json:"assignments"`
	Movements   []PartitionMovement `json:"movements,omitempty"`
}

type ExportAssignment struct {
	ConsumerID string             `json:"consumerId"`
	Topics     map[string][]int32 `json:"topics"`
}
