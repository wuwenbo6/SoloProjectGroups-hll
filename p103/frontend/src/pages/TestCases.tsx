import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, TestTube } from 'lucide-react';
import { casesApi, strategiesApi } from '../services/api';
import { TestCase, MutationStrategy } from '../types';

const TestCasesPage: React.FC = () => {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [strategies, setStrategies] = useState<MutationStrategy[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    strategyType: '',
    params: {} as Record<string, any>,
  });

  useEffect(() => {
    loadCases();
    loadStrategies();
  }, []);

  const loadCases = async () => {
    try {
      const data = await casesApi.getAll();
      setCases(data);
    } catch (error) {
      console.error('Failed to load cases:', error);
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

  const handleSubmit = async () => {
    try {
      if (editingCase) {
        await casesApi.update(editingCase.id, formData);
      } else {
        await casesApi.create(formData);
      }
      loadCases();
      resetForm();
    } catch (error) {
      console.error('Failed to save case:', error);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', strategyType: '', params: {} });
    setShowForm(false);
    setEditingCase(null);
  };

  const handleEdit = (testCase: TestCase) => {
    setEditingCase(testCase);
    setFormData({
      name: testCase.name,
      description: testCase.description,
      strategyType: testCase.strategyType,
      params: testCase.params,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('确定删除此测试用例？')) {
      try {
        await casesApi.delete(id);
        loadCases();
      } catch (error) {
        console.error('Failed to delete case:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">测试用例</h1>
          <p className="text-dark-400 mt-1">管理自定义测试用例</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建用例
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingCase ? '编辑测试用例' : '新建测试用例'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-dark-300 mb-1">用例名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
                placeholder="输入用例名称"
              />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1">策略类型</label>
              <select
                value={formData.strategyType}
                onChange={(e) => setFormData({ ...formData, strategyType: e.target.value })}
                className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">选择策略类型</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-dark-300 mb-1">描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white focus:outline-none focus:border-primary-500 resize-none"
                rows={3}
                placeholder="输入测试用例描述..."
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSubmit}
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
      )}

      <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
        <div className="space-y-3">
          {cases.map((testCase) => (
            <div
              key={testCase.id}
              className="p-4 bg-dark-700/30 rounded-lg border border-dark-600 hover:border-dark-500 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-primary-600/20 rounded-lg">
                    <TestTube className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{testCase.name}</h3>
                    <p className="text-sm text-dark-400 mt-1">{testCase.description}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-dark-400">
                        策略: {strategies.find((s) => s.id === testCase.strategyType)?.name || testCase.strategyType}
                      </span>
                      <span className="text-xs text-dark-400">
                        创建时间: {new Date(testCase.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(testCase)}
                    className="p-2 text-dark-300 hover:text-white hover:bg-dark-600 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(testCase.id)}
                    className="p-2 text-status-error hover:bg-dark-600 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {cases.length === 0 && (
            <p className="text-center text-dark-400 py-8">暂无测试用例，点击上方按钮创建</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestCasesPage;
