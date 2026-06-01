import React, { useState } from 'react';
import { Plus, Trash2, Table, Play, Pause, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { FlowRule, MatchFields, FlowAction } from '@/types';
import { flowRuleApi } from '@/services/api';

const FlowTablePanel: React.FC = () => {
  const { nodes, flowRules, selectedNode, addFlowRule, removeFlowRule } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState<Partial<FlowRule>>({
    priority: 100,
    match: {},
    actions: [{ type: 'OUTPUT' }],
  });

  const switches = nodes.filter((n) => n.data.nodeType === 'switch');
  const selectedSwitch = selectedNode && nodes.find((n) => n.id === selectedNode);
  const isSwitchSelected = selectedSwitch?.data.nodeType === 'switch';

  const switchFlowRules = isSwitchSelected
    ? flowRules.filter((r) => r.switchId === selectedNode)
    : [];

  const handleAddRule = async () => {
    if (!selectedNode || !isSwitchSelected) return;

    const rule: FlowRule = {
      id: `rule_${Date.now()}`,
      switchId: selectedNode,
      priority: newRule.priority || 100,
      match: newRule.match || {},
      actions: newRule.actions || [{ type: 'OUTPUT' }],
    };

    try {
      await flowRuleApi.add(rule);
      addFlowRule(rule);
      setShowAddForm(false);
      setNewRule({ priority: 100, match: {}, actions: [{ type: 'OUTPUT' }] });
    } catch (error) {
      console.error('Failed to add flow rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await flowRuleApi.delete(ruleId);
      removeFlowRule(ruleId);
    } catch (error) {
      console.error('Failed to delete flow rule:', error);
    }
  };

  const updateMatchField = (key: keyof MatchFields, value: string | number | undefined) => {
    setNewRule((prev) => ({
      ...prev,
      match: {
        ...prev.match,
        [key]: value === '' ? undefined : value,
      },
    }));
  };

  const updateAction = (index: number, field: string, value: string | number) => {
    setNewRule((prev) => {
      const actions = [...(prev.actions || [])];
      actions[index] = { ...actions[index], [field]: value };
      return { ...prev, actions };
    });
  };

  const matchFieldLabels: Record<keyof MatchFields, string> = {
    in_port: '输入端口',
    eth_src: '源MAC',
    eth_dst: '目的MAC',
    eth_type: '以太网类型',
    ip_src: '源IP',
    ip_dst: '目的IP',
    ip_proto: 'IP协议',
    tp_src: '源端口',
    tp_dst: '目的端口',
  };

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-1">
          <Table className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-semibold">流表配置</h2>
        </div>
        <p className="text-slate-400 text-xs">
          {isSwitchSelected
            ? `交换机: ${selectedSwitch?.data.label}`
            : '请选择一个交换机'}
        </p>
      </div>

      {isSwitchSelected ? (
        <>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {switchFlowRules.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Table className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无流表规则</p>
                  <p className="text-xs">点击下方按钮添加规则</p>
                </div>
              ) : (
                switchFlowRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="bg-slate-800 rounded-lg p-3 border border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-blue-400">
                        优先级: {rule.priority}
                      </span>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-slate-400">匹配: </span>
                        <span className="text-slate-200 font-mono">
                          {Object.entries(rule.match).length > 0
                            ? Object.entries(rule.match)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(', ')
                            : '所有数据包'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">动作: </span>
                        <span className="text-emerald-400 font-mono">
                          {rule.actions
                            .map(
                              (a) =>
                                `${a.type}${a.port ? `:${a.port}` : ''}`
                            )
                            .join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showAddForm && (
            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white text-sm font-medium">添加流表规则</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">优先级</label>
                  <input
                    type="number"
                    value={newRule.priority}
                    onChange={(e) =>
                      setNewRule((prev) => ({
                        ...prev,
                        priority: parseInt(e.target.value) || 100,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-1">匹配字段</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(matchFieldLabels).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-slate-500 text-[10px] mb-0.5">
                          {label}
                        </label>
                        <input
                          type="text"
                          placeholder={label}
                          value={(newRule.match as any)?.[key] || ''}
                          onChange={(e) => updateMatchField(key as keyof MatchFields, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-1">动作</label>
                  {newRule.actions?.map((action, index) => (
                    <div key={index} className="flex gap-2 mb-1">
                      <select
                        value={action.type}
                        onChange={(e) => updateAction(index, 'type', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="OUTPUT">OUTPUT</option>
                        <option value="DROP">DROP</option>
                        <option value="FORWARD">FORWARD</option>
                      </select>
                      {action.type === 'OUTPUT' && (
                        <input
                          type="number"
                          placeholder="端口"
                          value={action.port || ''}
                          onChange={(e) =>
                            updateAction(index, 'port', parseInt(e.target.value))
                          }
                          className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAddRule}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  添加规则
                </button>
              </div>
            </div>
          )}

          {!showAddForm && (
            <div className="p-4 border-t border-slate-700">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                添加流表规则
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 p-4">
          <div className="text-center">
            <Table className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">请先选择一个交换机</p>
            <p className="text-xs mt-1">点击画布中的交换机节点</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowTablePanel;
