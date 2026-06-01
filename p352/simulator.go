package main

import (
	"time"
)

type FlowGenerator struct {
	Flow          TrafficFlow
	NextFrameTime int64
	FrameCount    int
}

func NewFlowGenerator(flow TrafficFlow) *FlowGenerator {
	return &FlowGenerator{
		Flow:          flow,
		NextFrameTime: flow.StartTime,
		FrameCount:    0,
	}
}

func (fg *FlowGenerator) GenerateFrame(currentTime int64) *Frame {
	if currentTime < fg.NextFrameTime {
		return nil
	}

	fg.FrameCount++
	frame := &Frame{
		FrameID:     GenerateFrameID(),
		FlowID:      fg.Flow.FlowID,
		FlowType:    fg.Flow.FlowType,
		Size:        fg.Flow.FrameSize,
		EnqueueTime: currentTime,
		DequeueTime: 0,
		Priority:    fg.Flow.Priority,
		QueueID:     fg.Flow.Priority,
		Delay:       0,
	}

	fg.NextFrameTime += fg.Flow.Interval
	return frame
}

type Simulator struct {
	Config      *SimulationConfig
	Scheduler   *Scheduler
	Generators  []*FlowGenerator
	Frames      []Frame
	Dropped     int
	Transmitted int
	TimeStep    int64
}

func NewSimulator(config *SimulationConfig) *Simulator {
	generators := make([]*FlowGenerator, len(config.Flows))
	for i, flow := range config.Flows {
		generators[i] = NewFlowGenerator(flow)
	}

	return &Simulator{
		Config:      config,
		Scheduler:   NewScheduler(config),
		Generators:  generators,
		Frames:      make([]Frame, 0),
		Dropped:     0,
		Transmitted: 0,
		TimeStep:    config.TimeSlot,
	}
}

func (sim *Simulator) Run() *SimulationResult {
	var transmittingFrame *Frame
	var transmissionEndTime int64 = 0

	for sim.Scheduler.SimTime.Current < sim.Config.Duration {
		for _, gen := range sim.Generators {
			frame := gen.GenerateFrame(sim.Scheduler.SimTime.Current)
			if frame != nil {
				success := sim.Scheduler.EnqueueFrame(frame, frame.QueueID)
				if !success {
					sim.Dropped++
				}
			}
		}

		if transmittingFrame != nil && sim.Scheduler.SimTime.Current >= transmissionEndTime {
			transmittingFrame.DequeueTime = sim.Scheduler.SimTime.Current
			transmittingFrame.Delay = sim.Scheduler.SimTime.Current - transmittingFrame.EnqueueTime
			sim.Frames = append(sim.Frames, *transmittingFrame)
			sim.Transmitted++
			transmittingFrame = nil
		}

		if transmittingFrame == nil {
			frame := sim.Scheduler.GetTransmittableFrame()
			if frame != nil {
				transmittingFrame = frame
				transmissionEndTime = sim.Scheduler.SimTime.Current + TransmissionTime(frame.Size, sim.Config.PortBandwidth)
			}
		}

		sim.Scheduler.Step(sim.TimeStep)
	}

	if transmittingFrame != nil {
		transmittingFrame.DequeueTime = transmissionEndTime
		transmittingFrame.Delay = transmissionEndTime - transmittingFrame.EnqueueTime
		sim.Frames = append(sim.Frames, *transmittingFrame)
		sim.Transmitted++
	}

	return sim.buildResult()
}

func (sim *Simulator) buildResult() *SimulationResult {
	totalDelay := int64(0)
	maxDelay := int64(0)

	for _, frame := range sim.Frames {
		totalDelay += frame.Delay
		if frame.Delay > maxDelay {
			maxDelay = frame.Delay
		}
	}

	avgDelay := 0.0
	if len(sim.Frames) > 0 {
		avgDelay = float64(totalDelay) / float64(len(sim.Frames))
	}

	queueStats := sim.Scheduler.GetQueueStats()
	enqueuedPerQueue := make(map[int]int)
	dequeuedPerQueue := make(map[int]int)

	for _, frame := range sim.Frames {
		dequeuedPerQueue[frame.QueueID]++
	}

	for i, gen := range sim.Generators {
		queueID := sim.Config.Flows[i].Priority
		enqueuedPerQueue[queueID] += gen.FrameCount
	}

	for i := range queueStats {
		qid := queueStats[i].QueueID
		queueStats[i].Enqueued = enqueuedPerQueue[qid]
		queueStats[i].Dequeued = dequeuedPerQueue[qid]
		queueStats[i].Dropped = enqueuedPerQueue[qid] - dequeuedPerQueue[qid]
	}

	return &SimulationResult{
		TotalFrames: sim.Transmitted + sim.Dropped,
		Transmitted: sim.Transmitted,
		Dropped:     sim.Dropped,
		AvgDelay:    avgDelay,
		MaxDelay:    maxDelay,
		Frames:      sim.Frames,
		GateEvents:  sim.Scheduler.GateEvents,
		QueueStats:  queueStats,
	}
}

func DefaultConfig() *SimulationConfig {
	ns := int64(time.Nanosecond)
	us := int64(time.Microsecond)
	ms := int64(time.Millisecond)

	maxFrameTxTime := int64(12000) * ns

	return &SimulationConfig{
		Duration:      10 * ms,
		TimeSlot:      1 * us,
		PortBandwidth: 1000,
		Queues: []QueueConfig{
			{
				QueueID:   3,
				Priority:  3,
				Bandwidth: 1000,
				GuardBand: maxFrameTxTime,
				GateControlList: []GateControlEntry{
					{Operation: GateOpen, TimeInterval: 250 * us},
					{Operation: GateClose, TimeInterval: 750 * us},
				},
			},
			{
				QueueID:   2,
				Priority:  2,
				Bandwidth: 1000,
				GuardBand: maxFrameTxTime,
				GateControlList: []GateControlEntry{
					{Operation: GateClose, TimeInterval: 250 * us},
					{Operation: GateOpen, TimeInterval: 250 * us},
					{Operation: GateClose, TimeInterval: 500 * us},
				},
			},
			{
				QueueID:   1,
				Priority:  1,
				Bandwidth: 1000,
				GuardBand: maxFrameTxTime,
				GateControlList: []GateControlEntry{
					{Operation: GateClose, TimeInterval: 500 * us},
					{Operation: GateOpen, TimeInterval: 250 * us},
					{Operation: GateClose, TimeInterval: 250 * us},
				},
			},
			{
				QueueID:   0,
				Priority:  0,
				Bandwidth: 1000,
				GuardBand: maxFrameTxTime,
				GateControlList: []GateControlEntry{
					{Operation: GateClose, TimeInterval: 750 * us},
					{Operation: GateOpen, TimeInterval: 250 * us},
				},
			},
		},
		Flows: []TrafficFlow{
			{
				FlowID:    "avb-camera-1",
				FlowType:  "AVB-Class-A",
				SourceIP:  "192.168.1.10",
				DestIP:    "192.168.1.100",
				FrameSize: 1500,
				Interval:  125 * us,
				Priority:  3,
				StartTime: 0,
			},
			{
				FlowID:    "avb-audio-1",
				FlowType:  "AVB-Class-B",
				SourceIP:  "192.168.1.11",
				DestIP:    "192.168.1.100",
				FrameSize: 256,
				Interval:  250 * us,
				Priority:  2,
				StartTime: 0,
			},
			{
				FlowID:    "control-1",
				FlowType:  "Control",
				SourceIP:  "192.168.1.12",
				DestIP:    "192.168.1.100",
				FrameSize: 64,
				Interval:  1 * ms,
				Priority:  1,
				StartTime: 0,
			},
			{
				FlowID:    "best-effort-1",
				FlowType:  "Best-Effort",
				SourceIP:  "192.168.1.13",
				DestIP:    "192.168.1.100",
				FrameSize: 1500,
				Interval:  500 * us,
				Priority:  0,
				StartTime: 0,
			},
		},
	}
}
