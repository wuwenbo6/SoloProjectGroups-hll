package mqtt

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"coap-gateway/internal/config"
	"coap-gateway/internal/converter"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/plgd-dev/go-coap/v3/message/pool"
	"github.com/plgd-dev/go-coap/v3/tcp/client"
	"go.uber.org/zap"
)

type CoAPClient interface {
	SendMessage(deviceID string, msg *pool.Message) (*pool.Message, error)
	GetDeviceConnection(deviceID string) *client.Conn
}

type Bridge struct {
	cfg        *config.Config
	logger     *zap.Logger
	client     mqtt.Client
	coapClient CoAPClient
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
	started    bool
	mu         sync.Mutex
}

type CoAPMessage struct {
	DeviceID    string            `json:"device_id"`
	Path        string            `json:"path"`
	Method      string            `json:"method"`
	Payload     []byte            `json:"payload,omitempty"`
	QueryParams map[string]string `json:"query_params,omitempty"`
	Timestamp   time.Time         `json:"timestamp"`
}

func NewBridge(cfg *config.Config, logger *zap.Logger, coapClient CoAPClient) *Bridge {
	ctx, cancel := context.WithCancel(context.Background())
	return &Bridge{
		cfg:        cfg,
		logger:     logger,
		coapClient: coapClient,
		ctx:        ctx,
		cancel:     cancel,
	}
}

func (b *Bridge) Start() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.cfg.MQTT.Enabled {
		b.logger.Info("MQTT bridge is disabled")
		return nil
	}

	if b.started {
		return nil
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(b.cfg.MQTT.Broker)
	opts.SetClientID(b.cfg.MQTT.ClientID)
	opts.SetKeepAlive(time.Duration(b.cfg.MQTT.KeepAlive) * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)

	if b.cfg.MQTT.Username != "" {
		opts.SetUsername(b.cfg.MQTT.Username)
	}
	if b.cfg.MQTT.Password != "" {
		opts.SetPassword(b.cfg.MQTT.Password)
	}

	opts.OnConnect = func(client mqtt.Client) {
		b.logger.Info("Connected to MQTT broker", zap.String("broker", b.cfg.MQTT.Broker))
		b.subscribeToCommandTopics()
	}

	opts.OnConnectionLost = func(client mqtt.Client, err error) {
		b.logger.Warn("MQTT connection lost", zap.Error(err))
	}

	b.client = mqtt.NewClient(opts)

	if token := b.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("connect to MQTT broker failed: %w", token.Error())
	}

	b.started = true
	b.logger.Info("MQTT bridge started",
		zap.String("broker", b.cfg.MQTT.Broker),
		zap.String("topic_prefix", b.cfg.MQTT.TopicPrefix),
	)

	return nil
}

func (b *Bridge) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.started {
		return
	}

	b.cancel()
	b.wg.Wait()

	if b.client != nil && b.client.IsConnected() {
		b.client.Disconnect(250)
	}

	b.started = false
	b.logger.Info("MQTT bridge stopped")
}

func (b *Bridge) subscribeToCommandTopics() {
	commandTopic := fmt.Sprintf("%s/+/command/+", b.cfg.MQTT.TopicPrefix)

	token := b.client.Subscribe(commandTopic, byte(b.cfg.MQTT.QoS), b.handleCommand)
	if token.Wait() && token.Error() != nil {
		b.logger.Error("Subscribe to command topic failed",
			zap.String("topic", commandTopic),
			zap.Error(token.Error()),
		)
		return
	}

	b.logger.Info("Subscribed to MQTT command topic", zap.String("topic", commandTopic))
}

func (b *Bridge) handleCommand(client mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	parts := strings.Split(topic, "/")

	if len(parts) < 4 {
		b.logger.Warn("Invalid MQTT topic format", zap.String("topic", topic))
		return
	}

	deviceID := parts[1]
	coapPath := "/" + strings.Join(parts[3:], "/")

	b.logger.Debug("Received MQTT command",
		zap.String("topic", topic),
		zap.String("device_id", deviceID),
		zap.String("coap_path", coapPath),
	)

	conn := b.coapClient.GetDeviceConnection(deviceID)
	if conn == nil {
		b.logger.Warn("Device not connected", zap.String("device_id", deviceID))
		b.publishError(deviceID, coapPath, "Device not connected")
		return
	}

	ctx, cancel := context.WithTimeout(b.ctx, 30*time.Second)
	defer cancel()

	method := "GET"
	if len(msg.Payload()) > 0 {
		method = "POST"
	}

	coapMsg, err := converter.MQTTToCoAPMessage(ctx, conn, msg.Payload(), coapPath, method)
	if err != nil {
		b.logger.Error("Convert MQTT to CoAP failed", zap.Error(err))
		b.publishError(deviceID, coapPath, err.Error())
		return
	}
	defer conn.ReleaseMessage(coapMsg)

	coapResp, err := conn.Do(coapMsg)
	if err != nil {
		b.logger.Error("Send CoAP request failed", zap.Error(err))
		b.publishError(deviceID, coapPath, err.Error())
		return
	}
	defer conn.ReleaseMessage(coapResp)

	b.publishResponse(deviceID, coapPath, coapResp)
}

func (b *Bridge) publishResponse(deviceID, path string, resp *pool.Message) {
	topic := fmt.Sprintf("%s/%s/response%s", b.cfg.MQTT.TopicPrefix, deviceID, path)

	payload, err := converter.CoAPToMQTTPayload(resp)
	if err != nil {
		b.logger.Error("Convert CoAP to MQTT payload failed", zap.Error(err))
		return
	}

	token := b.client.Publish(topic, byte(b.cfg.MQTT.QoS), false, payload)
	if token.Wait() && token.Error() != nil {
		b.logger.Error("Publish MQTT response failed",
			zap.String("topic", topic),
			zap.Error(token.Error()),
		)
	}
}

func (b *Bridge) publishError(deviceID, path, errorMsg string) {
	topic := fmt.Sprintf("%s/%s/error%s", b.cfg.MQTT.TopicPrefix, deviceID, path)

	payload := map[string]interface{}{
		"error":     errorMsg,
		"timestamp": time.Now(),
	}

	data, _ := json.Marshal(payload)

	token := b.client.Publish(topic, byte(b.cfg.MQTT.QoS), false, data)
	if token.Wait() && token.Error() != nil {
		b.logger.Error("Publish MQTT error failed",
			zap.String("topic", topic),
			zap.Error(token.Error()),
		)
	}
}

func (b *Bridge) PublishCoAPNotification(deviceID, path string, msg *pool.Message) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.started || !b.cfg.MQTT.Enabled {
		return
	}

	topic := fmt.Sprintf("%s/%s/notify%s", b.cfg.MQTT.TopicPrefix, deviceID, path)

	payload, err := converter.CoAPToMQTTPayload(msg)
	if err != nil {
		b.logger.Error("Convert CoAP notification to MQTT failed", zap.Error(err))
		return
	}

	token := b.client.Publish(topic, byte(b.cfg.MQTT.QoS), false, payload)
	if token.Wait() && token.Error() != nil {
		b.logger.Error("Publish MQTT notification failed",
			zap.String("topic", topic),
			zap.Error(token.Error()),
		)
	}
}

func (b *Bridge) PublishDeviceStatus(deviceID, status string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.started || !b.cfg.MQTT.Enabled {
		return
	}

	topic := fmt.Sprintf("%s/%s/status", b.cfg.MQTT.TopicPrefix, deviceID)
	payload := map[string]interface{}{
		"device_id": deviceID,
		"status":    status,
		"timestamp": time.Now(),
	}

	data, _ := json.Marshal(payload)

	token := b.client.Publish(topic, byte(b.cfg.MQTT.QoS), true, data)
	if token.Wait() && token.Error() != nil {
		b.logger.Error("Publish device status failed",
			zap.String("topic", topic),
			zap.Error(token.Error()),
		)
	}
}
