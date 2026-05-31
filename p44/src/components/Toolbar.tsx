import { Camera, RotateCcw, Sun, Moon, Info } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';

export function Toolbar() {
  const { currentScene, isLoading, error } = useSceneStore();

  return (
    <div className="h-14 bg-[#0d0d14] border-b border-cyan-500/20 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-orange-500 flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold tracking-wide">RayTracer Studio</span>
        </div>
        
        <div className="h-6 w-px bg-gray-700 mx-2" />
        
        <div className="flex items-center gap-1">
          <button className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors">
            <Sun className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors">
            <Moon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-cyan-400">
            <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            处理中...
          </div>
        )}
        
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-lg">
            {error}
          </div>
        )}

        {currentScene && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Info className="w-3.5 h-3.5" />
            <span>材质: {currentScene.materials.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
