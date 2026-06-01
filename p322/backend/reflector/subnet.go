package reflector

import (
	"fmt"
	"math/rand"
	"time"

	"mdns-reflector/model"

	"github.com/google/uuid"
)

type SubnetSimulator struct {
	subnetID string
	registry *Registry
	bus      *Bus
	stop     chan struct{}
}

var serviceTemplates = []struct {
	namePrefix string
	svcType    model.ServiceType
	subtype    string
	port       int
	defaultTTL uint32
	txtGen     func() map[string]string
}{
	{"HP Color LaserJet", model.ServiceTypePrinter, "_printer._tcp.local", 631, 120, func() map[string]string {
		return map[string]string{"rp": "raw", "qtotal": "1", "mfg": "HP", "mdl": fmt.Sprintf("ColorLJ-%d", rand.Intn(9000)+1000)}
	}},
	{"Epson EcoTank", model.ServiceTypePrinter, "_printer._tcp.local", 631, 120, func() map[string]string {
		return map[string]string{"rp": "ipp/print", "mfg": "Epson", "mdl": fmt.Sprintf("EcoTank-%d", rand.Intn(900)+100)}
	}},
	{"Apple TV", model.ServiceTypeAirPlay, "_airplay._tcp.local", 7000, 4500, func() map[string]string {
		return map[string]string{"model": fmt.Sprintf("AppleTV%d,1", rand.Intn(5)+3), "deviceid": fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256))}
	}},
	{"HomePod Mini", model.ServiceTypeAirPlay, "_airplay._tcp.local", 7000, 4500, func() map[string]string {
		return map[string]string{"model": "HomePodMini1,1", "flags": "0x4"}
	}},
	{"Hue Bridge", model.ServiceTypeHomeKit, "_hap._tcp.local", 8080, 3600, func() map[string]string {
		return map[string]string{"c#": fmt.Sprintf("%d", rand.Intn(20)+1), "id": fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256)), "md": "BSB002", "pv": "1.1"}
	}},
	{"Chromecast", model.ServiceTypeChromecast, "_googlecast._tcp.local", 8009, 1800, func() map[string]string {
		return map[string]string{"fn": fmt.Sprintf("Room %d TV", rand.Intn(10)+1), "md": "Chromecast", "ve": "05"}
	}},
	{"Smart Lock", model.ServiceTypeHomeKit, "_hap._tcp.local", 8080, 3600, func() map[string]string {
		return map[string]string{"c#": "1", "id": fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256), rand.Intn(256)), "md": "smartlock1", "pv": "1.1"}
	}},
	{"Web Server", model.ServiceTypeHTTP, "_http._tcp.local", 80, 300, func() map[string]string {
		return map[string]string{"path": "/", "txtvers": "1"}
	}},
	{"File Share", model.ServiceTypeSMB, "_smb._tcp.local", 445, 7200, func() map[string]string {
		return map[string]string{"path": "/share", "workgroup": "WORKGROUP"}
	}},
	{"NFS Export", model.ServiceTypeNFS, "_nfs._tcp.local", 2049, 3600, func() map[string]string {
		return map[string]string{"path": "/export", "vers": "4"}
	}},
}

var subnetIPBases = map[string]string{
	"subnet-a": "192.168.1.",
	"subnet-b": "10.0.0.",
	"subnet-c": "172.16.0.",
}

func NewSubnetSimulator(subnetID string, registry *Registry, bus *Bus) *SubnetSimulator {
	return &SubnetSimulator{
		subnetID: subnetID,
		registry: registry,
		bus:      bus,
		stop:     make(chan struct{}),
	}
}

func (s *SubnetSimulator) Start() {
	go s.simulate()
}

func (s *SubnetSimulator) Stop() {
	close(s.stop)
}

func (s *SubnetSimulator) simulate() {
	discoverTicker := time.NewTicker(time.Duration(8+rand.Intn(12)) * time.Second)
	defer discoverTicker.Stop()

	lostTicker := time.NewTicker(time.Duration(20+rand.Intn(30)) * time.Second)
	defer lostTicker.Stop()

	for {
		select {
		case <-s.stop:
			return
		case <-discoverTicker.C:
			s.discoverService()
		case <-lostTicker.C:
			s.loseService()
		}
	}
}

func (s *SubnetSimulator) discoverService() {
	tmpl := serviceTemplates[rand.Intn(len(serviceTemplates))]
	ipBase := subnetIPBases[s.subnetID]
	ip := fmt.Sprintf("%s%d", ipBase, rand.Intn(200)+10)
	name := fmt.Sprintf("%s %s", tmpl.namePrefix, randomSuffix())

	ttl := tmpl.defaultTTL
	if ttl == 0 {
		ttl = 120
	}

	existing := s.registry.GetServiceInstances(s.subnetID, name)
	priority := 0
	weight := 100
	if len(existing) > 0 {
		priority = len(existing) * 10
		weight = 100 - (len(existing) * 20)
		if weight < 10 {
			weight = 10
		}
	}

	svc := &model.MDnsService{
		ID:           uuid.New().String(),
		Name:         name,
		Type:         tmpl.svcType,
		Subtype:      tmpl.subtype,
		IP:           ip,
		Port:         tmpl.port,
		TXTRecords:   tmpl.txtGen(),
		Status:       model.StatusOnline,
		DiscoveredAt: time.Now().UTC().Format(time.RFC3339),
		SubnetID:     s.subnetID,
		TTL:          ttl,
		TTLRemaining: int64(ttl),
	}

	rec := &model.ServiceRecords{
		PTR: tmpl.subtype,
		SRV: model.SRVRecord{
			Target:   fmt.Sprintf("%s.local", randomHostname()),
			Port:     tmpl.port,
			Priority: priority,
			Weight:   weight,
		},
		TXT: svc.TXTRecords,
	}

	s.registry.AddService(svc, rec)

	s.bus.Publish(model.WSEvent{
		Type:     model.EventServiceDiscovered,
		Service:  svc,
		SubnetID: s.subnetID,
	})
}

func (s *SubnetSimulator) loseService() {
	services := s.registry.GetServices(s.subnetID, "", string(model.StatusOnline))
	if len(services) == 0 {
		return
	}
	svc := services[rand.Intn(len(services))]
	lost, ok := s.registry.RemoveService(svc.ID)
	if ok {
		s.bus.Publish(model.WSEvent{
			Type:      model.EventServiceLost,
			ServiceID: lost.ID,
			SubnetID:  s.subnetID,
		})
	}
}

func randomSuffix() string {
	chars := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 4)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func randomHostname() string {
	chars := "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
