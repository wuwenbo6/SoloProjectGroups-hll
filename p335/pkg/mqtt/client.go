package mqtt

import (
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	client     mqtt.Client
	broker     string
	clientID   string
	handler    MessageHandler
	subTopics  map[string]byte
}

func NewClient(broker, clientID string) *Client {
	return &Client{
		broker:    broker,
		clientID:  clientID,
		subTopics: make(map[string]byte),
	}
}

func (c *Client) SetMessageHandler(handler MessageHandler) {
	c.handler = handler
}

func (c *Client) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(c.broker)
	opts.SetClientID(c.clientID)
	opts.SetKeepAlive(60 * time.Second)
	opts.SetDefaultPublishHandler(c.onMessage)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)

	c.client = mqtt.NewClient(opts)

	if token := c.client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt connect failed: %w", token.Error())
	}

	log.Printf("Connected to MQTT broker: %s", c.broker)
	return nil
}

func (c *Client) Disconnect() {
	if c.client != nil && c.client.IsConnected() {
		c.client.Disconnect(250)
		log.Println("Disconnected from MQTT broker")
	}
}

func (c *Client) onMessage(client mqtt.Client, msg mqtt.Message) {
	if c.handler != nil {
		c.handler(msg.Topic(), msg.Payload())
	}
}

func (c *Client) Subscribe(topic string, qos byte) error {
	if token := c.client.Subscribe(topic, qos, nil); token.Wait() && token.Error() != nil {
		return fmt.Errorf("subscribe failed: %w", token.Error())
	}
	c.subTopics[topic] = qos
	log.Printf("Subscribed to topic: %s", topic)
	return nil
}

func (c *Client) Unsubscribe(topic string) error {
	if token := c.client.Unsubscribe(topic); token.Wait() && token.Error() != nil {
		return fmt.Errorf("unsubscribe failed: %w", token.Error())
	}
	delete(c.subTopics, topic)
	log.Printf("Unsubscribed from topic: %s", topic)
	return nil
}

func (c *Client) Publish(topic string, qos byte, retained bool, payload []byte) error {
	token := c.client.Publish(topic, qos, retained, payload)
	go func() {
		if token.Wait() && token.Error() != nil {
			log.Printf("Publish error: %v", token.Error())
		}
	}()
	return nil
}

func (c *Client) IsConnected() bool {
	return c.client != nil && c.client.IsConnected()
}

func (c *Client) GetSubscribedTopics() []string {
	topics := make([]string, 0, len(c.subTopics))
	for t := range c.subTopics {
		topics = append(topics, t)
	}
	return topics
}
