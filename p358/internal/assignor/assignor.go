package assignor

import (
	"fmt"
	"kafka-simulator/internal/types"
	"sort"
	"time"
)

type PartitionAssignor interface {
	Name() string
	Assign(topics map[string][]types.Partition, consumers []*types.Consumer) map[string]map[string][]int32
}

type CustomScriptAssignor struct {
	ID          string
	DisplayName string
	Script      string
	ExecuteFn   func(map[string][]types.Partition, []string) (map[string]map[string][]int32, error)
}

func (c *CustomScriptAssignor) Name() string {
	return c.ID
}

func (c *CustomScriptAssignor) Assign(topics map[string][]types.Partition, consumers []*types.Consumer) map[string]map[string][]int32 {
	consumerIDs := make([]string, len(consumers))
	for i, c := range consumers {
		consumerIDs[i] = c.ID
	}

	result, err := c.ExecuteFn(topics, consumerIDs)
	if err != nil {
		result = make(map[string]map[string][]int32)
		for _, c := range consumers {
			result[c.ID] = make(map[string][]int32)
		}
	}

	for cID := range result {
		for t := range result[cID] {
			sort.Slice(result[cID][t], func(i, j int) bool {
				return result[cID][t][i] < result[cID][t][j]
			})
		}
	}

	return result
}

type RangeAssignor struct{}

func NewRangeAssignor() *RangeAssignor {
	return &RangeAssignor{}
}

func (r *RangeAssignor) Name() string {
	return "range"
}

func (r *RangeAssignor) Assign(topics map[string][]types.Partition, consumers []*types.Consumer) map[string]map[string][]int32 {
	result := make(map[string]map[string][]int32)
	for _, c := range consumers {
		result[c.ID] = make(map[string][]int32)
	}

	sort.Slice(consumers, func(i, j int) bool {
		return consumers[i].ID < consumers[j].ID
	})

	for topicName, partitions := range topics {
		if len(partitions) == 0 || len(consumers) == 0 {
			continue
		}

		topicConsumers := make([]*types.Consumer, 0)
		for _, c := range consumers {
			for _, t := range c.Topics {
				if t == topicName {
					topicConsumers = append(topicConsumers, c)
					break
				}
			}
		}

		if len(topicConsumers) == 0 {
			continue
		}

		sort.Slice(topicConsumers, func(i, j int) bool {
			return topicConsumers[i].ID < topicConsumers[j].ID
		})

		sort.Slice(partitions, func(i, j int) bool {
			return partitions[i].ID < partitions[j].ID
		})

		numPartitions := len(partitions)
		numConsumers := len(topicConsumers)
		basePartitions := numPartitions / numConsumers
		extraPartitions := numPartitions % numConsumers

		current := 0
		for i, consumer := range topicConsumers {
			numToAssign := basePartitions
			if i < extraPartitions {
				numToAssign++
			}

			if numToAssign > 0 && current < numPartitions {
				end := current + numToAssign
				if end > numPartitions {
					end = numPartitions
				}
				for p := current; p < end; p++ {
					result[consumer.ID][topicName] = append(result[consumer.ID][topicName], partitions[p].ID)
				}
				current = end
			}
		}
	}

	return result
}

type RoundRobinAssignor struct{}

func NewRoundRobinAssignor() *RoundRobinAssignor {
	return &RoundRobinAssignor{}
}

func (r *RoundRobinAssignor) Name() string {
	return "roundrobin"
}

func (r *RoundRobinAssignor) Assign(topics map[string][]types.Partition, consumers []*types.Consumer) map[string]map[string][]int32 {
	result := make(map[string]map[string][]int32)
	for _, c := range consumers {
		result[c.ID] = make(map[string][]int32)
	}

	allPartitions := make([]struct {
		Topic     string
		Partition int32
	}, 0)
	topicList := make([]string, 0, len(topics))
	for t := range topics {
		topicList = append(topicList, t)
	}
	sort.Strings(topicList)

	for _, topicName := range topicList {
		partitions := topics[topicName]
		sort.Slice(partitions, func(i, j int) bool {
			return partitions[i].ID < partitions[j].ID
		})
		for _, p := range partitions {
			allPartitions = append(allPartitions, struct {
				Topic     string
				Partition int32
			}{
				Topic:     topicName,
				Partition: p.ID,
			})
		}
	}

	sort.Slice(consumers, func(i, j int) bool {
		return consumers[i].ID < consumers[j].ID
	})

	for i, tp := range allPartitions {
		consumerIdx := i % len(consumers)
		consumer := consumers[consumerIdx]

		topicSubscribed := false
		for _, t := range consumer.Topics {
			if t == tp.Topic {
				topicSubscribed = true
				break
			}
		}

		if topicSubscribed {
			result[consumer.ID][tp.Topic] = append(result[consumer.ID][tp.Topic], tp.Partition)
		} else {
			for j := 1; j < len(consumers); j++ {
				altIdx := (consumerIdx + j) % len(consumers)
				altConsumer := consumers[altIdx]
				for _, t := range altConsumer.Topics {
					if t == tp.Topic {
						result[altConsumer.ID][tp.Topic] = append(result[altConsumer.ID][tp.Topic], tp.Partition)
						break
					}
				}
			}
		}
	}

	for consumerID := range result {
		for topicName := range result[consumerID] {
			sort.Slice(result[consumerID][topicName], func(i, j int) bool {
				return result[consumerID][topicName][i] < result[consumerID][topicName][j]
			})
		}
	}

	return result
}

type IncrementalAssignment struct {
	Assignments   map[string]map[string][]int32
	Revoked       map[string]map[string][]int32
	NewlyAssigned map[string]map[string][]int32
	Movements     []types.PartitionMovement
}

type CooperativeStickyAssignor struct{}

func NewCooperativeStickyAssignor() *CooperativeStickyAssignor {
	return &CooperativeStickyAssignor{}
}

func (a *CooperativeStickyAssignor) Name() string {
	return "cooperative-sticky"
}

func (a *CooperativeStickyAssignor) Assign(topics map[string][]types.Partition, consumers []*types.Consumer) map[string]map[string][]int32 {
	result := a.ComputeIncrementalAssignment(topics, consumers).Assignments
	return result
}

func (a *CooperativeStickyAssignor) ComputeIncrementalAssignment(
	topics map[string][]types.Partition,
	consumers []*types.Consumer,
) *IncrementalAssignment {
	sort.Slice(consumers, func(i, j int) bool {
		return consumers[i].ID < consumers[j].ID
	})

	topicConsumerMap := make(map[string][]*types.Consumer)
	for _, c := range consumers {
		for _, t := range c.Topics {
			if _, ok := topics[t]; ok {
				topicConsumerMap[t] = append(topicConsumerMap[t], c)
			}
		}
	}

	prevOwnership := make(map[string]string)
	for _, c := range consumers {
		for topic, partitions := range c.Assigned {
			for _, p := range partitions {
				key := fmt.Sprintf("%s-%d", topic, p)
				prevOwnership[key] = c.ID
			}
		}
	}

	targetAssignment := make(map[string]map[string][]int32)
	for _, c := range consumers {
		targetAssignment[c.ID] = make(map[string][]int32)
	}

	revoked := make(map[string]map[string][]int32)
	newlyAssigned := make(map[string]map[string][]int32)
	var movements []types.PartitionMovement

	for topicName, partitions := range topics {
		topicConsumers := topicConsumerMap[topicName]
		if len(topicConsumers) == 0 {
			continue
		}

		sort.Slice(topicConsumers, func(i, j int) bool {
			return topicConsumers[i].ID < topicConsumers[j].ID
		})

		sort.Slice(partitions, func(i, j int) bool {
			return partitions[i].ID < partitions[j].ID
		})

		numPartitions := len(partitions)
		numConsumers := len(topicConsumers)
		basePartitions := numPartitions / numConsumers
		extraPartitions := numPartitions % numConsumers

		targetCounts := make(map[string]int)
		for i, c := range topicConsumers {
			count := basePartitions
			if i < extraPartitions {
				count++
			}
			targetCounts[c.ID] = count
		}

		currentCounts := make(map[string]int)
		partitionToConsumer := make(map[int32]string)
		unassignedPartitions := make([]int32, 0)

		for _, p := range partitions {
			key := fmt.Sprintf("%s-%d", topicName, p.ID)
			if prevOwner, ok := prevOwnership[key]; ok {
				if _, ok := targetCounts[prevOwner]; ok && currentCounts[prevOwner] < targetCounts[prevOwner] {
					targetAssignment[prevOwner][topicName] = append(targetAssignment[prevOwner][topicName], p.ID)
					partitionToConsumer[p.ID] = prevOwner
					currentCounts[prevOwner]++
				} else {
					unassignedPartitions = append(unassignedPartitions, p.ID)
					if _, ok := targetCounts[prevOwner]; ok {
						if revoked[prevOwner] == nil {
							revoked[prevOwner] = make(map[string][]int32)
						}
						revoked[prevOwner][topicName] = append(revoked[prevOwner][topicName], p.ID)
					}
				}
			} else {
				unassignedPartitions = append(unassignedPartitions, p.ID)
			}
		}

		sort.Slice(unassignedPartitions, func(i, j int) bool {
			return unassignedPartitions[i] < unassignedPartitions[j]
		})

		consumerQueue := make([]*types.Consumer, len(topicConsumers))
		copy(consumerQueue, topicConsumers)

		for _, p := range unassignedPartitions {
			for i, c := range consumerQueue {
				if currentCounts[c.ID] < targetCounts[c.ID] {
					targetAssignment[c.ID][topicName] = append(targetAssignment[c.ID][topicName], p)
					partitionToConsumer[p] = c.ID
					currentCounts[c.ID]++

					if newlyAssigned[c.ID] == nil {
						newlyAssigned[c.ID] = make(map[string][]int32)
					}
					newlyAssigned[c.ID][topicName] = append(newlyAssigned[c.ID][topicName], p)

					prevOwner := prevOwnership[fmt.Sprintf("%s-%d", topicName, p)]
					if prevOwner != "" && prevOwner != c.ID {
						movements = append(movements, types.PartitionMovement{
							Topic:        topicName,
							Partition:    p,
							FromConsumer: prevOwner,
							ToConsumer:   c.ID,
						})
					}

					consumerQueue = append(consumerQueue[:i], consumerQueue[i+1:]...)
					consumerQueue = append(consumerQueue, c)
					break
				}
			}
		}

		for _, parts := range targetAssignment {
			sort.Slice(parts[topicName], func(i, j int) bool {
				return parts[topicName][i] < parts[topicName][j]
			})
		}
	}

	return &IncrementalAssignment{
		Assignments:   targetAssignment,
		Revoked:       revoked,
		NewlyAssigned: newlyAssigned,
		Movements:     movements,
	}
}

func (a *CooperativeStickyAssignor) ComputeBatchedRebalance(
	topics map[string][]types.Partition,
	consumers []*types.Consumer,
	batchSize int,
) []*IncrementalAssignment {
	result := make([]*IncrementalAssignment, 0)
	ia := a.ComputeIncrementalAssignment(topics, consumers)

	totalMovements := len(ia.Movements)
	if totalMovements == 0 {
		result = append(result, ia)
		return result
	}

	numBatches := (totalMovements + batchSize - 1) / batchSize
	if numBatches <= 1 {
		result = append(result, ia)
		return result
	}

	sort.Slice(ia.Movements, func(i, j int) bool {
		if ia.Movements[i].Topic != ia.Movements[j].Topic {
			return ia.Movements[i].Topic < ia.Movements[j].Topic
		}
		return ia.Movements[i].Partition < ia.Movements[j].Partition
	})

	for batch := 0; batch < numBatches; batch++ {
		start := batch * batchSize
		end := start + batchSize
		if end > totalMovements {
			end = totalMovements
		}

		batchMovements := ia.Movements[start:end]

		batchRevoked := make(map[string]map[string][]int32)
		batchNewlyAssigned := make(map[string]map[string][]int32)

		partialAssignment := make(map[string]map[string][]int32)
		for cID, topics := range ia.Assignments {
			partialAssignment[cID] = make(map[string][]int32)
			for t, ps := range topics {
				partialAssignment[cID][t] = make([]int32, len(ps))
				copy(partialAssignment[cID][t], ps)
			}
		}

		for _, m := range batchMovements {
			if batchRevoked[m.FromConsumer] == nil {
				batchRevoked[m.FromConsumer] = make(map[string][]int32)
			}
			batchRevoked[m.FromConsumer][m.Topic] = append(batchRevoked[m.FromConsumer][m.Topic], m.Partition)

			if batchNewlyAssigned[m.ToConsumer] == nil {
				batchNewlyAssigned[m.ToConsumer] = make(map[string][]int32)
			}
			batchNewlyAssigned[m.ToConsumer][m.Topic] = append(batchNewlyAssigned[m.ToConsumer][m.Topic], m.Partition)
		}

		result = append(result, &IncrementalAssignment{
			Assignments:   partialAssignment,
			Revoked:       batchRevoked,
			NewlyAssigned: batchNewlyAssigned,
			Movements:     batchMovements,
		})
	}

	return result
}

func (a *CooperativeStickyAssignor) GenerateBatchedEvents(
	groupID string,
	topics map[string][]types.Partition,
	consumers []*types.Consumer,
	reason string,
	generation int32,
	batchSize int,
) []types.RebalanceEvent {
	batches := a.ComputeBatchedRebalance(topics, consumers, batchSize)
	events := make([]types.RebalanceEvent, 0, len(batches))

	consumerIDs := make([]string, 0, len(consumers))
	for _, c := range consumers {
		consumerIDs = append(consumerIDs, c.ID)
	}
	sort.Strings(consumerIDs)

	for i, batch := range batches {
		assignments := make([]types.Assignment, 0, len(batch.Assignments))
		for cID, topics := range batch.Assignments {
			assignments = append(assignments, types.Assignment{
				ConsumerID: cID,
				Topics:     topics,
			})
		}
		sort.Slice(assignments, func(i, j int) bool {
			return assignments[i].ConsumerID < assignments[j].ConsumerID
		})

		batchReason := fmt.Sprintf("%s (批次 %d/%d)", reason, i+1, len(batches))
		if len(batches) == 1 {
			batchReason = reason
		}

		events = append(events, types.RebalanceEvent{
			Timestamp:     time.Now().Unix(),
			GroupID:       groupID,
			EventType:     "rebalance",
			Generation:    generation,
			Reason:        batchReason,
			Assignments:   assignments,
			ConsumerIDs:   consumerIDs,
			IsIncremental: true,
			BatchNum:      i + 1,
			TotalBatches:  len(batches),
			Movements:     batch.Movements,
		})

		if i < len(batches)-1 {
			time.Sleep(150 * time.Millisecond)
		}
	}

	return events
}
