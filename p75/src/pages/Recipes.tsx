import { useEffect, useState } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Play,
  Save,
  X,
  FileText,
  Clock,
  User,
  Thermometer,
  Gauge,
} from 'lucide-react';
import { Recipe, RecipeParameters } from '../types';
import { getAuthHeaders } from '../store/authStore';

const API_BASE = 'http://localhost:3001/api';

const defaultParameters: RecipeParameters = {
  temperatureSetpoint: 25,
  pressureSetpoint: 1.0,
  maxTemperature: 70,
  maxPressure: 2.0,
  sampleInterval: 1000,
};

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parameters: { ...defaultParameters },
  });
  const [applyingId, setApplyingId] = useState<number | null>(null);

  const fetchRecipes = async () => {
    try {
      const response = await fetch(`${API_BASE}/recipes`, {
        headers: getAuthHeaders(),
      });
      const result = await response.json();
      if (result.success) {
        setRecipes(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleOpenModal = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipe(recipe);
      setFormData({
        name: recipe.name,
        description: recipe.description,
        parameters: { ...recipe.parameters },
      });
    } else {
      setEditingRecipe(null);
      setFormData({
        name: '',
        description: '',
        parameters: { ...defaultParameters },
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRecipe(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingRecipe
        ? `${API_BASE}/recipes/${editingRecipe.id}`
        : `${API_BASE}/recipes`;
      const method = editingRecipe ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        fetchRecipes();
        handleCloseModal();
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此配方？')) return;

    try {
      await fetch(`${API_BASE}/recipes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      fetchRecipes();
    } catch (error) {
      console.error('Failed to delete recipe:', error);
    }
  };

  const handleApply = async (id: number) => {
    setApplyingId(id);
    try {
      await fetch(`${API_BASE}/recipes/${id}/apply`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      alert('配方已成功应用！');
    } catch (error) {
      console.error('Failed to apply recipe:', error);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">配方管理</h1>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建配方
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>暂无配方</p>
          <button
            onClick={() => handleOpenModal()}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            创建第一个配方
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-cyan-500/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{recipe.name}</h3>
                  {recipe.description && (
                    <p className="text-sm text-slate-400 mt-1">
                      {recipe.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleApply(recipe.id)}
                    disabled={applyingId === recipe.id}
                    className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors disabled:opacity-50"
                    title="应用配方"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenModal(recipe)}
                    className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(recipe.id)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Thermometer className="w-4 h-4" />
                    温度设定
                  </div>
                  <span className="text-cyan-400 font-mono">
                    {recipe.parameters.temperatureSetpoint}°C
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Gauge className="w-4 h-4" />
                    压力设定
                  </div>
                  <span className="text-green-400 font-mono">
                    {recipe.parameters.pressureSetpoint} MPa
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock className="w-4 h-4" />
                    采样间隔
                  </div>
                  <span className="text-yellow-400 font-mono">
                    {recipe.parameters.sampleInterval} ms
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {recipe.creator_name || '未知'}
                </div>
                <div>
                  {new Date(recipe.updated_at).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editingRecipe ? '编辑配方' : '新建配方'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  配方名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="输入配方名称"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                  rows={2}
                  placeholder="配方描述（可选）"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    温度设定 (°C)
                  </label>
                  <input
                    type="number"
                    value={formData.parameters.temperatureSetpoint}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        parameters: {
                          ...formData.parameters,
                          temperatureSetpoint: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    压力设定 (MPa)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.parameters.pressureSetpoint}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        parameters: {
                          ...formData.parameters,
                          pressureSetpoint: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    最高温度 (°C)
                  </label>
                  <input
                    type="number"
                    value={formData.parameters.maxTemperature}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        parameters: {
                          ...formData.parameters,
                          maxTemperature: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    最高压力 (MPa)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.parameters.maxPressure}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        parameters: {
                          ...formData.parameters,
                          maxPressure: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  采样间隔 (ms)
                </label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={formData.parameters.sampleInterval}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parameters: {
                        ...formData.parameters,
                        sampleInterval: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingRecipe ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
