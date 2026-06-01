package ospf

import "fmt"

type PacketDetails struct {
	MessageType  OspfPacketType  `json:"messageType"`
	SourceRouter string          `json:"sourceRouter"`
	DestRouter   string          `json:"destRouter"`
	Fields       map[string]interface{} `json:"fields"`
}

func GenerateHello(src, dst string, interval, dead int, dr, bdr string, seen []string) PacketDetails {
	neighborsSeen := "none"
	if len(seen) > 0 {
		neighborsSeen = fmt.Sprintf("%v", seen)
	}
	return PacketDetails{
		MessageType:  PacketHello,
		SourceRouter: src,
		DestRouter:   dst,
		Fields: map[string]interface{}{
			"interfaceId":    0,
			"helloInterval":  interval,
			"deadInterval":   dead,
			"dr":             dr,
			"bdr":            bdr,
			"neighborsSeen":  neighborsSeen,
			"options":        "0x000013 (V6|E|R)",
		},
	}
}

func GenerateDBD(src, dst string, isMaster bool, seq uint32, flags string, mtu int) PacketDetails {
	return PacketDetails{
		MessageType:  PacketDBD,
		SourceRouter: src,
		DestRouter:   dst,
		Fields: map[string]interface{}{
			"mtu":           mtu,
			"options":       "0x000013 (V6|E|R)",
			"init":          flags == "I",
			"more":          flags == "M",
			"master":        flags == "MS",
			"ddSequence":    fmt.Sprintf("0x%08X", seq),
			"masterSlave":   isMaster,
			"lsaHeaders":    3,
		},
	}
}

func GenerateLSR(src, dst string, requests []LSARef) PacketDetails {
	typeCount := len(requests)
	if typeCount == 0 {
		typeCount = 2
	}
	return PacketDetails{
		MessageType:  PacketLSR,
		SourceRouter: src,
		DestRouter:   dst,
		Fields: map[string]interface{}{
			"lsaType":       "Router-LSA",
			"linkStateId":   dst,
			"advRouter":     dst,
			"requestCount":  typeCount,
		},
	}
}

func GenerateLSU(src, dst string, lsas []LSARef, prefixes []IPv6Prefix) PacketDetails {
	lsaCount := len(lsas)
	if lsaCount == 0 {
		lsaCount = 2
	}

	fields := map[string]interface{}{
		"lsaCount":      lsaCount,
		"lsaType":       "Router-LSA",
		"sequence":      fmt.Sprintf("0x%08X", 0x80000005),
		"age":           0,
		"options":       "0x000013 (V6|E|R)",
	}

	if len(lsas) > 0 {
		lsaInfo := make([]map[string]interface{}, len(lsas))
		for i, lsa := range lsas {
			lsaInfo[i] = map[string]interface{}{
				"type":      lsa.Type,
				"lsId":      lsa.LSID,
				"advRouter": lsa.AdvRouter,
				"sequence":  fmt.Sprintf("0x%08X", lsa.Sequence),
				"age":       lsa.Age,
			}
		}
		fields["lsas"] = lsaInfo
	}

	if len(prefixes) > 0 {
		prefixInfo := make([]map[string]interface{}, len(prefixes))
		for i, p := range prefixes {
			prefixInfo[i] = map[string]interface{}{
				"prefix":    p.Prefix,
				"prefixLen": p.PrefixLen,
				"metric":    p.Metric,
				"advRouter": p.AdvRouter,
				"routeType": p.RouteType,
			}
		}
		fields["prefixes"] = prefixInfo
		fields["prefixCount"] = len(prefixes)
	}

	return PacketDetails{
		MessageType:  PacketLSU,
		SourceRouter: src,
		DestRouter:   dst,
		Fields:       fields,
	}
}

func GenerateLSAck(src, dst string) PacketDetails {
	return PacketDetails{
		MessageType:  PacketLSAck,
		SourceRouter: src,
		DestRouter:   dst,
		Fields: map[string]interface{}{
			"ackCount":    1,
			"lsaType":     "Router-LSA",
		},
	}
}
