package sflow

import (
	"net"
	"strings"
	"sync"
)

type IPRange struct {
	Start net.IP
	End   net.IP
	ASN   uint32
}

type ASNResolver struct {
	mu           sync.RWMutex
	ipv4Ranges   []IPRange
	asnNames     map[uint32]string
}

func NewASNResolver() *ASNResolver {
	r := &ASNResolver{
		ipv4Ranges: make([]IPRange, 0),
		asnNames:   make(map[uint32]string),
	}
	r.initDefaultRanges()
	return r
}

func (r *ASNResolver) initDefaultRanges() {
	r.addRange("10.0.0.0", "10.255.255.255", 64512, "Private-Use Network")
	r.addRange("172.16.0.0", "172.31.255.255", 64512, "Private-Use Network")
	r.addRange("192.168.0.0", "192.168.255.255", 64512, "Private-Use Network")
	r.addRange("127.0.0.0", "127.255.255.255", 64513, "Loopback")
	r.addRange("169.254.0.0", "169.254.255.255", 64514, "Link-Local")
	r.addRange("0.0.0.0", "0.255.255.255", 0, "Reserved")

	r.addRange("8.8.8.0", "8.8.8.255", 15169, "Google LLC")
	r.addRange("8.8.4.0", "8.8.4.255", 15169, "Google LLC")
	r.addRange("1.1.1.0", "1.1.1.255", 13335, "Cloudflare Inc")
	r.addRange("1.0.0.0", "1.0.0.255", 13335, "Cloudflare Inc")
	r.addRange("142.250.0.0", "142.250.255.255", 15169, "Google LLC")
	r.addRange("172.217.0.0", "172.217.255.255", 15169, "Google LLC")
	r.addRange("151.101.0.0", "151.101.255.255", 54113, "Fastly Inc")
	r.addRange("104.16.0.0", "104.31.255.255", 13335, "Cloudflare Inc")
	r.addRange("13.107.0.0", "13.107.255.255", 8075, "Microsoft Corporation")
	r.addRange("20.0.0.0", "20.255.255.255", 8075, "Microsoft Corporation")
	r.addRange("40.0.0.0", "40.127.255.255", 8075, "Microsoft Corporation")
	r.addRange("185.199.108.0", "185.199.111.255", 54113, "GitHub Inc")
	r.addRange("140.82.0.0", "140.82.255.255", 36459, "GitHub Inc")
	r.addRange("52.0.0.0", "52.95.255.255", 14618, "Amazon.com Inc")
	r.addRange("54.0.0.0", "54.255.255.255", 14618, "Amazon.com Inc")
	r.addRange("3.0.0.0", "3.255.255.255", 14618, "Amazon.com Inc")
	r.addRange("35.0.0.0", "35.255.255.255", 14618, "Amazon.com Inc")
	r.addRange("157.240.0.0", "157.240.255.255", 32934, "Facebook Inc")
	r.addRange("179.60.192.0", "179.60.195.255", 32934, "Facebook Inc")
	r.addRange("108.168.0.0", "108.175.255.255", 42962, "Netflix Inc")
	r.addRange("45.57.0.0", "45.57.63.255", 2906, "Netflix Inc")
	r.addRange("99.83.0.0", "99.86.255.255", 16509, "Amazon.com Inc")
	r.addRange("23.0.0.0", "23.63.255.255", 16625, "Akamai Technologies")
	r.addRange("23.64.0.0", "23.211.255.255", 20940, "Akamai Technologies")
	r.addRange("72.21.0.0", "72.21.255.255", 14618, "Amazon.com Inc")
	r.addRange("203.205.0.0", "203.205.255.255", 4808, "China Unicom")
	r.addRange("114.114.114.0", "114.114.114.255", 174, "China Telecom")
	r.addRange("223.5.5.0", "223.5.5.255", 37963, "Alibaba Group")
	r.addRange("223.6.6.0", "223.6.6.255", 37963, "Alibaba Group")
	r.addRange("180.76.0.0", "180.76.255.255", 202541, "Baidu Inc")
	r.addRange("119.29.0.0", "119.29.255.255", 45090, "Tencent Inc")
	r.addRange("182.254.0.0", "182.254.255.255", 45090, "Tencent Inc")
}

func (r *ASNResolver) addRange(startStr, endStr string, asn uint32, name string) {
	start := net.ParseIP(startStr)
	end := net.ParseIP(endStr)
	if start != nil && end != nil {
		r.ipv4Ranges = append(r.ipv4Ranges, IPRange{
			Start: start,
			End:   end,
			ASN:   asn,
		})
		r.asnNames[asn] = name
	}
}

func (r *ASNResolver) Lookup(ipStr string) uint32 {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return 0
	}

	ipv4 := ip.To4()
	if ipv4 == nil {
		return 0
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, ipRange := range r.ipv4Ranges {
		if compareIPs(ipv4, ipRange.Start) >= 0 && compareIPs(ipv4, ipRange.End) <= 0 {
			return ipRange.ASN
		}
	}

	return 0
}

func (r *ASNResolver) GetASNName(asn uint32) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if name, ok := r.asnNames[asn]; ok {
		return name
	}
	return "Unknown"
}

func (r *ASNResolver) GetAllASNs() []map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]map[string]interface{}, 0, len(r.asnNames))
	for asn, name := range r.asnNames {
		result = append(result, map[string]interface{}{
			"asn":  asn,
			"name": name,
		})
	}
	return result
}

func compareIPs(a, b net.IP) int {
	a4 := a.To4()
	b4 := b.To4()
	if a4 == nil || b4 == nil {
		return strings.Compare(a.String(), b.String())
	}

	for i := 0; i < 4; i++ {
		if a4[i] < b4[i] {
			return -1
		}
		if a4[i] > b4[i] {
			return 1
		}
	}
	return 0
}
