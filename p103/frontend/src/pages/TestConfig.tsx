import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, Zap, CheckCircle } from 'lucide-react';
import { targetsApi, strategiesApi, tasksApi } from '../services/api';
import { TargetConfig, MutationStrategy } from '../types';

const TestConfig: React.FC = () => {
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [strategies, setStrategies] = useState<MutationStrategy[]>([]);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetConfig | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [taskName, setTaskName] = useState('');
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const [connectionResult, setConnectionResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [advancedConfig, setAdvancedConfig] = useState({
    autoRecover: true,
    maxCrashes: 5,
    recoverTimeout: 300,
    sendInterval: 100,
    packetsPerStrategy: 100,
  });

  const [formData, setFormData] = useState({
    name: '',
    ipAddress: '',
    port: 502,
    slaveId: 1,
    timeout: 5000,
  });

  useEffect(() => {
    loadTargets();
    loadStrategies();
  }, []);

  const loadTargets = async () => {
    try {
      const data = await targetsApi.getAll();
      setTargets(data);
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  const loadStrategies = async () => {
    try {
      const data = await strategiesApi.getAll();
      setStrategies(data);
    } catch (error) {
      console.error('Failed to load strategies:', error);
    }
  };

  const handleSubmitTarget = async () => {
    try {
      if (editingTarget) {
        await targetsApi.update(editingTarget.id!, formData);
      } else {
        await targetsApi.create(formData);
      }
      loadTargets();
      resetForm();
    } catch (error) {
      console.error('Failed to save target:', error);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', ipAddress: '', port: 502, slaveId: 1, timeout: 5000 });
    setShowTargetForm(false);
    setEditingTarget(null);
  };

  const handleEditTarget = (target: TargetConfig) => {
    setEditingTarget(target);
    setFormData({
      name: target.name,
      ipAddress: target.ipAddress,
      port: target.port,
      slaveId: target.slaveId,
      timeout: target.timeout,
    });
    setShowTargetForm(true);
  };

  const handleDeleteTarget = async (id: number) => {
    if (confirm('确定删除此目标设备？')) {
      try {
        await targetsApi.delete(id);
        loadTargets();
        if (selectedTarget === id) {
          setSelectedTarget(null);
        }
      } catch (error) {
        console.error('Failed to delete target:', error);
      }
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingConnection(id);
    setConnectionResult(null);
    try {
      const result = await targetsApi.testConnection(id);
      setConnectionResult({ id, success: result.success, message: result.message });
    } catch (error) {
      setConnectionResult({ id, success: false, message: '测试失败' });
    } finally {
      setTestingConnection(null);
      setTimeout(() => setConnectionResult(null), 3000);
    }
  };

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(strategyId)
        ? prev.filter((s) => s !== strategyId)
        : [...prev, strategyId]
    );
  };

  const handleCreateTask = async () => {
    if (!selectedTarget || !taskName || selectedStrategies.length === 0) {
      alert('请选择目标设备、输入任务名称并选择至少一个变异策略');
      return;
    }
    try {
      await tasksApi.create({
        name: taskName,
        targetId: selectedTarget,
        strategies: selectedStrategies,
        ...advancedConfig,
      });
      alert('测试任务创建成功！');
      setTaskName('');
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('创建任务失败');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">测试配置</h1>
        <p className="text-dark-400 mt-1">配置目标设备和变异策略</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">目标设备</h2>
            <button
              onClick={() => setShowTargetForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加设备
            </button>
          </div>

          {showTargetForm && (
            <div className="mb-4 p-4 bg-dark-700/50 rounded-lg">
              <h3 className="text-white font-medium mb-3">
                {editingTarget ? '编辑设备' : '添加新设备'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-dark-300 mb-1">设备名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    placeholder="PLC-001"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-dark-300 mb-1">IP地址</label>
                    <input
                      type="text"
                      value={formData.ipAddress}
                      onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-300 mb-1">端口</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 502 })}
                      className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-dark-300 mb-1">从站ID</label>
                    <input
                      type="number"
                      value={formData.slaveId}
                      onChange={(e) => setFormData({ ...formData, slaveId: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-300 mb-1">超时(ms)</label>
                    <input
                      type="number"
                      value={formData.timeout}
                      onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 5000 })}
                      className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSubmitTarget}
                    className="flex items-center gap-2 px-4 py-2 bg-status-success text-white rounded-lg hover:bg-status-success/80 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    保存
                  </button>
                  <button
                    onClick={resetForm}
                    className="flex items-center gap-2 px-4 py-2 bg-dark-600 text-white rounded-lg hover:bg-dark-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {targets.map((target) => (
              <div
                key={target.id}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedTarget === target.id
                    ? 'bg-primary-600/20 border-primary-500'
                    : 'bg-dark-700/30 border-dark-600 hover:border-dark-500'
                }`}
                onClick={() => setSelectedTarget(target.id!)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{target.name}</h3>
                    <p className="text-sm text-dark-400">
                      {target.ipAddress}:{target.port} | Slave ID: {target.slaveId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {connectionResult?.id === target.id && (
                      <span
                        className={`text-sm px-2 py-1 rounded ${
                          connectionResult.success
                            ? 'bg-status-success/20 text-status-success'
                            : 'bg-status-error/20 text-status-error'
                        }`}
                      >
                        {connectionResult.success ? '连接成功' : '连接失败'}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestConnection(target.id!);
                      }}
                      disabled={testingConnection === target.id}
                      className="p-2 text-status-info hover:bg-dark-600 rounded transition-colors disabled:opacity-50"
                      title="测试连接"
                    >
                      <Zap className={`w-4 h-4 ${testingConnection === target.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTarget(target);
                      }}
                      className="p-2 text-dark-300 hover:text-white hover:bg-dark-600 rounded transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTarget(target.id!);
                      }}
                      className="p-2 text-status-error hover:bg-dark-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {targets.length === 0 && (
              <p className="text-center text-dark-400 py-8">暂无目标设备，请添加</p>
            )}
          </div>
        </div>

        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">变异策略</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-400">已选: {selectedStrategies.length}</span>
              <button
                onClick={() => setSelectedStrategies(strategies.map(s => s.id))}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                全选
              </button>
              <button
                onClick={() => setSelectedStrategies([])}
                className="text-xs text-dark-400 hover:text-dark-300"
              >
                清空
              </button>
            </div>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {Array.from(new Set(strategies.map(s => s.category || '其他'))).map((category) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-primary-400 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-500" />
                  {category}
                </h3>
                <div className="space-y-2">
                  {strategies
                    .filter(s => (s.category || '其他') === category)
                    .map((strategy) => (
                      <div
                        key={strategy.id}
                        onClick={() => toggleStrategy(strategy.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedStrategies.includes(strategy.id)
                            ? 'bg-primary-600/20 border-primary-500'
                            : 'bg-dark-700/30 border-dark-600 hover:border-dark-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedStrategies.includes(strategy.id)
                                ? 'bg-primary-500 border-primary-500'
                                : 'border-dark-500'
                            }`}
                          >
                            {selectedStrategies.includes(strategy.id) && (
                              <CheckCircle className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-white font-medium text-sm">{strategy.name}</h4>
                            <p className="text-xs text-dark-400">{strategy.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">创建测试任务</h2>
          <button
            onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
            className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            {showAdvancedConfig ? '隐藏高级配置' : '显示高级配置'}
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-dark-300 mb-1">任务名称</label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="w-full px-4 py-3 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                placeholder="输入测试任务名称..."
              />
            </div>
            <div className="text-dark-400 text-sm">
              <p>已选择目标: {selectedTarget ? targets.find((t) => t.id === selectedTarget)?.name : '未选择'}</p>
              <p>已选策略: {selectedStrategies.length} 个</p>
            </div>
            <button
              onClick={handleCreateTask}
              disabled={!selectedTarget || !taskName || selectedStrategies.length === 0}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              创建任务
            </button>
          </div>

          {showAdvancedConfig && (
            <div className="pt-4 border-t border-dark-700 grid grid-cols-5 gap-4">
              <div>
                <label className="block text-sm text-dark-300 mb-1">自动恢复</label>
                <div className="flex items-center gap-2 h-[42px]">
                  <input
                    type="checkbox"
                    checked={advancedConfig.autoRecover}
                    onChange={(e) => setAdvancedConfig({ ...advancedConfig, autoRecover: e.target.checked })}
                    className="w-4 h-4 rounded bg-dark-600 border-dark-500 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-white text-sm">启用</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-dark-300 mb-1">最大崩溃次数</label>
                <input
                  type="number"
                  value={advancedConfig.maxCrashes}
                  onChange={(e) => setAdvancedConfig({ ...advancedConfig, maxCrashes: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-300 mb-1">恢复超时(秒)</label>
                <input
                  type="number"
                  value={advancedConfig.recoverTimeout}
                  onChange={(e) => setAdvancedConfig({ ...advancedConfig, recoverTimeout: parseInt(e.target.value) || 300 })}
                  className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-300 mb-1">发送间隔(ms)</label>
                <input
                  type="number"
                  value={advancedConfig.sendInterval}
                  onChange={(e) => setAdvancedConfig({ ...advancedConfig, sendInterval: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-300 mb-1">每策略报文数</label>
                <input
                  type="number"
                  value={advancedConfig.packetsPerStrategy}
                  onChange={(e) => setAdvancedConfig({ ...advancedConfig, packetsPerStrategy: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestConfig;
