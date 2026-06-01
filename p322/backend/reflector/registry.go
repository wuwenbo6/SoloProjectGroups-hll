package reflector

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"mdns-reflector/model"

	"github.com/google/uuid"
)

type Registry struct {
	mu               sync.RWMutex
	services         map[string]*model.MDnsService
	records          map[string]*model.ServiceRecords
	subnets          map[string]*model.Subnet
	ttlTimers        map[string]*time.Timer
	bus              *Bus
	serviceInstances map[string][]string
	authPolicy       *model.AuthPolicy
}

func NewRegistry(bus *Bus) *Registry {
	r := &Registry{
		services:         make(map[string]*model.MDnsService),
		records:          make(map[string]*model.ServiceRecords),
		subnets:          make(map[string]*model.Subnet),
		ttlTimers:        make(map[string]*time.Timer),
		bus:              bus,
		serviceInstances: make(map[string][]string),
		authPolicy:       model.DefaultAuthPolicy(),
	}
	r.initSubnets()
	r.initServices()
	go r.ttlCountdownLoop()
	return r
}

func (r *Registry) initSubnets() {
	subnets := []*model.Subnet{
		{ID: "subnet-a", Name: "Office LAN", CIDR: "192.168.1.0/24", Color: "#00d4ff", Interface: "eth0"},
		{ID: "subnet-b", Name: "Guest WiFi", CIDR: "10.0.0.0/24", Color: "#00e676", Interface: "wlan0"},
		{ID: "subnet-c", Name: "IoT Network", CIDR: "172.16.0.0/24", Color: "#ff9f1c", Interface: "eth1"},
	}
	for _, s := range subnets {
		r.subnets[s.ID] = s
	}
}

func (r *Registry) initServices() {
	now := time.Now().UTC()
	services := []struct {
		Svc model.MDnsService
		Rec model.ServiceRecords
	}{
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "HP LaserJet Pro M404n", Type: model.ServiceTypePrinter,
				Subtype: "_printer._tcp.local", IP: "192.168.1.50", Port: 631,
				TXTRecords: map[string]string{"rp": "raw", "qtotal": "1", "mfg": "HP", "mdl": "LaserJet Pro M404n"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 120, TTLRemaining: 120, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_printer._tcp.local", SRV: model.SRVRecord{Target: "HP-LaserJet.local", Port: 631, Priority: 0, Weight: 100},
				TXT: map[string]string{"rp": "raw", "qtotal": "1", "mfg": "HP", "mdl": "LaserJet Pro M404n"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Apple TV Living Room", Type: model.ServiceTypeAirPlay,
				Subtype: "_airplay._tcp.local", IP: "192.168.1.101", Port: 7000,
				TXTRecords: map[string]string{"model": "AppleTV5,3", "deviceid": "AA:BB:CC:DD:EE:FF", "features": "0x5A7FFFF7,0x1E"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 4500, TTLRemaining: 4500, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_airplay._tcp.local", SRV: model.SRVRecord{Target: "Apple-TV.local", Port: 7000, Priority: 0, Weight: 50},
				TXT: map[string]string{"model": "AppleTV5,3", "deviceid": "AA:BB:CC:DD:EE:FF", "features": "0x5A7FFFF7,0x1E"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Apple TV Bedroom", Type: model.ServiceTypeAirPlay,
				Subtype: "_airplay._tcp.local", IP: "192.168.1.102", Port: 7000,
				TXTRecords: map[string]string{"model": "AppleTV6,2", "deviceid": "BB:CC:DD:EE:FF:AA", "features": "0x5A7FFFF7,0x1E"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 4500, TTLRemaining: 4500, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_airplay._tcp.local", SRV: model.SRVRecord{Target: "Apple-TV-Bedroom.local", Port: 7000, Priority: 10, Weight: 50},
				TXT: map[string]string{"model": "AppleTV6,2", "deviceid": "BB:CC:DD:EE:FF:AA", "features": "0x5A7FFFF7,0x1E"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Living Room Speaker", Type: model.ServiceTypeAirPlay,
				Subtype: "_airplay._tcp.local", IP: "10.0.0.45", Port: 7000,
				TXTRecords: map[string]string{"model": "HomePod1,1", "flags": "0x4"},
				Status:     model.StatusOnline, SubnetID: "subnet-b",
				TTL: 4500, TTLRemaining: 4500, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_airplay._tcp.local", SRV: model.SRVRecord{Target: "Living-Room-Speaker.local", Port: 7000, Priority: 0, Weight: 100},
				TXT: map[string]string{"model": "HomePod1,1", "flags": "0x4"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Brother MFC-L2750DW", Type: model.ServiceTypePrinter,
				Subtype: "_printer._tcp.local", IP: "10.0.0.80", Port: 631,
				TXTRecords: map[string]string{"rp": "ipp/print", "mfg": "Brother", "mdl": "MFC-L2750DW"},
				Status:     model.StatusOnline, SubnetID: "subnet-b",
				TTL: 120, TTLRemaining: 120, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_printer._tcp.local", SRV: model.SRVRecord{Target: "Brother-MFC.local", Port: 631, Priority: 0, Weight: 80},
				TXT: map[string]string{"rp": "ipp/print", "mfg": "Brother", "mdl": "MFC-L2750DW"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Philips Hue Bridge", Type: model.ServiceTypeHomeKit,
				Subtype: "_hap._tcp.local", IP: "172.16.0.10", Port: 8080,
				TXTRecords: map[string]string{"c#": "12", "ff": "0", "id": "12:34:56:78:9A:BC", "md": "BSB002", "pv": "1.1"},
				Status:     model.StatusOnline, SubnetID: "subnet-c",
				TTL: 3600, TTLRemaining: 3600, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_hap._tcp.local", SRV: model.SRVRecord{Target: "Hue-Bridge.local", Port: 8080, Priority: 0, Weight: 100},
				TXT: map[string]string{"c#": "12", "ff": "0", "id": "12:34:56:78:9A:BC", "md": "BSB002", "pv": "1.1"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Chromecast Ultra", Type: model.ServiceTypeChromecast,
				Subtype: "_googlecast._tcp.local", IP: "172.16.0.22", Port: 8009,
				TXTRecords: map[string]string{"fn": "Living Room TV", "md": "Chromecast Ultra", "ve": "05"},
				Status:     model.StatusOnline, SubnetID: "subnet-c",
				TTL: 1800, TTLRemaining: 1800, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_googlecast._tcp.local", SRV: model.SRVRecord{Target: "Chromecast-Ultra.local", Port: 8009, Priority: 0, Weight: 100},
				TXT: map[string]string{"fn": "Living Room TV", "md": "Chromecast Ultra", "ve": "05"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "NAS File Server", Type: model.ServiceTypeSMB,
				Subtype: "_smb._tcp.local", IP: "192.168.1.200", Port: 445,
				TXTRecords: map[string]string{"path": "/volume1", "workgroup": "WORKGROUP"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 7200, TTLRemaining: 7200, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_smb._tcp.local", SRV: model.SRVRecord{Target: "NAS-FileServer.local", Port: 445, Priority: 0, Weight: 100},
				TXT: map[string]string{"path": "/volume1", "workgroup": "WORKGROUP"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "NAS File Server (Backup)", Type: model.ServiceTypeSMB,
				Subtype: "_smb._tcp.local", IP: "192.168.1.201", Port: 445,
				TXTRecords: map[string]string{"path": "/backup", "workgroup": "WORKGROUP"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 7200, TTLRemaining: 7200, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_smb._tcp.local", SRV: model.SRVRecord{Target: "NAS-Backup.local", Port: 445, Priority: 100, Weight: 50},
				TXT: map[string]string{"path": "/backup", "workgroup": "WORKGROUP"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "HomeKit Thermostat", Type: model.ServiceTypeHomeKit,
				Subtype: "_hap._tcp.local", IP: "172.16.0.35", Port: 8080,
				TXTRecords: map[string]string{"c#": "3", "id": "AB:CD:EF:12:34:56", "md": "thermostat1", "pv": "1.1"},
				Status:     model.StatusOnline, SubnetID: "subnet-c",
				TTL: 3600, TTLRemaining: 3600, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_hap._tcp.local", SRV: model.SRVRecord{Target: "Thermostat.local", Port: 8080, Priority: 0, Weight: 100},
				TXT: map[string]string{"c#": "3", "id": "AB:CD:EF:12:34:56", "md": "thermostat1", "pv": "1.1"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "Web Config Panel", Type: model.ServiceTypeHTTP,
				Subtype: "_http._tcp.local", IP: "192.168.1.254", Port: 80,
				TXTRecords: map[string]string{"path": "/admin", "txtvers": "1"},
				Status:     model.StatusOffline, SubnetID: "subnet-a",
				TTL: 300, TTLRemaining: 0, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_http._tcp.local", SRV: model.SRVRecord{Target: "router.local", Port: 80, Priority: 0, Weight: 0},
				TXT: map[string]string{"path": "/admin", "txtvers": "1"},
			},
		},
		{
			Svc: model.MDnsService{
				ID: uuid.New().String(), Name: "NFS Media Share", Type: model.ServiceTypeNFS,
				Subtype: "_nfs._tcp.local", IP: "192.168.1.201", Port: 2049,
				TXTRecords: map[string]string{"path": "/media", "vers": "4"},
				Status:     model.StatusOnline, SubnetID: "subnet-a",
				TTL: 3600, TTLRemaining: 3600, DiscoveredAt: now.Format(time.RFC3339),
			},
			Rec: model.ServiceRecords{
				PTR: "_nfs._tcp.local", SRV: model.SRVRecord{Target: "NAS-Media.local", Port: 2049, Priority: 0, Weight: 100},
				TXT: map[string]string{"path": "/media", "vers": "4"},
			},
		},
	}
	for _, s := range services {
		svcCopy := s.Svc
		svcCopy.Authorized = r.authPolicy.IsAllowed(svcCopy.Type)
		recCopy := s.Rec
		r.services[s.Svc.ID] = &svcCopy
		r.records[s.Svc.ID] = &recCopy
		r.startTTLTimer(&svcCopy)
		r.addToServiceInstances(&svcCopy)
	}
	r.recountSubnets()
}

func (r *Registry) addToServiceInstances(svc *model.MDnsService) {
	key := fmt.Sprintf("%s|%s", svc.SubnetID, svc.Name)
	if _, exists := r.serviceInstances[key]; !exists {
		r.serviceInstances[key] = make([]string, 0)
	}
	r.serviceInstances[key] = append(r.serviceInstances[key], svc.ID)
	r.sortServiceInstances(key)
}

func (r *Registry) sortServiceInstances(key string) {
	ids, ok := r.serviceInstances[key]
	if !ok {
		return
	}
	sort.Slice(ids, func(i, j int) bool {
		recI := r.records[ids[i]]
		recJ := r.records[ids[j]]
		if recI.SRV.Priority != recJ.SRV.Priority {
			return recI.SRV.Priority < recJ.SRV.Priority
		}
		return recI.SRV.Weight > recJ.SRV.Weight
	})
}

func (r *Registry) GetServiceInstances(subnetID, name string) []*model.MDnsService {
	r.mu.RLock()
	defer r.mu.RUnlock()
	key := fmt.Sprintf("%s|%s", subnetID, name)
	ids, ok := r.serviceInstances[key]
	if !ok {
		return nil
	}
	result := make([]*model.MDnsService, 0, len(ids))
	for _, id := range ids {
		if svc, ok := r.services[id]; ok {
			result = append(result, svc)
		}
	}
	return result
}

func (r *Registry) startTTLTimer(svc *model.MDnsService) {
	if timer, ok := r.ttlTimers[svc.ID]; ok {
		timer.Stop()
	}
	ttl := time.Duration(svc.TTL) * time.Second
	timer := time.AfterFunc(ttl, func() {
		r.onTTLExpired(svc.ID)
	})
	r.ttlTimers[svc.ID] = timer
}

func (r *Registry) onTTLExpired(serviceID string) {
	r.mu.Lock()
	svc, ok := r.services[serviceID]
	if !ok || svc.Status == model.StatusOffline {
		r.mu.Unlock()
		return
	}
	svc.TTLRemaining = 0
	svc.Status = model.StatusOffline
	r.mu.Unlock()

	r.bus.Publish(model.WSEvent{
		Type:      model.EventTTLExpired,
		ServiceID: serviceID,
		Service:   svc,
		SubnetID:  svc.SubnetID,
	})

	r.requeryService(serviceID)
}

func (r *Registry) requeryService(serviceID string) {
	time.Sleep(2 * time.Second)

	r.mu.Lock()
	svc, ok := r.services[serviceID]
	if !ok {
		r.mu.Unlock()
		return
	}

	svc.Status = model.StatusOnline
	svc.TTLRemaining = int64(svc.TTL)
	svc.DiscoveredAt = time.Now().UTC().Format(time.RFC3339)
	r.startTTLTimer(svc)
	r.mu.Unlock()

	r.bus.Publish(model.WSEvent{
		Type:     model.EventServiceDiscovered,
		Service:  svc,
		SubnetID: svc.SubnetID,
	})

	if sub, ok := r.subnets[svc.SubnetID]; ok {
		r.mu.Lock()
		sub.LastSeen = svc.DiscoveredAt
		r.mu.Unlock()
	}
}

func (r *Registry) ttlCountdownLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		r.mu.Lock()
		for _, svc := range r.services {
			if svc.Status == model.StatusOnline && svc.TTLRemaining > 0 {
				svc.TTLRemaining--
			}
		}
		r.mu.Unlock()
	}
}

func (r *Registry) recountSubnets() {
	counts := make(map[string]int)
	for _, svc := range r.services {
		if svc.Status == model.StatusOnline {
			counts[svc.SubnetID]++
		}
	}
	for id, s := range r.subnets {
		s.ServiceCount = counts[id]
	}
}

func (r *Registry) GetSubnets() []*model.Subnet {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*model.Subnet, 0, len(r.subnets))
	for _, s := range r.subnets {
		result = append(result, s)
	}
	return result
}

func (r *Registry) GetSubnet(id string) *model.Subnet {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.subnets[id]
}

func (r *Registry) GetServices(subnetID string, svcType string, status string) []*model.MDnsService {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*model.MDnsService, 0)
	for _, svc := range r.services {
		if subnetID != "" && svc.SubnetID != subnetID {
			continue
		}
		if svcType != "" && string(svc.Type) != svcType {
			continue
		}
		if status != "" && string(svc.Status) != status {
			continue
		}
		result = append(result, svc)
	}
	return result
}

func (r *Registry) GetService(id string) *model.MDnsService {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.services[id]
}

func (r *Registry) GetRecords(serviceID string) *model.ServiceRecords {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.records[serviceID]
}

func (r *Registry) AddService(svc *model.MDnsService, rec *model.ServiceRecords) {
	r.mu.Lock()
	defer r.mu.Unlock()
	svc.Authorized = r.authPolicy.IsAllowed(svc.Type)
	r.services[svc.ID] = svc
	r.records[svc.ID] = rec
	r.startTTLTimer(svc)
	r.addToServiceInstances(svc)
	r.recountSubnets()
	if sub, ok := r.subnets[svc.SubnetID]; ok {
		sub.LastSeen = svc.DiscoveredAt
	}
}

func (r *Registry) RemoveService(id string) (*model.MDnsService, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	svc, ok := r.services[id]
	if !ok {
		return nil, false
	}
	svc.Status = model.StatusOffline
	if timer, ok := r.ttlTimers[id]; ok {
		timer.Stop()
		delete(r.ttlTimers, id)
	}
	r.recountSubnets()
	return svc, true
}

func (r *Registry) GetServiceStats() map[string]int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	stats := make(map[string]int)
	for _, svc := range r.services {
		if svc.Status == model.StatusOnline {
			stats[string(svc.Type)]++
		}
	}
	return stats
}

func (r *Registry) GetTotalOnline() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, svc := range r.services {
		if svc.Status == model.StatusOnline {
			count++
		}
	}
	return count
}

func (r *Registry) GetAuthPolicy() *model.AuthPolicy {
	r.mu.RLock()
	defer r.mu.RUnlock()
	policy := *r.authPolicy
	return &policy
}

func (r *Registry) UpdateAuthPolicy(policy *model.AuthPolicy) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.authPolicy = policy
	for _, svc := range r.services {
		svc.Authorized = r.authPolicy.IsAllowed(svc.Type)
	}
	r.recountSubnets()
}

func (r *Registry) SetServiceAuthorized(serviceID string, authorized bool) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	svc, ok := r.services[serviceID]
	if !ok {
		return false
	}
	svc.Authorized = authorized
	return true
}

type ServiceExport struct {
	Services   []*model.MDnsService             `json:"services"`
	Records    map[string]*model.ServiceRecords `json:"records"`
	ExportedAt string                           `json:"exportedAt"`
	Count      int                              `json:"count"`
}

func (r *Registry) ExportServices(subnetID string, svcType string, status string) *ServiceExport {
	r.mu.RLock()
	defer r.mu.RUnlock()
	services := make([]*model.MDnsService, 0)
	records := make(map[string]*model.ServiceRecords)
	for _, svc := range r.services {
		if subnetID != "" && svc.SubnetID != subnetID {
			continue
		}
		if svcType != "" && string(svc.Type) != svcType {
			continue
		}
		if status != "" && string(svc.Status) != status {
			continue
		}
		services = append(services, svc)
		if rec, ok := r.records[svc.ID]; ok {
			records[svc.ID] = rec
		}
	}
	return &ServiceExport{
		Services:   services,
		Records:    records,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Count:      len(services),
	}
}
