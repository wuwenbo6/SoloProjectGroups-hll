import { useState, useRef } from 'react';
import { FolderOpen, Upload, Save, Trash2, FileCode, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';
import { api } from '../services/api';
import type { SceneMetadata } from '../../shared/types';

export function SceneManager() {
  const { currentScene, scenes, setCurrentScene, setScenes, setLoading, setError } = useSceneStore();
  const [expanded, setExpanded] = useState(true);
  const [showSceneList, setShowSceneList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const fileArray = Array.from(files);
      const result = await api.upload.files(fileArray);
      
      if (result.success && result.data) {
        setCurrentScene(result.data.scene);
        const listResult = await api.scenes.list();
        if (listResult.success && listResult.data) {
          setScenes(listResult.data.scenes);
        }
      } else {
        setError(result.error || '上传失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadScene = async (scene: SceneMetadata) => {
    setCurrentScene(scene);
    setShowSceneList(false);
  };

  const handleSaveScene = async () => {
    if (!currentScene) return;
    
    setLoading(true);
    try {
      const result = await api.scenes.update(currentScene.id, {
        materials: currentScene.materials,
        camera: currentScene.camera,
      });
      
      if (result.success) {
        const listResult = await api.scenes.list();
        if (listResult.success && listResult.data) {
          setScenes(listResult.data.scenes);
        }
      } else {
        setError(result.error || '保存失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!confirm('确定要删除这个场景吗？')) return;
    
    try {
      const result = await api.scenes.delete(sceneId);
      if (result.success) {
        if (currentScene?.id === sceneId) {
          setCurrentScene(null);
        }
        const listResult = await api.scenes.list();
        if (listResult.success && listResult.data) {
          setScenes(listResult.data.scenes);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNewScene = async () => {
    const name = prompt('输入场景名称:', '新场景');
    if (!name) return;

    setLoading(true);
    try {
      const result = await api.scenes.create(name);
      if (result.success && result.data) {
        setCurrentScene(result.data);
        const listResult = await api.scenes.list();
        if (listResult.success && listResult.data) {
          setScenes(listResult.data.scenes);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-72 bg-[#0d0d14] border-l border-cyan-500/20 flex flex-col h-full">
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">场景管理</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs text-gray-400 font-medium">当前场景</div>
            <div className="px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <div className="text-sm text-white truncate">
                {currentScene?.name || '未加载场景'}
              </div>
              {currentScene && (
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(currentScene.updatedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleNewScene}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                上传
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".gltf,.glb,.bin,.png,.jpg,.jpeg"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={handleSaveScene}
                disabled={!currentScene}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                保存
              </button>
              <button
                onClick={() => setShowSceneList(!showSceneList)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-lg transition-colors"
              >
                <FileCode className="w-3.5 h-3.5" />
                列表
              </button>
            </div>
          </div>

          {showSceneList && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 font-medium">场景列表</div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {scenes.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-4">暂无保存的场景</div>
                ) : (
                  scenes.map((scene) => (
                    <div
                      key={scene.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        currentScene?.id === scene.id
                          ? 'bg-cyan-500/20 border border-cyan-500/50'
                          : 'bg-gray-800/50 hover:bg-gray-800'
                      }`}
                    >
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => handleLoadScene(scene)}
                      >
                        <div className="text-sm text-white truncate">{scene.name}</div>
                        <div className="text-xs text-gray-500">
                          {scene.modelPath ? '含模型' : '空场景'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-cyan-500/10">
            <div className="text-xs text-gray-500">
              支持格式: GLTF, GLB, PNG, JPG
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
