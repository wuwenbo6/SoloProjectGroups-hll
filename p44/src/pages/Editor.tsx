import { useState, useEffect } from 'react';
import { Toolbar } from '../components/Toolbar';
import { MaterialEditor } from '../components/MaterialEditor';
import { SceneManager } from '../components/SceneManager';
import { Viewport3D } from '../components/Viewport3D';
import { ExportPanel } from '../components/ExportPanel';
import { AnimationPanel } from '../components/AnimationPanel';
import { PathTracingRenderer } from '../lib/PathTracingRenderer';
import { useSceneStore } from '../store/useSceneStore';
import { api } from '../services/api';

export function Editor() {
  const [renderer, setRenderer] = useState<PathTracingRenderer | null>(null);
  const { setScenes } = useSceneStore();

  useEffect(() => {
    const loadScenes = async () => {
      const result = await api.scenes.list();
      if (result.success && result.data) {
        setScenes(result.data.scenes);
      }
    };
    loadScenes();
  }, [setScenes]);

  const handleRendererReady = (r: PathTracingRenderer) => {
    setRenderer(r);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      <Toolbar />
      
      <div className="flex-1 flex overflow-hidden">
        <MaterialEditor />
        
        <div className="flex-1 relative">
          <Viewport3D onRendererReady={handleRendererReady} />
          <ExportPanel renderer={renderer} />
          <AnimationPanel renderer={renderer} />
        </div>
        
        <SceneManager />
      </div>
    </div>
  );
}
