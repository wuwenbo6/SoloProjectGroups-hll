package codeserver

import (
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/codeserver-manager/internal/config"
	"github.com/codeserver-manager/internal/workspace"
)

type InstanceStatus string

const (
	StatusStopped  InstanceStatus = "stopped"
	StatusStarting InstanceStatus = "starting"
	StatusRunning  InstanceStatus = "running"
	StatusError    InstanceStatus = "error"

	DefaultIdleTimeout     = 3 * time.Minute
	DefaultCleanupInterval = 30 * time.Second
)

type ResourceLimits struct {
	CPULimit      float64 `json:"cpu_limit"`
	MemoryLimitMB int     `json:"memory_limit_mb"`
}

type Instance struct {
	UserID         string         `json:"user_id"`
	Port           int            `json:"port"`
	Status         InstanceStatus `json:"status"`
	PID            int            `json:"pid,omitempty"`
	Error          string         `json:"error,omitempty"`
	StartedAt      time.Time      `json:"started_at,omitempty"`
	LastActiveAt   time.Time      `json:"last_active_at,omitempty"`
	Workspace      string         `json:"workspace"`
	Password       string         `json:"-"`
	ResourceLimits ResourceLimits `json:"resource_limits"`
}

type Manager struct {
	instances     map[string]*Instance
	instanceLock  sync.RWMutex
	portAllocator *PortAllocator
	workspaceMgr  *workspace.Manager
	processes     map[string]*exec.Cmd
	processLock   sync.Mutex
	idleTimeout   time.Duration
	cleanupTicker *time.Ticker
	stopCleanup   chan struct{}
	defaultLimits ResourceLimits
}

type PortAllocator struct {
	basePort int
	maxPort  int
	used     map[int]bool
	freePool []int
	lock     sync.Mutex
}

var (
	ErrInstanceNotFound = errors.New("instance not found")
	ErrInstanceRunning  = errors.New("instance already running")
	ErrMaxInstances     = errors.New("max instances reached")
	ErrPortUnavailable  = errors.New("no available port")
)

func NewPortAllocator(basePort, maxInstances int) *PortAllocator {
	return &PortAllocator{
		basePort: basePort,
		maxPort:  basePort + maxInstances,
		used:     make(map[int]bool),
		freePool: make([]int, 0),
	}
}

func (pa *PortAllocator) Allocate() (int, error) {
	pa.lock.Lock()
	defer pa.lock.Unlock()

	if len(pa.freePool) > 0 {
		port := pa.freePool[0]
		pa.freePool = pa.freePool[1:]
		if isPortAvailable(port) {
			pa.used[port] = true
			return port, nil
		}
	}

	for port := pa.basePort; port < pa.maxPort; port++ {
		if !pa.used[port] {
			if isPortAvailable(port) {
				pa.used[port] = true
				return port, nil
			}
		}
	}

	return 0, ErrPortUnavailable
}

func (pa *PortAllocator) Release(port int) {
	pa.lock.Lock()
	defer pa.lock.Unlock()

	if pa.used[port] {
		delete(pa.used, port)
		pa.freePool = append(pa.freePool, port)
	}
}

func (pa *PortAllocator) GetFreePoolSize() int {
	pa.lock.Lock()
	defer pa.lock.Unlock()
	return len(pa.freePool)
}

func (pa *PortAllocator) GetFreePorts() []int {
	pa.lock.Lock()
	defer pa.lock.Unlock()
	ports := make([]int, len(pa.freePool))
	copy(ports, pa.freePool)
	return ports
}

func isPortAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

func NewManager(cfg *config.CodeServerConfig, wm *workspace.Manager) (*Manager, error) {
	idleTimeout := DefaultIdleTimeout
	if cfg.IdleTimeoutMinutes > 0 {
		idleTimeout = time.Duration(cfg.IdleTimeoutMinutes) * time.Minute
	}

	m := &Manager{
		instances:     make(map[string]*Instance),
		portAllocator: NewPortAllocator(cfg.BasePort, cfg.MaxInstances),
		workspaceMgr:  wm,
		processes:     make(map[string]*exec.Cmd),
		idleTimeout:   idleTimeout,
		stopCleanup:   make(chan struct{}),
		defaultLimits: ResourceLimits{
			CPULimit:      cfg.CPULimit,
			MemoryLimitMB: cfg.MemoryLimitMB,
		},
	}

	m.StartIdleCleanup()
	return m, nil
}

func (m *Manager) Start(userID, password string) (*Instance, error) {
	m.instanceLock.Lock()
	defer m.instanceLock.Unlock()

	if inst, exists := m.instances[userID]; exists {
		if inst.Status == StatusRunning || inst.Status == StatusStarting {
			return inst, ErrInstanceRunning
		}
	}

	port, err := m.portAllocator.Allocate()
	if err != nil {
		return nil, err
	}

	if err := m.workspaceMgr.Create(userID); err != nil {
		m.portAllocator.Release(port)
		return nil, err
	}

	now := time.Now()
	inst := &Instance{
		UserID:         userID,
		Port:           port,
		Status:         StatusStarting,
		Workspace:      m.workspaceMgr.GetPath(userID),
		Password:       password,
		StartedAt:      now,
		LastActiveAt:   now,
		ResourceLimits: m.defaultLimits,
	}

	m.instances[userID] = inst

	go m.runInstance(inst)

	return inst, nil
}

func (m *Manager) runInstance(inst *Instance) {
	cfg := config.AppConfig.CodeServer

	args := []string{
		"--bind-addr", fmt.Sprintf("127.0.0.1:%d", inst.Port),
		"--auth", "password",
		"--password", inst.Password,
		"--disable-telemetry",
		"--disable-update-check",
		inst.Workspace,
	}

	cmd := exec.Command(cfg.BinaryPath, args...)
	cmd.Dir = inst.Workspace

	applyResourceLimits(cmd, &inst.ResourceLimits)

	logFile, err := os.OpenFile(
		fmt.Sprintf("%s/code-server.log", inst.Workspace),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND,
		0644,
	)
	if err == nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		defer logFile.Close()
	}

	m.processLock.Lock()
	m.processes[inst.UserID] = cmd
	m.processLock.Unlock()

	m.instanceLock.Lock()
	inst.Status = StatusRunning
	m.instanceLock.Unlock()

	if err := cmd.Start(); err != nil {
		m.instanceLock.Lock()
		inst.Status = StatusError
		inst.Error = err.Error()
		m.instanceLock.Unlock()
		m.portAllocator.Release(inst.Port)
		return
	}

	m.instanceLock.Lock()
	inst.PID = cmd.Process.Pid
	m.instanceLock.Unlock()

	err = cmd.Wait()

	m.processLock.Lock()
	delete(m.processes, inst.UserID)
	m.processLock.Unlock()

	m.instanceLock.Lock()
	if inst.Status == StatusRunning {
		inst.Status = StatusStopped
		if err != nil {
			inst.Error = err.Error()
		}
	}
	m.instanceLock.Unlock()

	m.portAllocator.Release(inst.Port)
}

func (m *Manager) Stop(userID string) error {
	m.instanceLock.Lock()
	defer m.instanceLock.Unlock()

	inst, exists := m.instances[userID]
	if !exists {
		return ErrInstanceNotFound
	}

	if inst.Status != StatusRunning && inst.Status != StatusStarting {
		return nil
	}

	m.processLock.Lock()
	cmd, exists := m.processes[userID]
	m.processLock.Unlock()

	if exists && cmd.Process != nil {
		if err := cmd.Process.Kill(); err != nil {
			return err
		}
	}

	inst.Status = StatusStopped
	return nil
}

func (m *Manager) Get(userID string) (*Instance, error) {
	m.instanceLock.RLock()
	defer m.instanceLock.RUnlock()

	inst, exists := m.instances[userID]
	if !exists {
		return nil, ErrInstanceNotFound
	}

	return inst, nil
}

func (m *Manager) List() []*Instance {
	m.instanceLock.RLock()
	defer m.instanceLock.RUnlock()

	instances := make([]*Instance, 0, len(m.instances))
	for _, inst := range m.instances {
		instances = append(instances, inst)
	}

	return instances
}

func (m *Manager) Cleanup(userID string) {
	m.Stop(userID)

	m.instanceLock.Lock()
	delete(m.instances, userID)
	m.instanceLock.Unlock()

	m.workspaceMgr.Delete(userID)
}

func (m *Manager) RecordActivity(userID string) {
	m.instanceLock.Lock()
	defer m.instanceLock.Unlock()

	if inst, exists := m.instances[userID]; exists {
		inst.LastActiveAt = time.Now()
	}
}

func (m *Manager) StartIdleCleanup() {
	m.cleanupTicker = time.NewTicker(DefaultCleanupInterval)

	go func() {
		for {
			select {
			case <-m.cleanupTicker.C:
				m.cleanupIdleInstances()
			case <-m.stopCleanup:
				m.cleanupTicker.Stop()
				return
			}
		}
	}()
}

func (m *Manager) StopIdleCleanup() {
	close(m.stopCleanup)
}

func (m *Manager) cleanupIdleInstances() {
	m.instanceLock.RLock()
	var toStop []string
	now := time.Now()

	for userID, inst := range m.instances {
		if inst.Status == StatusRunning {
			idleTime := now.Sub(inst.LastActiveAt)
			if idleTime >= m.idleTimeout {
				toStop = append(toStop, userID)
			}
		}
	}
	m.instanceLock.RUnlock()

	for _, userID := range toStop {
		m.processLock.Lock()
		cmd, exists := m.processes[userID]
		m.processLock.Unlock()

		if exists && cmd.Process != nil {
			cmd.Process.Kill()
		}
	}
}

func (m *Manager) GetIdleTimeout() time.Duration {
	return m.idleTimeout
}

func (m *Manager) SetIdleTimeout(timeout time.Duration) {
	m.idleTimeout = timeout
}

func (m *Manager) GetPortAllocator() *PortAllocator {
	return m.portAllocator
}

func (m *Manager) GetDefaultLimits() ResourceLimits {
	return m.defaultLimits
}

func (m *Manager) SetResourceLimits(userID string, limits ResourceLimits) error {
	m.instanceLock.Lock()
	defer m.instanceLock.Unlock()

	inst, exists := m.instances[userID]
	if !exists {
		return ErrInstanceNotFound
	}

	inst.ResourceLimits = limits
	return nil
}

func applyResourceLimits(cmd *exec.Cmd, limits *ResourceLimits) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}

	cmd.SysProcAttr.Setpgid = true
}

func setMemoryLimit(cmd *exec.Cmd, memoryLimitMB int) {
}

func setCPULimit(cmd *exec.Cmd, cpuLimit float64) {
}
