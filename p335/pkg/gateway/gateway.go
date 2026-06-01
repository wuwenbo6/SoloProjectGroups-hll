package gateway

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"mqtt-sn-gateway/pkg/device"
	"mqtt-sn-gateway/pkg/mqtt"
	"mqtt-sn-gateway/pkg/mqttsn"
)

type Config struct {
	MQTTSNListenAddr  string
	MQTTBrokerAddr    string
	MQTTClientID      string
	TopicPrefix       string
	DataDir           string
	MaxQueueSize      int
	TopicTTL          time.Duration
	TopicTTLInterval  time.Duration
	GwID              byte
	AdvertisePeriod   time.Duration
	AdvertiseDuration uint16
}

func DefaultConfig() *Config {
	return &Config{
		MQTTSNListenAddr:  ":1884",
		MQTTBrokerAddr:    "tcp://127.0.0.1:1883",
		MQTTClientID:      "mqtt-sn-gateway",
		TopicPrefix:       "sensor/",
		DataDir:           "data/queues",
		MaxQueueSize:      100,
		TopicTTL:          1 * time.Hour,
		TopicTTLInterval:  5 * time.Minute,
		GwID:              1,
		AdvertisePeriod:   15 * time.Second,
		AdvertiseDuration: 30,
	}
}

type Gateway struct {
	config     *Config
	snServer   *mqttsn.Server
	mqttClient *mqtt.Client
	devMgr     *device.Manager
	snConn     *net.UDPConn
	clients    map[string]*snClient
	mu         sync.RWMutex
	msgCh      chan *downlinkMsg
	stopCh     chan struct{}
}

type snClient struct {
	ClientID  string
	Addr      net.Addr
	Sleeping  bool
	Connected bool
	LastSeen  time.Time
}

type downlinkMsg struct {
	ClientID string
	Topic    string
	Payload  []byte
	QoS      byte
}

func NewGateway(cfg *Config) *Gateway {
	var devMgr *device.Manager
	if cfg.DataDir != "" && cfg.MaxQueueSize > 0 {
		devMgr = device.NewManagerWithStore(cfg.DataDir, cfg.MaxQueueSize, cfg.TopicTTL)
	} else {
		devMgr = device.NewManager()
	}

	snCfg := &mqttsn.ServerConfig{
		GwID:              cfg.GwID,
		AdvertisePeriod:   cfg.AdvertisePeriod,
		AdvertiseDuration: cfg.AdvertiseDuration,
	}

	gw := &Gateway{
		config:  cfg,
		devMgr:  devMgr,
		clients: make(map[string]*snClient),
		msgCh:   make(chan *downlinkMsg, 256),
		stopCh:  make(chan struct{}),
	}
	gw.mqttClient = mqtt.NewClient(cfg.MQTTBrokerAddr, cfg.MQTTClientID)
	gw.snServer = mqttsn.NewServerWithConfig(cfg.MQTTSNListenAddr, gw, snCfg)
	return gw
}

func (gw *Gateway) Start() error {
	if err := gw.mqttClient.Connect(); err != nil {
		return fmt.Errorf("failed to connect to MQTT broker: %w", err)
	}
	gw.mqttClient.SetMessageHandler(gw.onMQTTMessage)

	go gw.processDownlink()

	if gw.config.TopicTTL > 0 && gw.config.TopicTTLInterval > 0 {
		go gw.topicExpiryLoop()
	}

	log.Printf("MQTT-SN Gateway started: SN=%s, MQTT=%s, Store=%s, TopicTTL=%v",
		gw.config.MQTTSNListenAddr, gw.config.MQTTBrokerAddr, gw.config.DataDir, gw.config.TopicTTL)
	return gw.snServer.ListenAndServe()
}

func (gw *Gateway) Stop() {
	close(gw.stopCh)
	gw.mqttClient.Disconnect()
	log.Println("Gateway stopped")
}

func (gw *Gateway) topicExpiryLoop() {
	ticker := time.NewTicker(gw.config.TopicTTLInterval)
	defer ticker.Stop()

	for {
		select {
		case <-gw.stopCh:
			return
		case <-ticker.C:
			expired := gw.devMgr.ExpireTopics()
			if expired > 0 {
				log.Printf("[TTL] Expired %d topics", expired)
			}
		}
	}
}

func (gw *Gateway) onMQTTMessage(topic string, payload []byte) {
	gw.mu.RLock()
	defer gw.mu.RUnlock()

	for _, cl := range gw.clients {
		if gw.devMgr.IsSubscribed(cl.ClientID, topic) {
			if cl.Sleeping {
				dropped := gw.devMgr.QueueMessage(cl.ClientID, topic, payload, 1)
				if dropped {
					gw.snServer.IncrementDrop(&gw.snServer.GetStatsPointer().DropsQueueFull)
				} else {
					gw.snServer.IncrementQueued()
				}
			} else {
				gw.msgCh <- &downlinkMsg{
					ClientID: cl.ClientID,
					Topic:    topic,
					Payload:  payload,
					QoS:      1,
				}
			}
		}
	}
}

func (gw *Gateway) processDownlink() {
	for msg := range gw.msgCh {
		topicID := gw.devMgr.GetTopicID(msg.Topic)
		if topicID == 0 {
			continue
		}
		pubMsg := &mqttsn.PublishMessage{
			Flags:     (msg.QoS << 5),
			TopicID:   topicID,
			MessageID: 0,
			Data:      msg.Payload,
		}
		gw.snServer.SendToClient(msg.ClientID, pubMsg)
	}
}

func (gw *Gateway) deliverQueuedMessages(clientID string) {
	msgs := gw.devMgr.GetQueuedMessages(clientID)
	if len(msgs) == 0 {
		return
	}
	log.Printf("Delivering %d queued messages to %s", len(msgs), clientID)
	for _, qm := range msgs {
		topicID := gw.devMgr.GetTopicID(qm.Topic)
		if topicID == 0 {
			continue
		}
		pubMsg := &mqttsn.PublishMessage{
			Flags:     (qm.QoS << 5),
			TopicID:   topicID,
			MessageID: 0,
			Data:      qm.Payload,
		}
		gw.snServer.SendToClient(clientID, pubMsg)
	}
	gw.devMgr.ClearQueuedMessages(clientID)
}

// mqttsn.Handler implementation

func (gw *Gateway) OnConnect(clientID string, addr net.Addr) mqttsn.ReturnCode {
	log.Printf("[GW] CONNECT: client=%s addr=%s", clientID, addr)
	gw.mu.Lock()
	gw.clients[clientID] = &snClient{
		ClientID:  clientID,
		Addr:      addr,
		Connected: true,
		LastSeen:  time.Now(),
	}
	gw.mu.Unlock()

	topic := gw.config.TopicPrefix + clientID + "/status"
	statusPayload, _ := json.Marshal(map[string]interface{}{
		"client_id": clientID,
		"status":    "online",
		"timestamp": time.Now().Unix(),
	})
	go gw.mqttClient.Publish(topic, 1, true, statusPayload)

	return mqttsn.RC_ACCEPTED
}

func (gw *Gateway) OnDisconnect(clientID string, duration uint16) {
	log.Printf("[GW] DISCONNECT: client=%s duration=%d", clientID, duration)
	gw.mu.Lock()
	if cl, ok := gw.clients[clientID]; ok {
		if duration > 0 {
			cl.Sleeping = true
			cl.LastSeen = time.Now()
		} else {
			delete(gw.clients, clientID)
		}
	}
	gw.mu.Unlock()

	if duration == 0 {
		gw.devMgr.RemoveClient(clientID)
		topic := gw.config.TopicPrefix + clientID + "/status"
		statusPayload, _ := json.Marshal(map[string]interface{}{
			"client_id": clientID,
			"status":    "offline",
			"timestamp": time.Now().Unix(),
		})
		go gw.mqttClient.Publish(topic, 1, true, statusPayload)
	}
}

func (gw *Gateway) OnPublish(clientID string, topicID uint16, data []byte, qos byte) {
	topicName := gw.devMgr.GetTopicName(topicID)
	if topicName == "" {
		topicName = fmt.Sprintf("%s%d", gw.config.TopicPrefix, topicID)
	}

	mqttTopic := gw.config.TopicPrefix + clientID + "/data"
	if topicName != "" {
		mqttTopic = topicName
	}

	log.Printf("[GW] PUBLISH: client=%s topic_id=%d topic=%s qos=%d len=%d", clientID, topicID, mqttTopic, qos, len(data))

	go gw.mqttClient.Publish(mqttTopic, qos, false, data)
}

func (gw *Gateway) OnSubscribe(clientID string, topicName string, messageID uint16) (uint16, mqttsn.ReturnCode) {
	log.Printf("[GW] SUBSCRIBE: client=%s topic=%s", clientID, topicName)

	topicID := gw.devMgr.RegisterTopic(clientID, topicName)
	gw.devMgr.Subscribe(clientID, topicName)

	mqttTopic := topicName
	if mqttTopic == "" {
		mqttTopic = gw.config.TopicPrefix + "#"
	}
	go gw.mqttClient.Subscribe(mqttTopic, 1)

	gw.mu.RLock()
	cl, exists := gw.clients[clientID]
	gw.mu.RUnlock()

	if exists && !cl.Sleeping {
		go gw.deliverQueuedMessages(clientID)
	}

	return topicID, mqttsn.RC_ACCEPTED
}

func (gw *Gateway) OnUnsubscribe(clientID string, topicName string) {
	log.Printf("[GW] UNSUBSCRIBE: client=%s topic=%s", clientID, topicName)
	gw.devMgr.Unsubscribe(clientID, topicName)
}

func (gw *Gateway) OnPing(clientID string) {
	gw.mu.RLock()
	cl, ok := gw.clients[clientID]
	gw.mu.RUnlock()

	if ok && cl.Sleeping {
		cl.Sleeping = false
		cl.LastSeen = time.Now()
		log.Printf("[GW] Client %s woke up, delivering queued messages", clientID)
		go gw.deliverQueuedMessages(clientID)
	}
}

func (gw *Gateway) GetTopicName(topicID uint16) string {
	return gw.devMgr.GetTopicName(topicID)
}

func (gw *Gateway) RegisterTopic(clientID string, topicName string) uint16 {
	return gw.devMgr.RegisterTopic(clientID, topicName)
}

// Public API for the REST layer

func (gw *Gateway) GetDeviceManager() *device.Manager {
	return gw.devMgr
}

func (gw *Gateway) GetSNServer() *mqttsn.Server {
	return gw.snServer
}

type DeviceStatus struct {
	ClientID      string   `json:"client_id"`
	Connected     bool     `json:"connected"`
	Sleeping      bool     `json:"sleeping"`
	LastSeen      string   `json:"last_seen"`
	Addr          string   `json:"address"`
	Subscriptions []string `json:"subscriptions"`
	QueueSize     int      `json:"queue_size"`
}

func (gw *Gateway) GetDevices() []DeviceStatus {
	gw.mu.RLock()
	defer gw.mu.RUnlock()

	devices := make([]DeviceStatus, 0, len(gw.clients))
	for id, cl := range gw.clients {
		subs := gw.devMgr.GetSubscriptions(id)
		queueSize := gw.devMgr.GetQueueSize(id)
		devices = append(devices, DeviceStatus{
			ClientID:      id,
			Connected:     cl.Connected,
			Sleeping:      cl.Sleeping,
			LastSeen:      cl.LastSeen.Format(time.RFC3339),
			Addr:          cl.Addr.String(),
			Subscriptions: subs,
			QueueSize:     queueSize,
		})
	}
	return devices
}

func (gw *Gateway) GetDevice(clientID string) *DeviceStatus {
	gw.mu.RLock()
	cl, ok := gw.clients[clientID]
	gw.mu.RUnlock()

	if !ok {
		return nil
	}

	subs := gw.devMgr.GetSubscriptions(clientID)
	queueSize := gw.devMgr.GetQueueSize(clientID)
	return &DeviceStatus{
		ClientID:      clientID,
		Connected:     cl.Connected,
		Sleeping:      cl.Sleeping,
		LastSeen:      cl.LastSeen.Format(time.RFC3339),
		Addr:          cl.Addr.String(),
		Subscriptions: subs,
		QueueSize:     queueSize,
	}
}

type GatewayStats struct {
	GatewayID         byte   `json:"gateway_id"`
	Uplink            uint64 `json:"messages_uplink"`
	Downlink          uint64 `json:"messages_downlink"`
	Queued            uint64 `json:"messages_queued"`
	Delivered         uint64 `json:"messages_delivered"`
	Dropped           uint64 `json:"messages_dropped"`
	DropsQueueFull    uint64 `json:"drops_queue_full"`
	DropsSleeping     uint64 `json:"drops_sleeping"`
	DropsOffline      uint64 `json:"drops_offline"`
	DropsUnknownTopic uint64 `json:"drops_unknown_topic"`
	QueueStatsDropped uint64 `json:"queue_dropped"`
	QueueStatsQueued  uint64 `json:"queue_queued"`
}

func (gw *Gateway) GetStats() GatewayStats {
	snStats := gw.snServer.GetStats()
	qStats := gw.devMgr.GetQueueStats()
	return GatewayStats{
		GatewayID:         gw.config.GwID,
		Uplink:            snStats.MessagesUplink,
		Downlink:          snStats.MessagesDownlink,
		Queued:            snStats.MessagesQueued,
		Delivered:         snStats.MessagesDelivered,
		Dropped:           snStats.MessagesDropped,
		DropsQueueFull:    snStats.DropsQueueFull,
		DropsSleeping:     snStats.DropsSleeping,
		DropsOffline:      snStats.DropsOffline,
		DropsUnknownTopic: snStats.DropsUnknownTopic,
		QueueStatsDropped: qStats.MessagesDropped,
		QueueStatsQueued:  qStats.MessagesQueued,
	}
}

func (gw *Gateway) ResetStats() {
	gw.snServer.ResetStats()
	gw.devMgr.ResetQueueStats()
}
