import { useEffect, useRef, useCallback, useState } from 'react';
import { PathTracingRenderer } from '../lib/PathTracingRenderer';
import { useSceneStore } from '../store/useSceneStore';
import { Loader2, AlertTriangle } from 'lucide-react';

interface Viewport3DProps {
  onRendererReady?: (renderer: PathTracingRenderer) => void;
}

export function Viewport3D({ onRendererReady }: Viewport3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PathTracingRenderer | null>(null);
  const { currentScene, updateMaterial, updateCamera, setCurrentScene, setError, setLoading } = useSceneStore();
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleResize = useCallback(() => {
    if (!rendererRef.current || !canvasRef.current) return;
    
    const container = canvasRef.current.parentElement;
    if (!container) return;
    
    rendererRef.current.setSize(container.clientWidth, container.clientHeight);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const container = canvasRef.current.parentElement;
    const width = container?.clientWidth || 800;
    const height = container?.clientHeight || 600;

    const renderer = new PathTracingRenderer({
      canvas: canvasRef.current,
      width,
      height,
    });

    rendererRef.current = renderer;
    onRendererReady?.(renderer);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [onRendererReady, handleResize]);

  useEffect(() => {
    if (!rendererRef.current || !currentScene) return;

    const renderer = rendererRef.current;

    if (currentScene.modelPath) {
      setLoadProgress(0);
      setLoadError(null);
      setLoading(true);

      renderer.loadGLTF(
        currentScene.modelPath,
        (progress) => {
          setLoadProgress(progress);
        }
      ).then((materials) => {
        setCurrentScene({
          ...currentScene,
          materials,
        });
        setLoadProgress(null);
        setLoading(false);
      }).catch((err) => {
        const errorMsg = `模型加载失败: ${err.message || '未知错误'}`;
        setLoadError(errorMsg);
        setError(errorMsg);
        setLoadProgress(null);
        setLoading(false);
      });
    } else {
      setLoadProgress(null);
      setLoadError(null);
    }

    renderer.setCameraState(currentScene.camera);
  }, [currentScene?.id, currentScene?.modelPath]);

  useEffect(() => {
    if (!rendererRef.current || !currentScene) return;
    
    currentScene.materials.forEach((mat) => {
      rendererRef.current?.updateMaterial(mat.id, mat);
    });
  }, [currentScene?.materials]);

  useEffect(() => {
    if (!rendererRef.current) return;
    
    const interval = setInterval(() => {
      if (rendererRef.current) {
        const cameraState = rendererRef.current.getCameraState();
        updateCamera(cameraState);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [updateCamera]);

  return (
    <div className="relative w-full h-full bg-[#0a0a0f] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      
      {loadProgress !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
          <div className="text-white text-sm mb-3">加载模型中...</div>
          <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-orange-500 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <div className="text-cyan-400 text-xs mt-2 font-mono">
            {loadProgress.toFixed(1)}%
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <AlertTriangle className="w-12 h-12 text-orange-500 mb-4" />
          <div className="text-white text-sm mb-2">模型加载出错</div>
          <div className="text-orange-400 text-xs text-center max-w-xs px-4">
            {loadError}
          </div>
          <div className="text-gray-500 text-xs mt-4">
            提示: 请确保模型文件完整且包含所有纹理资源
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 text-xs text-cyan-400/70 font-mono space-y-1">
        <div>鼠标拖拽: 旋转</div>
        <div>滚轮: 缩放</div>
      </div>
      
      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg border border-cyan-500/30">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-cyan-400 font-mono">PBR 渲染器</span>
      </div>
    </div>
  );
}
