package custom

import (
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"kafka-simulator/internal/types"

	"github.com/robertkrimen/otto"
)

type ScriptAssignor struct {
	id          string
	name        string
	description string
	script      string
	vm          *otto.Otto
}

type Manager struct {
	assignors map[string]*ScriptAssignor
	mu        sync.RWMutex
}

func NewManager() *Manager {
	m := &Manager{
		assignors: make(map[string]*ScriptAssignor),
	}

	m.registerBuiltIn()

	return m
}

func (m *Manager) registerBuiltIn() {
	scripts := map[string]map[string]string{
		"random": {
			"name":        "Random 随机分配",
			"description": "将分区随机分配给消费者，适合测试场景",
			"script": `function assign(topics, consumers) {
	var result = {};
	consumers.forEach(function(cid) {
		result[cid] = {};
		for (var topic in topics) {
			result[cid][topic] = [];
		}
	});
	var shuffled = [];
	for (var topic in topics) {
		topics[topic].forEach(function(p) {
			shuffled.push({topic: topic, partition: p});
		});
	}
	for (var i = shuffled.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = temp;
	}
	shuffled.forEach(function(item, idx) {
		var consumerIdx = idx % consumers.length;
		var cid = consumers[consumerIdx];
		result[cid][item.topic].push(item.partition);
	});
	for (var cid in result) {
		for (var topic in result[cid]) {
			result[cid][topic].sort(function(a, b) { return a - b; });
		}
	}
	return result;
}`,
		},
		"load-balance": {
			"name":        "Load-Balance 负载均衡",
			"description": "按消费者ID哈希分配，使分区分布更均匀",
			"script": `function assign(topics, consumers) {
	var result = {};
	consumers.sort();
	consumers.forEach(function(cid) {
		result[cid] = {};
		for (var topic in topics) {
			result[cid][topic] = [];
		}
	});
	var idx = 0;
	var topicNames = Object.keys(topics).sort();
	topicNames.forEach(function(topic) {
		var partitions = topics[topic].slice().sort(function(a, b) { return a - b; });
		partitions.forEach(function(p) {
			var cid = consumers[idx % consumers.length];
			result[cid][topic].push(p);
			idx++;
		});
	});
	return result;
}`,
		},
		"prefer-local": {
			"name":        "Prefer-Local 优先本地",
			"description": "模拟机架感知策略，按分区ID模消费者数量分配",
			"script": `function assign(topics, consumers) {
	var result = {};
	consumers.sort();
	consumers.forEach(function(cid) {
		result[cid] = {};
		for (var topic in topics) {
			result[cid][topic] = [];
		}
	});
	var topicNames = Object.keys(topics).sort();
	topicNames.forEach(function(topic) {
		var partitions = topics[topic].slice().sort(function(a, b) { return a - b; });
		partitions.forEach(function(p) {
			var consumerIdx = p % consumers.length;
			var cid = consumers[consumerIdx];
			result[cid][topic].push(p);
		});
	});
	return result;
}`,
		},
	}

	for id, meta := range scripts {
		sa, err := m.createAssignor(id, meta["name"], meta["description"], meta["script"])
		if err == nil {
			sa.vm.Set("assign", nil)
			m.assignors[id] = sa
		}
	}
}

func (m *Manager) createAssignor(id, name, description, script string) (*ScriptAssignor, error) {
	vm := otto.New()

	if _, err := vm.Run(script); err != nil {
		return nil, fmt.Errorf("failed to parse script: %w", err)
	}

	if _, err := vm.Get("assign"); err != nil {
		return nil, fmt.Errorf("script must define 'assign' function")
	}

	return &ScriptAssignor{
		id:          id,
		name:        name,
		description: description,
		script:      script,
		vm:          vm,
	}, nil
}

func (m *Manager) Create(id, name, description, script string) (*types.CustomAssignor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.assignors[id]; exists {
		return nil, fmt.Errorf("assignor %s already exists", id)
	}

	sa, err := m.createAssignor(id, name, description, script)
	if err != nil {
		return nil, err
	}

	m.assignors[id] = sa

	return &types.CustomAssignor{
		ID:          id,
		Name:        name,
		Description: description,
		Script:      script,
		CreatedAt:   time.Now().Unix(),
		UpdatedAt:   time.Now().Unix(),
		IsBuiltIn:   false,
	}, nil
}

func (m *Manager) Update(id, name, description, script string) (*types.CustomAssignor, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, exists := m.assignors[id]
	if !exists {
		return nil, fmt.Errorf("assignor %s not found", id)
	}

	if existing.id == "random" || existing.id == "load-balance" || existing.id == "prefer-local" {
		return nil, fmt.Errorf("cannot modify built-in assignor")
	}

	sa, err := m.createAssignor(id, name, description, script)
	if err != nil {
		return nil, err
	}

	m.assignors[id] = sa

	return &types.CustomAssignor{
		ID:          id,
		Name:        name,
		Description: description,
		Script:      script,
		CreatedAt:   time.Now().Unix(),
		UpdatedAt:   time.Now().Unix(),
		IsBuiltIn:   false,
	}, nil
}

func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, exists := m.assignors[id]
	if !exists {
		return fmt.Errorf("assignor %s not found", id)
	}

	if existing.id == "random" || existing.id == "load-balance" || existing.id == "prefer-local" {
		return fmt.Errorf("cannot delete built-in assignor")
	}

	delete(m.assignors, id)
	return nil
}

func (m *Manager) List() []*types.CustomAssignor {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*types.CustomAssignor, 0, len(m.assignors))
	for id, sa := range m.assignors {
		result = append(result, &types.CustomAssignor{
			ID:          id,
			Name:        sa.name,
			Description: sa.description,
			Script:      sa.script,
			IsBuiltIn:   id == "random" || id == "load-balance" || id == "prefer-local",
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].IsBuiltIn != result[j].IsBuiltIn {
			return !result[i].IsBuiltIn
		}
		return result[i].ID < result[j].ID
	})

	return result
}

func (m *Manager) Get(id string) (*types.CustomAssignor, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sa, exists := m.assignors[id]
	if !exists {
		return nil, fmt.Errorf("assignor %s not found", id)
	}

	return &types.CustomAssignor{
		ID:          id,
		Name:        sa.name,
		Description: sa.description,
		Script:      sa.script,
		IsBuiltIn:   id == "random" || id == "load-balance" || id == "prefer-local",
	}, nil
}

func (m *Manager) Test(id string, input *types.AssignorTestInput) *types.AssignorTestResult {
	m.mu.RLock()
	sa, exists := m.assignors[id]
	m.mu.RUnlock()

	if !exists {
		return &types.AssignorTestResult{
			Success: false,
			Error:   fmt.Sprintf("assignor %s not found", id),
		}
	}

	topics := make(map[string][]types.Partition)
	for t, ps := range input.Topics {
		tps := make([]types.Partition, len(ps))
		for i, pid := range ps {
			tps[i] = types.Partition{ID: pid, Topic: t}
		}
		topics[t] = tps
	}

	result, err := m.executeScript(sa, topics, input.Consumers)
	if err != nil {
		return &types.AssignorTestResult{
			Success: false,
			Error:   err.Error(),
		}
	}

	return &types.AssignorTestResult{
		Success: true,
		Result:  result,
	}
}

func (m *Manager) executeScript(sa *ScriptAssignor, topics map[string][]types.Partition, consumerIDs []string) (map[string]map[string][]int32, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tm := make(map[string][]int32)
	for t, ps := range topics {
		ids := make([]int32, len(ps))
		for i, p := range ps {
			ids[i] = p.ID
		}
		tm[t] = ids
	}

	vm := otto.New()

	topicsJSON, _ := json.Marshal(tm)
	consumersJSON, _ := json.Marshal(consumerIDs)

	script := fmt.Sprintf(`
		%s
		var topics = %s;
		var consumers = %s;
		var result = assign(topics, consumers);
		JSON.stringify(result);
	`, sa.script, string(topicsJSON), string(consumersJSON))

	val, err := vm.Run(script)
	if err != nil {
		return nil, fmt.Errorf("script execution failed: %w", err)
	}

	resultStr, err := val.ToString()
	if err != nil {
		return nil, fmt.Errorf("result is not a string: %w", err)
	}

	var result map[string]map[string][]int32
	if err := json.Unmarshal([]byte(resultStr), &result); err != nil {
		return nil, fmt.Errorf("result is not valid JSON: %w", err)
	}

	return result, nil
}

func (m *Manager) GetAsAssignor(id string) (func(map[string][]types.Partition, []string) (map[string]map[string][]int32, error), error) {
	m.mu.RLock()
	sa, exists := m.assignors[id]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("assignor %s not found", id)
	}

	return func(topics map[string][]types.Partition, consumerIDs []string) (map[string]map[string][]int32, error) {
		return m.executeScript(sa, topics, consumerIDs)
	}, nil
}

func (m *Manager) Assign(id string, topics map[string][]types.Partition, consumerIDs []string) (map[string]map[string][]int32, error) {
	fn, err := m.GetAsAssignor(id)
	if err != nil {
		return nil, err
	}
	return fn(topics, consumerIDs)
}

func (m *Manager) IsCustomAssignor(protocol string) bool {
	_, err := m.Get(protocol)
	return err == nil
}
