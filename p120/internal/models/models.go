package models

import (
	"time"
)

type Device struct {
	ID           string    `json:"id"`
	DeviceID     string    `json:"device_id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	Status       string    `json:"status"`
	LastSeen     time.Time `json:"last_seen"`
	RemoteAddr   string    `json:"remote_addr"`
	Protocol     string    `json:"protocol"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Route struct {
	ID            string    `json:"id"`
	DeviceID      string    `json:"device_id"`
	CoAPPath      string    `json:"coap_path"`
	HTTPPath      string    `json:"http_path"`
	Method        string    `json:"method"`
	Description   string    `json:"description"`
	IsObservable  bool      `json:"is_observable"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type ObserveSubscription struct {
	ID              string    `json:"id"`
	RouteID         string    `json:"route_id"`
	DeviceID        string    `json:"device_id"`
	CoAPPath        string    `json:"coap_path"`
	Token           string    `json:"token"`
	SequenceNumber  uint32    `json:"sequence_number"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	LastNotifyAt    time.Time `json:"last_notify_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

type CoAPMessage struct {
	MessageID   uint16
	Type        string
	Code        string
	Token       string
	Path        string
	Query       string
	Payload     []byte
	ContentType string
	Observe     uint32
}

type HTTPResponse struct {
	StatusCode int
	Headers    map[string]string
	Body       []byte
}

type SSEEvent struct {
	ID    string
	Event string
	Data  string
}
