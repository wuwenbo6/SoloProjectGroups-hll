package broker

import (
	"mqtt-attr-broker/internal/models"
	"strings"
	"sync"
	"time"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/packets"
)

type SubscriptionFilter struct {
	ClientID     string
	TopicFilter  string
	Properties   models.UserProperties
	SubscribedAt int64
	QoS          byte
}

type SubscriptionFilterManager struct {
	mu            sync.RWMutex
	subscriptions map[string]map[string]*SubscriptionFilter
}

func NewSubscriptionFilterManager() *SubscriptionFilterManager {
	return &SubscriptionFilterManager{
		subscriptions: make(map[string]map[string]*SubscriptionFilter),
	}
}

func (sfm *SubscriptionFilterManager) Add(clientID, topicFilter string, props models.UserProperties, qos byte) {
	sfm.mu.Lock()
	defer sfm.mu.Unlock()

	key := clientID + "|" + topicFilter
	filter := &SubscriptionFilter{
		ClientID:     clientID,
		TopicFilter:  topicFilter,
		Properties:   props,
		SubscribedAt: time.Now().Unix(),
		QoS:          qos,
	}

	byTopic, ok := sfm.subscriptions[topicFilter]
	if !ok {
		byTopic = make(map[string]*SubscriptionFilter)
		sfm.subscriptions[topicFilter] = byTopic
	}
	byTopic[key] = filter
}

func (sfm *SubscriptionFilterManager) Remove(clientID, topicFilter string) {
	sfm.mu.Lock()
	defer sfm.mu.Unlock()

	key := clientID + "|" + topicFilter
	if byTopic, ok := sfm.subscriptions[topicFilter]; ok {
		delete(byTopic, key)
		if len(byTopic) == 0 {
			delete(sfm.subscriptions, topicFilter)
		}
	}
}

func (sfm *SubscriptionFilterManager) GetMatchingSubscribers(msgTopic string, msgProps models.UserProperties) []*SubscriptionFilter {
	sfm.mu.RLock()
	defer sfm.mu.RUnlock()

	var matched []*SubscriptionFilter

	for topicFilter, byTopic := range sfm.subscriptions {
		if !topicMatches(topicFilter, msgTopic) {
			continue
		}

		for _, filter := range byTopic {
			if propertiesMatch(filter.Properties, msgProps) {
				matched = append(matched, filter)
			}
		}
	}

	return matched
}

func (sfm *SubscriptionFilterManager) GetAll() []*SubscriptionFilter {
	sfm.mu.RLock()
	defer sfm.mu.RUnlock()

	var all []*SubscriptionFilter
	for _, byTopic := range sfm.subscriptions {
		for _, f := range byTopic {
			all = append(all, f)
		}
	}
	return all
}

func (sfm *SubscriptionFilterManager) Count() int {
	sfm.mu.RLock()
	defer sfm.mu.RUnlock()
	count := 0
	for _, byTopic := range sfm.subscriptions {
		count += len(byTopic)
	}
	return count
}

func topicMatches(filter, topic string) bool {
	if filter == topic {
		return true
	}
	if filter == "#" {
		return true
	}

	filterParts := strings.Split(filter, "/")
	topicParts := strings.Split(topic, "/")

	i, j := 0, 0
	for i < len(filterParts) && j < len(topicParts) {
		if filterParts[i] == "#" {
			return true
		}
		if filterParts[i] == "+" {
			i++
			j++
			continue
		}
		if filterParts[i] != topicParts[j] {
			return false
		}
		i++
		j++
	}

	if i < len(filterParts) && filterParts[i] == "#" {
		return true
	}

	return i == len(filterParts) && j == len(topicParts)
}

func propertiesMatch(filterProps, msgProps models.UserProperties) bool {
	if len(filterProps) == 0 {
		return true
	}

	for key, requiredValues := range filterProps {
		msgValues, ok := msgProps[key]
		if !ok {
			return false
		}

		matched := false
		for _, required := range requiredValues {
			for _, actual := range msgValues {
				if required == actual {
					matched = true
					break
				}
			}
			if matched {
				break
			}
		}

		if !matched {
			return false
		}
	}

	return true
}

type SubscriptionFilterHook struct {
	mqtt.HookBase
	server    *mqtt.Server
	filterMgr *SubscriptionFilterManager
}

func NewSubscriptionFilterHook(filterMgr *SubscriptionFilterManager) *SubscriptionFilterHook {
	return &SubscriptionFilterHook{
		filterMgr: filterMgr,
	}
}

func (h *SubscriptionFilterHook) Provides(b byte) bool {
	return b == mqtt.OnSubscribe || b == mqtt.OnUnsubscribe || b == mqtt.OnPublished
}

func (h *SubscriptionFilterHook) Init(config any) error {
	return nil
}

func (h *SubscriptionFilterHook) OnSubscribe(cl *mqtt.Client, pk packets.Packet) packets.Packet {
	if pk.ProtocolVersion != 5 {
		return pk
	}

	userProps := extractSubscribeUserProperties(pk)

	for i, sub := range pk.Filters {
		qos := byte(0)
		if i < len(pk.Properties.SubscriptionIdentifier) {
			qos = byte(pk.Properties.SubscriptionIdentifier[i] & 0xFF)
		}
		h.filterMgr.Add(cl.ID, sub.Filter, userProps, qos)
	}

	return pk
}

func (h *SubscriptionFilterHook) OnUnsubscribe(cl *mqtt.Client, pk packets.Packet) packets.Packet {
	for _, topic := range pk.Filters {
		h.filterMgr.Remove(cl.ID, topic.Filter)
	}
	return pk
}

func (h *SubscriptionFilterHook) OnPublished(cl *mqtt.Client, pk packets.Packet) {
}

func (h *SubscriptionFilterHook) ID() string {
	return "subscription-filter-hook"
}

func extractSubscribeUserProperties(pk packets.Packet) models.UserProperties {
	props := models.NewUserProperties()

	if pk.Properties.User == nil {
		return props
	}

	for _, kv := range pk.Properties.User {
		props.Set(kv.Key, kv.Val)
	}

	return props
}
