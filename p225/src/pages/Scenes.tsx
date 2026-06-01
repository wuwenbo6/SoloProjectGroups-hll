import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sliders, LayoutGrid, Trash2, Play, Plus, Calendar, Layers } from 'lucide-react';
import { useConsoleStore } from '../store/consoleStore';
import { getScenes, createScene, deleteScene } from '../lib/api';
import type { Scene } from '../../shared/types';

export default function Scenes() {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const channels = useConsoleStore((s) => s.channels);
  const loadScene = useConsoleStore((s) => s.loadScene);

  const fetchScenes = async () => {
    setLoading(true);
    const data = await getScenes();
    setScenes(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchScenes();
  }, []);

  const handleCreateScene = async () => {
    if (!newSceneName.trim()) return;
    const scene = await createScene(newSceneName.trim(), channels);
    if (scene) {
      setNewSceneName('');
      setShowCreate(false);
      await fetchScenes();
    }
  };

  const handleDeleteScene = async (id: string) => {
    const success = await deleteScene(id);
    if (success) {
      setDeleteConfirm(null);
      await fetchScenes();
    }
  };

  const handleLoadScene = (scene: Scene) => {
    loadScene(scene);
    navigate('/');
  };

  const getNonZeroCount = (scene: Scene) =>
    scene.channels.filter((v) => v > 0).length;

  const getMaxValue = (scene: Scene) => Math.max(...scene.channels);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-console-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-console-panel border-b border-console-border">
        <div className="flex items-center gap-3">
          <Sliders className="text-console-accent" size={28} />
          <div>
            <h1 className="text-xl font-bold text-console-text">Art-Net 控制台</h1>
            <p className="text-xs text-console-muted">DMX512 灯光控制</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className="px-4 py-2 rounded-lg text-console-muted hover:bg-console-border hover:text-console-text transition-colors flex items-center gap-2"
          >
            <Sliders size={18} />
            控制台
          </Link>
          <Link
            to="/scenes"
            className="px-4 py-2 rounded-lg bg-console-accent text-black font-medium flex items-center gap-2"
          >
            <LayoutGrid size={18} />
            场景管理
          </Link>
        </nav>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-console-text">场景管理</h2>
            <p className="text-sm text-console-muted mt-1">
              共 {scenes.length} 个场景，可快速加载到控制台
            </p>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-lg bg-console-accent text-black font-medium flex items-center gap-2 hover:bg-console-accentHover transition-colors"
          >
            <Plus size={18} />
            保存当前状态
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-console-muted">加载中...</div>
          </div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-20 bg-console-panel border border-console-border rounded-xl">
            <Layers size={48} className="mx-auto text-console-muted mb-4" />
            <h3 className="text-lg font-medium text-console-text mb-2">
              暂无场景
            </h3>
            <p className="text-sm text-console-muted mb-6">
              点击上方按钮保存当前控制台状态为场景
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-lg bg-console-accent text-black font-medium inline-flex items-center gap-2 hover:bg-console-accentHover transition-colors"
            >
              <Plus size={18} />
              创建第一个场景
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scenes.map((scene) => (
              <div
                key={scene.id}
                className="bg-console-panel border border-console-border rounded-xl overflow-hidden hover:border-console-accent/50 transition-all group scene-card-enter"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-console-text truncate">
                      {scene.name}
                    </h3>
                    {deleteConfirm === scene.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteScene(scene.id)}
                          className="p-1.5 rounded bg-console-warning text-white hover:bg-console-warning/80"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1.5 rounded bg-console-border text-console-muted hover:bg-console-border/80"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(scene.id)}
                        className="p-1.5 rounded text-console-muted hover:text-console-warning hover:bg-console-warning/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-console-muted mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(scene.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={12} />
                      {getNonZeroCount(scene)} 通道
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs text-console-muted mb-2">通道预览</div>
                    <div className="h-12 bg-console-bg rounded-lg p-2 flex items-end gap-px overflow-hidden">
                      {scene.channels.slice(0, 64).map((val, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-console-accent/60 rounded-sm transition-all"
                          style={{ height: `${(val / 255) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5 text-xs font-mono">
                      <span className="text-console-muted">0</span>
                      <span className={getMaxValue(scene) > 0 ? 'text-console-accent' : 'text-console-muted'}>
                        {getMaxValue(scene)}
                      </span>
                      <span className="text-console-muted">255</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadScene(scene)}
                      className="flex-1 px-4 py-2 rounded-lg bg-console-accent text-black font-medium flex items-center justify-center gap-2 hover:bg-console-accentHover transition-colors"
                    >
                      <Play size={16} />
                      加载
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-console-panel border border-console-border rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-console-text mb-4 flex items-center gap-2">
              <Plus size={20} className="text-console-accent" />
              保存当前状态
            </h3>

            <div className="mb-4 p-3 bg-console-bg rounded-lg">
              <div className="text-xs text-console-muted mb-2">当前状态</div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-console-text">
                  <span className="font-mono text-console-accent">
                    {channels.filter((v) => v > 0).length}
                  </span>{' '}
                  活跃通道
                </span>
                <span className="text-console-text">
                  最大值:{' '}
                  <span className="font-mono text-console-accent">
                    {Math.max(...channels)}
                  </span>
                </span>
              </div>
            </div>

            <input
              type="text"
              value={newSceneName}
              onChange={(e) => setNewSceneName(e.target.value)}
              placeholder="输入场景名称..."
              autoFocus
              className="w-full px-4 py-3 bg-console-bg border border-console-border rounded-lg text-console-text placeholder:text-console-muted focus:outline-none focus:border-console-accent mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateScene()}
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewSceneName('');
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-console-border text-console-text hover:bg-console-border/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateScene}
                disabled={!newSceneName.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-console-accent text-black font-medium hover:bg-console-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
