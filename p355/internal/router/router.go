package router

import (
	"fmt"
	"mqtt-attr-broker/internal/models"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/rs/xid"
)

type trieNode struct {
	children map[rune]*trieNode
	rules    map[string]models.RoutingRule
}

func newTrieNode() *trieNode {
	return &trieNode{
		children: make(map[rune]*trieNode),
		rules:    make(map[string]models.RoutingRule),
	}
}

type valueTrie struct {
	root *trieNode
}

func newValueTrie() *valueTrie {
	return &valueTrie{root: newTrieNode()}
}

func (vt *valueTrie) insert(matchValue string, rule models.RoutingRule) {
	node := vt.root
	for _, ch := range matchValue {
		if node.children[ch] == nil {
			node.children[ch] = newTrieNode()
		}
		node = node.children[ch]
	}
	node.rules[rule.ID] = rule
}

func (vt *valueTrie) remove(matchValue, ruleID string) {
	node := vt.root
	for _, ch := range matchValue {
		if node.children[ch] == nil {
			return
		}
		node = node.children[ch]
	}
	delete(node.rules, ruleID)
}

func (vt *valueTrie) lookup(msgValue string) []models.RoutingRule {
	var matched []models.RoutingRule

	node := vt.root
	for i, ch := range msgValue {
		for _, rule := range node.rules {
			if rule.MatchType == "prefix" && strings.HasPrefix(msgValue, rule.MatchValue) {
				matched = append(matched, rule)
			}
		}

		child, ok := node.children[ch]
		if !ok {
			break
		}
		node = child

		if i == len(msgValue)-1 {
			for _, rule := range node.rules {
				switch rule.MatchType {
				case "exact":
					if msgValue == rule.MatchValue {
						matched = append(matched, rule)
					}
				case "prefix":
					if strings.HasPrefix(msgValue, rule.MatchValue) {
						matched = append(matched, rule)
					}
				}
			}
		}
	}

	for _, rule := range vt.root.rules {
		if rule.MatchType == "prefix" && strings.HasPrefix(msgValue, rule.MatchValue) {
			matched = append(matched, rule)
		}
	}

	vt.collectNonPrefix(vt.root, msgValue, &matched)

	return matched
}

func (vt *valueTrie) collectNonPrefix(node *trieNode, msgValue string, matched *[]models.RoutingRule) {
	for _, rule := range node.rules {
		switch rule.MatchType {
		case "suffix":
			if strings.HasSuffix(msgValue, rule.MatchValue) {
				*matched = append(*matched, rule)
			}
		case "contains":
			if strings.Contains(msgValue, rule.MatchValue) {
				*matched = append(*matched, rule)
			}
		case "regex":
			if matchRegex(msgValue, rule.MatchValue) {
				*matched = append(*matched, rule)
			}
		}
	}
	for _, child := range node.children {
		vt.collectNonPrefix(child, msgValue, matched)
	}
}

type AttributeRouter struct {
	rules    map[string]models.RoutingRule
	keyTries map[string]*valueTrie
	stats    map[string]models.RouteStats
	mu       sync.RWMutex
}

func NewAttributeRouter() *AttributeRouter {
	return &AttributeRouter{
		rules:    make(map[string]models.RoutingRule),
		keyTries: make(map[string]*valueTrie),
		stats:    make(map[string]models.RouteStats),
	}
}

func (ar *AttributeRouter) AddRule(rule models.RoutingRule) error {
	ar.mu.Lock()
	defer ar.mu.Unlock()

	if rule.ID == "" {
		rule.ID = fmt.Sprintf("rule-%s", xid.New().String())
	}
	if rule.MatchType == "" {
		rule.MatchType = "exact"
	}
	if rule.CreatedAt == 0 {
		rule.CreatedAt = time.Now().Unix()
	}
	if rule.Metadata == nil {
		rule.Metadata = make(map[string]string)
	}

	ar.rules[rule.ID] = rule

	if _, ok := ar.stats[rule.ID]; !ok {
		ar.stats[rule.ID] = models.RouteStats{RuleID: rule.ID}
	}

	trie, ok := ar.keyTries[rule.MatchKey]
	if !ok {
		trie = newValueTrie()
		ar.keyTries[rule.MatchKey] = trie
	}
	trie.insert(rule.MatchValue, rule)

	return nil
}

func (ar *AttributeRouter) GetRule(id string) (models.RoutingRule, bool) {
	ar.mu.RLock()
	defer ar.mu.RUnlock()
	rule, ok := ar.rules[id]
	return rule, ok
}

func (ar *AttributeRouter) ListRules() []models.RoutingRule {
	ar.mu.RLock()
	defer ar.mu.RUnlock()
	rules := make([]models.RoutingRule, 0, len(ar.rules))
	for _, rule := range ar.rules {
		rules = append(rules, rule)
	}
	sort.Slice(rules, func(i, j int) bool {
		return rules[i].CreatedAt < rules[j].CreatedAt
	})
	return rules
}

func (ar *AttributeRouter) UpdateRule(id string, rule models.RoutingRule) error {
	ar.mu.Lock()
	defer ar.mu.Unlock()

	oldRule, ok := ar.rules[id]
	if !ok {
		return fmt.Errorf("rule not found: %s", id)
	}

	if oldTrie, exists := ar.keyTries[oldRule.MatchKey]; exists {
		oldTrie.remove(oldRule.MatchValue, id)
	}

	rule.ID = id
	if rule.MatchType == "" {
		rule.MatchType = "exact"
	}
	if rule.Metadata == nil {
		rule.Metadata = make(map[string]string)
	}

	ar.rules[id] = rule

	trie, ok := ar.keyTries[rule.MatchKey]
	if !ok {
		trie = newValueTrie()
		ar.keyTries[rule.MatchKey] = trie
	}
	trie.insert(rule.MatchValue, rule)

	return nil
}

func (ar *AttributeRouter) DeleteRule(id string) error {
	ar.mu.Lock()
	defer ar.mu.Unlock()

	rule, ok := ar.rules[id]
	if !ok {
		return fmt.Errorf("rule not found: %s", id)
	}

	if trie, exists := ar.keyTries[rule.MatchKey]; exists {
		trie.remove(rule.MatchValue, id)
	}

	delete(ar.rules, id)
	delete(ar.stats, id)
	return nil
}

func (ar *AttributeRouter) RouteMessage(msg models.MQTTMessage) models.RoutingResult {
	ar.mu.Lock()
	defer ar.mu.Unlock()

	result := models.RoutingResult{
		OrigTopic:    msg.Topic,
		Properties:   msg.Properties,
		MatchedRules: make([]models.RoutingRule, 0),
		TargetTopics: make([]string, 0),
	}

	seen := make(map[string]bool)

	for key, values := range msg.Properties {
		trie, ok := ar.keyTries[key]
		if !ok {
			continue
		}
		for _, value := range values {
			for _, rule := range trie.lookup(value) {
				if !rule.Enabled || seen[rule.ID] {
					continue
				}
				seen[rule.ID] = true
				result.MatchedRules = append(result.MatchedRules, rule)
				result.TargetTopics = append(result.TargetTopics, rule.TargetTopic)

				stats := ar.stats[rule.ID]
				stats.RuleID = rule.ID
				stats.HitCount++
				now := time.Now().Unix()
				if stats.FirstHitAt == 0 {
					stats.FirstHitAt = now
				}
				stats.LastHitAt = now
				stats.TotalMessages++
				ar.stats[rule.ID] = stats
			}
		}
	}

	return result
}

func (ar *AttributeRouter) GetStats(ruleID string) (models.RouteStats, bool) {
	ar.mu.RLock()
	defer ar.mu.RUnlock()
	stats, ok := ar.stats[ruleID]
	return stats, ok
}

func (ar *AttributeRouter) ListStats() []models.RouteStats {
	ar.mu.RLock()
	defer ar.mu.RUnlock()
	stats := make([]models.RouteStats, 0, len(ar.stats))
	for _, s := range ar.stats {
		stats = append(stats, s)
	}
	return stats
}

func (ar *AttributeRouter) ListRulesWithStats() []models.RuleWithStats {
	ar.mu.RLock()
	defer ar.mu.RUnlock()
	result := make([]models.RuleWithStats, 0, len(ar.rules))
	for _, rule := range ar.rules {
		stats := ar.stats[rule.ID]
		result = append(result, models.RuleWithStats{
			RoutingRule: rule,
			Stats:       stats,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt < result[j].CreatedAt
	})
	return result
}

func (ar *AttributeRouter) ResetStats(ruleID string) error {
	ar.mu.Lock()
	defer ar.mu.Unlock()
	if _, ok := ar.rules[ruleID]; !ok {
		return fmt.Errorf("rule not found: %s", ruleID)
	}
	ar.stats[ruleID] = models.RouteStats{RuleID: ruleID}
	return nil
}

func (ar *AttributeRouter) ResetAllStats() {
	ar.mu.Lock()
	defer ar.mu.Unlock()
	for id := range ar.stats {
		ar.stats[id] = models.RouteStats{RuleID: id}
	}
}

func matchRegex(value, pattern string) bool {
	if pattern == "" {
		return false
	}
	parts := strings.Split(pattern, "*")
	if len(parts) == 1 {
		return pattern == value
	}
	if len(parts) == 2 {
		if parts[0] == "" && parts[1] == "" {
			return true
		}
		if parts[0] == "" {
			return strings.HasSuffix(value, parts[1])
		}
		if parts[1] == "" {
			return strings.HasPrefix(value, parts[0])
		}
		return strings.HasPrefix(value, parts[0]) && strings.HasSuffix(value, parts[1])
	}
	return strings.HasPrefix(value, parts[0]) && strings.HasSuffix(value, parts[len(parts)-1])
}
