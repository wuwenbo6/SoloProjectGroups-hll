package topology

import (
	"crypto/sha256"
	"fmt"
	"sync"
	"time"

	"github.com/user/lldp-topology/internal/lldp"
)

type TLV struct {
	Type     int    `json:"type"`
	TypeName string `json:"typeName"`
	Value    string `json:"value"`
}

type Port struct {
	ID          string    `json:"id"`
	Subtype     string    `json:"subtype"`
	Description string    `json:"description"`
	SpeedMbps   int       `json:"speedMbps"`
	Utilization float64   `json:"utilization"`
	InOctets    uint64    `json:"inOctets"`
	OutOctets   uint64    `json:"outOctets"`
	LastUpdated time.Time `json:"lastUpdated"`
}

type Device struct {
	ID                string            `json:"id"`
	ChassisID         string            `json:"chassisId"`
	ChassisIDSubtype  string            `json:"chassisIdSubtype"`
	SystemName        string            `json:"systemName"`
	SystemDescription string            `json:"systemDescription"`
	ManagementAddress string            `json:"managementAddress"`
	Ports             []Port            `json:"ports"`
	TTL               int               `json:"ttl"`
	TLVs              []TLV             `json:"tlvs"`
	Capabilities      lldp.Capabilities `json:"capabilities"`
	LastSeen          time.Time         `json:"lastSeen"`
	Status            string            `json:"status"`
}

type Link struct {
	ID             string `json:"id"`
	SourceDeviceID string `json:"sourceDeviceId"`
	SourcePortID   string `json:"sourcePortId"`
	TargetDeviceID string `json:"targetDeviceId"`
	TargetPortID   string `json:"targetPortId"`
}

type TopologyData struct {
	Devices []Device `json:"devices"`
	Links   []Link   `json:"links"`
}

type TopologyStore struct {
	mu       sync.RWMutex
	Devices  map[string]*Device
	Links    map[string]*Link
	onChange []func()
}

func NewTopologyStore() *TopologyStore {
	return &TopologyStore{
		Devices:  make(map[string]*Device),
		Links:    make(map[string]*Link),
		onChange: nil,
	}
}

func (s *TopologyStore) OnChange(fn func()) {
	s.mu.Lock()
	s.onChange = append(s.onChange, fn)
	s.mu.Unlock()
}

func (s *TopologyStore) notifyChange() {
	for _, fn := range s.onChange {
		go fn()
	}
}

func deviceID(chassisID string) string {
	return chassisID
}

func linkID(srcDeviceID, srcPortID, tgtDeviceID, tgtPortID string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s-%s:%s", srcDeviceID, srcPortID, tgtDeviceID, tgtPortID)))
	return fmt.Sprintf("%x", h[:8])
}

func addOrUpdatePort(dev *Device, portID, portSubtype string, tlvs []TLV, stats lldp.PortStats) {
	description := ""
	for _, tlv := range tlvs {
		if tlv.Type == 4 {
			description = tlv.Value
			break
		}
	}

	for i := range dev.Ports {
		if dev.Ports[i].ID == portID {
			dev.Ports[i].Subtype = portSubtype
			dev.Ports[i].Description = description
			dev.Ports[i].SpeedMbps = stats.SpeedMbps
			dev.Ports[i].Utilization = stats.Utilization
			dev.Ports[i].InOctets = stats.InOctets
			dev.Ports[i].OutOctets = stats.OutOctets
			if !stats.LastUpdated.IsZero() {
				dev.Ports[i].LastUpdated = stats.LastUpdated
			}
			return
		}
	}

	dev.Ports = append(dev.Ports, Port{
		ID:          portID,
		Subtype:     portSubtype,
		Description: description,
		SpeedMbps:   stats.SpeedMbps,
		Utilization: stats.Utilization,
		InOctets:    stats.InOctets,
		OutOctets:   stats.OutOctets,
		LastUpdated: stats.LastUpdated,
	})
}

func (s *TopologyStore) ProcessLLDP(ev lldp.LLDPEvent) {
	s.mu.Lock()

	id := deviceID(ev.ChassisID)

	tlvs := make([]TLV, len(ev.TLVs))
	for i, t := range ev.TLVs {
		tlvs[i] = TLV{Type: t.Type, TypeName: t.TypeName, Value: t.Value}
	}

	now := time.Now()

	if dev, ok := s.Devices[id]; ok {
		dev.ChassisIDSubtype = ev.ChassisIDSubtype
		dev.SystemName = ev.SystemName
		dev.SystemDescription = ev.SystemDesc
		dev.ManagementAddress = ev.MgmtAddr
		dev.TTL = ev.TTL
		dev.TLVs = tlvs
		dev.LastSeen = now
		dev.Status = "online"
		if len(ev.Capabilities.Available) > 0 {
			dev.Capabilities = ev.Capabilities
		}
		addOrUpdatePort(dev, ev.PortID, ev.PortIDSubtype, tlvs, ev.PortStats)
	} else {
		dev := &Device{
			ID:                id,
			ChassisID:         ev.ChassisID,
			ChassisIDSubtype:  ev.ChassisIDSubtype,
			SystemName:        ev.SystemName,
			SystemDescription: ev.SystemDesc,
			ManagementAddress: ev.MgmtAddr,
			Ports:             []Port{{ID: ev.PortID, Subtype: ev.PortIDSubtype, SpeedMbps: ev.PortStats.SpeedMbps, Utilization: ev.PortStats.Utilization, InOctets: ev.PortStats.InOctets, OutOctets: ev.PortStats.OutOctets, LastUpdated: ev.PortStats.LastUpdated}},
			TTL:               ev.TTL,
			TLVs:              tlvs,
			Capabilities:      ev.Capabilities,
			LastSeen:          now,
			Status:            "online",
		}
		for _, tlv := range tlvs {
			if tlv.Type == 4 {
				dev.Ports[0].Description = tlv.Value
				break
			}
		}
		s.Devices[id] = dev
	}

	targetDevID := s.findTargetDevice(ev)
	if targetDevID != "" {
		lid := linkID(id, ev.PortID, targetDevID, "")
		if _, ok := s.Links[lid]; !ok {
			s.Links[lid] = &Link{
				ID:             lid,
				SourceDeviceID: id,
				SourcePortID:   ev.PortID,
				TargetDeviceID: targetDevID,
			}
		}
	}

	s.mu.Unlock()
	s.notifyChange()
}

func (s *TopologyStore) findTargetDevice(ev lldp.LLDPEvent) string {
	for _, tlv := range ev.TLVs {
		if tlv.Type == 4 {
			for _, dev := range s.Devices {
				if dev.ChassisID != ev.ChassisID && dev.SystemName != "" {
					return dev.ID
				}
			}
		}
	}
	return ""
}

func (s *TopologyStore) ProcessLLDPWithTarget(ev lldp.LLDPEvent, targetChassisID, targetPortID string) {
	s.mu.Lock()

	id := deviceID(ev.ChassisID)

	tlvs := make([]TLV, len(ev.TLVs))
	for i, t := range ev.TLVs {
		tlvs[i] = TLV{Type: t.Type, TypeName: t.TypeName, Value: t.Value}
	}

	now := time.Now()

	if dev, ok := s.Devices[id]; ok {
		dev.ChassisIDSubtype = ev.ChassisIDSubtype
		dev.SystemName = ev.SystemName
		dev.SystemDescription = ev.SystemDesc
		dev.ManagementAddress = ev.MgmtAddr
		dev.TTL = ev.TTL
		dev.TLVs = tlvs
		dev.LastSeen = now
		dev.Status = "online"
		if len(ev.Capabilities.Available) > 0 {
			dev.Capabilities = ev.Capabilities
		}
		addOrUpdatePort(dev, ev.PortID, ev.PortIDSubtype, tlvs, ev.PortStats)
	} else {
		dev := &Device{
			ID:                id,
			ChassisID:         ev.ChassisID,
			ChassisIDSubtype:  ev.ChassisIDSubtype,
			SystemName:        ev.SystemName,
			SystemDescription: ev.SystemDesc,
			ManagementAddress: ev.MgmtAddr,
			Ports:             []Port{{ID: ev.PortID, Subtype: ev.PortIDSubtype, SpeedMbps: ev.PortStats.SpeedMbps, Utilization: ev.PortStats.Utilization, InOctets: ev.PortStats.InOctets, OutOctets: ev.PortStats.OutOctets, LastUpdated: ev.PortStats.LastUpdated}},
			TTL:               ev.TTL,
			TLVs:              tlvs,
			Capabilities:      ev.Capabilities,
			LastSeen:          now,
			Status:            "online",
		}
		for _, tlv := range tlvs {
			if tlv.Type == 4 {
				dev.Ports[0].Description = tlv.Value
				break
			}
		}
		s.Devices[id] = dev
	}

	if targetChassisID != "" {
		targetDevID := deviceID(targetChassisID)

		if _, ok := s.Devices[targetDevID]; !ok {
			s.Devices[targetDevID] = &Device{
				ID:        targetDevID,
				ChassisID: targetChassisID,
				Ports:     []Port{{ID: targetPortID}},
				LastSeen:  now,
				Status:    "online",
			}
		} else {
			if targetPortID != "" {
				addOrUpdatePort(s.Devices[targetDevID], targetPortID, "", nil, lldp.PortStats{})
			}
		}

		lid := linkID(id, ev.PortID, targetDevID, targetPortID)
		if _, ok := s.Links[lid]; !ok {
			s.Links[lid] = &Link{
				ID:             lid,
				SourceDeviceID: id,
				SourcePortID:   ev.PortID,
				TargetDeviceID: targetDevID,
				TargetPortID:   targetPortID,
			}
		}
	}

	s.mu.Unlock()
	s.notifyChange()
}

func (s *TopologyStore) GetTopology() TopologyData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	devices := make([]Device, 0, len(s.Devices))
	for _, d := range s.Devices {
		devices = append(devices, *d)
	}

	links := make([]Link, 0, len(s.Links))
	for _, l := range s.Links {
		links = append(links, *l)
	}

	return TopologyData{Devices: devices, Links: links}
}

func (s *TopologyStore) GetDevices() []Device {
	s.mu.RLock()
	defer s.mu.RUnlock()

	devices := make([]Device, 0, len(s.Devices))
	for _, d := range s.Devices {
		devices = append(devices, *d)
	}
	return devices
}

func (s *TopologyStore) GetDevice(id string) *Device {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if d, ok := s.Devices[id]; ok {
		cp := *d
		return &cp
	}
	return nil
}

func (s *TopologyStore) GetNeighbors(id string) ([]Device, []Link) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	neighborIDs := make(map[string]bool)
	var neighborLinks []Link

	for _, l := range s.Links {
		if l.SourceDeviceID == id {
			neighborIDs[l.TargetDeviceID] = true
			neighborLinks = append(neighborLinks, *l)
		}
		if l.TargetDeviceID == id {
			neighborIDs[l.SourceDeviceID] = true
			neighborLinks = append(neighborLinks, *l)
		}
	}

	var neighbors []Device
	for nid := range neighborIDs {
		if d, ok := s.Devices[nid]; ok {
			neighbors = append(neighbors, *d)
		}
	}

	return neighbors, neighborLinks
}

func (s *TopologyStore) StartCleanupTask() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			s.mu.Lock()
			now := time.Now()
			changed := false
			for _, d := range s.Devices {
				if d.Status == "online" {
					threshold := time.Duration(d.TTL*2) * time.Second
					if now.Sub(d.LastSeen) > threshold {
						d.Status = "offline"
						changed = true
					}
				}
			}
			s.mu.Unlock()

			if changed {
				s.notifyChange()
			}
		}
	}()
}
