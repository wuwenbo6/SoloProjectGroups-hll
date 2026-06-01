package reflector

import (
	"mdns-reflector/model"
	"sync"
)

type Bus struct {
	mu          sync.RWMutex
	subscribers []chan model.WSEvent
}

func NewBus() *Bus {
	return &Bus{
		subscribers: make([]chan model.WSEvent, 0),
	}
}

func (b *Bus) Subscribe() chan model.WSEvent {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan model.WSEvent, 64)
	b.subscribers = append(b.subscribers, ch)
	return ch
}

func (b *Bus) Unsubscribe(ch chan model.WSEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, sub := range b.subscribers {
		if sub == ch {
			b.subscribers = append(b.subscribers[:i], b.subscribers[i+1:]...)
			close(ch)
			return
		}
	}
}

func (b *Bus) Publish(event model.WSEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, sub := range b.subscribers {
		select {
		case sub <- event:
		default:
		}
	}
}
