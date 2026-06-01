package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

type SessionUpdateEvent struct {
	Event     string   `json:"event"`
	SessionID string   `json:"session_id"`
	UserName  string   `json:"user_name"`
	NASIP     string   `json:"nas_ip"`
	Updates   []string `json:"updates"`
	Timestamp string   `json:"timestamp"`
}

type NASNotifier struct {
	mu        sync.Mutex
	callbacks []func(SessionUpdateEvent)
	client    *http.Client
	nasURL    string
}

func NewNASNotifier(nasURL string) *NASNotifier {
	return &NASNotifier{
		client: &http.Client{
			Timeout: 3 * time.Second,
		},
		nasURL: nasURL,
	}
}

func (n *NASNotifier) OnSessionUpdate(cb func(SessionUpdateEvent)) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.callbacks = append(n.callbacks, cb)
}

func (n *NASNotifier) PushSessionUpdate(session *Session, updates []string) {
	event := SessionUpdateEvent{
		Event:     "session-update",
		SessionID: session.SessionID,
		UserName:  session.UserName,
		NASIP:     session.NASIP,
		Updates:   updates,
		Timestamp: time.Now().Format(time.RFC3339),
	}

	log.Printf("NAS Session Update: session=%s user=%s updates=%v nas=%s", session.SessionID, session.UserName, updates, session.NASIP)

	n.mu.Lock()
	callbacks := make([]func(SessionUpdateEvent), len(n.callbacks))
	copy(callbacks, n.callbacks)
	n.mu.Unlock()

	for _, cb := range callbacks {
		go func(fn func(SessionUpdateEvent)) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("NAS callback panic: %v", r)
				}
			}()
			fn(event)
		}(cb)
	}

	if n.nasURL != "" {
		go n.sendToNAS(event)
	}
}

func (n *NASNotifier) sendToNAS(event SessionUpdateEvent) {
	body, err := json.Marshal(event)
	if err != nil {
		log.Printf("NAS push: marshal error: %v", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, n.nasURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("NAS push: request creation error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Radius-Event", "session-update")

	resp, err := n.client.Do(req)
	if err != nil {
		log.Printf("NAS push: send to %s failed: %v", n.nasURL, err)
		return
	}
	defer resp.Body.Close()

	log.Printf("NAS push: %s responded %d for session=%s", n.nasURL, resp.StatusCode, event.SessionID)
}

func (n *NASNotifier) PushDisconnect(session *Session) {
	event := SessionUpdateEvent{
		Event:     "session-disconnect",
		SessionID: session.SessionID,
		UserName:  session.UserName,
		NASIP:     session.NASIP,
		Updates:   []string{"status:disconnected"},
		Timestamp: time.Now().Format(time.RFC3339),
	}

	log.Printf("NAS Session Disconnect: session=%s user=%s nas=%s", session.SessionID, session.UserName, session.NASIP)

	n.mu.Lock()
	callbacks := make([]func(SessionUpdateEvent), len(n.callbacks))
	copy(callbacks, n.callbacks)
	n.mu.Unlock()

	for _, cb := range callbacks {
		go func(fn func(SessionUpdateEvent)) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("NAS callback panic: %v", r)
				}
			}()
			fn(event)
		}(cb)
	}
}

var _ = fmt.Sprintf
