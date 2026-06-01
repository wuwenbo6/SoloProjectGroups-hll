package pcep

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
)

const (
	PCEP_VERSION = 1
	PCEP_PORT    = 4189

	MSG_OPEN        = 1
	MSG_KEEPALIVE   = 2
	MSG_PCREQ       = 3
	MSG_PCREP       = 4
	MSG_NOTIFICATION = 5
	MSG_ERROR       = 6
	MSG_CLOSE       = 7

	OBJ_TYPE_ENDPOINTS_IPV4 = 1
	OBJ_TYPE_BANDWIDTH      = 5
	OBJ_TYPE_METRIC         = 6
	OBJ_TYPE_ERO            = 7
	OBJ_TYPE_RRO            = 8
	OBJ_TYPE_LSPA           = 9
)

type CommonHeader struct {
	Version     uint8
	Flags       uint8
	MessageType uint8
	Length      uint16
}

type ObjectHeader struct {
	ObjectClass  uint8
	ObjectType   uint8
	Flags        uint8
	Length       uint16
}

type OpenMessage struct {
	CommonHeader
	Keepalive uint8
	DeadTimer uint8
	SID       uint8
	Capabilities []Capability
}

type Capability struct {
	Type   uint8
	Length uint8
	Value  []byte
}

type PCReqMessage struct {
	CommonHeader
	Requests []Request
}

type Request struct {
	RP        RPObject
	Endpoints *EndpointsObject
	Bandwidth *BandwidthObject
	Metric    *MetricObject
	LSPA      *LSPAObject
	Metrics   []MetricObject
}

type LSPAObject struct {
	IncludeAny uint32
	IncludeAll uint32
	Exclude    uint32
	Setup      uint8
	Hold       uint8
	LOP        bool
	LocalProtectionDesired bool
}

type RPObject struct {
	Priority    uint8
	Reoptimization bool
	BiDirectional bool
	Loose       bool
	RequestID   uint32
}

type EndpointsObject struct {
	SourceIP [4]byte
	DestIP   [4]byte
}

type BandwidthObject struct {
	Bandwidth float32
}

type MetricObject struct {
	Bound  bool
	Comp   bool
	Type   uint8
	Value  float32
}

type EROObject struct {
	Subobjects []EROSubobject
}

type EROSubobject struct {
	Loose   bool
	Type    uint8
	IP      [4]byte
	Prefix  uint8
}

type PCRepMessage struct {
	CommonHeader
	Responses []Response
}

type Response struct {
	RequestID uint32
	RP        RPObject
	ERO       *EROObject
	Bandwidth *BandwidthObject
	Metric    *MetricObject
	NoPath    bool
}

func ParseCommonHeader(data []byte) (*CommonHeader, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("data too short for common header")
	}

	h := &CommonHeader{}
	h.Version = (data[0] >> 5) & 0x7
	h.Flags = data[0] & 0x1F
	h.MessageType = data[1]
	h.Length = binary.BigEndian.Uint16(data[2:4])

	return h, nil
}

func ParseOpenMessage(data []byte) (*OpenMessage, error) {
	hdr, err := ParseCommonHeader(data)
	if err != nil {
		return nil, err
	}

	if hdr.MessageType != MSG_OPEN {
		return nil, fmt.Errorf("not an open message")
	}

	msg := &OpenMessage{CommonHeader: *hdr}

	if len(data) < 8 {
		return nil, fmt.Errorf("open message too short")
	}

	msg.Keepalive = data[4]
	msg.DeadTimer = data[5]
	msg.SID = data[6]

	return msg, nil
}

func ParsePCReqMessage(data []byte) (*PCReqMessage, error) {
	hdr, err := ParseCommonHeader(data)
	if err != nil {
		return nil, err
	}

	if hdr.MessageType != MSG_PCREQ {
		return nil, fmt.Errorf("not a pc req message")
	}

	msg := &PCReqMessage{CommonHeader: *hdr}

	offset := 4
	for offset < int(hdr.Length) {
		if offset+4 > len(data) {
			break
		}

		objClass := data[offset]
		objType := data[offset+1]
		objFlags := data[offset+2]
		objLen := int(binary.BigEndian.Uint16(data[offset+3:offset+5]))

		if objLen < 4 {
			break
		}

		objData := data[offset+4 : offset+objLen]

		switch objClass {
		case 1:
			rp := parseRPObject(objType, objFlags, objData)
			msg.Requests = append(msg.Requests, Request{RP: rp})
		case 4:
			if len(msg.Requests) > 0 {
				msg.Requests[len(msg.Requests)-1].Endpoints = parseEndpointsObject(objData)
			}
		case 5:
			if len(msg.Requests) > 0 {
				msg.Requests[len(msg.Requests)-1].Bandwidth = parseBandwidthObject(objData)
			}
		case 6:
			if len(msg.Requests) > 0 {
				m := parseMetricObject(objType, objFlags, objData)
				msg.Requests[len(msg.Requests)-1].Metrics = append(msg.Requests[len(msg.Requests)-1].Metrics, *m)
				if msg.Requests[len(msg.Requests)-1].Metric == nil {
					msg.Requests[len(msg.Requests)-1].Metric = m
				}
			}
		case 19:
			if len(msg.Requests) > 0 {
				msg.Requests[len(msg.Requests)-1].LSPA = parseLSPAObject(objFlags, objData)
			}
		}

		offset += objLen
	}

	return msg, nil
}

func parseRPObject(objType uint8, flags uint8, data []byte) RPObject {
	rp := RPObject{}
	if len(data) >= 4 {
		rp.RequestID = binary.BigEndian.Uint32(data[0:4])
	}
	rp.Priority = (flags >> 3) & 0x7
	rp.Reoptimization = (flags & 0x04) != 0
	rp.BiDirectional = (flags & 0x02) != 0
	rp.Loose = (flags & 0x01) != 0
	return rp
}

func parseEndpointsObject(data []byte) *EndpointsObject {
	if len(data) < 8 {
		return nil
	}
	ep := &EndpointsObject{}
	copy(ep.SourceIP[:], data[0:4])
	copy(ep.DestIP[:], data[4:8])
	return ep
}

func parseBandwidthObject(data []byte) *BandwidthObject {
	if len(data) < 4 {
		return nil
	}
	bw := &BandwidthObject{}
	bits := binary.BigEndian.Uint32(data[0:4])
	bw.Bandwidth = float32(bits) / 8.0
	return bw
}

func parseMetricObject(objType uint8, flags uint8, data []byte) *MetricObject {
	if len(data) < 4 {
		return nil
	}
	m := &MetricObject{}
	m.Bound = (flags & 0x80) != 0
	m.Comp = (flags & 0x40) != 0
	m.Type = objType
	bits := binary.BigEndian.Uint32(data[0:4])
	m.Value = float32(bits)
	return m
}

func parseLSPAObject(flags uint8, data []byte) *LSPAObject {
	lspa := &LSPAObject{}
	lspa.LocalProtectionDesired = (flags & 0x80) != 0
	lspa.LOP = (flags & 0x04) != 0

	if len(data) >= 16 {
		lspa.IncludeAny = binary.BigEndian.Uint32(data[0:4])
		lspa.IncludeAll = binary.BigEndian.Uint32(data[4:8])
		lspa.Exclude = binary.BigEndian.Uint32(data[8:12])
		lspa.Setup = data[12]
		lspa.Hold = data[13]
	} else if len(data) >= 12 {
		lspa.IncludeAny = binary.BigEndian.Uint32(data[0:4])
		lspa.IncludeAll = binary.BigEndian.Uint32(data[4:8])
		lspa.Exclude = binary.BigEndian.Uint32(data[8:12])
	}

	return lspa
}

func BuildPCRepMessage(response Response) []byte {
	var objects []byte

	rpData := buildRPObject(response.RP)
	objects = append(objects, rpData...)

	if response.NoPath {
		noPathData := buildNoPathObject()
		objects = append(objects, noPathData...)
	} else {
		if response.ERO != nil {
			eroData := buildEROObject(*response.ERO)
			objects = append(objects, eroData...)
		}
		if response.Bandwidth != nil {
			bwData := buildBandwidthObject(*response.Bandwidth)
			objects = append(objects, bwData...)
		}
		if response.Metric != nil {
			metricData := buildMetricObject(*response.Metric)
			objects = append(objects, metricData...)
		}
	}

	totalLen := 4 + len(objects)
	msg := make([]byte, totalLen)

	msg[0] = (PCEP_VERSION << 5) & 0xE0
	msg[1] = MSG_PCREP
	binary.BigEndian.PutUint16(msg[2:4], uint16(totalLen))

	copy(msg[4:], objects)

	return msg
}

func buildRPObject(rp RPObject) []byte {
	data := make([]byte, 8)
	data[0] = 1
	data[1] = 1

	var flags uint8
	if rp.Reoptimization {
		flags |= 0x04
	}
	if rp.BiDirectional {
		flags |= 0x02
	}
	if rp.Loose {
		flags |= 0x01
	}
	data[2] = flags

	binary.BigEndian.PutUint16(data[3:5], 8)
	binary.BigEndian.PutUint32(data[4:8], rp.RequestID)

	return data
}

func buildEROObject(ero EROObject) []byte {
	var subobjData []byte
	for _, so := range ero.Subobjects {
		soData := make([]byte, 8)
		if so.Loose {
			soData[0] |= 0x80
		}
		soData[0] |= so.Type & 0x1F
		soData[1] = 8
		copy(soData[2:6], so.IP[:])
		soData[6] = so.Prefix
		subobjData = append(subobjData, soData...)
	}

	totalLen := 4 + len(subobjData)
	data := make([]byte, totalLen)
	data[0] = 7
	data[1] = 1
	data[2] = 0
	binary.BigEndian.PutUint16(data[3:5], uint16(totalLen))
	copy(data[4:], subobjData)

	return data
}

func buildBandwidthObject(bw BandwidthObject) []byte {
	data := make([]byte, 8)
	data[0] = 5
	data[1] = 1
	data[2] = 0
	binary.BigEndian.PutUint16(data[3:5], 8)
	bits := uint32(bw.Bandwidth * 8)
	binary.BigEndian.PutUint32(data[4:8], bits)
	return data
}

func buildMetricObject(m MetricObject) []byte {
	data := make([]byte, 8)
	data[0] = 6
	data[1] = m.Type

	var flags uint8
	if m.Bound {
		flags |= 0x80
	}
	if m.Comp {
		flags |= 0x40
	}
	data[2] = flags

	binary.BigEndian.PutUint16(data[3:5], 8)
	bits := uint32(m.Value)
	binary.BigEndian.PutUint32(data[4:8], bits)
	return data
}

func buildNoPathObject() []byte {
	data := make([]byte, 8)
	data[0] = 10
	data[1] = 1
	data[2] = 0
	binary.BigEndian.PutUint16(data[3:5], 8)
	binary.BigEndian.PutUint32(data[4:8], 1)
	return data
}

func BuildKeepaliveMessage() []byte {
	msg := make([]byte, 4)
	msg[0] = (PCEP_VERSION << 5) & 0xE0
	msg[1] = MSG_KEEPALIVE
	binary.BigEndian.PutUint16(msg[2:4], 4)
	return msg
}

func BuildOpenMessage(keepalive, deadTimer uint8) []byte {
	msg := make([]byte, 8)
	msg[0] = (PCEP_VERSION << 5) & 0xE0
	msg[1] = MSG_OPEN
	binary.BigEndian.PutUint16(msg[2:4], 8)
	msg[4] = keepalive
	msg[5] = deadTimer
	msg[6] = 0
	msg[7] = 0
	return msg
}

func BuildCloseMessage(reason uint8) []byte {
	msg := make([]byte, 8)
	msg[0] = (PCEP_VERSION << 5) & 0xE0
	msg[1] = MSG_CLOSE
	binary.BigEndian.PutUint16(msg[2:4], 8)
	msg[4] = reason
	return msg
}

type PathRequest struct {
	Source       string  `json:"source"`
	Target       string  `json:"target"`
	Bandwidth    float64 `json:"bandwidth"`
	IncludeAny   uint32  `json:"include_any"`
	IncludeAll   uint32  `json:"include_all"`
	Exclude      uint32  `json:"exclude"`
	MetricWeight   float64 `json:"metric_weight"`
	LatencyWeight  float64 `json:"latency_weight"`
	BandwidthWeight float64 `json:"bandwidth_weight"`
}

type PathResponse struct {
	Success      bool     `json:"success"`
	Nodes        []string `json:"nodes"`
	Links        []string `json:"links"`
	Metric       int      `json:"metric"`
	Cost         float64  `json:"cost"`
	TotalLatency float64  `json:"total_latency"`
	MinBandwidth float64  `json:"min_bandwidth"`
	Message      string   `json:"message,omitempty"`
}

func (r *PathResponse) ToJSON() ([]byte, error) {
	return json.Marshal(r)
}
