package coap

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"coap-gateway/internal/database"
	"coap-gateway/internal/models"

	"github.com/plgd-dev/go-coap/v3/message/pool"
	"go.uber.org/zap"
)

type SSESubscriber struct {
	ID       string
	DeviceID string
	Path     string
	Ctx      context.Context
	Cancel   context.CancelFunc
	Events   chan *models.SSEEvent
}

type ObserveManager struct {
	logger          *zap.Logger
	db              *database.Database
	subscriptions   map[string]*models.ObserveSubscription
	sseSubscribers  map[string][]*SSESubscriber
	deviceObservers map[string]map[string]string
	mu              sync.RWMutex
	notifyChan      chan *models.CoAPMessage
}

func NewObserveManager(logger *zap.Logger, db *database.Database) *ObserveManager {
	return &ObserveManager{
		logger:          logger,
		db:              db,
		subscriptions:   make(map[string]*models.ObserveSubscription),
		sseSubscribers:  make(map[string][]*SSESubscriber),
		deviceObservers: make(map[string]map[string]string),
		notifyChan:      make(chan *models.CoAPMessage, 1000),
	}
}

func (om *ObserveManager) Start(ctx context.Context) {
	om.loadActiveSubscriptions()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-om.notifyChan:
				om.broadcastToSSESubscribers(msg)
			}
		}
	}()

	go om.cleanupExpired(ctx)
}

func (om *ObserveManager) loadActiveSubscriptions() {
	subs, err := om.db.GetActiveSubscriptions()
	if err != nil {
		om.logger.Error("Load active subscriptions failed", zap.Error(err))
		return
	}

	om.mu.Lock()
	defer om.mu.Unlock()

	for _, sub := range subs {
		om.subscriptions[sub.Token] = sub
	}
	om.logger.Info("Loaded active subscriptions", zap.Int("count", len(subs)))
}

func (om *ObserveManager) AddSubscription(deviceID, path, token string) error {
	route, err := om.db.GetRouteByHTTPPath(path, "GET")
	var routeID string
	if err == nil {
		routeID = route.ID
	}

	sub := &models.ObserveSubscription{
		RouteID:  routeID,
		DeviceID: deviceID,
		CoAPPath: path,
		Token:    token,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	if err := om.db.CreateSubscription(sub); err != nil {
		return err
	}

	om.mu.Lock()
	om.subscriptions[token] = sub

	if om.deviceObservers[deviceID] == nil {
		om.deviceObservers[deviceID] = make(map[string]string)
	}
	om.deviceObservers[deviceID][path] = token
	om.mu.Unlock()

	om.logger.Info("Observe subscription added",
		zap.String("device_id", deviceID),
		zap.String("path", path),
		zap.String("token", token),
	)

	return nil
}

func (om *ObserveManager) CancelSubscription(token string) {
	om.mu.Lock()
	sub, ok := om.subscriptions[token]
	if ok {
		delete(om.subscriptions, token)
		if om.deviceObservers[sub.DeviceID] != nil {
			delete(om.deviceObservers[sub.DeviceID], sub.CoAPPath)
		}
	}
	om.mu.Unlock()

	if ok {
		om.db.CancelSubscription(sub.ID)
		om.logger.Info("Observe subscription cancelled",
			zap.String("device_id", sub.DeviceID),
			zap.String("path", sub.CoAPPath),
		)
	}
}

func (om *ObserveManager) CleanupDeviceSubscriptions(deviceID string) {
	om.mu.Lock()
	tokens := make([]string, 0)
	for token, sub := range om.subscriptions {
		if sub.DeviceID == deviceID {
			tokens = append(tokens, token)
		}
	}
	om.mu.Unlock()

	for _, token := range tokens {
		om.CancelSubscription(token)
	}

	om.mu.Lock()
	delete(om.deviceObservers, deviceID)
	om.mu.Unlock()
}

func (om *ObserveManager) HandleDeviceNotification(deviceID, path string, msg *pool.Message) {
	var payload []byte
	if msg.Body() != nil {
		payload, _ = io.ReadAll(msg.Body())
		msg.SetBody(bytes.NewReader(payload))
	}

	observe, _ := msg.Observe()
	tokenStr := ""
	if msg.Token() != nil {
		tokenStr = fmt.Sprintf("%x", msg.Token())
	}

	messageID := msg.MessageID()
	if messageID < 0 {
		messageID = 0
	}

	coapMsg := &models.CoAPMessage{
		MessageID:  uint16(messageID),
		Type:       msg.Type().String(),
		Code:       msg.Code().String(),
		Token:      tokenStr,
		Path:       path,
		Payload:    payload,
		Observe:    observe,
	}

	om.logger.Debug("Device notification received",
		zap.String("device_id", deviceID),
		zap.String("path", path),
		zap.Int("payload_len", len(payload)),
	)

	if tokenStr != "" {
		om.updateSubscriptionSequence(tokenStr, observe)
	}

	om.notifyChan <- coapMsg
}

func (om *ObserveManager) updateSubscriptionSequence(token string, seq uint32) {
	om.mu.RLock()
	sub, ok := om.subscriptions[token]
	om.mu.RUnlock()

	if ok {
		om.db.UpdateSubscriptionSequence(sub.ID, seq)
		om.mu.Lock()
		sub.SequenceNumber = seq
		sub.LastNotifyAt = time.Now()
		om.mu.Unlock()
	}
}

func (om *ObserveManager) broadcastToSSESubscribers(coapMsg *models.CoAPMessage) {
	om.mu.RLock()
	subscribers := make([]*SSESubscriber, 0)

	for _, subs := range om.sseSubscribers {
		for _, s := range subs {
			if s.Path == coapMsg.Path {
				subscribers = append(subscribers, s)
			}
		}
	}
	om.mu.RUnlock()

	om.logger.Debug("Broadcasting to SSE subscribers",
		zap.String("path", coapMsg.Path),
		zap.Int("subscriber_count", len(subscribers)),
	)

	event := &models.SSEEvent{
		ID:    fmt.Sprintf("%d", coapMsg.MessageID),
		Event: "device_data",
		Data:  string(coapMsg.Payload),
	}

	for _, sub := range subscribers {
		select {
		case <-sub.Ctx.Done():
			continue
		case sub.Events <- event:
		default:
			om.logger.Warn("SSE subscriber channel full, dropping message",
				zap.String("subscriber_id", sub.ID),
				zap.String("device_id", sub.DeviceID),
				zap.String("path", sub.Path),
			)
		}
	}
}

func (om *ObserveManager) AddSSESubscriber(deviceID, path string) (*SSESubscriber, error) {
	ctx, cancel := context.WithCancel(context.Background())

	subscriber := &SSESubscriber{
		ID:       fmt.Sprintf("sse-%d", time.Now().UnixNano()),
		DeviceID: deviceID,
		Path:     path,
		Ctx:      ctx,
		Cancel:   cancel,
		Events:   make(chan *models.SSEEvent, 100),
	}

	key := fmt.Sprintf("%s:%s", deviceID, path)

	om.mu.Lock()
	om.sseSubscribers[key] = append(om.sseSubscribers[key], subscriber)
	om.mu.Unlock()

	om.logger.Info("SSE subscriber added",
		zap.String("subscriber_id", subscriber.ID),
		zap.String("device_id", deviceID),
		zap.String("path", path),
	)

	return subscriber, nil
}

func (om *ObserveManager) RemoveSSESubscriber(subscriber *SSESubscriber) {
	key := fmt.Sprintf("%s:%s", subscriber.DeviceID, subscriber.Path)

	om.mu.Lock()
	subs := om.sseSubscribers[key]
	for i, s := range subs {
		if s.ID == subscriber.ID {
			om.sseSubscribers[key] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	if len(om.sseSubscribers[key]) == 0 {
		delete(om.sseSubscribers, key)
	}
	om.mu.Unlock()

	subscriber.Cancel()
	close(subscriber.Events)

	om.logger.Info("SSE subscriber removed",
		zap.String("subscriber_id", subscriber.ID),
		zap.String("device_id", subscriber.DeviceID),
	)
}

func (om *ObserveManager) cleanupExpired(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			om.removeExpiredSubscriptions()
		}
	}
}

func (om *ObserveManager) removeExpiredSubscriptions() {
	om.mu.RLock()
	now := time.Now()
	expiredTokens := make([]string, 0)
	for token, sub := range om.subscriptions {
		if !sub.ExpiresAt.IsZero() && sub.ExpiresAt.Before(now) {
			expiredTokens = append(expiredTokens, token)
		}
	}
	om.mu.RUnlock()

	for _, token := range expiredTokens {
		om.CancelSubscription(token)
	}
}

func (om *ObserveManager) GetSubscriptionCount() int {
	om.mu.RLock()
	defer om.mu.RUnlock()
	return len(om.subscriptions)
}

func (om *ObserveManager) GetSSESubscriberCount() int {
	om.mu.RLock()
	defer om.mu.RUnlock()
	count := 0
	for _, subs := range om.sseSubscribers {
		count += len(subs)
	}
	return count
}
