package bgp

import (
	"encoding/json"
	"fmt"
	"net"
	"sort"
	"strings"
	"sync"
)

type BGPRoute struct {
	Prefix      string   `json:"prefix"`
	ASN         uint32   `json:"asn"`
	ASName      string   `json:"as_name"`
	NextHop     string   `json:"next_hop"`
	LocalPref   uint32   `json:"local_pref"`
	Weight      uint32   `json:"weight"`
	Communities []string `json:"communities"`
	Source      string   `json:"source"`
}

type BGPPrefixInfo struct {
	Prefix      string `json:"prefix"`
	ASN         uint32 `json:"asn"`
	ASName      string `json:"as_name"`
	Description string `json:"description"`
	CountryCode string `json:"country_code"`
	Type        string `json:"type"`
}

type PrefixNode struct {
	children map[byte]*PrefixNode
	info     *BGPPrefixInfo
	prefix   string
	isEnd    bool
}

type PrefixTree struct {
	rootV4 *PrefixNode
	rootV6 *PrefixNode
	mu     sync.RWMutex
}

type BGPLookup struct {
	tree     *PrefixTree
	routes   map[string]*BGPRoute
	asNames  map[uint32]string
	mu       sync.RWMutex
}

func NewPrefixTree() *PrefixTree {
	return &PrefixTree{
		rootV4: newNode(),
		rootV6: newNode(),
	}
}

func newNode() *PrefixNode {
	return &PrefixNode{
		children: make(map[byte]*PrefixNode),
	}
}

func (t *PrefixTree) Insert(info *BGPPrefixInfo) error {
	_, ipNet, err := net.ParseCIDR(info.Prefix)
	if err != nil {
		return fmt.Errorf("invalid prefix %s: %w", info.Prefix, err)
	}

	ip := ipNet.IP.To4()
	if ip == nil {
		ip = ipNet.IP.To16()
	}

	maskBits, _ := ipNet.Mask.Size()

	t.mu.Lock()
	defer t.mu.Unlock()

	var current *PrefixNode
	if ipNet.IP.To4() != nil {
		current = t.rootV4
	} else {
		current = t.rootV6
	}

	for bit := 0; bit < maskBits; bit++ {
		byteIdx := bit / 8
		bitIdx := uint(7 - (bit % 8))
		bitVal := (ip[byteIdx] >> bitIdx) & 1

		if next, ok := current.children[bitVal]; ok {
			current = next
		} else {
			newChild := newNode()
			current.children[bitVal] = newChild
			current = newChild
		}
	}

	current.info = info
	current.prefix = info.Prefix
	current.isEnd = true

	return nil
}

func (t *PrefixTree) Lookup(ipStr string) (*BGPPrefixInfo, bool) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil, false
	}

	ip4 := ip.To4()
	isV4 := ip4 != nil
	if !isV4 {
		ip4 = ip.To16()
	}

	t.mu.RLock()
	defer t.mu.RUnlock()

	var current *PrefixNode
	if isV4 {
		current = t.rootV4
	} else {
		current = t.rootV6
	}

	var bestMatch *BGPPrefixInfo
	ipBytes := ip4

	for byteIdx := 0; byteIdx < len(ipBytes); byteIdx++ {
		for bitIdx := uint(7); bitIdx < 8; bitIdx-- {
			if current.isEnd && current.info != nil {
				bestMatch = current.info
			}

			bitVal := (ipBytes[byteIdx] >> bitIdx) & 1
			next, ok := current.children[bitVal]
			if !ok {
				return bestMatch, bestMatch != nil
			}
			current = next
		}
	}

	if current.isEnd && current.info != nil {
		bestMatch = current.info
	}

	return bestMatch, bestMatch != nil
}

func (t *PrefixTree) Remove(prefix string) error {
	_, ipNet, err := net.ParseCIDR(prefix)
	if err != nil {
		return fmt.Errorf("invalid prefix %s: %w", prefix, err)
	}

	ip := ipNet.IP.To4()
	if ip == nil {
		ip = ipNet.IP.To16()
	}

	maskBits, _ := ipNet.Mask.Size()

	t.mu.Lock()
	defer t.mu.Unlock()

	var current *PrefixNode
	if ipNet.IP.To4() != nil {
		current = t.rootV4
	} else {
		current = t.rootV6
	}

	path := make([]*PrefixNode, 0, maskBits)
	bitVals := make([]byte, 0, maskBits)

	for bit := 0; bit < maskBits; bit++ {
		byteIdx := bit / 8
		bitIdx := uint(7 - (bit % 8))
		bitVal := (ip[byteIdx] >> bitIdx) & 1

		path = append(path, current)
		bitVals = append(bitVals, bitVal)

		next, ok := current.children[bitVal]
		if !ok {
			return nil
		}
		current = next
	}

	if current.isEnd {
		current.isEnd = false
		current.info = nil
		current.prefix = ""
	}

	for i := len(path) - 1; i >= 0; i-- {
		node := path[i]
		bitVal := bitVals[i]
		child := node.children[bitVal]

		if child != nil && !child.isEnd && len(child.children) == 0 {
			delete(node.children, bitVal)
		} else {
			break
		}
	}

	return nil
}

func NewBGPLookup() *BGPLookup {
	lookup := &BGPLookup{
		tree:    NewPrefixTree(),
		routes:  make(map[string]*BGPRoute),
		asNames: make(map[uint32]string),
	}

	lookup.initDefaultPrefixes()

	return lookup
}

func (b *BGPLookup) initDefaultPrefixes() {
	defaultPrefixes := []*BGPPrefixInfo{
		{Prefix: "10.0.0.0/8", ASN: 64512, ASName: "Private-Use Network", Type: "private", Description: "RFC 1918"},
		{Prefix: "172.16.0.0/12", ASN: 64512, ASName: "Private-Use Network", Type: "private", Description: "RFC 1918"},
		{Prefix: "192.168.0.0/16", ASN: 64512, ASName: "Private-Use Network", Type: "private", Description: "RFC 1918"},
		{Prefix: "127.0.0.0/8", ASN: 64513, ASName: "Loopback", Type: "loopback", Description: "RFC 5735"},
		{Prefix: "169.254.0.0/16", ASN: 64514, ASName: "Link-Local", Type: "link-local", Description: "RFC 3927"},
		{Prefix: "224.0.0.0/4", ASN: 0, ASName: "Multicast", Type: "multicast", Description: "RFC 5771"},
		{Prefix: "240.0.0.0/4", ASN: 0, ASName: "Reserved", Type: "reserved", Description: "RFC 5735"},

		{Prefix: "8.8.8.0/24", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google Public DNS"},
		{Prefix: "8.8.4.0/24", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google Public DNS"},
		{Prefix: "1.1.1.0/24", ASN: 13335, ASName: "Cloudflare Inc", Type: "public", Description: "Cloudflare DNS"},
		{Prefix: "1.0.0.0/24", ASN: 13335, ASName: "Cloudflare Inc", Type: "public", Description: "Cloudflare DNS"},
		{Prefix: "142.250.0.0/15", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google Cloud"},
		{Prefix: "172.217.0.0/16", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google Cloud"},
		{Prefix: "151.101.0.0/16", ASN: 54113, ASName: "Fastly Inc", Type: "public", Description: "Fastly CDN"},
		{Prefix: "104.16.0.0/12", ASN: 13335, ASName: "Cloudflare Inc", Type: "public", Description: "Cloudflare CDN"},
		{Prefix: "13.107.0.0/16", ASN: 8075, ASName: "Microsoft Corporation", Type: "public", Description: "Microsoft Azure"},
		{Prefix: "20.0.0.0/8", ASN: 8075, ASName: "Microsoft Corporation", Type: "public", Description: "Microsoft Azure"},
		{Prefix: "40.0.0.0/8", ASN: 8075, ASName: "Microsoft Corporation", Type: "public", Description: "Microsoft Azure"},
		{Prefix: "185.199.108.0/22", ASN: 54113, ASName: "GitHub Inc", Type: "public", Description: "GitHub Pages"},
		{Prefix: "140.82.0.0/16", ASN: 36459, ASName: "GitHub Inc", Type: "public", Description: "GitHub"},
		{Prefix: "52.0.0.0/10", ASN: 14618, ASName: "Amazon.com Inc", Type: "public", Description: "AWS"},
		{Prefix: "54.0.0.0/8", ASN: 14618, ASName: "Amazon.com Inc", Type: "public", Description: "AWS"},
		{Prefix: "3.0.0.0/8", ASN: 14618, ASName: "Amazon.com Inc", Type: "public", Description: "AWS"},
		{Prefix: "35.0.0.0/16", ASN: 14618, ASName: "Amazon.com Inc", Type: "public", Description: "AWS"},
		{Prefix: "157.240.0.0/16", ASN: 32934, ASName: "Facebook Inc", Type: "public", Description: "Meta Platforms"},
		{Prefix: "179.60.192.0/22", ASN: 32934, ASName: "Facebook Inc", Type: "public", Description: "Meta Platforms"},
		{Prefix: "108.168.0.0/13", ASN: 42962, ASName: "Netflix Inc", Type: "public", Description: "Netflix"},
		{Prefix: "45.57.0.0/18", ASN: 2906, ASName: "Netflix Inc", Type: "public", Description: "Netflix"},
		{Prefix: "99.83.0.0/16", ASN: 16509, ASName: "Amazon.com Inc", Type: "public", Description: "CloudFront"},
		{Prefix: "23.0.0.0/12", ASN: 16625, ASName: "Akamai Technologies", Type: "public", Description: "Akamai CDN"},
		{Prefix: "23.64.0.0/14", ASN: 20940, ASName: "Akamai Technologies", Type: "public", Description: "Akamai CDN"},
		{Prefix: "72.21.0.0/16", ASN: 14618, ASName: "Amazon.com Inc", Type: "public", Description: "AWS"},
		{Prefix: "203.205.0.0/16", ASN: 4808, ASName: "China Unicom", Type: "public", CountryCode: "CN"},
		{Prefix: "114.114.0.0/16", ASN: 174, ASName: "China Telecom", Type: "public", CountryCode: "CN"},
		{Prefix: "223.5.5.0/24", ASN: 37963, ASName: "Alibaba Group", Type: "public", CountryCode: "CN", Description: "Alibaba DNS"},
		{Prefix: "223.6.6.0/24", ASN: 37963, ASName: "Alibaba Group", Type: "public", CountryCode: "CN", Description: "Alibaba DNS"},
		{Prefix: "180.76.0.0/16", ASN: 202541, ASName: "Baidu Inc", Type: "public", CountryCode: "CN"},
		{Prefix: "119.29.0.0/16", ASN: 45090, ASName: "Tencent Inc", Type: "public", CountryCode: "CN"},
		{Prefix: "182.254.0.0/16", ASN: 45090, ASName: "Tencent Inc", Type: "public", CountryCode: "CN"},

		{Prefix: "2001:db8::/32", ASN: 0, ASName: "Documentation", Type: "documentation", Description: "RFC 3849"},
		{Prefix: "fe80::/10", ASN: 64514, ASName: "Link-Local", Type: "link-local", Description: "RFC 4291"},
		{Prefix: "fc00::/7", ASN: 64512, ASName: "Unique Local", Type: "private", Description: "RFC 4193"},
		{Prefix: "2001:4860::/32", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google IPv6"},
		{Prefix: "2606:4700::/32", ASN: 13335, ASName: "Cloudflare Inc", Type: "public", Description: "Cloudflare IPv6"},
		{Prefix: "2a00:1450::/29", ASN: 15169, ASName: "Google LLC", Type: "public", Description: "Google IPv6"},
	}

	for _, info := range defaultPrefixes {
		b.tree.Insert(info)
		b.asNames[info.ASN] = info.ASName
	}
}

func (b *BGPLookup) LookupIP(ip string) (*BGPPrefixInfo, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	info, found := b.tree.Lookup(ip)
	return info, found
}

func (b *BGPLookup) GetASNName(asn uint32) string {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if name, ok := b.asNames[asn]; ok {
		return name
	}
	return fmt.Sprintf("AS%d", asn)
}

func (b *BGPLookup) AddRoute(route *BGPRoute) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.routes[route.Prefix] = route
	b.asNames[route.ASN] = route.ASName

	info := &BGPPrefixInfo{
		Prefix: route.Prefix,
		ASN:    route.ASN,
		ASName: route.ASName,
		Type:   "bgp-learned",
		Source: route.Source,
	}
	b.tree.Insert(info)
}

func (b *BGPLookup) RemoveRoute(prefix string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.routes, prefix)
	b.tree.Remove(prefix)
}

func (b *BGPLookup) GetRoutes() []*BGPRoute {
	b.mu.RLock()
	defer b.mu.RUnlock()

	routes := make([]*BGPRoute, 0, len(b.routes))
	for _, route := range b.routes {
		routes = append(routes, route)
	}

	sort.Slice(routes, func(i, j int) bool {
		return routes[i].Prefix < routes[j].Prefix
	})

	return routes
}

func (b *BGPLookup) BatchInsert(prefixes []*BGPPrefixInfo) int {
	count := 0
	for _, info := range prefixes {
		if err := b.tree.Insert(info); err == nil {
			b.mu.Lock()
			b.asNames[info.ASN] = info.ASName
			b.mu.Unlock()
			count++
		}
	}
	return count
}

func (b *BGPLookup) LoadFromJSON(data []byte) error {
	var prefixes []*BGPPrefixInfo
	if err := json.Unmarshal(data, &prefixes); err != nil {
		return fmt.Errorf("parse JSON: %w", err)
	}

	count := b.BatchInsert(prefixes)
	fmt.Printf("Loaded %d prefixes from JSON\n", count)
	return nil
}

func (b *BGPLookup) ExportPrefixes() []*BGPPrefixInfo {
	b.mu.RLock()
	defer b.mu.RUnlock()

	result := make([]*BGPPrefixInfo, 0)

	var traverse func(node *PrefixNode)
	traverse = func(node *PrefixNode) {
		if node.isEnd && node.info != nil {
			result = append(result, node.info)
		}
		for _, child := range node.children {
			traverse(child)
		}
	}

	traverse(b.tree.rootV4)
	traverse(b.tree.rootV6)

	return result
}

func (b *BGPLookup) GetPrefixStats() map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()

	prefixes := b.ExportPrefixes()
	stats := map[string]interface{}{
		"total_prefixes": len(prefixes),
		"total_asns":     len(b.asNames),
	}

	typeCount := make(map[string]int)
	for _, p := range prefixes {
		typeCount[p.Type]++
	}
	stats["type_distribution"] = typeCount

	return stats
}

func (b *BGPLookup) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.tree = NewPrefixTree()
	b.routes = make(map[string]*BGPRoute)
	b.asNames = make(map[uint32]string)
	b.initDefaultPrefixes()
}

func ParseIPPrefix(prefix string) (string, int, error) {
	parts := strings.SplitN(prefix, "/", 2)
	if len(parts) != 2 {
		return prefix, 0, fmt.Errorf("invalid prefix format: %s", prefix)
	}

	ip := net.ParseIP(parts[0])
	if ip == nil {
		return "", 0, fmt.Errorf("invalid IP address: %s", parts[0])
	}

	mask, err := fmt.Sscanf(parts[1], "%d", new(int))
	if err != nil || mask != 1 {
		return "", 0, fmt.Errorf("invalid mask: %s", parts[1])
	}

	return fmt.Sprintf("%s/%s", ip.String(), parts[1]), 0, nil
}

func IsPrivateIP(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
		"fe80::/10",
		"fc00::/7",
	}

	for _, cidr := range privateRanges {
		_, network, _ := net.ParseCIDR(cidr)
		if network.Contains(parsedIP) {
			return true
		}
	}

	return false
}

func IsReservedIP(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	reservedRanges := []string{
		"0.0.0.0/8",
		"100.64.0.0/10",
		"192.0.0.0/24",
		"192.0.2.0/24",
		"198.18.0.0/15",
		"198.51.100.0/24",
		"203.0.113.0/24",
		"224.0.0.0/4",
		"240.0.0.0/4",
		"::1/128",
		"::ffff:0:0/96",
		"100::/64",
		"2001::/32",
		"2001:20::/28",
		"2001:db8::/32",
		"ff00::/8",
	}

	for _, cidr := range reservedRanges {
		_, network, _ := net.ParseCIDR(cidr)
		if network.Contains(parsedIP) {
			return true
		}
	}

	return false
}

func CIDROverlap(a, b string) bool {
	_, netA, errA := net.ParseCIDR(a)
	_, netB, errB := net.ParseCIDR(b)

	if errA != nil || errB != nil {
		return false
	}

	return netA.Contains(netB.IP) || netB.Contains(netA.IP)
}
