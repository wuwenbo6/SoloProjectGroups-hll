package lldp

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

type mockDevice struct {
	systemName   string
	chassisID    string
	mgmtAddr     string
	systemDesc   string
	ports        []string
	capabilities Capabilities
}

type mockLink struct {
	fromDevice int
	fromPort   int
	toDevice   int
	toPort     int
}

type LLDSimulator struct {
	Events chan LLDPEvent
	stop   chan struct{}
}

func NewSimulator() *LLDSimulator {
	return &LLDSimulator{
		Events: make(chan LLDPEvent, 64),
		stop:   make(chan struct{}),
	}
}

func (s *LLDSimulator) Start() {
	devices := s.generateDevices()
	links := s.generateLinks(len(devices))

	go s.emitLoop(devices, links)
}

func (s *LLDSimulator) Stop() {
	close(s.stop)
}

func (s *LLDSimulator) generateDevices() []mockDevice {
	coreCount := 2
	distCount := 3
	accessCount := 3
	total := coreCount + distCount + accessCount

	devices := make([]mockDevice, total)

	corePorts := []string{"Gi0/1", "Gi0/2", "Gi0/3", "Gi0/4", "Te0/1"}
	distPorts := []string{"Gi0/1", "Gi0/2", "Gi0/3", "Gi0/4", "Gi0/5", "Gi0/6"}
	accessPorts := []string{"Gi0/1", "Gi0/2", "Fa0/1", "Fa0/2", "Fa0/3", "Fa0/4", "Fa0/5", "Fa0/6"}

	for i := 0; i < coreCount; i++ {
		devices[i] = mockDevice{
			systemName: fmt.Sprintf("sw-core-%02d", i+1),
			chassisID:  fmt.Sprintf("00:1a:2b:3c:00:%02x", i+1),
			mgmtAddr:   fmt.Sprintf("10.0.0.%d", i+1),
			systemDesc: "Cisco Nexus 9300, NX-OS 9.3(8), Core Switch",
			ports:      corePorts,
			capabilities: Capabilities{
				Available: []string{"Bridge", "Router"},
				Enabled:   []string{"Bridge", "Router"},
			},
		}
	}

	for i := 0; i < distCount; i++ {
		idx := coreCount + i
		devices[idx] = mockDevice{
			systemName: fmt.Sprintf("sw-dist-%02d", i+1),
			chassisID:  fmt.Sprintf("00:1a:2b:3c:10:%02x", i+1),
			mgmtAddr:   fmt.Sprintf("10.0.1.%d", i+1),
			systemDesc: "Cisco Catalyst 3850, IOS-XE 16.9, Distribution Switch",
			ports:      distPorts,
			capabilities: Capabilities{
				Available: []string{"Bridge", "Router"},
				Enabled:   []string{"Bridge"},
			},
		}
	}

	for i := 0; i < accessCount; i++ {
		idx := coreCount + distCount + i
		devices[idx] = mockDevice{
			systemName: fmt.Sprintf("sw-access-%02d", i+1),
			chassisID:  fmt.Sprintf("00:1a:2b:3c:20:%02x", i+1),
			mgmtAddr:   fmt.Sprintf("10.0.2.%d", i+1),
			systemDesc: "Cisco Catalyst 2960, IOS 15.2, Access Switch",
			ports:      accessPorts,
			capabilities: Capabilities{
				Available: []string{"Bridge"},
				Enabled:   []string{"Bridge"},
			},
		}
	}

	return devices
}

func (s *LLDSimulator) generateLinks(deviceCount int) []mockLink {
	var links []mockLink

	links = append(links, mockLink{fromDevice: 0, fromPort: 0, toDevice: 1, toPort: 0})
	links = append(links, mockLink{fromDevice: 0, fromPort: 1, toDevice: 1, toPort: 1})

	links = append(links, mockLink{fromDevice: 0, fromPort: 2, toDevice: 2, toPort: 0})
	links = append(links, mockLink{fromDevice: 0, fromPort: 3, toDevice: 3, toPort: 0})

	links = append(links, mockLink{fromDevice: 1, fromPort: 2, toDevice: 4, toPort: 0})
	links = append(links, mockLink{fromDevice: 1, fromPort: 3, toDevice: 4, toPort: 1})

	links = append(links, mockLink{fromDevice: 2, fromPort: 1, toDevice: 5, toPort: 0})
	links = append(links, mockLink{fromDevice: 2, fromPort: 2, toDevice: 6, toPort: 0})

	links = append(links, mockLink{fromDevice: 3, fromPort: 1, toDevice: 6, toPort: 1})
	links = append(links, mockLink{fromDevice: 3, fromPort: 2, toDevice: 5, toPort: 1})

	links = append(links, mockLink{fromDevice: 4, fromPort: 2, toDevice: 5, toPort: 2})
	links = append(links, mockLink{fromDevice: 4, fromPort: 3, toDevice: 6, toPort: 2})

	return links
}

func (s *LLDSimulator) emitLoop(devices []mockDevice, links []mockLink) {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	portStats := make(map[string]*PortStats)
	getOrCreateStats := func(deviceChassis, portID string, isUplink bool) *PortStats {
		key := deviceChassis + ":" + portID
		if _, ok := portStats[key]; !ok {
			speed := 1000
			if isUplink {
				speed = 10000
			}
			portStats[key] = &PortStats{
				SpeedMbps: speed,
			}
		}
		return portStats[key]
	}

	for {
		select {
		case <-s.stop:
			return
		default:
		}

		link := links[r.Intn(len(links))]
		from := devices[link.fromDevice]
		to := devices[link.toDevice]

		if link.fromPort < len(from.ports) && link.toPort < len(to.ports) {
			fromPort := from.ports[link.fromPort]
			toPort := to.ports[link.toPort]

			now := time.Now()

			fromIsCore := containsStr(from.capabilities.Enabled, "Router")
			toIsCore := containsStr(to.capabilities.Enabled, "Router")
			fromIsUplink := r.Intn(3) == 0 || fromIsCore
			toIsUplink := r.Intn(3) == 0 || toIsCore

			fromStats := getOrCreateStats(from.chassisID, fromPort, fromIsUplink)
			toStats := getOrCreateStats(to.chassisID, toPort, toIsUplink)

			for _, st := range []*PortStats{fromStats, toStats} {
				maxSpeed := float64(st.SpeedMbps)
				targetUtil := r.Float64() * 0.8
				delta := (targetUtil - st.Utilization) * 0.3
				st.Utilization = math.Max(0.01, math.Min(maxSpeed, st.Utilization+delta))
				bytes := uint64(st.Utilization * float64(st.SpeedMbps) * 125000)
				st.InOctets += bytes
				st.OutOctets += bytes
				st.LastUpdated = now
			}

			s.Events <- LLDPEvent{
				ChassisID:        from.chassisID,
				ChassisIDSubtype: "4",
				PortID:           fromPort,
				PortIDSubtype:    "7",
				SystemName:       from.systemName,
				SystemDesc:       from.systemDesc,
				MgmtAddr:         from.mgmtAddr,
				TTL:              120,
				TargetChassisID:  to.chassisID,
				TargetPortID:     toPort,
				Capabilities:     from.capabilities,
				PortStats:        *fromStats,
				TLVs: []TLVEntry{
					{Type: 5, TypeName: "SystemName", Value: from.systemName},
					{Type: 6, TypeName: "SystemDescription", Value: from.systemDesc},
					{Type: 7, TypeName: "SystemCapabilities", Value: fmt.Sprintf("available=%v enabled=%v", from.capabilities.Available, from.capabilities.Enabled)},
					{Type: 8, TypeName: "ManagementAddress", Value: from.mgmtAddr},
					{Type: 4, TypeName: "PortDescription", Value: fmt.Sprintf("Connected to %s %s", to.systemName, toPort)},
				},
			}

			s.Events <- LLDPEvent{
				ChassisID:        to.chassisID,
				ChassisIDSubtype: "4",
				PortID:           toPort,
				PortIDSubtype:    "7",
				SystemName:       to.systemName,
				SystemDesc:       to.systemDesc,
				MgmtAddr:         to.mgmtAddr,
				TTL:              120,
				TargetChassisID:  from.chassisID,
				TargetPortID:     fromPort,
				Capabilities:     to.capabilities,
				PortStats:        *toStats,
				TLVs: []TLVEntry{
					{Type: 5, TypeName: "SystemName", Value: to.systemName},
					{Type: 6, TypeName: "SystemDescription", Value: to.systemDesc},
					{Type: 7, TypeName: "SystemCapabilities", Value: fmt.Sprintf("available=%v enabled=%v", to.capabilities.Available, to.capabilities.Enabled)},
					{Type: 8, TypeName: "ManagementAddress", Value: to.mgmtAddr},
					{Type: 4, TypeName: "PortDescription", Value: fmt.Sprintf("Connected to %s %s", from.systemName, fromPort)},
				},
			}
		}

		interval := 5 + r.Intn(6)
		select {
		case <-s.stop:
			return
		case <-time.After(time.Duration(interval) * time.Second):
		}
	}
}

func containsStr(arr []string, s string) bool {
	for _, a := range arr {
		if a == s {
			return true
		}
	}
	return false
}
