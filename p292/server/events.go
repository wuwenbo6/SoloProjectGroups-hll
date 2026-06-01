package main

import (
	"sync"
	"time"
)

type EventLogger struct {
	mu     sync.Mutex
	events []EventLog
}

func NewEventLogger() *EventLogger {
	return &EventLogger{
		events: make([]EventLog, 0),
	}
}

func (el *EventLogger) Log(eventType, mnID, magAddress, detail string) {
	el.mu.Lock()
	defer el.mu.Unlock()
	el.events = append(el.events, EventLog{
		Timestamp:  time.Now(),
		EventType:  eventType,
		MNID:       mnID,
		MAGAddress: magAddress,
		Detail:     detail,
	})
}

func (el *EventLogger) GetAll() []EventLog {
	el.mu.Lock()
	defer el.mu.Unlock()
	result := make([]EventLog, len(el.events))
	copy(result, el.events)
	return result
}
