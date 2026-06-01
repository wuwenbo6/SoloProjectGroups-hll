package repository

import (
	"encoding/json"
	"os"
	"sync"
	"time"

	"nfv-mano/internal/models"
)

type Repository struct {
	mu              sync.RWMutex
	vnfds           map[string]*models.Vnfd
	vnfs            map[string]*models.VnfInstance
	links           map[string]*models.VirtualLink
	routeTables     map[string]*models.RouteTable
	events          []*models.Event
	autoScaling      map[string]*models.AutoScalingConfig
	metrics        map[string][]*models.VnfMetrics
	filePath        string
}

type persistData struct {
	Vnfds           map[string]*models.Vnfd              `json:"vnfds"`
	Vnfs            map[string]*models.VnfInstance       `json:"vnfs"`
	Links           map[string]*models.VirtualLink       `json:"links"`
	RouteTables     map[string]*models.RouteTable        `json:"routeTables"`
	Events          []*models.Event                      `json:"events"`
	AutoScaling     map[string]*models.AutoScalingConfig `json:"autoScaling"`
}

func NewRepository(filePath string) *Repository {
	r := &Repository{
		vnfds:           make(map[string]*models.Vnfd),
		vnfs:            make(map[string]*models.VnfInstance),
		links:           make(map[string]*models.VirtualLink),
		routeTables:     make(map[string]*models.RouteTable),
		events:          make([]*models.Event, 0),
		autoScaling:      make(map[string]*models.AutoScalingConfig),
		metrics:        make(map[string][]*models.VnfMetrics),
		filePath:        filePath,
	}
	r.load()
	r.seedDefaults()
	return r
}

func (r *Repository) seedDefaults() {
	if len(r.vnfds) > 0 {
		return
	}
	r.vnfds["vnfd-firewall-001"] = &models.Vnfd{
		ID:               "vnfd-firewall-001",
		Name:             "Virtual Firewall",
		Type:             "firewall",
		Description:      "Next-generation virtual firewall with DPI, IDS/IPS, and ACL capabilities",
		DefaultCpu:       2,
		DefaultMemory:    4096,
		DefaultBandwidth: 10000,
		Icon:             "shield",
	}
	r.vnfds["vnfd-vrouter-001"] = &models.Vnfd{
		ID:               "vnfd-vrouter-001",
		Name:             "Virtual Router",
		Type:             "vrouter",
		Description:      "Software-based virtual router with BGP/OSPF support and traffic engineering",
		DefaultCpu:       4,
		DefaultMemory:    8192,
		DefaultBandwidth: 25000,
		Icon:             "router",
	}
	r.persist()
}

func (r *Repository) load() {
	data, err := os.ReadFile(r.filePath)
	if err != nil {
		return
	}
	var pd persistData
	if err := json.Unmarshal(data, &pd); err != nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.vnfds = pd.Vnfds
	r.vnfs = pd.Vnfs
	r.links = pd.Links
	r.routeTables = pd.RouteTables
	r.events = pd.Events
	r.autoScaling = pd.AutoScaling
	if r.vnfds == nil {
		r.vnfds = make(map[string]*models.Vnfd)
	}
	if r.vnfs == nil {
		r.vnfs = make(map[string]*models.VnfInstance)
	}
	if r.links == nil {
		r.links = make(map[string]*models.VirtualLink)
	}
	if r.routeTables == nil {
		r.routeTables = make(map[string]*models.RouteTable)
	}
	if r.events == nil {
		r.events = make([]*models.Event, 0)
	}
	if r.autoScaling == nil {
		r.autoScaling = make(map[string]*models.AutoScalingConfig)
	}
}

func (r *Repository) persist() {
	r.mu.RLock()
	pd := persistData{
		Vnfds:           r.vnfds,
		Vnfs:            r.vnfs,
		Links:           r.links,
		RouteTables:     r.routeTables,
		Events:          r.events,
		AutoScaling:     r.autoScaling,
	}
	r.mu.RUnlock()
	data, err := json.MarshalIndent(pd, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(r.filePath, data, 0644)
}

// VNFD operations

func (r *Repository) GetAllVnfds() []*models.Vnfd {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*models.Vnfd, 0, len(r.vnfds))
	for _, v := range r.vnfds {
		result = append(result, v)
	}
	return result
}

func (r *Repository) GetVnfd(id string) *models.Vnfd {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.vnfds[id]
}

func (r *Repository) CreateVnfd(vnfd *models.Vnfd) {
	r.mu.Lock()
	r.vnfds[vnfd.ID] = vnfd
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) DeleteVnfd(id string) bool {
	r.mu.Lock()
	_, exists := r.vnfds[id]
	if exists {
		delete(r.vnfds, id)
	}
	r.mu.Unlock()
	if exists {
		r.persist()
	}
	return exists
}

// VNF Instance operations

func (r *Repository) GetAllVnfs() []*models.VnfInstance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*models.VnfInstance, 0, len(r.vnfs))
	for _, v := range r.vnfs {
		result = append(result, v)
	}
	return result
}

func (r *Repository) GetVnf(id string) *models.VnfInstance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.vnfs[id]
}

func (r *Repository) CreateVnf(vnf *models.VnfInstance) {
	r.mu.Lock()
	r.vnfs[vnf.ID] = vnf
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) UpdateVnf(vnf *models.VnfInstance) {
	r.mu.Lock()
	r.vnfs[vnf.ID] = vnf
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) DeleteVnf(id string) bool {
	r.mu.Lock()
	_, exists := r.vnfs[id]
	if exists {
		delete(r.vnfs, id)
	}
	r.mu.Unlock()
	if exists {
		r.persist()
	}
	return exists
}

// VirtualLink operations

func (r *Repository) GetAllLinks() []*models.VirtualLink {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*models.VirtualLink, 0, len(r.links))
	for _, v := range r.links {
		result = append(result, v)
	}
	return result
}

func (r *Repository) GetLink(id string) *models.VirtualLink {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.links[id]
}

func (r *Repository) CreateLink(link *models.VirtualLink) {
	r.mu.Lock()
	r.links[link.ID] = link
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) DeleteLink(id string) bool {
	r.mu.Lock()
	_, exists := r.links[id]
	if exists {
		delete(r.links, id)
	}
	r.mu.Unlock()
	if exists {
		r.persist()
	}
	return exists
}

func (r *Repository) GetLinksByVnf(vnfID string) []*models.VirtualLink {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*models.VirtualLink, 0)
	for _, l := range r.links {
		if l.SourceID == vnfID || l.TargetID == vnfID {
			result = append(result, l)
		}
	}
	return result
}

// Event operations

func (r *Repository) AddEvent(event *models.Event) {
	r.mu.Lock()
	r.events = append(r.events, event)
	if len(r.events) > 100 {
		r.events = r.events[len(r.events)-100:]
	}
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) GetEvents(limit int) []*models.Event {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if limit <= 0 || limit > len(r.events) {
		limit = len(r.events)
	}
	result := make([]*models.Event, limit)
	copy(result, r.events[len(r.events)-limit:])
	return result
}

func (r *Repository) GetNeighborVnfs(vnfID string) []*models.VnfInstance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	neighborIDs := make(map[string]bool)
	for _, l := range r.links {
		if l.SourceID == vnfID {
			neighborIDs[l.TargetID] = true
		}
		if l.TargetID == vnfID {
			neighborIDs[l.SourceID] = true
		}
	}
	result := make([]*models.VnfInstance, 0, len(neighborIDs))
	for id := range neighborIDs {
		if vnf, exists := r.vnfs[id]; exists {
			result = append(result, vnf)
		}
	}
	return result
}

func (r *Repository) GetRouteTable(vnfID string) *models.RouteTable {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.routeTables[vnfID]
}

func (r *Repository) CreateOrUpdateRouteTable(vnfID string, entries []models.RouteEntry) *models.RouteTable {
	r.mu.Lock()
	existing, exists := r.routeTables[vnfID]
	version := 1
	if exists {
		version = existing.Version + 1
	}
	rt := &models.RouteTable{
		VnfID:       vnfID,
		Entries:     entries,
		Version:     version,
		LastUpdated: time.Now(),
	}
	r.routeTables[vnfID] = rt
	r.mu.Unlock()
	r.persist()
	return rt
}

// AutoScaling operations

func (r *Repository) GetAutoScalingConfig(vnfID string) *models.AutoScalingConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if config, exists := r.autoScaling[vnfID]; exists {
		return config
	}
	return &models.AutoScalingConfig{
		VnfID:              vnfID,
		MinReplicas:        1,
		MaxReplicas:        10,
		ScaleUpThreshold:   70,
		ScaleDownThreshold: 30,
		CooldownSeconds:    300,
		Enabled:            false,
	}
}

func (r *Repository) UpdateAutoScalingConfig(vnfID string, config *models.AutoScalingConfig) {
	r.mu.Lock()
	r.autoScaling[vnfID] = config
	r.mu.Unlock()
	r.persist()
}

func (r *Repository) GetAllAutoScalingConfigs() []*models.AutoScalingConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*models.AutoScalingConfig, 0, len(r.autoScaling))
	for _, v := range r.autoScaling {
		result = append(result, v)
	}
	return result
}

// Metrics operations

func (r *Repository) AddMetrics(metrics *models.VnfMetrics) {
	r.mu.Lock()
	r.metrics[metrics.VnfID] = append(r.metrics[metrics.VnfID], metrics)
	if len(r.metrics[metrics.VnfID]) > 60 {
		r.metrics[metrics.VnfID] = r.metrics[metrics.VnfID][len(r.metrics[metrics.VnfID])-60:]
	}
	r.mu.Unlock()
}

func (r *Repository) GetMetrics(vnfID string, limit int) []*models.VnfMetrics {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m := r.metrics[vnfID]
	if limit <= 0 || limit > len(m) {
		limit = len(m)
	}
	result := make([]*models.VnfMetrics, limit)
	copy(result, m[len(m)-limit:])
	return result
}
