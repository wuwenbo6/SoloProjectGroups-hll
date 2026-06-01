package group

import (
	"encoding/json"
	"fmt"
	"kafka-simulator/internal/assignor"
	"kafka-simulator/internal/custom"
	"kafka-simulator/internal/types"
	"sort"
	"strconv"
	"sync"
	"time"
)

type GroupManager struct {
	groups          map[string]*types.ConsumerGroup
	topics          map[string]*types.Topic
	brokers         []types.Broker
	assignors       map[string]assignor.PartitionAssignor
	events          []types.RebalanceEvent
	customAssignors *custom.Manager
	mu              sync.RWMutex
	maxEvents       int
}

func NewGroupManager() *GroupManager {
	customMgr := custom.NewManager()
	gm := &GroupManager{
		groups:          make(map[string]*types.ConsumerGroup),
		topics:          make(map[string]*types.Topic),
		brokers:         make([]types.Broker, 0),
		assignors:       make(map[string]assignor.PartitionAssignor),
		events:          make([]types.RebalanceEvent, 0),
		customAssignors: customMgr,
		maxEvents:       100,
	}

	gm.assignors["range"] = assignor.NewRangeAssignor()
	gm.assignors["roundrobin"] = assignor.NewRoundRobinAssignor()
	gm.assignors["cooperative-sticky"] = assignor.NewCooperativeStickyAssignor()

	for _, ca := range customMgr.List() {
		if fn, err := customMgr.GetAsAssignor(ca.ID); err == nil {
			gm.assignors[ca.ID] = &assignor.CustomScriptAssignor{
				ID:          ca.ID,
				DisplayName: ca.Name,
				Script:      ca.Script,
				ExecuteFn:   fn,
			}
		}
	}

	gm.initDefaultData()

	return gm
}

func (gm *GroupManager) CustomAssignors() *custom.Manager {
	return gm.customAssignors
}

func (gm *GroupManager) RefreshCustomAssignor(id string) error {
	ca, err := gm.customAssignors.Get(id)
	if err != nil {
		return err
	}
	fn, err := gm.customAssignors.GetAsAssignor(id)
	if err != nil {
		return err
	}
	gm.mu.Lock()
	defer gm.mu.Unlock()
	gm.assignors[id] = &assignor.CustomScriptAssignor{
		ID:          ca.ID,
		DisplayName: ca.Name,
		Script:      ca.Script,
		ExecuteFn:   fn,
	}
	return nil
}

func (gm *GroupManager) RemoveCustomAssignor(id string) {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	delete(gm.assignors, id)
}

func (gm *GroupManager) initDefaultData() {
	gm.brokers = []types.Broker{
		{ID: 0, Host: "localhost", Port: 9092},
		{ID: 1, Host: "localhost", Port: 9093},
		{ID: 2, Host: "localhost", Port: 9094},
	}

	gm.CreateTopic("orders", 6)
	gm.CreateTopic("payments", 4)
	gm.CreateTopic("notifications", 3)

	gm.CreateGroup("order-group", "range", []string{"orders"})
	gm.CreateGroup("payment-group", "roundrobin", []string{"payments", "notifications"})
	gm.CreateGroup("realtime-group", "cooperative-sticky", []string{"orders", "payments", "notifications"})
}

func (gm *GroupManager) CreateTopic(name string, partitions int32) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if _, exists := gm.topics[name]; exists {
		return fmt.Errorf("topic %s already exists", name)
	}

	topicPartitions := make([]types.Partition, partitions)
	for i := int32(0); i < partitions; i++ {
		topicPartitions[i] = types.Partition{
			ID:     i,
			Topic:  name,
			Leader: i % int32(len(gm.brokers)),
		}
	}

	gm.topics[name] = &types.Topic{
		Name:       name,
		Partitions: topicPartitions,
		CreatedAt:  time.Now().Unix(),
	}

	return nil
}

func (gm *GroupManager) DeleteTopic(name string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if _, exists := gm.topics[name]; !exists {
		return fmt.Errorf("topic %s not found", name)
	}

	delete(gm.topics, name)
	return nil
}

func (gm *GroupManager) GetTopics() map[string]*types.Topic {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	result := make(map[string]*types.Topic)
	for k, v := range gm.topics {
		result[k] = v
	}
	return result
}

func (gm *GroupManager) CreateGroup(groupID, protocol string, topics []string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if _, exists := gm.groups[groupID]; exists {
		return fmt.Errorf("group %s already exists", groupID)
	}

	if _, exists := gm.assignors[protocol]; !exists {
		return fmt.Errorf("unsupported protocol: %s", protocol)
	}

	gm.groups[groupID] = &types.ConsumerGroup{
		ID:         groupID,
		State:      "Empty",
		Consumers:  make(map[string]*types.Consumer),
		Topics:     topics,
		Protocol:   protocol,
		Generation: 0,
	}

	return nil
}

func (gm *GroupManager) DeleteGroup(groupID string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if _, exists := gm.groups[groupID]; !exists {
		return fmt.Errorf("group %s not found", groupID)
	}

	delete(gm.groups, groupID)
	return nil
}

func (gm *GroupManager) GetGroups() map[string]*types.ConsumerGroup {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	result := make(map[string]*types.ConsumerGroup)
	for k, v := range gm.groups {
		result[k] = v
	}
	return result
}

func (gm *GroupManager) GetGroup(groupID string) (*types.ConsumerGroup, error) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	group, exists := gm.groups[groupID]
	if !exists {
		return nil, fmt.Errorf("group %s not found", groupID)
	}
	return group, nil
}

func (gm *GroupManager) AddConsumer(groupID, consumerID string, topics []string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	group, exists := gm.groups[groupID]
	if !exists {
		return fmt.Errorf("group %s not found", groupID)
	}

	if _, exists := group.Consumers[consumerID]; exists {
		return fmt.Errorf("consumer %s already exists in group %s", consumerID, groupID)
	}

	consumerTopics := topics
	if len(consumerTopics) == 0 {
		consumerTopics = group.Topics
	}

	group.Consumers[consumerID] = &types.Consumer{
		ID:       consumerID,
		GroupID:  groupID,
		MemberID: fmt.Sprintf("%s-%d", consumerID, time.Now().UnixNano()),
		Topics:   consumerTopics,
		Assigned: make(map[string][]int32),
		JoinedAt: time.Now().Unix(),
	}

	group.State = "PreparingRebalance"

	go gm.triggerRebalance(groupID, fmt.Sprintf("Consumer %s joined", consumerID))

	return nil
}

func (gm *GroupManager) RemoveConsumer(groupID, consumerID string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	group, exists := gm.groups[groupID]
	if !exists {
		return fmt.Errorf("group %s not found", groupID)
	}

	if _, exists := group.Consumers[consumerID]; !exists {
		return fmt.Errorf("consumer %s not found in group %s", consumerID, groupID)
	}

	delete(group.Consumers, consumerID)

	if len(group.Consumers) == 0 {
		group.State = "Empty"
	} else {
		group.State = "PreparingRebalance"
	}

	go gm.triggerRebalance(groupID, fmt.Sprintf("Consumer %s left", consumerID))

	return nil
}

func (gm *GroupManager) triggerRebalance(groupID, reason string) {
	time.Sleep(100 * time.Millisecond)

	gm.mu.Lock()
	defer gm.mu.Unlock()

	group, exists := gm.groups[groupID]
	if !exists {
		return
	}

	group.Generation++
	group.RebalanceCount++
	group.LastRebalanceAt = time.Now().Unix()
	group.State = "Rebalancing"

	time.Sleep(50 * time.Millisecond)

	assignorImpl, exists := gm.assignors[group.Protocol]
	if !exists {
		group.State = "Stable"
		return
	}

	consumers := make([]*types.Consumer, 0, len(group.Consumers))
	for _, c := range group.Consumers {
		consumers = append(consumers, c)
	}

	topicPartitions := make(map[string][]types.Partition)
	for _, topicName := range group.Topics {
		if topic, ok := gm.topics[topicName]; ok {
			topicPartitions[topicName] = topic.Partitions
		}
	}

	if stickyAssignor, ok := assignorImpl.(*assignor.CooperativeStickyAssignor); ok {
		batchSize := 2
		events := stickyAssignor.GenerateBatchedEvents(
			groupID,
			topicPartitions,
			consumers,
			reason,
			group.Generation,
			batchSize,
		)

		for i, event := range events {
			for _, a := range event.Assignments {
				if consumer, ok := group.Consumers[a.ConsumerID]; ok {
					consumer.Assigned = a.Topics
				}
			}

			gm.events = append(gm.events, event)
			if len(gm.events) > gm.maxEvents {
				gm.events = gm.events[len(gm.events)-gm.maxEvents:]
			}

			if i < len(events)-1 {
				gm.mu.Unlock()
				time.Sleep(200 * time.Millisecond)
				gm.mu.Lock()
			}
		}
	} else {
		assignments := assignorImpl.Assign(topicPartitions, consumers)

		for consumerID, topicAssignments := range assignments {
			if consumer, ok := group.Consumers[consumerID]; ok {
				consumer.Assigned = topicAssignments
			}
		}

		eventAssignments := make([]types.Assignment, 0, len(assignments))
		consumerIDs := make([]string, 0, len(consumers))
		for consumerID, topicAssignments := range assignments {
			eventAssignments = append(eventAssignments, types.Assignment{
				ConsumerID: consumerID,
				Topics:     topicAssignments,
			})
			consumerIDs = append(consumerIDs, consumerID)
		}

		event := types.RebalanceEvent{
			Timestamp:   time.Now().Unix(),
			GroupID:     groupID,
			EventType:   "rebalance",
			Generation:  group.Generation,
			Reason:      reason,
			Assignments: eventAssignments,
			ConsumerIDs: consumerIDs,
		}

		gm.events = append(gm.events, event)
		if len(gm.events) > gm.maxEvents {
			gm.events = gm.events[len(gm.events)-gm.maxEvents:]
		}
	}

	group.State = "Stable"
}

func (gm *GroupManager) GetRebalanceEvents() []types.RebalanceEvent {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	result := make([]types.RebalanceEvent, len(gm.events))
	copy(result, gm.events)
	return result
}

func (gm *GroupManager) GetBrokers() []types.Broker {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	result := make([]types.Broker, len(gm.brokers))
	copy(result, gm.brokers)
	return result
}

func (gm *GroupManager) GetAssignors() []string {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	result := make([]string, 0, len(gm.assignors))
	for name := range gm.assignors {
		result = append(result, name)
	}
	return result
}

func (gm *GroupManager) ExportHistoryJSON(groupID string) ([]byte, error) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	var records []types.ExportRecord
	for _, event := range gm.events {
		if groupID != "" && event.GroupID != groupID {
			continue
		}

		ea := make([]types.ExportAssignment, len(event.Assignments))
		for i, a := range event.Assignments {
			ea[i] = types.ExportAssignment{
				ConsumerID: a.ConsumerID,
				Topics:     a.Topics,
			}
		}

		records = append(records, types.ExportRecord{
			Timestamp:   event.Timestamp,
			GroupID:     event.GroupID,
			Generation:  event.Generation,
			Reason:      event.Reason,
			Assignments: ea,
			Movements:   event.Movements,
		})
	}

	return json.MarshalIndent(map[string]interface{}{
		"version":     "1.0",
		"exportedAt":  time.Now().Unix(),
		"groupFilter": groupID,
		"records":     records,
	}, "", "  ")
}

func (gm *GroupManager) ExportHistoryCSV(groupID string) ([][]string, error) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	var records [][]string
	header := []string{"Timestamp", "GroupID", "Generation", "Reason", "ConsumerID", "Topic", "Partitions"}
	records = append(records, header)

	for _, event := range gm.events {
		if groupID != "" && event.GroupID != groupID {
			continue
		}

		ts := time.Unix(event.Timestamp, 0).Format(time.RFC3339)
		gen := strconv.Itoa(int(event.Generation))

		for _, a := range event.Assignments {
			topics := make([]string, 0, len(a.Topics))
			for t := range a.Topics {
				topics = append(topics, t)
			}
			sort.Strings(topics)

			for _, t := range topics {
				ps := a.Topics[t]
				partStr := ""
				for i, p := range ps {
					if i > 0 {
						partStr += ";"
					}
					partStr += strconv.Itoa(int(p))
				}
				records = append(records, []string{
					ts,
					event.GroupID,
					gen,
					event.Reason,
					a.ConsumerID,
					t,
					partStr,
				})
			}
		}
	}

	return records, nil
}
