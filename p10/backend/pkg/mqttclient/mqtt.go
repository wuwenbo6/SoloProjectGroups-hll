package mqttclient

import (
	"encoding/json"
	"fmt"
	"iot-system/internal/config"
	"iot-system/internal/engine"
	"iot-system/internal/models"
	"iot-system/pkg/database"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type SensorMessage struct {
	DeviceID  string                 `json:"device_id"`
	Type      string                 `json:"type"`
	Value     float64                `json:"value"`
	Unit      string                 `json:"unit"`
	Timestamp int64                  `json:"timestamp,omitempty"`
	Seq       uint64                 `json:"seq,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

type deviceState struct {
	lastTimestamp int64
	lastSeq       uint64
	lastValue     float64
	lastUpdate    time.Time
}

var (
	client         mqtt.Client
	messageHandler func(*SensorMessage)
	stateCache     = make(map[string]*deviceState)
	stateMutex     sync.RWMutex
	msgChan        = make(chan *SensorMessage, 1000)
	workerCount    = 2
)

const (
	maxMsgAge      = 30 * time.Second
	dedupWindow    = 5 * time.Second
	valueThreshold = 0.01
)

func Init(cfg *config.MQTTConfig, handler func(*SensorMessage)) error {
	messageHandler = handler

	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Broker)
	opts.SetClientID(cfg.ClientID)
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)
	opts.SetMessageChannelDepth(1000)

	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}

	opts.OnConnect = onConnect
	opts.OnConnectionLost = onConnectionLost

	client = mqtt.NewClient(opts)

	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return token.Error()
	}

	for i := 0; i < workerCount; i++ {
		go messageWorker(i)
	}

	go cleanupState()

	Subscribe(cfg.Topic)
	return nil
}

func onConnect(client mqtt.Client) {
	log.Println("MQTT client connected")
}

func onConnectionLost(client mqtt.Client, err error) {
	log.Printf("MQTT connection lost: %v", err)
}

func Subscribe(topic string) {
	token := client.Subscribe(topic, 1, handleMessage)
	if token.Wait() && token.Error() != nil {
		log.Printf("Failed to subscribe to topic %s: %v", topic, token.Error())
	} else {
		log.Printf("Subscribed to topic: %s", topic)
	}
}

func handleMessage(client mqtt.Client, msg mqtt.Message) {
	var sensorMsg SensorMessage
	err := json.Unmarshal(msg.Payload(), &sensorMsg)
	if err != nil {
		log.Printf("Failed to parse message: %v", err)
		return
	}

	select {
	case msgChan <- &sensorMsg:
	default:
		log.Printf("Message queue full, dropping message from %s", sensorMsg.DeviceID)
	}
}

func messageWorker(id int) {
	log.Printf("Message worker %d started", id)
	for msg := range msgChan {
		processMessage(msg)
	}
}

func processMessage(msg *SensorMessage) {
	key := fmt.Sprintf("%s_%s", msg.DeviceID, msg.Type)

	stateMutex.Lock()
	state, exists := stateCache[key]
	if !exists {
		state = &deviceState{}
		stateCache[key] = state
	}
	stateMutex.Unlock()

	msgTimestamp := msg.Timestamp
	if msgTimestamp == 0 {
		msgTimestamp = time.Now().UnixNano()
	}

	if isOutOfOrder(state, msgTimestamp, msg.Seq, msg.Value) {
		log.Printf("Dropped out-of-order message: %s (ts=%d, seq=%d)", key, msgTimestamp, msg.Seq)
		return
	}

	now := time.Now()
	if now.Sub(time.Unix(0, msgTimestamp)) > maxMsgAge {
		log.Printf("Dropped expired message: %s", key)
		return
	}

	if isDuplicate(state, msgTimestamp, msg.Value) {
		log.Printf("Dropped duplicate/noisy message: %s", key)
		return
	}

	stateMutex.Lock()
	state.lastTimestamp = msgTimestamp
	state.lastSeq = msg.Seq
	state.lastValue = msg.Value
	state.lastUpdate = now
	stateMutex.Unlock()

	engine.UpdateDeviceDiagnostic(msg.DeviceID)
	engine.DetectAnomaly(msg.DeviceID, msg.Type, msg.Value)

	sensorData := &models.SensorData{
		DeviceID:  msg.DeviceID,
		Type:      msg.Type,
		Value:     msg.Value,
		Unit:      msg.Unit,
		Timestamp: time.Unix(0, msgTimestamp),
	}

	if err := database.SaveSensorData(sensorData); err != nil {
		log.Printf("Failed to save sensor data: %v", err)
	}

	device := &models.Device{
		DeviceID: msg.DeviceID,
		Name:     msg.DeviceID,
		Type:     msg.Type,
		Status:   "online",
		Online:   true,
		LastSeen: time.Unix(0, msgTimestamp),
	}
	if err := database.CreateOrUpdateDevice(device); err != nil {
		log.Printf("Failed to update device: %v", err)
	}

	if messageHandler != nil {
		messageHandler(msg)
	}
}

func isOutOfOrder(state *deviceState, msgTimestamp int64, seq uint64, value float64) bool {
	if seq > 0 && state.lastSeq > 0 {
		if seq < state.lastSeq {
			return true
		}
	}

	if msgTimestamp > 0 && state.lastTimestamp > 0 {
		if msgTimestamp < state.lastTimestamp {
			return true
		}
	}

	return false
}

func isDuplicate(state *deviceState, msgTimestamp int64, value float64) bool {
	if time.Since(state.lastUpdate) < dedupWindow {
		if abs(value-state.lastValue) < valueThreshold {
			return true
		}
	}
	return false
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func cleanupState() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		stateMutex.Lock()
		now := time.Now()
		for key, state := range stateCache {
			if now.Sub(state.lastUpdate) > 1*time.Hour {
				delete(stateCache, key)
			}
		}
		stateMutex.Unlock()
		log.Printf("State cache cleanup complete, entries: %d", len(stateCache))
	}
}

func Publish(topic string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	token := client.Publish(topic, 1, false, data)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	log.Printf("Published to %s", topic)
	return nil
}

func SendCommand(deviceID string, command map[string]interface{}) error {
	topic := fmt.Sprintf("zigbee/device/%s/command", deviceID)
	return Publish(topic, command)
}

func Disconnect() {
	close(msgChan)
	if client != nil {
		client.Disconnect(250)
	}
}
