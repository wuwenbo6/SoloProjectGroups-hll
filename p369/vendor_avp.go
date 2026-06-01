package main

import (
	"encoding/binary"

	"layeh.com/radius"
)

const (
	VendorCisco    = 9
	VendorHuawei   = 2011
	VendorJuniper  = 2636
	VendorMikrotik = 14988
)

const (
	AttributeVendorSpecific = 26
)

const (
	CiscoAVPPair      = 1
	CiscoNASPort      = 2
	CiscoReplyMessage = 18
	CiscoCVPN3000ASA3 = 26
	CiscoAccountInfo  = 25
	CiscoCommand      = 251
)

const (
	HuaweiInputOctets     = 1
	HuaweiOutputOctets    = 2
	HuaweiInputPackets    = 3
	HuaweiOutputPackets   = 4
	HuaweiSessionTimeout  = 5
	HuaweiIdleTimeout     = 6
	HuaweiTerminateAction = 7
	HuaweiPortLimit       = 8
	HuaweiLoginIPHost     = 14
	HuaweiUserID          = 19
	HuaweiChargeNumber    = 28
	HuaweiUserPassword    = 42
	HuaweiNASIPAddress    = 61
	HuaweiVlanID          = 62
	HuaweiPriority        = 63
	HuaweiRedirectURL     = 64
	HuaweiUpBandwidth     = 85
	HuaweiDownBandwidth   = 86
	HuaweiUpPeakRate      = 87
	HuaweiDownPeakRate    = 88
	HuaweiUpAverageRate   = 89
	HuaweiDownAverageRate = 90
	HuaweiInputGigawords  = 91
	HuaweiOutputGigawords = 92
	HuaweiVpnInstance     = 140
	HuaweiUserGroup       = 143
	HuaweiClientIP        = 144
	HuaweiServiceType     = 145
	HuaweiBillingPlan     = 146
	HuaweiAction          = 209
)

type VendorAVP struct {
	VendorID    uint32
	AVPType     uint32
	StringValue string
	IntValue    uint32
	IsString    bool
}

func NewVendorSpecific(vendorID uint32, vsaType uint32, value []byte) radius.Attribute {
	attrLen := 2 + len(value)
	if attrLen > 253 {
		attrLen = 253
		value = value[:251]
	}
	vsa := make([]byte, 6+attrLen)
	binary.BigEndian.PutUint32(vsa[0:4], vendorID)
	vsa[4] = byte(vsaType)
	vsa[5] = byte(attrLen)
	copy(vsa[6:], value)
	return vsa
}

func NewVendorString(vendorID uint32, vsaType uint32, value string) radius.Attribute {
	return NewVendorSpecific(vendorID, vsaType, []byte(value))
}

func NewVendorInteger(vendorID uint32, vsaType uint32, value uint32) radius.Attribute {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, value)
	return NewVendorSpecific(vendorID, vsaType, buf)
}

func ParseVendorSpecific(attr radius.Attribute) (vendorID uint32, vsaType uint8, vsaLen uint8, value []byte, ok bool) {
	b := []byte(attr)
	if len(b) < 6 {
		return 0, 0, 0, nil, false
	}
	vendorID = binary.BigEndian.Uint32(b[0:4])
	vsaType = b[4]
	vsaLen = b[5]
	if int(vsaLen) > len(b)-4 || vsaLen < 2 {
		return 0, 0, 0, nil, false
	}
	value = b[6 : 4+int(vsaLen)]
	ok = true
	return
}

type CiscoAVP struct {
	Type  uint8
	Value string
}

func NewCiscoAVPPair(attr, value string) radius.Attribute {
	return NewVendorString(VendorCisco, CiscoAVPPair, attr+"="+value)
}

func ParseCiscoAVPPair(attr radius.Attribute) (map[string]string, bool) {
	vendorID, vsaType, _, value, ok := ParseVendorSpecific(attr)
	if !ok || vendorID != VendorCisco || vsaType != CiscoAVPPair {
		return nil, false
	}
	result := make(map[string]string)
	parts := splitValue(string(value), '\n')
	for _, part := range parts {
		if idx := indexByte(part, '='); idx >= 0 {
			result[part[:idx]] = part[idx+1:]
		}
	}
	return result, true
}

type HuaweiAVP struct {
	Type  uint8
	Value interface{}
}

func NewHuaweiBandwidth(upKbps, downKbps uint32) []radius.Attribute {
	return []radius.Attribute{
		NewVendorInteger(VendorHuawei, HuaweiUpBandwidth, upKbps),
		NewVendorInteger(VendorHuawei, HuaweiDownBandwidth, downKbps),
	}
}

func NewHuaweiQoS(upKbps, downKbps, upPeak, downPeak uint32) []radius.Attribute {
	return []radius.Attribute{
		NewVendorInteger(VendorHuawei, HuaweiUpBandwidth, upKbps),
		NewVendorInteger(VendorHuawei, HuaweiDownBandwidth, downKbps),
		NewVendorInteger(VendorHuawei, HuaweiUpPeakRate, upPeak),
		NewVendorInteger(VendorHuawei, HuaweiDownPeakRate, downPeak),
	}
}

func NewCiscoBandwidthPolicy(policyName string) radius.Attribute {
	return NewCiscoAVPPair("sub-qos-policy-in", policyName)
}

func NewCiscoRateLimit(inputRate, outputRate uint32) []radius.Attribute {
	return []radius.Attribute{
		NewCiscoAVPPair("rate-limit", "input "+itoa(int(inputRate))+" 1500 1500 conform-action transmit exceed-action drop"),
		NewCiscoAVPPair("rate-limit", "output "+itoa(int(outputRate))+" 1500 1500 conform-action transmit exceed-action drop"),
	}
}

func itoa(n int) string {
	return string(rune('0' + n))
}

func splitValue(s string, sep byte) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

func indexByte(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}

func ExtractVendorBandwidth(p *radius.Packet) (upKbps, downKbps uint32, found bool) {
	for _, avp := range p.Attributes {
		if avp.Type != AttributeVendorSpecific {
			continue
		}
		vendorID, vsaType, _, value, ok := ParseVendorSpecific(avp.Attribute)
		if !ok {
			continue
		}
		switch vendorID {
		case VendorHuawei:
			switch vsaType {
			case HuaweiUpBandwidth:
				if len(value) >= 4 {
					upKbps = binary.BigEndian.Uint32(value)
					found = true
				}
			case HuaweiDownBandwidth:
				if len(value) >= 4 {
					downKbps = binary.BigEndian.Uint32(value)
					found = true
				}
			}
		case VendorCisco:
			if vsaType == CiscoAVPPair {
				attrs, ok := ParseCiscoAVPPair(avp.Attribute)
				if ok {
					if bw, ok := attrs["bandwidth-up"]; ok {
						upKbps = parseUint(bw)
						found = true
					}
					if bw, ok := attrs["bandwidth-down"]; ok {
						downKbps = parseUint(bw)
						found = true
					}
				}
			}
		}
	}
	return
}

func parseUint(s string) uint32 {
	var result uint32
	for _, c := range s {
		if c >= '0' && c <= '9' {
			result = result*10 + uint32(c-'0')
		}
	}
	return result
}
