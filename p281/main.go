package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/insomniacslk/dhcp/dhcpv6"
)

type Lease struct {
	DUID       string    `json:"duid"`
	Prefix     string    `json:"prefix"`
	PrefixLen  int       `json:"prefixLen"`
	IAID       string    `json:"iaid"`
	IAIDNum    uint32    `json:"iaidNum"`
	AssignedAt time.Time `json:"assignedAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
	ClientAddr string    `json:"clientAddr"`
	RenewCount int       `json:"renewCount"`
}

type PrefixBinding struct {
	Prefix    string
	DUID      string
	IAID      [4]byte
	LeaseKey  string
	ExpiresAt time.Time
}

type LogEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	EventType  string    `json:"eventType"`
	DUID       string    `json:"duid"`
	Prefix     string    `json:"prefix"`
	IAID       string    `json:"iaid"`
	ClientAddr string    `json:"clientAddr"`
	Message    string    `json:"message"`
}

var (
	leases            = make(map[string]*Lease)
	assignedPrefixes  = make(map[string]*PrefixBinding)
	allocationLogs    = make([]*LogEntry, 0, 1000)
	leasesMutex       sync.RWMutex
	prefixPool        *net.IPNet
	nextSubnet        uint64
	cleanupTicker     *time.Ticker
	dnsServers        []net.IP
)

const (
	prefixPoolStr   = "2001:db8:100::/56"
	leaseTime       = 24 * time.Hour
	serverPort      = ":547"
	httpPort        = ":8080"
	cleanupInterval = 1 * time.Hour
	maxLogEntries   = 10000
)

func initDNSServers() {
	dnsServers = []net.IP{
		net.ParseIP("2001:4860:4860::8888"),
		net.ParseIP("2001:4860:4860::8844"),
	}
}

func iaidToUint32(iaid [4]byte) uint32 {
	return binary.BigEndian.Uint32(iaid[:])
}

func initPrefixPool() error {
	_, pool, err := net.ParseCIDR(prefixPoolStr)
	if err != nil {
		return fmt.Errorf("failed to parse prefix pool: %v", err)
	}
	prefixPool = pool
	nextSubnet = 0
	return nil
}

func addLogEntry(eventType, duid, prefix, iaid, clientAddr, message string) {
	leasesMutex.Lock()
	defer leasesMutex.Unlock()

	entry := &LogEntry{
		Timestamp:  time.Now(),
		EventType:  eventType,
		DUID:       duid,
		Prefix:     prefix,
		IAID:       iaid,
		ClientAddr: clientAddr,
		Message:    message,
	}

	allocationLogs = append(allocationLogs, entry)

	if len(allocationLogs) > maxLogEntries {
		allocationLogs = allocationLogs[len(allocationLogs)-maxLogEntries:]
	}
}

func isPrefixAssigned(prefixStr string) bool {
	_, exists := assignedPrefixes[prefixStr]
	return exists
}

func isPrefixInPool(prefix *net.IPNet) bool {
	return prefixPool.Contains(prefix.IP)
}

func generatePrefix(subnetIdx uint64) *net.IPNet {
	poolOnes, _ := prefixPool.Mask.Size()
	subnetBits := 64 - poolOnes

	prefix := make(net.IP, len(prefixPool.IP))
	copy(prefix, prefixPool.IP)

	for i := 0; i < int(subnetBits); i++ {
		byteIdx := 15 - (i / 8)
		bitIdx := uint(i % 8)
		if (subnetIdx>>i)&1 == 1 {
			prefix[byteIdx] |= 1 << bitIdx
		} else {
			prefix[byteIdx] &^= (1 << bitIdx)
		}
	}

	mask := net.CIDRMask(64, 128)
	return &net.IPNet{
		IP:   prefix,
		Mask: mask,
	}
}

func findAvailablePrefix() (*net.IPNet, error) {
	poolOnes, _ := prefixPool.Mask.Size()
	subnetBits := 64 - poolOnes
	maxSubnets := uint64(1) << uint(subnetBits)

	for i := uint64(0); i < maxSubnets; i++ {
		candidateIdx := (nextSubnet + i) % maxSubnets
		prefix := generatePrefix(candidateIdx)
		prefixStr := prefix.String()

		if !isPrefixAssigned(prefixStr) {
			nextSubnet = (candidateIdx + 1) % maxSubnets
			return prefix, nil
		}
	}

	return nil, fmt.Errorf("no available prefixes in pool")
}

func allocatePrefix() (*net.IPNet, error) {
	prefix, err := findAvailablePrefix()
	if err != nil {
		return nil, err
	}

	return prefix, nil
}

func getLeaseKey(duid string, iaid [4]byte) string {
	return fmt.Sprintf("%s-%x", duid, iaid)
}

func findLeaseByDUIDAndIAID(duidStr string, iaid [4]byte) (*Lease, bool) {
	leaseKey := getLeaseKey(duidStr, iaid)
	lease, exists := leases[leaseKey]
	return lease, exists
}

func findBindingByPrefix(prefixStr string) (*PrefixBinding, bool) {
	binding, exists := assignedPrefixes[prefixStr]
	return binding, exists
}

func updateLease(leaseKey string, lease *Lease, prefix *net.IPNet, iaid [4]byte) {
	prefixStr := prefix.String()

	oldLease, exists := leases[leaseKey]
	if exists && oldLease.Prefix != prefixStr {
		delete(assignedPrefixes, oldLease.Prefix)
	}

	binding := &PrefixBinding{
		Prefix:    prefixStr,
		DUID:      lease.DUID,
		IAID:      iaid,
		LeaseKey:  leaseKey,
		ExpiresAt: lease.ExpiresAt,
	}

	leases[leaseKey] = lease
	assignedPrefixes[prefixStr] = binding

	log.Printf("Binding updated: prefix=%s, duid=%s, iaid=%x, expires=%s",
		prefixStr, lease.DUID, iaid, lease.ExpiresAt.Format(time.RFC3339))
}

func removeLease(leaseKey string) {
	lease, exists := leases[leaseKey]
	if !exists {
		return
	}

	delete(assignedPrefixes, lease.Prefix)
	delete(leases, leaseKey)

	log.Printf("Binding removed: prefix=%s, duid=%s", lease.Prefix, lease.DUID)
}

func cleanupExpiredLeases() {
	leasesMutex.Lock()
	defer leasesMutex.Unlock()

	now := time.Now()
	expiredCount := 0

	for leaseKey, lease := range leases {
		if now.After(lease.ExpiresAt) {
			addLogEntry("EXPIRE", lease.DUID, lease.Prefix, lease.IAID, "",
				fmt.Sprintf("Lease expired for prefix %s", lease.Prefix))
			removeLease(leaseKey)
			expiredCount++
		}
	}

	if expiredCount > 0 {
		log.Printf("Cleaned up %d expired leases", expiredCount)
	}
}

func startCleanupRoutine() {
	cleanupTicker = time.NewTicker(cleanupInterval)
	go func() {
		for range cleanupTicker.C {
			cleanupExpiredLeases()
		}
	}()
	log.Printf("Started expired lease cleanup routine (interval: %s)", cleanupInterval)
}

func getRequestedPrefix(msg *dhcpv6.Message) *net.IPNet {
	iaPd := msg.GetOneOption(dhcpv6.OptionIAPD)
	if iaPd == nil {
		return nil
	}

	iaPdOpt, ok := iaPd.(*dhcpv6.OptIAPD)
	if !ok {
		return nil
	}

	for _, opt := range iaPdOpt.Options.Options {
		if prefixOpt, ok := opt.(*dhcpv6.OptIAPrefix); ok {
			if prefixOpt.Prefix != nil && prefixOpt.Prefix.IP != nil {
				return prefixOpt.Prefix
			}
		}
	}

	return nil
}

func addRDNSSOption(msg *dhcpv6.Message) {
	if len(dnsServers) > 0 {
		msg.AddOption(dhcpv6.OptDNS(dnsServers...))
		log.Printf("Added RDNSS option: %v", dnsServers)
	}
}

func handleSolicit(msg *dhcpv6.Message, peer net.Addr, duidStr string) *dhcpv6.Message {
	iaPd := msg.GetOneOption(dhcpv6.OptionIAPD)
	if iaPd == nil {
		log.Println("No IA_PD option in request")
		return nil
	}

	iaPdOpt, ok := iaPd.(*dhcpv6.OptIAPD)
	if !ok {
		log.Println("Invalid IA_PD option")
		return nil
	}

	leaseKey := getLeaseKey(duidStr, iaPdOpt.IaId)
	iaidStr := fmt.Sprintf("%x", iaPdOpt.IaId)

	leasesMutex.Lock()
	defer leasesMutex.Unlock()

	var prefix *net.IPNet
	var err error
	var isRenewal bool

	existingLease, exists := findLeaseByDUIDAndIAID(duidStr, iaPdOpt.IaId)
	if exists {
		_, p, err := net.ParseCIDR(existingLease.Prefix)
		if err == nil {
			prefix = p
			isRenewal = true
			log.Printf("Existing binding found for %s, reusing prefix %s", duidStr, prefix)
		}
	}

	if prefix == nil {
		requestedPrefix := getRequestedPrefix(msg)
		if requestedPrefix != nil && isPrefixInPool(requestedPrefix) {
			prefixStr := requestedPrefix.String()
			binding, bindingExists := findBindingByPrefix(prefixStr)
			if !bindingExists || (bindingExists && binding.DUID == duidStr && binding.IAID == iaPdOpt.IaId) {
				prefix = requestedPrefix
				log.Printf("Client requested valid prefix %s, assigning", prefixStr)
			}
		}
	}

	if prefix == nil {
		prefix, err = allocatePrefix()
		if err != nil {
			log.Printf("Failed to allocate prefix: %v", err)
			addLogEntry("ERROR", duidStr, "", iaidStr, peer.String(),
				fmt.Sprintf("Failed to allocate prefix: %v", err))
			return nil
		}
		log.Printf("Allocated new prefix %s to client %s", prefix, duidStr)
	}

	prefixLen, _ := prefix.Mask.Size()
	renewCount := 0
	if existingLease != nil {
		renewCount = existingLease.RenewCount + 1
	}

	lease := &Lease{
		DUID:       duidStr,
		Prefix:     prefix.String(),
		PrefixLen:  prefixLen,
		IAID:       iaidStr,
		IAIDNum:    iaidToUint32(iaPdOpt.IaId),
		AssignedAt: time.Now(),
		ExpiresAt:  time.Now().Add(leaseTime),
		ClientAddr: peer.String(),
		RenewCount: renewCount,
	}

	updateLease(leaseKey, lease, prefix, iaPdOpt.IaId)

	if isRenewal {
		log.Printf("Renewed prefix %s for client %s (renewal count: %d)", prefix, duidStr, renewCount)
		addLogEntry("RENEW", duidStr, prefix.String(), iaidStr, peer.String(),
			fmt.Sprintf("Renewed prefix %s, renewal count: %d", prefix, renewCount))
	} else {
		log.Printf("Assigned new prefix %s to client %s", prefix, duidStr)
		addLogEntry("ASSIGN", duidStr, prefix.String(), iaidStr, peer.String(),
			fmt.Sprintf("Assigned new prefix %s from pool", prefix))
	}

	adv, err := dhcpv6.NewAdvertiseFromSolicit(msg)
	if err != nil {
		log.Printf("Failed to create advertise: %v", err)
		return nil
	}

	prefixOption := &dhcpv6.OptIAPrefix{
		PreferredLifetime: leaseTime,
		ValidLifetime:     leaseTime,
		Prefix: &net.IPNet{
			IP:   prefix.IP,
			Mask: net.CIDRMask(prefixLen, 128),
		},
	}

	newIaPdOpt := &dhcpv6.OptIAPD{
		IaId: iaPdOpt.IaId,
		T1:   leaseTime / 2,
		T2:   leaseTime * 3 / 4,
		Options: dhcpv6.PDOptions{
			Options: []dhcpv6.Option{prefixOption},
		},
	}

	adv.AddOption(newIaPdOpt)

	addRDNSSOption(adv)

	return adv
}

func handleRequest(msg *dhcpv6.Message, peer net.Addr, duidStr string) *dhcpv6.Message {
	iaPd := msg.GetOneOption(dhcpv6.OptionIAPD)
	if iaPd == nil {
		log.Println("No IA_PD option in request")
		return nil
	}

	iaPdOpt, ok := iaPd.(*dhcpv6.OptIAPD)
	if !ok {
		log.Println("Invalid IA_PD option")
		return nil
	}

	leaseKey := getLeaseKey(duidStr, iaPdOpt.IaId)
	iaidStr := fmt.Sprintf("%x", iaPdOpt.IaId)

	leasesMutex.Lock()
	defer leasesMutex.Unlock()

	var prefix *net.IPNet
	var err error
	var isRenewal bool

	existingLease, exists := findLeaseByDUIDAndIAID(duidStr, iaPdOpt.IaId)
	if exists {
		_, p, err := net.ParseCIDR(existingLease.Prefix)
		if err == nil {
			prefix = p
			isRenewal = true
			log.Printf("Renewal request from %s, reusing prefix %s", duidStr, prefix)
		}
	}

	if prefix == nil {
		requestedPrefix := getRequestedPrefix(msg)
		if requestedPrefix != nil && isPrefixInPool(requestedPrefix) {
			prefixStr := requestedPrefix.String()
			binding, bindingExists := findBindingByPrefix(prefixStr)
			if !bindingExists || (bindingExists && binding.DUID == duidStr && binding.IAID == iaPdOpt.IaId) {
				prefix = requestedPrefix
				log.Printf("Client requested valid prefix %s, assigning", prefixStr)
			}
		}
	}

	if prefix == nil {
		prefix, err = allocatePrefix()
		if err != nil {
			log.Printf("Failed to allocate prefix: %v", err)
			addLogEntry("ERROR", duidStr, "", iaidStr, peer.String(),
				fmt.Sprintf("Failed to allocate prefix: %v", err))
			return nil
		}
		log.Printf("Allocated new prefix %s to client %s", prefix, duidStr)
	}

	prefixLen, _ := prefix.Mask.Size()
	renewCount := 0
	if existingLease != nil {
		renewCount = existingLease.RenewCount + 1
	}

	lease := &Lease{
		DUID:       duidStr,
		Prefix:     prefix.String(),
		PrefixLen:  prefixLen,
		IAID:       iaidStr,
		IAIDNum:    iaidToUint32(iaPdOpt.IaId),
		AssignedAt: time.Now(),
		ExpiresAt:  time.Now().Add(leaseTime),
		ClientAddr: peer.String(),
		RenewCount: renewCount,
	}

	updateLease(leaseKey, lease, prefix, iaPdOpt.IaId)

	if isRenewal {
		log.Printf("Renewed prefix %s for client %s (renewal count: %d)", prefix, duidStr, renewCount)
		addLogEntry("RENEW", duidStr, prefix.String(), iaidStr, peer.String(),
			fmt.Sprintf("Renewed prefix %s, renewal count: %d", prefix, renewCount))
	} else {
		log.Printf("Assigned new prefix %s to client %s", prefix, duidStr)
		addLogEntry("ASSIGN", duidStr, prefix.String(), iaidStr, peer.String(),
			fmt.Sprintf("Assigned new prefix %s from pool", prefix))
	}

	reply, err := dhcpv6.NewReplyFromMessage(msg)
	if err != nil {
		log.Printf("Failed to create reply: %v", err)
		return nil
	}

	prefixOption := &dhcpv6.OptIAPrefix{
		PreferredLifetime: leaseTime,
		ValidLifetime:     leaseTime,
		Prefix: &net.IPNet{
			IP:   prefix.IP,
			Mask: net.CIDRMask(prefixLen, 128),
		},
	}

	newIaPdOpt := &dhcpv6.OptIAPD{
		IaId: iaPdOpt.IaId,
		T1:   leaseTime / 2,
		T2:   leaseTime * 3 / 4,
		Options: dhcpv6.PDOptions{
			Options: []dhcpv6.Option{prefixOption},
		},
	}

	reply.AddOption(newIaPdOpt)

	addRDNSSOption(reply)

	return reply
}

func handleRelease(msg *dhcpv6.Message, duidStr string) {
	iaPd := msg.GetOneOption(dhcpv6.OptionIAPD)
	if iaPd == nil {
		return
	}

	iaPdOpt, ok := iaPd.(*dhcpv6.OptIAPD)
	if !ok {
		return
	}

	leaseKey := getLeaseKey(duidStr, iaPdOpt.IaId)
	iaidStr := fmt.Sprintf("%x", iaPdOpt.IaId)

	leasesMutex.Lock()
	defer leasesMutex.Unlock()

	lease, exists := leases[leaseKey]
	if exists {
		addLogEntry("RELEASE", duidStr, lease.Prefix, iaidStr, "",
			fmt.Sprintf("Client released prefix %s", lease.Prefix))
	}

	removeLease(leaseKey)
}

func handlePacket(conn net.PacketConn, peer net.Addr, buf []byte) {
	msg, err := dhcpv6.FromBytes(buf)
	if err != nil {
		log.Printf("Error parsing DHCPv6 message: %v", err)
		return
	}

	dMsg, ok := msg.(*dhcpv6.Message)
	if !ok {
		log.Println("Not a DHCPv6 Message")
		return
	}

	clientIDOpt := dMsg.GetOneOption(dhcpv6.OptionClientID)
	if clientIDOpt == nil {
		log.Println("No client DUID in request")
		return
	}

	optClientID, ok := clientIDOpt.(dhcpv6.Option)
	if !ok {
		log.Println("Invalid client ID option")
		return
	}

	optCID, ok := optClientID.(interface{ GetCID() dhcpv6.DUID })
	if !ok {
		log.Println("Cannot get CID from option")
		return
	}

	duid := optCID.GetCID()
	duidStr := hex.EncodeToString(duid.ToBytes())

	log.Printf("Received %s from %s (DUID: %s)", dMsg.Type(), peer.String(), duidStr)

	var response *dhcpv6.Message

	switch dMsg.Type() {
	case dhcpv6.MessageTypeSolicit:
		response = handleSolicit(dMsg, peer, duidStr)
	case dhcpv6.MessageTypeRequest:
		response = handleRequest(dMsg, peer, duidStr)
	case dhcpv6.MessageTypeRenew:
		log.Printf("Processing RENEW for client %s", duidStr)
		response = handleRequest(dMsg, peer, duidStr)
	case dhcpv6.MessageTypeRebind:
		log.Printf("Processing REBIND for client %s", duidStr)
		response = handleRequest(dMsg, peer, duidStr)
	case dhcpv6.MessageTypeConfirm:
		log.Printf("Processing CONFIRM for client %s", duidStr)
		response = handleRequest(dMsg, peer, duidStr)
	case dhcpv6.MessageTypeRelease:
		handleRelease(dMsg, duidStr)
		return
	default:
		log.Printf("Unsupported message type: %s", dMsg.Type())
		return
	}

	if response == nil {
		return
	}

	responseBytes := response.ToBytes()
	_, err = conn.WriteTo(responseBytes, peer)
	if err != nil {
		log.Printf("Failed to send reply: %v", err)
	}
}

func startDHCPv6Server() error {
	conn, err := net.ListenPacket("udp6", serverPort)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %v", serverPort, err)
	}
	defer conn.Close()

	log.Printf("DHCPv6 server listening on %s", serverPort)

	buf := make([]byte, 1500)
	for {
		n, peer, err := conn.ReadFrom(buf)
		if err != nil {
			log.Printf("Error reading packet: %v", err)
			continue
		}

		go handlePacket(conn, peer, buf[:n])
	}
}

func startHTTPServer() error {
	http.HandleFunc("/api/leases", getLeasesHandler)
	http.HandleFunc("/api/stats", getStatsHandler)
	http.HandleFunc("/api/bindings", getBindingsHandler)
	http.HandleFunc("/api/logs", getLogsHandler)
	http.HandleFunc("/api/logs/export", exportLogsHandler)
	http.Handle("/", http.FileServer(http.Dir("./static")))

	log.Printf("HTTP server listening on http://localhost%s", httpPort)
	return http.ListenAndServe(httpPort, nil)
}

func getLeasesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	leasesMutex.RLock()
	leaseList := make([]*Lease, 0, len(leases))
	for _, lease := range leases {
		leaseList = append(leaseList, lease)
	}
	leasesMutex.RUnlock()

	json.NewEncoder(w).Encode(leaseList)
}

func getBindingsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	leasesMutex.RLock()
	bindingList := make([]*PrefixBinding, 0, len(assignedPrefixes))
	for _, binding := range assignedPrefixes {
		bindingList = append(bindingList, binding)
	}
	leasesMutex.RUnlock()

	json.NewEncoder(w).Encode(bindingList)
}

func getStatsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	leasesMutex.RLock()
	leaseCount := len(leases)
	prefixCount := len(assignedPrefixes)
	logCount := len(allocationLogs)
	leasesMutex.RUnlock()

	poolOnes, _ := prefixPool.Mask.Size()
	subnetBits := 64 - poolOnes
	totalPrefixes := 1 << uint(subnetBits)
	availablePrefixes := totalPrefixes - prefixCount

	stats := map[string]interface{}{
		"leaseCount":        leaseCount,
		"bindingCount":      prefixCount,
		"totalPrefixes":     totalPrefixes,
		"availablePrefixes": availablePrefixes,
		"prefixPool":        prefixPoolStr,
		"leaseTime":         leaseTime.String(),
		"serverTime":        time.Now(),
		"logCount":          logCount,
		"dnsServers":        dnsServers,
	}

	json.NewEncoder(w).Encode(stats)
}

func getLogsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	eventType := r.URL.Query().Get("type")
	limit := r.URL.Query().Get("limit")

	leasesMutex.RLock()
	defer leasesMutex.RUnlock()

	var logs []*LogEntry
	if eventType != "" {
		for _, entry := range allocationLogs {
			if entry.EventType == eventType {
				logs = append(logs, entry)
			}
		}
	} else {
		logs = make([]*LogEntry, len(allocationLogs))
		copy(logs, allocationLogs)
	}

	sort.Slice(logs, func(i, j int) bool {
		return logs[i].Timestamp.After(logs[j].Timestamp)
	})

	if limit != "" {
		var n int
		fmt.Sscanf(limit, "%d", &n)
		if n > 0 && n < len(logs) {
			logs = logs[:n]
		}
	}

	json.NewEncoder(w).Encode(logs)
}

func exportLogsHandler(w http.ResponseWriter, r *http.Request) {
	eventType := r.URL.Query().Get("type")
	format := r.URL.Query().Get("format")

	leasesMutex.RLock()
	defer leasesMutex.RUnlock()

	var logs []*LogEntry
	if eventType != "" {
		for _, entry := range allocationLogs {
			if entry.EventType == eventType {
				logs = append(logs, entry)
			}
		}
	} else {
		logs = make([]*LogEntry, len(allocationLogs))
		copy(logs, allocationLogs)
	}

	sort.Slice(logs, func(i, j int) bool {
		return logs[i].Timestamp.After(logs[j].Timestamp)
	})

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=dhcpv6-logs.csv")

		fmt.Fprintln(w, "时间,事件类型,DUID,前缀,IAID,客户端地址,消息")
		for _, entry := range logs {
			fmt.Fprintf(w, "%s,%s,%s,%s,%s,%s,%s\n",
				entry.Timestamp.Format(time.RFC3339),
				entry.EventType,
				entry.DUID,
				entry.Prefix,
				entry.IAID,
				entry.ClientAddr,
				entry.Message,
			)
		}
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=dhcpv6-logs.json")
		json.NewEncoder(w).Encode(logs)
	}
}

func main() {
	if err := initPrefixPool(); err != nil {
		log.Fatalf("Failed to initialize prefix pool: %v", err)
	}

	initDNSServers()

	log.Println("Starting DHCPv6 Server with Prefix Delegation...")
	log.Printf("Prefix Pool: %s", prefixPoolStr)
	log.Printf("Lease Time: %s", leaseTime)
	log.Printf("DNS Servers: %v", dnsServers)

	if err := os.MkdirAll("./static", 0755); err != nil {
		log.Fatalf("Failed to create static directory: %v", err)
	}

	startCleanupRoutine()

	go func() {
		if err := startHTTPServer(); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	if err := startDHCPv6Server(); err != nil {
		log.Fatalf("DHCPv6 server error: %v", err)
	}
}
