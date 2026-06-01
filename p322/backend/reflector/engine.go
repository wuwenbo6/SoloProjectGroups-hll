package reflector

import (
	"fmt"
	"sync/atomic"
	"time"

	"mdns-reflector/model"
)

type Engine struct {
	registry         *Registry
	bus              *Bus
	simulators       []*SubnetSimulator
	packetsForwarded atomic.Int64
	startedAt        time.Time
}

func NewEngine() *Engine {
	bus := NewBus()
	registry := NewRegistry(bus)
	return &Engine{
		registry:  registry,
		bus:       bus,
		startedAt: time.Now().UTC(),
	}
}

func (e *Engine) Start() {
	subnetIDs := []string{"subnet-a", "subnet-b", "subnet-c"}
	for _, id := range subnetIDs {
		sim := NewSubnetSimulator(id, e.registry, e.bus)
		e.simulators = append(e.simulators, sim)
		sim.Start()
	}
	go e.statsLoop()
}

func (e *Engine) Stop() {
	for _, sim := range e.simulators {
		sim.Stop()
	}
}

func (e *Engine) GetRegistry() *Registry {
	return e.registry
}

func (e *Engine) GetBus() *Bus {
	return e.bus
}

func (e *Engine) GetStatus() *model.ReflectorStatus {
	return &model.ReflectorStatus{
		Status:           "running",
		Uptime:           int64(time.Since(e.startedAt).Seconds()),
		PacketsForwarded: e.packetsForwarded.Load(),
		ActiveInterfaces: []string{"eth0", "wlan0", "eth1"},
		StartedAt:        e.startedAt.Format(time.RFC3339),
	}
}

func (e *Engine) statsLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		e.packetsForwarded.Add(int64(3 + time.Now().Second()%7))
		e.bus.Publish(model.WSEvent{
			Type:             model.EventReflectorStats,
			PacketsForwarded: e.packetsForwarded.Load(),
			Uptime:           int64(time.Since(e.startedAt).Seconds()),
		})
	}
}

func (e *Engine) FormatUptime() string {
	secs := int64(time.Since(e.startedAt).Seconds())
	h := secs / 3600
	m := (secs % 3600) / 60
	s := secs % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}
