package main

import (
	"container/list"
	"fmt"
	"sort"
	"sync"
	"time"
)

type Queue struct {
	QueueID         int
	Priority        int
	GateControlList []GateControlEntry
	GateState       GateState
	GCLIndex        int
	GCLTimeLeft     int64
	Bandwidth       float64
	GuardBand       int64
	Frames          *list.List
	CurrentBytes    int
	MaxBytes        int
	mu              sync.Mutex
}

func NewQueue(config QueueConfig) *Queue {
	maxBytes := int(config.Bandwidth * 1000000 * 0.01 / 8)
	firstEntry := config.GateControlList[0]
	return &Queue{
		QueueID:         config.QueueID,
		Priority:        config.Priority,
		GateControlList: config.GateControlList,
		GateState:       firstEntry.Operation,
		GCLIndex:        0,
		GCLTimeLeft:     firstEntry.TimeInterval,
		Bandwidth:       config.Bandwidth,
		GuardBand:       config.GuardBand,
		Frames:          list.New(),
		CurrentBytes:    0,
		MaxBytes:        maxBytes,
	}
}

func (q *Queue) Enqueue(frame *Frame) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.CurrentBytes+frame.Size > q.MaxBytes {
		return false
	}

	q.Frames.PushBack(frame)
	q.CurrentBytes += frame.Size
	return true
}

func (q *Queue) Dequeue() *Frame {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.Frames.Len() == 0 {
		return nil
	}

	front := q.Frames.Front()
	frame := front.Value.(*Frame)
	q.Frames.Remove(front)
	q.CurrentBytes -= frame.Size
	return frame
}

func (q *Queue) Depth() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.Frames.Len()
}

func (q *Queue) Peek() *Frame {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.Frames.Len() == 0 {
		return nil
	}
	return q.Frames.Front().Value.(*Frame)
}

func (q *Queue) CanTransmit(portBandwidth float64) bool {
	if q.GateState != GateOpen {
		return false
	}
	frame := q.Peek()
	if frame == nil {
		return false
	}
	txTime := TransmissionTime(frame.Size, portBandwidth)
	availableTime := q.GCLTimeLeft - q.GuardBand
	return availableTime >= txTime
}

func (q *Queue) UpdateGate(deltaTime int64) bool {
	q.GCLTimeLeft -= deltaTime
	changed := false

	for q.GCLTimeLeft <= 0 {
		prevState := q.GateState
		q.GCLIndex = (q.GCLIndex + 1) % len(q.GateControlList)
		entry := q.GateControlList[q.GCLIndex]
		q.GateState = entry.Operation
		q.GCLTimeLeft += entry.TimeInterval

		if prevState != q.GateState {
			changed = true
		}
	}

	return changed
}

type Scheduler struct {
	Queues        []*Queue
	PortBandwidth float64
	SimTime       *SimTime
	GateEvents    []GateEvent
	QueueDepths   [][]int
}

func NewScheduler(config *SimulationConfig) *Scheduler {
	queues := make([]*Queue, len(config.Queues))
	for i, qc := range config.Queues {
		queues[i] = NewQueue(qc)
	}

	sort.Slice(queues, func(i, j int) bool {
		return queues[i].Priority > queues[j].Priority
	})

	return &Scheduler{
		Queues:        queues,
		PortBandwidth: config.PortBandwidth,
		SimTime:       &SimTime{Current: 0},
		GateEvents:    make([]GateEvent, 0),
		QueueDepths:   make([][]int, len(queues)),
	}
}

func (s *Scheduler) Step(deltaTime int64) {
	s.SimTime.Tick(deltaTime)

	for i, q := range s.Queues {
		if q.UpdateGate(deltaTime) {
			s.GateEvents = append(s.GateEvents, GateEvent{
				Time:    s.SimTime.Current,
				QueueID: q.QueueID,
				State:   string(q.GateState),
			})
		}
		s.QueueDepths[i] = append(s.QueueDepths[i], q.Depth())
	}
}

func (s *Scheduler) GetTransmittableFrame() *Frame {
	for _, q := range s.Queues {
		if q.CanTransmit(s.PortBandwidth) {
			return q.Dequeue()
		}
	}
	return nil
}

func (s *Scheduler) EnqueueFrame(frame *Frame, queueID int) bool {
	for _, q := range s.Queues {
		if q.QueueID == queueID {
			return q.Enqueue(frame)
		}
	}
	return false
}

func (s *Scheduler) GetQueueStats() []QueueStat {
	stats := make([]QueueStat, len(s.Queues))
	for i, q := range s.Queues {
		stats[i].QueueID = q.QueueID
		maxDepth := 0
		totalDepth := 0
		for _, d := range s.QueueDepths[i] {
			totalDepth += d
			if d > maxDepth {
				maxDepth = d
			}
		}
		stats[i].MaxQueueDepth = maxDepth
		if len(s.QueueDepths[i]) > 0 {
			stats[i].AvgQueueDepth = float64(totalDepth) / float64(len(s.QueueDepths[i]))
		}
	}
	return stats
}

func (s *Scheduler) GetGateStates() map[int]string {
	states := make(map[int]string)
	for _, q := range s.Queues {
		states[q.QueueID] = string(q.GateState)
	}
	return states
}

func TransmissionTime(frameSize int, bandwidthMbps float64) int64 {
	bytes := float64(frameSize)
	bits := bytes * 8
	bandwidthBps := bandwidthMbps * 1000000
	timeSec := bits / bandwidthBps
	return int64(timeSec * float64(time.Second))
}

func GenerateFrameID() string {
	return fmt.Sprintf("frame-%d", time.Now().UnixNano())
}
