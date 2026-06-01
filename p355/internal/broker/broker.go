package broker

import (
	"fmt"
	"log"
	"mqtt-attr-broker/internal/models"
	"mqtt-attr-broker/internal/router"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
	"github.com/mochi-mqtt/server/v2/packets"
)

type MQTTBroker struct {
	server    *mqtt.Server
	router    *router.AttributeRouter
	filterMgr *SubscriptionFilterManager
	addr      string
}

func NewMQTTBroker(r *router.AttributeRouter, addr string) *MQTTBroker {
	return &MQTTBroker{
		router:    r,
		filterMgr: NewSubscriptionFilterManager(),
		addr:      addr,
	}
}

func (b *MQTTBroker) Start() error {
	b.server = mqtt.New(&mqtt.Options{
		InlineClient: true,
	})

	err := b.server.AddHook(new(auth.AllowHook), nil)
	if err != nil {
		return fmt.Errorf("failed to add auth hook: %w", err)
	}

	attrHook := &AttributeRoutingHook{
		router: b.router,
		server: b.server,
	}
	err = b.server.AddHook(attrHook, nil)
	if err != nil {
		return fmt.Errorf("failed to add attribute routing hook: %w", err)
	}

	filterHook := NewSubscriptionFilterHook(b.filterMgr)
	filterHook.server = b.server
	err = b.server.AddHook(filterHook, nil)
	if err != nil {
		return fmt.Errorf("failed to add subscription filter hook: %w", err)
	}

	tcp := listeners.NewTCP(listeners.Config{
		ID:      "tcp1",
		Address: b.addr,
	})
	err = b.server.AddListener(tcp)
	if err != nil {
		return fmt.Errorf("failed to add TCP listener: %w", err)
	}

	log.Printf("MQTT v5 Broker starting on %s", b.addr)
	return b.server.Serve()
}

func (b *MQTTBroker) Stop() {
	if b.server != nil {
		b.server.Close()
	}
}

type AttributeRoutingHook struct {
	mqtt.HookBase
	router *router.AttributeRouter
	server *mqtt.Server
}

func (h *AttributeRoutingHook) Provides(b byte) bool {
	return b == mqtt.OnPublish || b == mqtt.OnPublished
}

func (h *AttributeRoutingHook) Init(config any) error {
	return nil
}

func (h *AttributeRoutingHook) OnPublish(cl *mqtt.Client, pk packets.Packet) (packets.Packet, error) {
	if pk.ProtocolVersion != 5 {
		return pk, nil
	}

	userProps := extractUserProperties(pk)
	if len(userProps) == 0 {
		return pk, nil
	}

	msg := models.MQTTMessage{
		Topic:      pk.TopicName,
		Payload:    pk.Payload,
		QoS:        pk.FixedHeader.Qos,
		Retained:   pk.FixedHeader.Retain,
		Properties: userProps,
	}

	result := h.router.RouteMessage(msg)

	for _, targetTopic := range result.TargetTopics {
		newPk := pk.Copy(false)
		newPk.TopicName = targetTopic
		newPk.FixedHeader.Dup = false

		_ = h.server.Publish(newPk.TopicName, newPk.Payload, newPk.FixedHeader.Retain, newPk.FixedHeader.Qos)
		log.Printf("Attribute routing: message from '%s' routed to '%s' (matched %d rules)",
			pk.TopicName, targetTopic, len(result.MatchedRules))
	}

	return pk, nil
}

func (h *AttributeRoutingHook) ID() string {
	return "attribute-routing-hook"
}

func extractUserProperties(pk packets.Packet) models.UserProperties {
	props := models.NewUserProperties()

	if pk.Properties.User == nil {
		return props
	}

	for _, kv := range pk.Properties.User {
		props.Set(kv.Key, kv.Val)
	}

	return props
}

func (b *MQTTBroker) GetServer() *mqtt.Server {
	return b.server
}

func (b *MQTTBroker) GetFilterMgr() *SubscriptionFilterManager {
	return b.filterMgr
}

func (b *MQTTBroker) GetListenerAddr() string {
	if b.server == nil {
		return ""
	}
	if b.server.Listeners == nil {
		return ""
	}
	l, ok := b.server.Listeners.Get("tcp1")
	if ok && l != nil {
		return l.Address()
	}
	return ""
}
