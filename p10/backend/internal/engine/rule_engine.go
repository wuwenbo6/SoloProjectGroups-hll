package engine

import (
	"encoding/json"
	"fmt"
	"iot-system/internal/models"
	"iot-system/pkg/database"
	"iot-system/pkg/mqttclient"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/tidwall/gjson"
)

type RuleCondition struct {
	DeviceID  string      `json:"device_id"`
	DataType  string      `json:"data_type"`
	Operator  string      `json:"operator"`
	Threshold interface{} `json:"threshold"`
}

type RuleAction struct {
	DeviceID string                 `json:"device_id"`
	Command  map[string]interface{} `json:"command"`
}

type CachedRule struct {
	models.Rule
	ParsedCondition RuleCondition
	ParsedAction    RuleAction
}

type CachedScene struct {
	models.Scene
	LastTriggered time.Time
}

type RuleEngine struct {
	cron          *cron.Cron
	sceneJobs     map[uint]cron.EntryID
	rulesCache    []*CachedRule
	rulesIndex    map[string][]*CachedRule
	scenesCache   []*CachedScene
	scenesIndex   map[string][]*CachedScene
	cacheMutex    sync.RWMutex
	debounceMap   map[string]time.Time
	debounceMutex sync.Mutex
	actionChan    chan func()
}

const (
	defaultDebounceTime = 5 * time.Second
	cacheRefreshInterval = 30 * time.Second
	actionWorkerCount    = 2
)

func NewRuleEngine() *RuleEngine {
	re := &RuleEngine{
		cron:        cron.New(),
		sceneJobs:   make(map[uint]cron.EntryID),
		rulesIndex:  make(map[string][]*CachedRule),
		scenesIndex: make(map[string][]*CachedScene),
		debounceMap: make(map[string]time.Time),
		actionChan:  make(chan func(), 100),
	}

	for i := 0; i < actionWorkerCount; i++ {
		go re.actionWorker(i)
	}

	return re
}

func (re *RuleEngine) Start() {
	re.cron.Start()
	re.refreshCache()
	re.loadScenes()

	go re.cacheRefresher()

	log.Println("Rule engine started (optimized)")
}

func (re *RuleEngine) Stop() {
	re.cron.Stop()
	close(re.actionChan)
	log.Println("Rule engine stopped")
}

func (re *RuleEngine) cacheRefresher() {
	ticker := time.NewTicker(cacheRefreshInterval)
	defer ticker.Stop()

	for range ticker.C {
		re.refreshCache()
	}
}

func (re *RuleEngine) refreshCache() {
	rules, err := database.DB.Where("enabled = ?", true).Find(&[]models.Rule{}).Rows()
	if err != nil {
		log.Printf("Failed to load rules for cache: %v", err)
		return
	}
	defer rules.Close()

	var cachedRules []*CachedRule
	newRulesIndex := make(map[string][]*CachedRule)

	for rules.Next() {
		var rule models.Rule
		database.DB.ScanRows(rules, &rule)

		cachedRule := &CachedRule{Rule: rule}

		if err := json.Unmarshal([]byte(rule.Condition), &cachedRule.ParsedCondition); err != nil {
			log.Printf("Failed to parse rule %d condition: %v", rule.ID, err)
			continue
		}
		if err := json.Unmarshal([]byte(rule.Action), &cachedRule.ParsedAction); err != nil {
			log.Printf("Failed to parse rule %d action: %v", rule.ID, err)
			continue
		}

		cachedRules = append(cachedRules, cachedRule)

		indexKey := fmt.Sprintf("%s_%s", cachedRule.ParsedCondition.DeviceID, cachedRule.ParsedCondition.DataType)
		newRulesIndex[indexKey] = append(newRulesIndex[indexKey], cachedRule)
	}

	scenes, err := database.GetAllScenes()
	if err != nil {
		log.Printf("Failed to load scenes for cache: %v", err)
	}

	var cachedScenes []*CachedScene
	newScenesIndex := make(map[string][]*CachedScene)

	for i := range scenes {
		cachedScene := &CachedScene{Scene: scenes[i]}
		cachedScenes = append(cachedScenes, cachedScene)

		if cachedScene.Enabled && cachedScene.TriggerType == "condition" {
			trigger := gjson.Parse(cachedScene.Trigger)
			indexKey := fmt.Sprintf("%s_%s", trigger.Get("device_id").String(), trigger.Get("data_type").String())
			newScenesIndex[indexKey] = append(newScenesIndex[indexKey], cachedScene)
		}
	}

	re.cacheMutex.Lock()
	re.rulesCache = cachedRules
	re.rulesIndex = newRulesIndex
	re.scenesCache = cachedScenes
	re.scenesIndex = newScenesIndex
	re.cacheMutex.Unlock()

	log.Printf("Rule cache refreshed: %d rules, %d scenes", len(cachedRules), len(cachedScenes))
}

func (re *RuleEngine) loadScenes() {
	re.cacheMutex.RLock()
	scenes := re.scenesCache
	re.cacheMutex.RUnlock()

	for _, scene := range scenes {
		if scene.Enabled && scene.TriggerType == "scheduled" && scene.CronExpr != "" {
			re.addSceneJob(scene.Scene)
		}
	}
}

func (re *RuleEngine) addSceneJob(scene models.Scene) {
	id, err := re.cron.AddFunc(scene.CronExpr, func() {
		log.Printf("Executing scheduled scene: %s", scene.Name)
		re.ExecuteSceneActions(scene.Actions)
	})
	if err != nil {
		log.Printf("Failed to add cron job for scene %s: %v", scene.Name, err)
		return
	}
	re.sceneJobs[scene.ID] = id
}

func (re *RuleEngine) RefreshScene(scene models.Scene) {
	if jobID, exists := re.sceneJobs[scene.ID]; exists {
		re.cron.Remove(jobID)
		delete(re.sceneJobs, scene.ID)
	}

	if scene.Enabled && scene.TriggerType == "scheduled" && scene.CronExpr != "" {
		re.addSceneJob(scene)
	}

	re.refreshCache()
}

func (re *RuleEngine) ProcessSensorData(msg *mqttclient.SensorMessage) {
	indexKey := fmt.Sprintf("%s_%s", msg.DeviceID, msg.Type)

	re.cacheMutex.RLock()
	rules := re.rulesIndex[indexKey]
	scenes := re.scenesIndex[indexKey]
	re.cacheMutex.RUnlock()

	for _, rule := range rules {
		if re.evaluateRuleFast(rule, msg) {
			if re.checkDebounce(fmt.Sprintf("rule_%d", rule.ID)) {
				log.Printf("Rule triggered (debounced): %s", rule.Name)
				action := rule.ParsedAction
				re.actionChan <- func() {
					re.executeAction(action.DeviceID, action.Command)
				}
			}
		}
	}

	for _, scene := range scenes {
		if re.evaluateSceneFast(scene, msg) {
			if re.checkDebounce(fmt.Sprintf("scene_%d", scene.ID)) {
				log.Printf("Condition scene triggered (debounced): %s", scene.Name)
				scene.LastTriggered = time.Now()
				re.actionChan <- func() {
					re.ExecuteSceneActions(scene.Actions)
				}
			}
		}
	}
}

func (re *RuleEngine) evaluateRuleFast(rule *CachedRule, msg *mqttclient.SensorMessage) bool {
	cond := rule.ParsedCondition
	return compareValues(msg.Value, cond.Operator, cond.Threshold)
}

func (re *RuleEngine) evaluateSceneFast(scene *CachedScene, msg *mqttclient.SensorMessage) bool {
	trigger := gjson.Parse(scene.Trigger)
	operator := trigger.Get("operator").String()
	threshold := trigger.Get("threshold").Float()

	return compareValues(msg.Value, operator, threshold)
}

func (re *RuleEngine) checkDebounce(key string) bool {
	re.debounceMutex.Lock()
	defer re.debounceMutex.Unlock()

	lastTriggered, exists := re.debounceMap[key]
	if exists && time.Since(lastTriggered) < defaultDebounceTime {
		return false
	}

	re.debounceMap[key] = time.Now()
	return true
}

func (re *RuleEngine) actionWorker(id int) {
	log.Printf("Rule action worker %d started", id)
	for action := range re.actionChan {
		action()
	}
}

func compareValues(value float64, operator string, threshold interface{}) bool {
	var thresholdFloat float64
	switch v := threshold.(type) {
	case float64:
		thresholdFloat = v
	case float32:
		thresholdFloat = float64(v)
	case int:
		thresholdFloat = float64(v)
	case string:
		parsed, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return false
		}
		thresholdFloat = parsed
	default:
		return false
	}

	switch operator {
	case ">":
		return value > thresholdFloat
	case ">=":
		return value >= thresholdFloat
	case "<":
		return value < thresholdFloat
	case "<=":
		return value <= thresholdFloat
	case "==":
		return value == thresholdFloat
	case "!=":
		return value != thresholdFloat
	default:
		return false
	}
}

func (re *RuleEngine) executeAction(deviceID string, command map[string]interface{}) {
	err := mqttclient.SendCommand(deviceID, command)
	cmdStr := fmt.Sprintf("%v", command)
	if err != nil {
		log.Printf("Failed to send command: %v", err)
		database.LogCommand(deviceID, cmdStr, "failed")
	} else {
		database.LogCommand(deviceID, cmdStr, "sent")
	}
}

func (re *RuleEngine) ExecuteSceneActions(actionsJSON string) {
	actions := gjson.Parse(actionsJSON)
	if !actions.IsArray() {
		log.Printf("Invalid actions format")
		return
	}

	actions.ForEach(func(_, action gjson.Result) bool {
		deviceID := action.Get("device_id").String()
		commandJSON := action.Get("command").String()

		var command map[string]interface{}
		err := json.Unmarshal([]byte(commandJSON), &command)
		if err != nil {
			log.Printf("Failed to parse command: %v", err)
			return true
		}

		re.executeAction(deviceID, command)
		return true
	})
}

func ParseCondition(conditionStr string) (*RuleCondition, error) {
	parts := strings.Fields(conditionStr)
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid condition format")
	}

	deviceParts := strings.Split(parts[0], ".")
	if len(deviceParts) != 2 {
		return nil, fmt.Errorf("invalid device format")
	}

	threshold, err := strconv.ParseFloat(parts[2], 64)
	if err != nil {
		return nil, fmt.Errorf("invalid threshold value")
	}

	return &RuleCondition{
		DeviceID:  deviceParts[0],
		DataType:  deviceParts[1],
		Operator:  parts[1],
		Threshold: threshold,
	}, nil
}
