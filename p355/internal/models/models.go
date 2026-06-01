package models

type UserProperties map[string][]string

type RoutingRule struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	MatchKey    string            `json:"matchKey"`
	MatchValue  string            `json:"matchValue"`
	MatchType   string            `json:"matchType"`
	TargetTopic string            `json:"targetTopic"`
	Enabled     bool              `json:"enabled"`
	CreatedAt   int64             `json:"createdAt"`
	Metadata    map[string]string `json:"metadata"`
}

type RouteStats struct {
	RuleID        string `json:"ruleId"`
	HitCount      int64  `json:"hitCount"`
	LastHitAt     int64  `json:"lastHitAt"`
	FirstHitAt    int64  `json:"firstHitAt"`
	TotalMessages int64  `json:"totalMessages"`
}

type RuleWithStats struct {
	RoutingRule
	Stats RouteStats `json:"stats"`
}

type RoutingResult struct {
	MatchedRules []RoutingRule  `json:"matchedRules"`
	OrigTopic    string         `json:"origTopic"`
	TargetTopics []string       `json:"targetTopics"`
	Properties   UserProperties `json:"properties"`
}

type MQTTMessage struct {
	Topic      string         `json:"topic"`
	Payload    []byte         `json:"payload"`
	QoS        byte           `json:"qos"`
	Retained   bool           `json:"retained"`
	Properties UserProperties `json:"properties"`
}

func NewUserProperties() UserProperties {
	return make(UserProperties)
}

func (up UserProperties) Set(key, value string) {
	up[key] = append(up[key], value)
}

func (up UserProperties) Get(key string) []string {
	return up[key]
}

func (up UserProperties) GetAll() map[string][]string {
	return up
}

func (up UserProperties) Keys() []string {
	keys := make([]string, 0, len(up))
	for k := range up {
		keys = append(keys, k)
	}
	return keys
}
