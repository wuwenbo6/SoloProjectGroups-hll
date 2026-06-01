package types

import "time"

type FlowRecord struct {
	Timestamp   time.Time `json:"timestamp"`
	SrcIP       string    `json:"src_ip"`
	DstIP       string    `json:"dst_ip"`
	SrcPort     uint16    `json:"src_port"`
	DstPort     uint16    `json:"dst_port"`
	Protocol    uint8     `json:"protocol"`
	ProtocolStr string    `json:"protocol_str"`
	Bytes       uint64    `json:"bytes"`
	Packets     uint32    `json:"packets"`
	SrcASN      uint32    `json:"src_asn"`
	DstASN      uint32    `json:"dst_asn"`
}

type IPPairKey struct {
	SrcIP string
	DstIP string
}

type AppKey struct {
	Port     uint16
	Protocol uint8
}

type IPPairStats struct {
	SrcIP   string `json:"src_ip"`
	DstIP   string `json:"dst_ip"`
	Bytes   uint64 `json:"bytes"`
	Packets uint32 `json:"packets"`
	SrcASN  uint32 `json:"src_asn"`
	DstASN  uint32 `json:"dst_asn"`
}

type AppStats struct {
	Port        uint16 `json:"port"`
	Protocol    uint8  `json:"protocol"`
	ProtocolStr string `json:"protocol_str"`
	Bytes       uint64 `json:"bytes"`
	Packets     uint32 `json:"packets"`
	AppName     string `json:"app_name"`
}

type TopNResult struct {
	IPPairs []IPPairStats `json:"ip_pairs"`
	Apps    []AppStats    `json:"apps"`
}

type ASNInfo struct {
	ASN         uint32 `json:"asn"`
	Name        string `json:"name"`
	CountryCode string `json:"country_code"`
}

type WebSocketMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
}

type HistoricalQuery struct {
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
	ASNFilter uint32    `json:"asn_filter"`
	Limit     int       `json:"limit"`
}
