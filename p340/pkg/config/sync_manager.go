package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"vsan-storage-simulator/pkg/models"
)

type ConfigChangeCallback func(version string, acl *models.ACLConfig)

type SyncManager struct {
	mu                sync.RWMutex
	currentVersion    string
	versionHistory    []models.ConfigVersion
	aclConfigs        map[string]models.ACLConfig
	broadcastChannels map[string]chan models.BroadcastMessage
	switchNodes       map[string]models.SwitchNode
	callbacks         []ConfigChangeCallback
}

func NewSyncManager() *SyncManager {
	sm := &SyncManager{
		versionHistory:    make([]models.ConfigVersion, 0),
		aclConfigs:        make(map[string]models.ACLConfig),
		broadcastChannels: make(map[string]chan models.BroadcastMessage),
		switchNodes:       make(map[string]models.SwitchNode),
		callbacks:         make([]ConfigChangeCallback, 0),
	}
	sm.initSwitchNodes()
	return sm
}

func (sm *SyncManager) initSwitchNodes() {
	sm.switchNodes = map[string]models.SwitchNode{
		"switch-001": {ID: "switch-001", Name: "FC-Switch-A", Status: "online", ACLVersion: ""},
		"switch-002": {ID: "switch-002", Name: "FC-Switch-B", Status: "online", ACLVersion: ""},
		"switch-003": {ID: "switch-003", Name: "FC-Switch-C", Status: "online", ACLVersion: ""},
	}
}

func (sm *SyncManager) GenerateVersion() string {
	now := time.Now()
	return fmt.Sprintf("v%d.%02d%02d-%02d%02d%02d",
		now.Year(), now.Month(), now.Day(),
		now.Hour(), now.Minute(), now.Second())
}

func (sm *SyncManager) GenerateACL(zones []models.Zone, hbas []models.HBA, targets []models.StorageTarget) models.ACLConfig {
	hbaMap := make(map[string]models.HBA)
	for _, hba := range hbas {
		hbaMap[hba.ID] = hba
	}

	targetMap := make(map[string]models.StorageTarget)
	for _, target := range targets {
		targetMap[target.ID] = target
	}

	var entries []models.ACLEntry
	priority := 100

	for _, zone := range zones {
		if !zone.Active {
			continue
		}

		for _, hbaID := range zone.HBAIDs {
			hba, exists := hbaMap[hbaID]
			if !exists {
				continue
			}

			for _, targetID := range zone.StorageTargetIDs {
				target, exists := targetMap[targetID]
				if !exists {
					continue
				}

				entry := models.ACLEntry{
					ID:         fmt.Sprintf("acl-%s-%s-%s", zone.ID, hbaID, targetID),
					ZoneID:     zone.ID,
					ZoneName:   zone.Name,
					HBAID:      hbaID,
					HBAWWN:     hba.WWN,
					TargetID:   targetID,
					TargetWWN:  target.WWN,
					Permission: "allow",
					Priority:   priority,
				}
				entries = append(entries, entry)
			}
		}
		priority -= 10
	}

	version := sm.GenerateVersion()
	acl := models.ACLConfig{
		Version:     version,
		GeneratedAt: time.Now(),
		Entries:     entries,
		ZoneCount:   len(zones),
		EntryCount:  len(entries),
	}

	return acl
}

func (sm *SyncManager) CalculateChecksum(acl models.ACLConfig) string {
	data, _ := json.Marshal(acl)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func (sm *SyncManager) PushACLConfig(acl models.ACLConfig, changeType string, description string) models.ConfigVersion {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	previousVersion := sm.currentVersion
	checksum := sm.CalculateChecksum(acl)

	version := models.ConfigVersion{
		Version:     acl.Version,
		Previous:    previousVersion,
		CreatedAt:   time.Now(),
		ChangeType:  changeType,
		Description: description,
		Checksum:    checksum,
	}

	sm.aclConfigs[acl.Version] = acl
	sm.versionHistory = append(sm.versionHistory, version)
	sm.currentVersion = acl.Version

	sm.broadcastConfig(acl, version)
	sm.updateSwitchNodesACLVersion(acl.Version)
	sm.triggerCallbacks(acl.Version, &acl)

	return version
}

func (sm *SyncManager) broadcastConfig(acl models.ACLConfig, version models.ConfigVersion) {
	msg := models.BroadcastMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Type:      "ACL_UPDATE",
		Version:   acl.Version,
		Source:    "VSAN-Controller",
		Payload:   acl,
	}

	for nodeID, ch := range sm.broadcastChannels {
		select {
		case ch <- msg:
			fmt.Printf("Broadcast ACL %s to node %s\n", acl.Version, nodeID)
		default:
			fmt.Printf("Warning: channel full for node %s, skipping broadcast\n", nodeID)
		}
	}
}

func (sm *SyncManager) updateSwitchNodesACLVersion(version string) {
	for id, node := range sm.switchNodes {
		node.ACLVersion = version
		sm.switchNodes[id] = node
	}
}

func (sm *SyncManager) triggerCallbacks(version string, acl *models.ACLConfig) {
	for _, cb := range sm.callbacks {
		go cb(version, acl)
	}
}

func (sm *SyncManager) RegisterCallback(cb ConfigChangeCallback) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.callbacks = append(sm.callbacks, cb)
}

func (sm *SyncManager) GetCurrentACL() (models.ACLConfig, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	acl, exists := sm.aclConfigs[sm.currentVersion]
	return acl, exists
}

func (sm *SyncManager) GetACL(version string) (models.ACLConfig, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	acl, exists := sm.aclConfigs[version]
	return acl, exists
}

func (sm *SyncManager) GetCurrentVersion() string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.currentVersion
}

func (sm *SyncManager) GetVersionHistory() []models.ConfigVersion {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	history := make([]models.ConfigVersion, len(sm.versionHistory))
	copy(history, sm.versionHistory)
	return history
}

func (sm *SyncManager) GetSwitchNodes() []models.SwitchNode {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	nodes := make([]models.SwitchNode, 0, len(sm.switchNodes))
	for _, node := range sm.switchNodes {
		nodes = append(nodes, node)
	}
	return nodes
}

func (sm *SyncManager) GetSyncStatus() models.SyncStatus {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	nodeStatus := make(map[string]string)
	for id, node := range sm.switchNodes {
		if node.ACLVersion == sm.currentVersion {
			nodeStatus[id] = "synced"
		} else {
			nodeStatus[id] = "out_of_sync"
		}
	}

	var lastSyncAt time.Time
	if len(sm.versionHistory) > 0 {
		lastSyncAt = sm.versionHistory[len(sm.versionHistory)-1].CreatedAt
	}

	return models.SyncStatus{
		CurrentVersion: sm.currentVersion,
		LastSyncAt:     lastSyncAt,
		NodeStatus:     nodeStatus,
		SyncInProgress: false,
	}
}

func (sm *SyncManager) SubscribeBroadcast(nodeID string) (<-chan models.BroadcastMessage, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, exists := sm.broadcastChannels[nodeID]; exists {
		return nil, fmt.Errorf("node %s already subscribed", nodeID)
	}

	ch := make(chan models.BroadcastMessage, 100)
	sm.broadcastChannels[nodeID] = ch
	return ch, nil
}

func (sm *SyncManager) UnsubscribeBroadcast(nodeID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ch, exists := sm.broadcastChannels[nodeID]; exists {
		close(ch)
		delete(sm.broadcastChannels, nodeID)
	}
}

func (sm *SyncManager) ManualSync(nodeID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	node, exists := sm.switchNodes[nodeID]
	if !exists {
		return fmt.Errorf("node %s not found", nodeID)
	}

	node.ACLVersion = sm.currentVersion
	sm.switchNodes[nodeID] = node
	return nil
}

func (sm *SyncManager) RollbackToVersion(version string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	acl, exists := sm.aclConfigs[version]
	if !exists {
		return fmt.Errorf("version %s not found", version)
	}

	sm.currentVersion = version
	sm.broadcastConfig(acl, models.ConfigVersion{Version: version})
	sm.updateSwitchNodesACLVersion(version)
	sm.triggerCallbacks(version, &acl)

	return nil
}
