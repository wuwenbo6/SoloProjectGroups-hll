package main

import (
	"encoding/json"
	"time"
)

type QoSTrafficClass string

const (
	QoSClassEF        QoSTrafficClass = "EF"     // Expedited Forwarding - 语音、低延迟
	QoSClassAF4       QoSTrafficClass = "AF4"    // Assured Forwarding 4 - 视频
	QoSClassAF3       QoSTrafficClass = "AF3"    // Assured Forwarding 3 - 游戏
	QoSClassAF2       QoSTrafficClass = "AF2"    // Assured Forwarding 2 - 流媒体
	QoSClassAF1       QoSTrafficClass = "AF1"    // Assured Forwarding 1 - 浏览
	QoSClassBE        QoSTrafficClass = "BE"     // Best Effort - 默认
	QoSClassVoice     QoSTrafficClass = "VOICE"  // 语音流
	QoSClassVideo     QoSTrafficClass = "VIDEO"  // 视频流
	QoSClassData      QoSTrafficClass = "DATA"   // 数据流
	QoSClassSignaling QoSTrafficClass = "SIGNAL" // 信令流
)

type FlowMapping struct {
	FlowID         string          `json:"flow_id"`
	TrafficClass   QoSTrafficClass `json:"traffic_class"`
	DSCP           int             `json:"dscp"`
	MaxBandwidth   int             `json:"max_bandwidth_kbps"`
	MinBandwidth   int             `json:"min_bandwidth_kbps"`
	MaxLatencyMs   int             `json:"max_latency_ms"`
	MaxJitterMs    int             `json:"max_jitter_ms"`
	PacketLossRate float64         `json:"max_packet_loss_rate"`
	Priority       int             `json:"priority"`
}

type QoSProfile struct {
	ProfileID    string        `json:"profile_id"`
	Name         string        `json:"name"`
	FlowMappings []FlowMapping `json:"flow_mappings"`
	Negotiated   bool          `json:"negotiated"`
	Granted      bool          `json:"granted"`
	Reason       string        `json:"reason,omitempty"`
}

func NewQoSProfile(classes []QoSTrafficClass) *QoSProfile {
	profile := &QoSProfile{
		ProfileID:    generateQoSProfileID(),
		FlowMappings: make([]FlowMapping, 0, len(classes)),
		Negotiated:   true,
		Granted:      true,
	}
	for _, cls := range classes {
		profile.FlowMappings = append(profile.FlowMappings, defaultFlowMapping(cls))
	}
	return profile
}

func NegotiateQoS(requested *QoSProfile, magAddr string, accessTech AccessTechType) *QoSProfile {
	result := &QoSProfile{
		ProfileID:    requested.ProfileID,
		Name:         requested.Name,
		FlowMappings: make([]FlowMapping, 0, len(requested.FlowMappings)),
		Negotiated:   true,
		Granted:      true,
	}

	techLimit := techBandwidthLimit(accessTech)

	for _, fm := range requested.FlowMappings {
		granted := fm
		if fm.MaxBandwidth > techLimit {
			granted.MaxBandwidth = techLimit
			granted.MinBandwidth = min(fm.MinBandwidth, techLimit)
			granted.MaxLatencyMs = fm.MaxLatencyMs + techLatencyPenalty(accessTech)
			result.Granted = false
			result.Reason = "bandwidth limited by access technology"
		}
		granted.Priority = flowClassPriority(fm.TrafficClass)
		granted.DSCP = dscpForClass(fm.TrafficClass)
		result.FlowMappings = append(result.FlowMappings, granted)
	}

	return result
}

func generateQoSProfileID() string {
	return "QoS-" + time.Now().Format("20060102150405")
}

func defaultFlowMapping(cls QoSTrafficClass) FlowMapping {
	switch cls {
	case QoSClassVoice, QoSClassEF:
		return FlowMapping{FlowID: "f-voice", TrafficClass: cls, DSCP: 46, MaxBandwidth: 1000, MinBandwidth: 64, MaxLatencyMs: 50, MaxJitterMs: 10, PacketLossRate: 0.001, Priority: 10}
	case QoSClassVideo:
		return FlowMapping{FlowID: "f-video", TrafficClass: cls, DSCP: 34, MaxBandwidth: 10000, MinBandwidth: 1000, MaxLatencyMs: 150, MaxJitterMs: 30, PacketLossRate: 0.005, Priority: 8}
	case QoSClassAF4:
		return FlowMapping{FlowID: "f-af4", TrafficClass: cls, DSCP: 32, MaxBandwidth: 15000, MinBandwidth: 2000, MaxLatencyMs: 200, MaxJitterMs: 50, PacketLossRate: 0.01, Priority: 7}
	case QoSClassSignaling:
		return FlowMapping{FlowID: "f-signal", TrafficClass: cls, DSCP: 40, MaxBandwidth: 500, MinBandwidth: 128, MaxLatencyMs: 100, MaxJitterMs: 20, PacketLossRate: 0.001, Priority: 9}
	case QoSClassAF3:
		return FlowMapping{FlowID: "f-af3", TrafficClass: cls, DSCP: 24, MaxBandwidth: 8000, MinBandwidth: 500, MaxLatencyMs: 300, MaxJitterMs: 80, PacketLossRate: 0.015, Priority: 5}
	case QoSClassAF2:
		return FlowMapping{FlowID: "f-af2", TrafficClass: cls, DSCP: 16, MaxBandwidth: 5000, MinBandwidth: 256, MaxLatencyMs: 400, MaxJitterMs: 100, PacketLossRate: 0.02, Priority: 4}
	case QoSClassData:
		return FlowMapping{FlowID: "f-data", TrafficClass: cls, DSCP: 8, MaxBandwidth: 20000, MinBandwidth: 128, MaxLatencyMs: 500, MaxJitterMs: 200, PacketLossRate: 0.03, Priority: 3}
	case QoSClassAF1:
		return FlowMapping{FlowID: "f-af1", TrafficClass: cls, DSCP: 8, MaxBandwidth: 10000, MinBandwidth: 128, MaxLatencyMs: 500, MaxJitterMs: 200, PacketLossRate: 0.03, Priority: 2}
	default:
		return FlowMapping{FlowID: "f-be", TrafficClass: QoSClassBE, DSCP: 0, MaxBandwidth: 50000, MinBandwidth: 0, MaxLatencyMs: 1000, MaxJitterMs: 500, PacketLossRate: 0.05, Priority: 1}
	}
}

func techBandwidthLimit(tech AccessTechType) int {
	switch tech {
	case AccessTech5G:
		return 1000000
	case AccessTechLTE:
		return 150000
	case AccessTechWiFi:
		return 300000
	case AccessTechEthernet:
		return 1000000
	default:
		return 10000
	}
}

func techLatencyPenalty(tech AccessTechType) int {
	switch tech {
	case AccessTech5G:
		return 0
	case AccessTechLTE:
		return 20
	case AccessTechWiFi:
		return 15
	case AccessTechEthernet:
		return 0
	default:
		return 50
	}
}

func flowClassPriority(cls QoSTrafficClass) int {
	switch cls {
	case QoSClassVoice, QoSClassEF:
		return 10
	case QoSClassSignaling:
		return 9
	case QoSClassVideo:
		return 8
	case QoSClassAF4:
		return 7
	case QoSClassAF3:
		return 5
	case QoSClassAF2:
		return 4
	case QoSClassData, QoSClassAF1:
		return 3
	default:
		return 1
	}
}

func dscpForClass(cls QoSTrafficClass) int {
	switch cls {
	case QoSClassVoice, QoSClassEF:
		return 46
	case QoSClassSignaling:
		return 40
	case QoSClassVideo:
		return 34
	case QoSClassAF4:
		return 32
	case QoSClassAF3:
		return 24
	case QoSClassAF2:
		return 16
	case QoSClassData, QoSClassAF1:
		return 8
	default:
		return 0
	}
}

func (q *QoSProfile) Summary() string {
	b, _ := json.Marshal(q.FlowMappings)
	return string(b)
}

func (q *QoSProfile) TotalBandwidth() int {
	total := 0
	for _, fm := range q.FlowMappings {
		total += fm.MaxBandwidth
	}
	return total
}
