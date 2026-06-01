package main

import (
	"fmt"
	"math/rand"
	"time"
)

type SRPManager struct {
	TotalBandwidth    float64
	ReservedBandwidth float64
	Streams           map[string]*SRPStream
	PortBandwidth     float64
}

func NewSRPManager(portBandwidth float64) *SRPManager {
	return &SRPManager{
		TotalBandwidth:    portBandwidth * 0.75,
		ReservedBandwidth: 0,
		Streams:           make(map[string]*SRPStream),
		PortBandwidth:     portBandwidth,
	}
}

func CalculateStreamBandwidth(stream *SRPStream) float64 {
	talker := stream.Talker
	frameSize := talker.MaxFrameSize
	framesPerInterval := talker.MaxIntervalFrames
	interval := 125.0

	if framesPerInterval == 0 {
		framesPerInterval = 1
	}

	bytesPerSecond := float64(frameSize) * float64(framesPerInterval) * (1000000.0 / interval)
	bandwidthMbps := (bytesPerSecond * 8) / 1000000.0

	return bandwidthMbps
}

func (srp *SRPManager) ReserveStream(stream *SRPStream) error {
	if stream.StreamID == "" {
		stream.StreamID = generateStreamID()
	}

	requiredBW := CalculateStreamBandwidth(stream)
	stream.RequiredBandwidth = requiredBW

	if srp.ReservedBandwidth+requiredBW > srp.TotalBandwidth {
		stream.Status = SRPStatusFailed
		stream.FailureReason = fmt.Sprintf("Insufficient bandwidth: required %.2f Mbps, available %.2f Mbps",
			requiredBW, srp.TotalBandwidth-srp.ReservedBandwidth)
		stream.Talker.Status = TalkerStatusFailed
		for i := range stream.Listeners {
			stream.Listeners[i].Status = ListenerStatusFailed
		}
		return fmt.Errorf(stream.FailureReason)
	}

	srp.ReservedBandwidth += requiredBW
	stream.ReservedBandwidth = requiredBW
	stream.Status = SRPStatusReserved
	stream.Talker.Status = TalkerStatusReady
	for i := range stream.Listeners {
		stream.Listeners[i].Status = ListenerStatusReady
	}

	srp.Streams[stream.StreamID] = stream
	return nil
}

func (srp *SRPManager) ReleaseStream(streamID string) {
	if stream, exists := srp.Streams[streamID]; exists {
		srp.ReservedBandwidth -= stream.ReservedBandwidth
		delete(srp.Streams, streamID)
	}
}

func (srp *SRPManager) ProcessReservationRequest(request *SRPReservationRequest) *SRPReservationResult {
	result := &SRPReservationResult{
		Streams: make([]SRPStream, 0),
	}

	for i := range request.Streams {
		stream := &request.Streams[i]
		stream.Status = SRPStatusPending

		err := srp.ReserveStream(stream)
		if err != nil {
			result.FailureCount++
		} else {
			result.SuccessCount++
			result.TotalReserved += stream.ReservedBandwidth
		}

		result.TotalRequested += stream.RequiredBandwidth
		result.Streams = append(result.Streams, *stream)
	}

	result.RemainingBandwidth = srp.TotalBandwidth - srp.ReservedBandwidth
	return result
}

func (srp *SRPManager) GetAllStreams() []SRPStream {
	streams := make([]SRPStream, 0, len(srp.Streams))
	for _, stream := range srp.Streams {
		streams = append(streams, *stream)
	}
	return streams
}

func (srp *SRPManager) GetAvailableBandwidth() float64 {
	return srp.TotalBandwidth - srp.ReservedBandwidth
}

func (srp *SRPManager) ConvertToTrafficFlows() []TrafficFlow {
	flows := make([]TrafficFlow, 0, len(srp.Streams))

	for _, stream := range srp.Streams {
		if stream.Status != SRPStatusReserved {
			continue
		}

		talker := stream.Talker
		interval := int64(125000)
		if talker.MaxIntervalFrames > 1 {
			interval = int64(125000 / talker.MaxIntervalFrames)
		}

		flow := TrafficFlow{
			FlowID:    stream.StreamID,
			FlowType:  fmt.Sprintf("SRP-%s", talker.Rank),
			SourceIP:  talker.EndStationMAC,
			DestIP:    talker.DestMAC,
			FrameSize: talker.MaxFrameSize,
			Interval:  interval,
			Priority:  talker.DataFramePriority,
			StartTime: 0,
		}
		flows = append(flows, flow)
	}

	return flows
}

func generateStreamID() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%016x", rand.Uint64())
}

func DefaultSRPStreams() []SRPStream {
	return []SRPStream{
		{
			StreamID:   "00:01:02:03:04:05:00:01",
			StreamName: "Camera Video Stream",
			Talker: SRPTalker{
				StreamID:          "00:01:02:03:04:05:00:01",
				DestMAC:           "01:00:5E:00:00:01",
				VLANID:            100,
				MaxFrameSize:      1500,
				MaxIntervalFrames: 1,
				DataFramePriority: 3,
				Rank:              "HIGH",
				EndStationMAC:     "00:11:22:33:44:55",
				Status:            TalkerStatusReady,
			},
			Listeners: []SRPListener{
				{
					StreamID:      "00:01:02:03:04:05:00:01",
					EndStationMAC: "00:AA:BB:CC:DD:EE",
					Status:        ListenerStatusReady,
				},
			},
			Priority: 3,
		},
		{
			StreamID:   "00:01:02:03:04:05:00:02",
			StreamName: "Audio Stream",
			Talker: SRPTalker{
				StreamID:          "00:01:02:03:04:05:00:02",
				DestMAC:           "01:00:5E:00:00:02",
				VLANID:            100,
				MaxFrameSize:      256,
				MaxIntervalFrames: 1,
				DataFramePriority: 2,
				Rank:              "MEDIUM",
				EndStationMAC:     "00:11:22:33:44:56",
				Status:            TalkerStatusReady,
			},
			Listeners: []SRPListener{
				{
					StreamID:      "00:01:02:03:04:05:00:02",
					EndStationMAC: "00:AA:BB:CC:DD:EF",
					Status:        ListenerStatusReady,
				},
			},
			Priority: 2,
		},
	}
}
