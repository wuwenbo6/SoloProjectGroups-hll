package models

import (
	"fmt"
	"sync"
	"time"
)

type PF struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	PCIAddress     string    `json:"pci_address"`
	MaxVFs         int       `json:"max_vfs"`
	VFs            []*VF     `json:"vfs"`
	FreePCIIndices []int     `json:"free_pci_indices"`
	CreatedAt      time.Time `json:"created_at"`
	mu             sync.RWMutex
}

type VFState string

const (
	VFFree     VFState = "free"
	VFAllocated VFState = "allocated"
)

type VFQoS struct {
	MaxTxMbps int `json:"max_tx_mbps"`
	MaxRxMbps int `json:"max_rx_mbps"`
}

type VMRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type VF struct {
	ID             string     `json:"id"`
	VFIndex        int        `json:"vf_index"`
	PCIAddress     string     `json:"pci_address"`
	State          VFState    `json:"state"`
	AssignedVMRef  *VMRef     `json:"assigned_vm,omitempty"`
	VirtPCIAddr    string     `json:"virt_pci_addr,omitempty"`
	AssignedAt     *time.Time `json:"assigned_at,omitempty"`
	PFID           string     `json:"pf_id"`
	QoS            VFQoS      `json:"qos"`
	AssignedVM     *VM        `json:"-"`
}

type LogAction string

const (
	LogActionCreate    LogAction = "create"
	LogActionDelete    LogAction = "delete"
	LogActionAssign    LogAction = "assign"
	LogActionRelease   LogAction = "release"
	LogActionMigrate   LogAction = "migrate"
	LogActionSetQoS    LogAction = "set_qos"
)

type VFLogEntry struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Action    LogAction `json:"action"`
	VFID      string    `json:"vf_id"`
	PFID      string    `json:"pf_id"`
	VMID      string    `json:"vm_id,omitempty"`
	Details   string    `json:"details,omitempty"`
}

type VFRef struct {
	ID         string `json:"id"`
	VFIndex    int    `json:"vf_index"`
	PCIAddress string `json:"pci_address"`
}

type VM struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	AssignedVFRef  *VFRef    `json:"assigned_vf,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	AssignedVF     *VF       `json:"-"`
}

func NewPF(id, name, pciAddress string, maxVFs int) *PF {
	return &PF{
		ID:             id,
		Name:           name,
		PCIAddress:     pciAddress,
		MaxVFs:         maxVFs,
		VFs:            make([]*VF, 0),
		FreePCIIndices: make([]int, 0),
		CreatedAt:      time.Now(),
	}
}

func (pf *PF) GenerateVFPCIAddress(vfIndex int) string {
	return fmt.Sprintf("%s.%d", pf.PCIAddress, vfIndex)
}

func NewVF(id string, vfIndex int, pciAddress, pfID string) *VF {
	return &VF{
		ID:         id,
		VFIndex:    vfIndex,
		PCIAddress: pciAddress,
		State:      VFFree,
		PFID:       pfID,
	}
}

func NewVM(id, name string) *VM {
	return &VM{
		ID:        id,
		Name:      name,
		CreatedAt: time.Now(),
	}
}

func (vf *VF) Assign(vm *VM, virtPCIAddr string) {
	now := time.Now()
	vf.State = VFAllocated
	vf.AssignedVM = vm
	vf.AssignedVMRef = &VMRef{
		ID:   vm.ID,
		Name: vm.Name,
	}
	vf.VirtPCIAddr = virtPCIAddr
	vf.AssignedAt = &now
}

func (vf *VF) Release() {
	vf.State = VFFree
	vf.AssignedVM = nil
	vf.AssignedVMRef = nil
	vf.VirtPCIAddr = ""
	vf.AssignedAt = nil
}
