package zone

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"vsan-storage-simulator/pkg/config"
	"vsan-storage-simulator/pkg/models"
)

const (
	DefaultZoneID   = "default_zone"
	BroadcastZoneID = "broadcast_zone"
)

type Manager struct {
	mu             sync.RWMutex
	hbas           map[string]models.HBA
	storageTargets map[string]models.StorageTarget
	zones          map[string]models.Zone
	syncManager    *config.SyncManager
	autoSync       bool
}

func NewManager() *Manager {
	return &Manager{
		hbas:           make(map[string]models.HBA),
		storageTargets: make(map[string]models.StorageTarget),
		zones:          make(map[string]models.Zone),
		syncManager:    config.NewSyncManager(),
		autoSync:       true,
	}
}

func (m *Manager) SetAutoSync(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.autoSync = enabled
}

func (m *Manager) GetSyncManager() *config.SyncManager {
	return m.syncManager
}

func (m *Manager) triggerACLUpdate(changeType string, description string) {
	if !m.autoSync {
		return
	}

	zones := m.GetAllZones()
	hbas := m.GetAllHBAs()
	targets := m.GetAllStorageTargets()

	acl := m.syncManager.GenerateACL(zones, hbas, targets)
	m.syncManager.PushACLConfig(acl, changeType, description)
}

func (m *Manager) AddHBA(hba models.HBA) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if hba.ID == "" {
		return errors.New("HBA ID cannot be empty")
	}
	if _, exists := m.hbas[hba.ID]; exists {
		return fmt.Errorf("HBA with ID %s already exists", hba.ID)
	}
	hba.CreatedAt = time.Now()
	m.hbas[hba.ID] = hba

	if _, exists := m.zones[BroadcastZoneID]; exists {
		zone := m.zones[BroadcastZoneID]
		zone.HBAIDs = append(zone.HBAIDs, hba.ID)
		zone.UpdatedAt = time.Now()
		m.zones[BroadcastZoneID] = zone
	}

	go m.triggerACLUpdate("HBA_ADDED", fmt.Sprintf("Added HBA %s", hba.ID))
	return nil
}

func (m *Manager) GetHBA(id string) (models.HBA, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	hba, exists := m.hbas[id]
	return hba, exists
}

func (m *Manager) GetAllHBAs() []models.HBA {
	m.mu.RLock()
	defer m.mu.RUnlock()
	hbas := make([]models.HBA, 0, len(m.hbas))
	for _, hba := range m.hbas {
		hbas = append(hbas, hba)
	}
	return hbas
}

func (m *Manager) DeleteHBA(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.hbas[id]; !exists {
		return fmt.Errorf("HBA with ID %s not found", id)
	}
	delete(m.hbas, id)
	for zoneID, zone := range m.zones {
		newHBAIDs := make([]string, 0, len(zone.HBAIDs))
		for _, hbaID := range zone.HBAIDs {
			if hbaID != id {
				newHBAIDs = append(newHBAIDs, hbaID)
			}
		}
		zone.HBAIDs = newHBAIDs
		zone.UpdatedAt = time.Now()
		m.zones[zoneID] = zone
	}

	go m.triggerACLUpdate("HBA_DELETED", fmt.Sprintf("Deleted HBA %s", id))
	return nil
}

func (m *Manager) AddStorageTarget(target models.StorageTarget) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if target.ID == "" {
		return errors.New("Storage Target ID cannot be empty")
	}
	if _, exists := m.storageTargets[target.ID]; exists {
		return fmt.Errorf("Storage Target with ID %s already exists", target.ID)
	}
	target.CreatedAt = time.Now()
	m.storageTargets[target.ID] = target

	if _, exists := m.zones[BroadcastZoneID]; exists {
		zone := m.zones[BroadcastZoneID]
		zone.StorageTargetIDs = append(zone.StorageTargetIDs, target.ID)
		zone.UpdatedAt = time.Now()
		m.zones[BroadcastZoneID] = zone
	}

	go m.triggerACLUpdate("TARGET_ADDED", fmt.Sprintf("Added Storage Target %s", target.ID))
	return nil
}

func (m *Manager) GetStorageTarget(id string) (models.StorageTarget, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	target, exists := m.storageTargets[id]
	return target, exists
}

func (m *Manager) GetAllStorageTargets() []models.StorageTarget {
	m.mu.RLock()
	defer m.mu.RUnlock()
	targets := make([]models.StorageTarget, 0, len(m.storageTargets))
	for _, target := range m.storageTargets {
		targets = append(targets, target)
	}
	return targets
}

func (m *Manager) DeleteStorageTarget(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.storageTargets[id]; !exists {
		return fmt.Errorf("Storage Target with ID %s not found", id)
	}
	delete(m.storageTargets, id)
	for zoneID, zone := range m.zones {
		newTargetIDs := make([]string, 0, len(zone.StorageTargetIDs))
		for _, targetID := range zone.StorageTargetIDs {
			if targetID != id {
				newTargetIDs = append(newTargetIDs, targetID)
			}
		}
		zone.StorageTargetIDs = newTargetIDs
		zone.UpdatedAt = time.Now()
		m.zones[zoneID] = zone
	}

	go m.triggerACLUpdate("TARGET_DELETED", fmt.Sprintf("Deleted Storage Target %s", id))
	return nil
}

func (m *Manager) CreateZone(zone models.Zone) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if zone.ID == "" {
		return errors.New("Zone ID cannot be empty")
	}
	if zone.Name == "" {
		return errors.New("Zone name cannot be empty")
	}
	if _, exists := m.zones[zone.ID]; exists {
		return fmt.Errorf("Zone with ID %s already exists", zone.ID)
	}
	if zone.ZoneType == "" {
		zone.ZoneType = models.ZoneTypeNormal
	}
	now := time.Now()
	zone.CreatedAt = now
	zone.UpdatedAt = now
	m.zones[zone.ID] = zone

	go m.triggerACLUpdate("ZONE_CREATED", fmt.Sprintf("Created Zone %s (type: %s)", zone.Name, zone.ZoneType))
	return nil
}

func (m *Manager) GetZone(id string) (models.Zone, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	zone, exists := m.zones[id]
	return zone, exists
}

func (m *Manager) GetAllZones() []models.Zone {
	m.mu.RLock()
	defer m.mu.RUnlock()
	zones := make([]models.Zone, 0, len(m.zones))
	for _, zone := range m.zones {
		zones = append(zones, zone)
	}
	return zones
}

func (m *Manager) GetZonesByType(zoneType string) []models.Zone {
	m.mu.RLock()
	defer m.mu.RUnlock()
	zones := make([]models.Zone, 0)
	for _, zone := range m.zones {
		if zone.ZoneType == zoneType {
			zones = append(zones, zone)
		}
	}
	return zones
}

func (m *Manager) GetDefaultZone() (models.Zone, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	zone, exists := m.zones[DefaultZoneID]
	return zone, exists
}

func (m *Manager) GetBroadcastZone() (models.Zone, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	zone, exists := m.zones[BroadcastZoneID]
	return zone, exists
}

func (m *Manager) CreateDefaultZone() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.zones[DefaultZoneID]; exists {
		return fmt.Errorf("default zone already exists")
	}

	now := time.Now()
	zone := models.Zone{
		ID:          DefaultZoneID,
		Name:        "Default Zone",
		ZoneType:    models.ZoneTypeDefault,
		Description: "Default zone for devices not assigned to any other zone",
		Active:      false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	m.zones[DefaultZoneID] = zone

	go m.triggerACLUpdate("DEFAULT_ZONE_CREATED", "Default zone created")
	return nil
}

func (m *Manager) CreateBroadcastZone() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.zones[BroadcastZoneID]; exists {
		return fmt.Errorf("broadcast zone already exists")
	}

	hbaIDs := make([]string, 0, len(m.hbas))
	for id := range m.hbas {
		hbaIDs = append(hbaIDs, id)
	}

	targetIDs := make([]string, 0, len(m.storageTargets))
	for id := range m.storageTargets {
		targetIDs = append(targetIDs, id)
	}

	now := time.Now()
	zone := models.Zone{
		ID:               BroadcastZoneID,
		Name:             "Broadcast Zone",
		ZoneType:         models.ZoneTypeBroadcast,
		Description:      "Broadcast zone - allows all HBAs to access all storage targets",
		HBAIDs:           hbaIDs,
		StorageTargetIDs: targetIDs,
		Active:           false,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	m.zones[BroadcastZoneID] = zone

	go m.triggerACLUpdate("BROADCAST_ZONE_CREATED", "Broadcast zone created")
	return nil
}

func (m *Manager) RefreshBroadcastZoneMembers() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[BroadcastZoneID]
	if !exists {
		return fmt.Errorf("broadcast zone does not exist")
	}

	hbaIDs := make([]string, 0, len(m.hbas))
	for id := range m.hbas {
		hbaIDs = append(hbaIDs, id)
	}

	targetIDs := make([]string, 0, len(m.storageTargets))
	for id := range m.storageTargets {
		targetIDs = append(targetIDs, id)
	}

	zone.HBAIDs = hbaIDs
	zone.StorageTargetIDs = targetIDs
	zone.UpdatedAt = time.Now()
	m.zones[BroadcastZoneID] = zone

	go m.triggerACLUpdate("BROADCAST_ZONE_UPDATED", "Broadcast zone members refreshed")
	return nil
}

func (m *Manager) UpdateZone(id string, updates models.Zone) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[id]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", id)
	}

	if updates.Name != "" {
		zone.Name = updates.Name
	}
	zone.Description = updates.Description
	zone.Active = updates.Active
	zone.UpdatedAt = time.Now()
	m.zones[id] = zone

	go m.triggerACLUpdate("ZONE_UPDATED", fmt.Sprintf("Updated Zone %s", zone.Name))
	return nil
}

func (m *Manager) GetZoneMemberView(id string) (models.ZoneMemberView, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	zone, exists := m.zones[id]
	if !exists {
		return models.ZoneMemberView{}, false
	}

	hbas := make([]models.HBA, 0, len(zone.HBAIDs))
	for _, hbaID := range zone.HBAIDs {
		if hba, ok := m.hbas[hbaID]; ok {
			hbas = append(hbas, hba)
		}
	}

	targets := make([]models.StorageTarget, 0, len(zone.StorageTargetIDs))
	for _, targetID := range zone.StorageTargetIDs {
		if target, ok := m.storageTargets[targetID]; ok {
			targets = append(targets, target)
		}
	}

	return models.ZoneMemberView{
		Zone:           zone,
		HBAs:           hbas,
		StorageTargets: targets,
	}, true
}

func (m *Manager) GetAllZoneMemberViews() []models.ZoneMemberView {
	m.mu.RLock()
	defer m.mu.RUnlock()

	views := make([]models.ZoneMemberView, 0, len(m.zones))
	for _, zone := range m.zones {
		hbas := make([]models.HBA, 0, len(zone.HBAIDs))
		for _, hbaID := range zone.HBAIDs {
			if hba, ok := m.hbas[hbaID]; ok {
				hbas = append(hbas, hba)
			}
		}

		targets := make([]models.StorageTarget, 0, len(zone.StorageTargetIDs))
		for _, targetID := range zone.StorageTargetIDs {
			if target, ok := m.storageTargets[targetID]; ok {
				targets = append(targets, target)
			}
		}

		views = append(views, models.ZoneMemberView{
			Zone:           zone,
			HBAs:           hbas,
			StorageTargets: targets,
		})
	}
	return views
}

func (m *Manager) AddHBAToZone(zoneID, hbaID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[zoneID]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", zoneID)
	}

	if _, exists := m.hbas[hbaID]; !exists {
		return fmt.Errorf("HBA with ID %s not found", hbaID)
	}

	for _, id := range zone.HBAIDs {
		if id == hbaID {
			return fmt.Errorf("HBA %s is already in zone %s", hbaID, zoneID)
		}
	}

	zone.HBAIDs = append(zone.HBAIDs, hbaID)
	zone.UpdatedAt = time.Now()
	m.zones[zoneID] = zone

	go m.triggerACLUpdate("ZONE_MEMBER_ADDED", fmt.Sprintf("Added HBA %s to Zone %s", hbaID, zone.Name))
	return nil
}

func (m *Manager) AddStorageTargetToZone(zoneID, targetID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[zoneID]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", zoneID)
	}

	if _, exists := m.storageTargets[targetID]; !exists {
		return fmt.Errorf("Storage Target with ID %s not found", targetID)
	}

	for _, id := range zone.StorageTargetIDs {
		if id == targetID {
			return fmt.Errorf("Storage Target %s is already in zone %s", targetID, zoneID)
		}
	}

	zone.StorageTargetIDs = append(zone.StorageTargetIDs, targetID)
	zone.UpdatedAt = time.Now()
	m.zones[zoneID] = zone

	go m.triggerACLUpdate("ZONE_MEMBER_ADDED", fmt.Sprintf("Added Target %s to Zone %s", targetID, zone.Name))
	return nil
}

func (m *Manager) RemoveHBAFromZone(zoneID, hbaID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[zoneID]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", zoneID)
	}

	newHBAIDs := make([]string, 0, len(zone.HBAIDs))
	found := false
	for _, id := range zone.HBAIDs {
		if id == hbaID {
			found = true
		} else {
			newHBAIDs = append(newHBAIDs, id)
		}
	}

	if !found {
		return fmt.Errorf("HBA %s is not in zone %s", hbaID, zoneID)
	}

	zone.HBAIDs = newHBAIDs
	zone.UpdatedAt = time.Now()
	m.zones[zoneID] = zone

	go m.triggerACLUpdate("ZONE_MEMBER_REMOVED", fmt.Sprintf("Removed HBA %s from Zone %s", hbaID, zone.Name))
	return nil
}

func (m *Manager) RemoveStorageTargetFromZone(zoneID, targetID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	zone, exists := m.zones[zoneID]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", zoneID)
	}

	newTargetIDs := make([]string, 0, len(zone.StorageTargetIDs))
	found := false
	for _, id := range zone.StorageTargetIDs {
		if id == targetID {
			found = true
		} else {
			newTargetIDs = append(newTargetIDs, id)
		}
	}

	if !found {
		return fmt.Errorf("Storage Target %s is not in zone %s", targetID, zoneID)
	}

	zone.StorageTargetIDs = newTargetIDs
	zone.UpdatedAt = time.Now()
	m.zones[zoneID] = zone

	go m.triggerACLUpdate("ZONE_MEMBER_REMOVED", fmt.Sprintf("Removed Target %s from Zone %s", targetID, zone.Name))
	return nil
}

func (m *Manager) DeleteZone(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	zone, exists := m.zones[id]
	if !exists {
		return fmt.Errorf("Zone with ID %s not found", id)
	}
	delete(m.zones, id)

	go m.triggerACLUpdate("ZONE_DELETED", fmt.Sprintf("Deleted Zone %s", zone.Name))
	return nil
}

func (m *Manager) CheckAccess(hbaID, targetID string) models.AccessCheckResult {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if _, exists := m.hbas[hbaID]; !exists {
		return models.AccessCheckResult{
			Allowed: false,
			Message: fmt.Sprintf("HBA %s does not exist", hbaID),
		}
	}

	if _, exists := m.storageTargets[targetID]; !exists {
		return models.AccessCheckResult{
			Allowed: false,
			Message: fmt.Sprintf("Storage Target %s does not exist", targetID),
		}
	}

	if broadcastZone, exists := m.zones[BroadcastZoneID]; exists && broadcastZone.Active {
		return models.AccessCheckResult{
			Allowed:  true,
			Message:  fmt.Sprintf("Access allowed through Broadcast Zone - all devices can communicate"),
			ZoneName: broadcastZone.Name,
		}
	}

	hbaInNormalZone := false
	targetInNormalZone := false
	var normalZoneMatch *models.Zone

	for _, zone := range m.zones {
		if !zone.Active {
			continue
		}

		if zone.ZoneType == models.ZoneTypeDefault {
			continue
		}

		hbaInZone := false
		for _, id := range zone.HBAIDs {
			if id == hbaID {
				hbaInZone = true
				hbaInNormalZone = true
				break
			}
		}

		targetInZone := false
		for _, id := range zone.StorageTargetIDs {
			if id == targetID {
				targetInZone = true
				targetInNormalZone = true
				break
			}
		}

		if hbaInZone && targetInZone {
			normalZoneMatch = &zone
			break
		}
	}

	if normalZoneMatch != nil {
		return models.AccessCheckResult{
			Allowed:  true,
			Message:  fmt.Sprintf("Access allowed through zone '%s'", normalZoneMatch.Name),
			ZoneName: normalZoneMatch.Name,
		}
	}

	if defaultZone, exists := m.zones[DefaultZoneID]; exists && defaultZone.Active {
		hbaInDefault := false
		for _, id := range defaultZone.HBAIDs {
			if id == hbaID {
				hbaInDefault = true
				break
			}
		}

		targetInDefault := false
		for _, id := range defaultZone.StorageTargetIDs {
			if id == targetID {
				targetInDefault = true
				break
			}
		}

		if hbaInDefault && targetInDefault {
			return models.AccessCheckResult{
				Allowed:  true,
				Message:  fmt.Sprintf("Access allowed through Default Zone"),
				ZoneName: defaultZone.Name,
			}
		}
	}

	if !hbaInNormalZone || !targetInNormalZone {
		return models.AccessCheckResult{
			Allowed: false,
			Message: fmt.Sprintf("Access denied: HBA %s and Storage Target %s are not assigned to any active normal zone", hbaID, targetID),
		}
	}

	return models.AccessCheckResult{
		Allowed: false,
		Message: fmt.Sprintf("Access denied: HBA %s and Storage Target %s are not in the same active zone", hbaID, targetID),
	}
}

func (m *Manager) ForceACLUpdate(description string) models.ConfigVersion {
	zones := m.GetAllZones()
	hbas := m.GetAllHBAs()
	targets := m.GetAllStorageTargets()

	acl := m.syncManager.GenerateACL(zones, hbas, targets)
	return m.syncManager.PushACLConfig(acl, "MANUAL_SYNC", description)
}

func (m *Manager) InitSampleData() {
	now := time.Now()

	hbas := []models.HBA{
		{
			ID:       "hba-001",
			Name:     "HBA-ServerA-Port1",
			WWN:      "10:00:00:00:C9:00:00:01",
			NodeName: "20:00:00:00:C9:00:00:01",
			PortName: "21:00:00:00:C9:00:00:01",
			Vendor:   "QLogic",
			Model:    "QLE2672",
			Status:   "online",
		},
		{
			ID:       "hba-002",
			Name:     "HBA-ServerA-Port2",
			WWN:      "10:00:00:00:C9:00:00:02",
			NodeName: "20:00:00:00:C9:00:00:02",
			PortName: "21:00:00:00:C9:00:00:02",
			Vendor:   "QLogic",
			Model:    "QLE2672",
			Status:   "online",
		},
		{
			ID:       "hba-003",
			Name:     "HBA-ServerB-Port1",
			WWN:      "10:00:00:00:C9:00:00:03",
			NodeName: "20:00:00:00:C9:00:00:03",
			PortName: "21:00:00:00:C9:00:00:03",
			Vendor:   "Emulex",
			Model:    "LPe16002",
			Status:   "online",
		},
		{
			ID:       "hba-004",
			Name:     "HBA-ServerC-Port1",
			WWN:      "10:00:00:00:C9:00:00:04",
			NodeName: "20:00:00:00:C9:00:00:04",
			PortName: "21:00:00:00:C9:00:00:04",
			Vendor:   "Brocade",
			Model:    "BR-1860",
			Status:   "offline",
		},
	}

	for _, hba := range hbas {
		hba.CreatedAt = now
		m.hbas[hba.ID] = hba
	}

	targets := []models.StorageTarget{
		{
			ID:         "target-001",
			Name:       "Storage-Array1-LUN0",
			WWN:        "50:00:00:00:00:00:00:01",
			Type:       "FC",
			CapacityGB: 1024,
			Vendor:     "EMC",
			Model:      "VMAX3",
			Status:     "online",
		},
		{
			ID:         "target-002",
			Name:       "Storage-Array1-LUN1",
			WWN:        "50:00:00:00:00:00:00:02",
			Type:       "FC",
			CapacityGB: 2048,
			Vendor:     "EMC",
			Model:      "VMAX3",
			Status:     "online",
		},
		{
			ID:         "target-003",
			Name:       "Storage-Array2-LUN0",
			WWN:        "50:00:00:00:00:00:00:03",
			Type:       "iSCSI",
			CapacityGB: 512,
			Vendor:     "NetApp",
			Model:      "FAS8080",
			Status:     "online",
		},
		{
			ID:         "target-004",
			Name:       "Storage-Array3-LUN0",
			WWN:        "50:00:00:00:00:00:00:04",
			Type:       "FC",
			CapacityGB: 4096,
			Vendor:     "HPE",
			Model:      "3PAR",
			Status:     "online",
		},
	}

	for _, target := range targets {
		target.CreatedAt = now
		m.storageTargets[target.ID] = target
	}

	allHBAIDs := make([]string, 0, len(hbas))
	for _, hba := range hbas {
		allHBAIDs = append(allHBAIDs, hba.ID)
	}

	allTargetIDs := make([]string, 0, len(targets))
	for _, target := range targets {
		allTargetIDs = append(allTargetIDs, target.ID)
	}

	unassignedHBAIDs := []string{"hba-004"}
	unassignedTargetIDs := []string{}

	zones := []models.Zone{
		{
			ID:               DefaultZoneID,
			Name:             "Default Zone",
			ZoneType:         models.ZoneTypeDefault,
			Description:      "Default zone for devices not assigned to any other zone",
			HBAIDs:           unassignedHBAIDs,
			StorageTargetIDs: unassignedTargetIDs,
			Active:           false,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
		{
			ID:               BroadcastZoneID,
			Name:             "Broadcast Zone",
			ZoneType:         models.ZoneTypeBroadcast,
			Description:      "Broadcast zone - when active, allows all HBAs to access all storage targets",
			HBAIDs:           allHBAIDs,
			StorageTargetIDs: allTargetIDs,
			Active:           false,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
		{
			ID:               "zone-prod-db",
			Name:             "Production-DB-Zone",
			ZoneType:         models.ZoneTypeNormal,
			Description:      "Zone for production database servers",
			HBAIDs:           []string{"hba-001", "hba-002"},
			StorageTargetIDs: []string{"target-001", "target-002"},
			Active:           true,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
		{
			ID:               "zone-dev-app",
			Name:             "Development-App-Zone",
			ZoneType:         models.ZoneTypeNormal,
			Description:      "Zone for development application servers",
			HBAIDs:           []string{"hba-003"},
			StorageTargetIDs: []string{"target-003"},
			Active:           true,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
		{
			ID:               "zone-backup",
			Name:             "Backup-Zone",
			ZoneType:         models.ZoneTypeNormal,
			Description:      "Zone for backup operations",
			HBAIDs:           []string{"hba-001"},
			StorageTargetIDs: []string{"target-004"},
			Active:           false,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
	}

	for _, zone := range zones {
		m.zones[zone.ID] = zone
	}

	zonesList := make([]models.Zone, 0, len(zones))
	for _, zone := range zones {
		zonesList = append(zonesList, zone)
	}

	acl := m.syncManager.GenerateACL(zonesList, hbas, targets)
	m.syncManager.PushACLConfig(acl, "INITIAL_LOAD", "Initial sample data loaded with default and broadcast zones")
}
