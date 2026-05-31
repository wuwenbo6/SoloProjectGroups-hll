package mqtt

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"pv-monitor/internal/config"
	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type Client struct {
	client            mqtt.Client
	db                *database.Database
	cfg               *config.MQTTConfig
	lastTimestampByInv map[string]time.Time
}

func New(cfg *config.MQTTConfig, db *database.Database) (*Client, error) {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Broker)
	opts.SetClientID(cfg.ClientID)
	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return nil, fmt.Errorf("failed to connect to MQTT broker: %w", token.Error())
	}

	c := &Client{
		client:             client,
		db:                 db,
		cfg:                cfg,
		lastTimestampByInv: make(map[string]time.Time),
	}

	c.initFromDB()
	return c, nil
}

func (c *Client) initFromDB() {
	ctx := context.Background()
	inverterData, err := c.db.GetAllLatestInverterData(ctx)
	if err != nil {
		log.Printf("Warning: failed to init MQTT from DB: %v", err)
		return
	}

	for _, data := range inverterData {
		c.lastTimestampByInv[data.InverterID] = data.Timestamp
	}

	log.Printf("MQTT client initialized with %d inverters from database", len(inverterData))
}

func (c *Client) Subscribe(dataHandler func(*models.InverterData)) error {
	handler := func(client mqtt.Client, msg mqtt.Message) {
		var data models.InverterData
		if err := json.Unmarshal(msg.Payload(), &data); err != nil {
			log.Printf("Failed to unmarshal MQTT message: %v", err)
			return
		}

		if data.Timestamp.IsZero() {
			data.Timestamp = time.Now()
		}

		lastTs, exists := c.lastTimestampByInv[data.InverterID]
		if exists && data.Timestamp.Before(lastTs) {
			log.Printf("Ignoring out-of-order data from %s: data_ts=%s, last_ts=%s",
				data.InverterID, data.Timestamp.Format(time.RFC3339),
				lastTs.Format(time.RFC3339))
			return
		}

		c.lastTimestampByInv[data.InverterID] = data.Timestamp

		ctx := context.Background()
		if err := c.db.InsertInverterData(ctx, &data); err != nil {
			log.Printf("Failed to insert inverter data: %v", err)
		}

		if dataHandler != nil {
			dataHandler(&data)
		}

		log.Printf("Received data from %s: Power=%.2fW, Energy=%.2fkWh",
			data.InverterID, data.Power, data.Energy)
	}

	token := c.client.Subscribe(c.cfg.Topic, 1, handler)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to subscribe: %w", token.Error())
	}

	log.Printf("Subscribed to MQTT topic: %s", c.cfg.Topic)
	return nil
}

func (c *Client) Publish(topic string, data interface{}) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	token := c.client.Publish(topic, 1, false, payload)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

func (c *Client) Close() {
	if c.client.IsConnected() {
		c.client.Disconnect(250)
	}
}
