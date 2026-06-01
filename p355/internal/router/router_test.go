package router

import (
	"mqtt-attr-broker/internal/models"
	"testing"
)

func TestExactMatch(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "温度传感器", MatchKey: "device_type", MatchValue: "temperature_sensor",
		MatchType: "exact", TargetTopic: "sensors/temp", Enabled: true,
	})

	cases := []struct {
		name  string
		props models.UserProperties
		match bool
	}{
		{"精确匹配成功", models.UserProperties{"device_type": {"temperature_sensor"}}, true},
		{"精确匹配失败-值不同", models.UserProperties{"device_type": {"humidity_sensor"}}, false},
		{"精确匹配失败-键不同", models.UserProperties{"sensor_type": {"temperature_sensor"}}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := r.RouteMessage(models.MQTTMessage{Topic: "t", Properties: tc.props})
			if got := len(result.MatchedRules) > 0; got != tc.match {
				t.Errorf("match=%v, want=%v", got, tc.match)
			}
		})
	}
}

func TestPrefixMatch(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "传感器前缀路由", MatchKey: "device_id", MatchValue: "sensor_",
		MatchType: "prefix", TargetTopic: "devices/sensors", Enabled: true,
	})

	cases := []struct {
		name  string
		props models.UserProperties
		match bool
	}{
		{"前缀匹配成功1", models.UserProperties{"device_id": {"sensor_001"}}, true},
		{"前缀匹配成功2", models.UserProperties{"device_id": {"sensor_abc"}}, true},
		{"前缀匹配失败", models.UserProperties{"device_id": {"device_001"}}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := r.RouteMessage(models.MQTTMessage{Topic: "t", Properties: tc.props})
			if got := len(result.MatchedRules) > 0; got != tc.match {
				t.Errorf("match=%v, want=%v", got, tc.match)
			}
		})
	}
}

func TestSuffixMatch(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "生产环境路由", MatchKey: "env", MatchValue: "_prod",
		MatchType: "suffix", TargetTopic: "prod/logs", Enabled: true,
	})

	cases := []struct {
		name  string
		props models.UserProperties
		match bool
	}{
		{"后缀匹配成功", models.UserProperties{"env": {"us_east_prod"}}, true},
		{"后缀匹配失败", models.UserProperties{"env": {"us_east_dev"}}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := r.RouteMessage(models.MQTTMessage{Topic: "t", Properties: tc.props})
			if got := len(result.MatchedRules) > 0; got != tc.match {
				t.Errorf("match=%v, want=%v", got, tc.match)
			}
		})
	}
}

func TestContainsMatch(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "报警路由", MatchKey: "msg_type", MatchValue: "alert",
		MatchType: "contains", TargetTopic: "alerts/all", Enabled: true,
	})

	cases := []struct {
		name  string
		props models.UserProperties
		match bool
	}{
		{"包含匹配成功1", models.UserProperties{"msg_type": {"high_alert"}}, true},
		{"包含匹配成功2", models.UserProperties{"msg_type": {"alert_critical"}}, true},
		{"包含匹配失败", models.UserProperties{"msg_type": {"info_msg"}}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := r.RouteMessage(models.MQTTMessage{Topic: "t", Properties: tc.props})
			if got := len(result.MatchedRules) > 0; got != tc.match {
				t.Errorf("match=%v, want=%v", got, tc.match)
			}
		})
	}
}

func TestRegexMatch(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "通配符路由", MatchKey: "region", MatchValue: "us_*",
		MatchType: "regex", TargetTopic: "us/region", Enabled: true,
	})

	cases := []struct {
		name  string
		props models.UserProperties
		match bool
	}{
		{"通配符匹配成功1", models.UserProperties{"region": {"us_east"}}, true},
		{"通配符匹配成功2", models.UserProperties{"region": {"us_west"}}, true},
		{"通配符匹配失败", models.UserProperties{"region": {"eu_west"}}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := r.RouteMessage(models.MQTTMessage{Topic: "t", Properties: tc.props})
			if got := len(result.MatchedRules) > 0; got != tc.match {
				t.Errorf("match=%v, want=%v", got, tc.match)
			}
		})
	}
}

func TestDisabledRule(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "已禁用", MatchKey: "test", MatchValue: "value",
		MatchType: "exact", TargetTopic: "test/target", Enabled: false,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"test": {"value"}},
	})
	if len(result.MatchedRules) > 0 {
		t.Error("disabled rule should not match")
	}
}

func TestMultipleRules(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "温度路由", MatchKey: "device_type", MatchValue: "temperature",
		MatchType: "exact", TargetTopic: "sensors/temp", Enabled: true,
	})
	r.AddRule(models.RoutingRule{
		Name: "湿度路由", MatchKey: "device_type", MatchValue: "humidity",
		MatchType: "exact", TargetTopic: "sensors/humidity", Enabled: true,
	})

	result1 := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"device_type": {"temperature"}},
	})
	if len(result1.MatchedRules) != 1 || result1.TargetTopics[0] != "sensors/temp" {
		t.Errorf("expected 1 match → sensors/temp, got %v", result1.TargetTopics)
	}

	result2 := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"device_type": {"humidity"}},
	})
	if len(result2.MatchedRules) != 1 || result2.TargetTopics[0] != "sensors/humidity" {
		t.Errorf("expected 1 match → sensors/humidity, got %v", result2.TargetTopics)
	}

	result3 := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"device_type": {"pressure"}},
	})
	if len(result3.MatchedRules) != 0 {
		t.Errorf("expected 0 matches for pressure, got %d", len(result3.MatchedRules))
	}
}

func TestSingleKeyMultipleValues(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "温度路由", MatchKey: "device_type", MatchValue: "temperature",
		MatchType: "exact", TargetTopic: "sensors/temp", Enabled: true,
	})
	r.AddRule(models.RoutingRule{
		Name: "湿度路由", MatchKey: "device_type", MatchValue: "humidity",
		MatchType: "exact", TargetTopic: "sensors/humidity", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t",
		Properties: models.UserProperties{
			"device_type": {"temperature", "humidity"},
		},
	})

	if len(result.MatchedRules) != 2 {
		t.Errorf("expected 2 matches for single-key multi-value, got %d", len(result.MatchedRules))
	}

	topics := map[string]bool{}
	for _, topic := range result.TargetTopics {
		topics[topic] = true
	}
	if !topics["sensors/temp"] || !topics["sensors/humidity"] {
		t.Errorf("expected both sensors/temp and sensors/humidity, got %v", result.TargetTopics)
	}
}

func TestMultiKeyMultiValueProperties(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "高优先级", MatchKey: "priority", MatchValue: "high",
		MatchType: "exact", TargetTopic: "alerts/high", Enabled: true,
	})
	r.AddRule(models.RoutingRule{
		Name: "系统来源", MatchKey: "source", MatchValue: "system",
		MatchType: "exact", TargetTopic: "alerts/system", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "device/alerts",
		Properties: models.UserProperties{
			"priority":  {"high", "critical"},
			"source":    {"system"},
			"device_id": {"server01"},
		},
	})

	if len(result.MatchedRules) != 2 {
		t.Errorf("expected 2 matches across multiple keys, got %d", len(result.MatchedRules))
	}
}

func TestTriePrefixMatchSingleKeyMultiValue(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "传感器前缀", MatchKey: "device_id", MatchValue: "sensor_",
		MatchType: "prefix", TargetTopic: "sensors/all", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t",
		Properties: models.UserProperties{
			"device_id": {"sensor_001", "actuator_001"},
		},
	})

	if len(result.MatchedRules) != 1 {
		t.Errorf("expected 1 match (sensor_001 matches prefix), got %d", len(result.MatchedRules))
	}
	if result.TargetTopics[0] != "sensors/all" {
		t.Errorf("expected sensors/all, got %s", result.TargetTopics[0])
	}
}

func TestCRUDOperations(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "测试规则", MatchKey: "key", MatchValue: "value",
		MatchType: "exact", TargetTopic: "test/topic", Enabled: true,
	})

	rules := r.ListRules()
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}

	ruleID := rules[0].ID

	gotRule, ok := r.GetRule(ruleID)
	if !ok {
		t.Fatal("rule not found")
	}
	if gotRule.Name != "测试规则" {
		t.Errorf("name=%q, want=%q", gotRule.Name, "测试规则")
	}

	r.UpdateRule(ruleID, models.RoutingRule{
		Name: "更新后", MatchKey: "key", MatchValue: "new_value",
		MatchType: "exact", TargetTopic: "test/new", Enabled: true,
	})

	gotRule, _ = r.GetRule(ruleID)
	if gotRule.Name != "更新后" {
		t.Errorf("name=%q, want=%q", gotRule.Name, "更新后")
	}

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"key": {"new_value"}},
	})
	if len(result.MatchedRules) != 1 {
		t.Errorf("expected 1 match for updated rule, got %d", len(result.MatchedRules))
	}
	if result.TargetTopics[0] != "test/new" {
		t.Errorf("target=%q, want=%q", result.TargetTopics[0], "test/new")
	}

	result2 := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"key": {"value"}},
	})
	if len(result2.MatchedRules) != 0 {
		t.Errorf("expected 0 match for old value after update, got %d", len(result2.MatchedRules))
	}

	r.DeleteRule(ruleID)

	rules = r.ListRules()
	if len(rules) != 0 {
		t.Errorf("expected 0 rules after delete, got %d", len(rules))
	}

	_, ok = r.GetRule(ruleID)
	if ok {
		t.Error("rule should be deleted")
	}
}

func TestUpdateRuleKeyChange(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "原始规则", MatchKey: "old_key", MatchValue: "val",
		MatchType: "exact", TargetTopic: "old/target", Enabled: true,
	})

	rules := r.ListRules()
	ruleID := rules[0].ID

	r.UpdateRule(ruleID, models.RoutingRule{
		Name: "更新键规则", MatchKey: "new_key", MatchValue: "val",
		MatchType: "exact", TargetTopic: "new/target", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"old_key": {"val"}},
	})
	if len(result.MatchedRules) != 0 {
		t.Errorf("old key should not match after update, got %d", len(result.MatchedRules))
	}

	result2 := r.RouteMessage(models.MQTTMessage{
		Topic: "t", Properties: models.UserProperties{"new_key": {"val"}},
	})
	if len(result2.MatchedRules) != 1 {
		t.Errorf("new key should match after update, got %d", len(result2.MatchedRules))
	}
}

func TestNoDuplicateMatches(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "精确+前缀同时匹配", MatchKey: "device_type", MatchValue: "sensor_temp",
		MatchType: "exact", TargetTopic: "exact/topic", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic: "t",
		Properties: models.UserProperties{
			"device_type": {"sensor_temp", "sensor_temp"},
		},
	})

	if len(result.MatchedRules) != 1 {
		t.Errorf("expected 1 unique match (dedup by rule ID), got %d", len(result.MatchedRules))
	}
}

func TestEmptyProperties(t *testing.T) {
	r := NewAttributeRouter()

	r.AddRule(models.RoutingRule{
		Name: "规则", MatchKey: "key", MatchValue: "value",
		MatchType: "exact", TargetTopic: "target", Enabled: true,
	})

	result := r.RouteMessage(models.MQTTMessage{
		Topic:      "t",
		Properties: models.UserProperties{},
	})
	if len(result.MatchedRules) != 0 {
		t.Errorf("expected 0 matches for empty properties, got %d", len(result.MatchedRules))
	}

	result2 := r.RouteMessage(models.MQTTMessage{
		Topic:      "t",
		Properties: nil,
	})
	if len(result2.MatchedRules) != 0 {
		t.Errorf("expected 0 matches for nil properties, got %d", len(result2.MatchedRules))
	}
}
