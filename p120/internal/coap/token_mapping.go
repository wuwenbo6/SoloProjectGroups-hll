package coap

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/plgd-dev/go-coap/v3/message"
	"go.uber.org/zap"
)

type TokenMapping struct {
	HTTPRequestID string
	CoAPToken     string
	DeviceID      string
	Path          string
	CreatedAt     time.Time
	ExpiresAt     time.Time
}

type TokenManager struct {
	logger    *zap.Logger
	mappings  map[string]*TokenMapping
	mu        sync.RWMutex
	tokenPool chan message.Token
}

func NewTokenManager(logger *zap.Logger) *TokenManager {
	tm := &TokenManager{
		logger:   logger,
		mappings: make(map[string]*TokenMapping),
	}
	go tm.cleanupExpired()
	return tm
}

func (tm *TokenManager) GenerateToken() (message.Token, error) {
	token := make(message.Token, 8)
	_, err := rand.Read(token)
	if err != nil {
		return nil, fmt.Errorf("generate token failed: %w", err)
	}
	return token, nil
}

func (tm *TokenManager) RegisterMapping(httpRequestID, coapToken, deviceID, path string, ttl time.Duration) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now()
	mapping := &TokenMapping{
		HTTPRequestID: httpRequestID,
		CoAPToken:     coapToken,
		DeviceID:      deviceID,
		Path:          path,
		CreatedAt:     now,
		ExpiresAt:     now.Add(ttl),
	}

	tm.mappings[coapToken] = mapping
	tm.logger.Debug("Token mapping registered",
		zap.String("http_request_id", httpRequestID),
		zap.String("coap_token", coapToken),
		zap.String("device_id", deviceID),
		zap.String("path", path),
	)
}

func (tm *TokenManager) GetByToken(coapToken string) (*TokenMapping, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	mapping, ok := tm.mappings[coapToken]
	if !ok {
		return nil, false
	}

	if time.Now().After(mapping.ExpiresAt) {
		return nil, false
	}

	return mapping, true
}

func (tm *TokenManager) GetByHTTPRequestID(httpRequestID string) (*TokenMapping, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	for _, mapping := range tm.mappings {
		if mapping.HTTPRequestID == httpRequestID {
			if time.Now().Before(mapping.ExpiresAt) {
				return mapping, true
			}
			return nil, false
		}
	}
	return nil, false
}

func (tm *TokenManager) RemoveMapping(coapToken string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	delete(tm.mappings, coapToken)
	tm.logger.Debug("Token mapping removed",
		zap.String("coap_token", coapToken),
	)
}

func (tm *TokenManager) RemoveByDeviceID(deviceID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	for token, mapping := range tm.mappings {
		if mapping.DeviceID == deviceID {
			delete(tm.mappings, token)
		}
	}
}

func (tm *TokenManager) cleanupExpired() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		tm.mu.Lock()
		now := time.Now()
		expiredTokens := make([]string, 0)
		for token, mapping := range tm.mappings {
			if now.After(mapping.ExpiresAt) {
				expiredTokens = append(expiredTokens, token)
			}
		}
		for _, token := range expiredTokens {
			delete(tm.mappings, token)
		}
		if len(expiredTokens) > 0 {
			tm.logger.Debug("Cleaned up expired token mappings",
				zap.Int("count", len(expiredTokens)),
			)
		}
		tm.mu.Unlock()
	}
}

func (tm *TokenManager) GetActiveMappingsCount() int {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return len(tm.mappings)
}

func GenerateHTTPRequestID() string {
	return uuid.New().String()
}

func TokenToString(token message.Token) string {
	return hex.EncodeToString(token)
}

func ParseToken(tokenStr string) (message.Token, error) {
	return hex.DecodeString(tokenStr)
}
