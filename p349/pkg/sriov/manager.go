package sriov

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"sriov-simulator/pkg/models"
)

var (
	ErrPFNotFound          = errors.New("PF not found")
	ErrVFLimitExceeded     = errors.New("VF limit exceeded")
	ErrVFNotFound          = errors.New("VF not found")
	ErrVFAlreadyAllocated  = errors.New("VF already allocated")
	ErrVFFree              = errors.New("VF is already free")
	ErrVMNotFound          = errors.New("VM not found")
	ErrVMHasVF             = errors.New("VM already has an assigned VF")
	ErrSamePF              = errors.New("source and destination PF are the same")
	ErrVFMustBeAllocated   = errors.New("VF must be allocated to migrate")
	ErrInvalidQoS          = errors.New("invalid QoS value")
)

type Manager struct {
	pfs  map[string]*models.PF
	vms  map[string]*models.VM
	logs []*models.VFLogEntry
	mu   sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		pfs:  make(map[string]*models.PF),
		vms:  make(map[string]*models.VM),
		logs: make([]*models.VFLogEntry, 0),
	}
}

func (m *Manager) addLog(action models.LogAction, pfID, vfID, vmID, details string) {
	log := &models.VFLogEntry{
		ID:        fmt.Sprintf("log-%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Action:    action,
		VFID:      vfID,
		PFID:      pfID,
		VMID:      vmID,
		Details:   details,
	}
	m.logs = append(m.logs, log)
}

func (m *Manager) GetLogs() []*models.VFLogEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	logs := make([]*models.VFLogEntry, len(m.logs))
	copy(logs, m.logs)
	return logs
}

func (m *Manager) ExportLogsJSON(w io.Writer) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(m.logs)
}

func (m *Manager) ExportLogsCSV(w io.Writer) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := []string{"ID", "Timestamp", "Action", "PF ID", "VF ID", "VM ID", "Details"}
	if err := writer.Write(header); err != nil {
		return err
	}

	for _, log := range m.logs {
		row := []string{
			log.ID,
			log.Timestamp.Format(time.RFC3339),
			string(log.Action),
			log.PFID,
			log.VFID,
			log.VMID,
			log.Details,
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

func (m *Manager) AddPF(id, name, pciAddress string, maxVFs int) *models.PF {
	m.mu.Lock()
	defer m.mu.Unlock()

	pf := models.NewPF(id, name, pciAddress, maxVFs)
	m.pfs[id] = pf
	return pf
}

func (m *Manager) GetPF(id string) (*models.PF, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pf, exists := m.pfs[id]
	if !exists {
		return nil, ErrPFNotFound
	}
	return pf, nil
}

func (m *Manager) ListPFs() []*models.PF {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pfs := make([]*models.PF, 0, len(m.pfs))
	for _, pf := range m.pfs {
		pfs = append(pfs, pf)
	}
	return pfs
}

func (m *Manager) RemovePF(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.pfs[id]; !exists {
		return ErrPFNotFound
	}
	delete(m.pfs, id)
	return nil
}

func (m *Manager) CreateVF(pfID string) (*models.VF, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	if len(pf.VFs) >= pf.MaxVFs {
		return nil, ErrVFLimitExceeded
	}

	var vfIndex int
	if len(pf.FreePCIIndices) > 0 {
		vfIndex = pf.FreePCIIndices[0]
		pf.FreePCIIndices = pf.FreePCIIndices[1:]
	} else {
		vfIndex = len(pf.VFs)
	}

	vfID := fmt.Sprintf("%s-vf%d", pfID, vfIndex)
	pciAddr := pf.GenerateVFPCIAddress(vfIndex)

	vf := models.NewVF(vfID, vfIndex, pciAddr, pfID)
	pf.VFs = append(pf.VFs, vf)

	m.addLog(models.LogActionCreate, pfID, vfID, "", fmt.Sprintf("PCI: %s", pciAddr))

	return vf, nil
}

func (m *Manager) CreateMultipleVFs(pfID string, count int) ([]*models.VF, error) {
	vfs := make([]*models.VF, 0, count)
	for i := 0; i < count; i++ {
		vf, err := m.CreateVF(pfID)
		if err != nil {
			return vfs, err
		}
		vfs = append(vfs, vf)
	}
	return vfs, nil
}

func (m *Manager) RemoveVF(pfID, vfID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return ErrPFNotFound
	}

	for i, vf := range pf.VFs {
		if vf.ID == vfID {
			if vf.State == models.VFAllocated {
				return ErrVFAlreadyAllocated
			}
			pf.FreePCIIndices = append(pf.FreePCIIndices, vf.VFIndex)
			pf.VFs = append(pf.VFs[:i], pf.VFs[i+1:]...)
			m.addLog(models.LogActionDelete, pfID, vfID, "", fmt.Sprintf("PCI: %s returned to free pool", vf.PCIAddress))
			return nil
		}
	}

	return ErrVFNotFound
}

func (m *Manager) GetVF(pfID, vfID string) (*models.VF, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	for _, vf := range pf.VFs {
		if vf.ID == vfID {
			return vf, nil
		}
	}

	return nil, ErrVFNotFound
}

func (m *Manager) ListVFs(pfID string) ([]*models.VF, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	return pf.VFs, nil
}

func (m *Manager) AssignVF(pfID, vfID, vmID, virtPCIAddr string) (*models.VF, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	vm, vmExists := m.vms[vmID]
	if !vmExists {
		return nil, ErrVMNotFound
	}

	if vm.AssignedVF != nil {
		return nil, ErrVMHasVF
	}

	for _, vf := range pf.VFs {
		if vf.ID == vfID {
			if vf.State == models.VFAllocated {
				return nil, ErrVFAlreadyAllocated
			}
			vf.Assign(vm, virtPCIAddr)
			vm.AssignedVF = vf
			vm.AssignedVFRef = &models.VFRef{
				ID:         vf.ID,
				VFIndex:    vf.VFIndex,
				PCIAddress: vf.PCIAddress,
			}
			m.addLog(models.LogActionAssign, pfID, vfID, vmID, fmt.Sprintf("Virt PCI: %s", virtPCIAddr))
			return vf, nil
		}
	}

	return nil, ErrVFNotFound
}

func (m *Manager) ReleaseVF(pfID, vfID string) (*models.VF, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	for _, vf := range pf.VFs {
		if vf.ID == vfID {
			if vf.State == models.VFFree {
				return nil, ErrVFFree
			}
			vmID := ""
			if vf.AssignedVM != nil {
				vmID = vf.AssignedVM.ID
				vf.AssignedVM.AssignedVF = nil
				vf.AssignedVM.AssignedVFRef = nil
			}
			vf.Release()
			m.addLog(models.LogActionRelease, pfID, vfID, vmID, "VF released")
			return vf, nil
		}
	}

	return nil, ErrVFNotFound
}

func (m *Manager) AddVM(id, name string) *models.VM {
	m.mu.Lock()
	defer m.mu.Unlock()

	vm := models.NewVM(id, name)
	m.vms[id] = vm
	return vm
}

func (m *Manager) GetVM(id string) (*models.VM, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	vm, exists := m.vms[id]
	if !exists {
		return nil, ErrVMNotFound
	}
	return vm, nil
}

func (m *Manager) ListVMs() []*models.VM {
	m.mu.RLock()
	defer m.mu.RUnlock()

	vms := make([]*models.VM, 0, len(m.vms))
	for _, vm := range m.vms {
		vms = append(vms, vm)
	}
	return vms
}

func (m *Manager) RemoveVM(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	vm, exists := m.vms[id]
	if !exists {
		return ErrVMNotFound
	}

	if vm.AssignedVF != nil {
		vm.AssignedVF.Release()
	}

	delete(m.vms, id)
	return nil
}

type MigrationResult struct {
	SourceVF   *models.VF `json:"source_vf"`
	NewVF      *models.VF `json:"new_vf"`
	VMID       string     `json:"vm_id"`
	Success    bool       `json:"success"`
	Message    string     `json:"message"`
}

func (m *Manager) MigrateVF(sourcePFID, sourceVFID, destPFID string) (*MigrationResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if sourcePFID == destPFID {
		return nil, ErrSamePF
	}

	sourcePF, exists := m.pfs[sourcePFID]
	if !exists {
		return nil, ErrPFNotFound
	}

	destPF, exists := m.pfs[destPFID]
	if !exists {
		return nil, ErrPFNotFound
	}

	var sourceVF *models.VF
	var sourceVFIndex int
	for i, vf := range sourcePF.VFs {
		if vf.ID == sourceVFID {
			sourceVF = vf
			sourceVFIndex = i
			break
		}
	}
	if sourceVF == nil {
		return nil, ErrVFNotFound
	}

	if sourceVF.State != models.VFAllocated {
		return nil, ErrVFMustBeAllocated
	}

	if len(destPF.VFs) >= destPF.MaxVFs {
		return nil, ErrVFLimitExceeded
	}

	vm := sourceVF.AssignedVM
	virtPCIAddr := sourceVF.VirtPCIAddr

	var newVFIndex int
	if len(destPF.FreePCIIndices) > 0 {
		newVFIndex = destPF.FreePCIIndices[0]
		destPF.FreePCIIndices = destPF.FreePCIIndices[1:]
	} else {
		newVFIndex = len(destPF.VFs)
	}

	newVFID := fmt.Sprintf("%s-vf%d", destPFID, newVFIndex)
	newPCIAddr := destPF.GenerateVFPCIAddress(newVFIndex)
	newVF := models.NewVF(newVFID, newVFIndex, newPCIAddr, destPFID)

	newVF.Assign(vm, virtPCIAddr)
	vm.AssignedVF = newVF
	vm.AssignedVFRef = &models.VFRef{
		ID:         newVF.ID,
		VFIndex:    newVF.VFIndex,
		PCIAddress: newVF.PCIAddress,
	}

	destPF.VFs = append(destPF.VFs, newVF)

	sourcePF.FreePCIIndices = append(sourcePF.FreePCIIndices, sourceVF.VFIndex)
	sourcePF.VFs = append(sourcePF.VFs[:sourceVFIndex], sourcePF.VFs[sourceVFIndex+1:]...)

	m.addLog(models.LogActionMigrate, sourcePFID, sourceVFID, vm.ID, fmt.Sprintf("Migrated to %s -> %s", destPFID, newVFID))
	m.addLog(models.LogActionCreate, destPFID, newVFID, vm.ID, fmt.Sprintf("Created via migration from %s -> %s", sourcePFID, sourceVFID))

	return &MigrationResult{
		SourceVF: sourceVF,
		NewVF:    newVF,
		VMID:     vm.ID,
		Success:  true,
		Message:  fmt.Sprintf("VF migrated from %s to %s, assigned to VM %s", sourceVFID, newVFID, vm.ID),
	}, nil
}

func (m *Manager) SetVFQoS(pfID, vfID string, maxTxMbps, maxRxMbps int) (*models.VF, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if maxTxMbps < 0 || maxRxMbps < 0 {
		return nil, ErrInvalidQoS
	}

	pf, exists := m.pfs[pfID]
	if !exists {
		return nil, ErrPFNotFound
	}

	for _, vf := range pf.VFs {
		if vf.ID == vfID {
			vf.QoS.MaxTxMbps = maxTxMbps
			vf.QoS.MaxRxMbps = maxRxMbps
			m.addLog(models.LogActionSetQoS, pfID, vfID, "", fmt.Sprintf("Tx: %d Mbps, Rx: %d Mbps", maxTxMbps, maxRxMbps))
			return vf, nil
		}
	}

	return nil, ErrVFNotFound
}

func (m *Manager) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	totalPFs := len(m.pfs)
	totalVFs := 0
	allocatedVFs := 0
	freeVFs := 0

	for _, pf := range m.pfs {
		for _, vf := range pf.VFs {
			totalVFs++
			if vf.State == models.VFAllocated {
				allocatedVFs++
			} else {
				freeVFs++
			}
		}
	}

	return map[string]interface{}{
		"total_pfs":      totalPFs,
		"total_vfs":      totalVFs,
		"allocated_vfs":  allocatedVFs,
		"free_vfs":       freeVFs,
		"total_vms":      len(m.vms),
	}
}
