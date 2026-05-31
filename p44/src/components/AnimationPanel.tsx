import { useState, useEffect } from 'react';
import { Play, Pause, Square, SkipForward, SkipBack, Film, ChevronDown, ChevronUp } from 'lucide-react';
import { PathTracingRenderer, AnimationInfo } from '../lib/PathTracingRenderer';

interface AnimationPanelProps {
  renderer: PathTracingRenderer | null;
}

export function AnimationPanel({ renderer }: AnimationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeScale, setTimeScale] = useState(1);

  useEffect(() => {
    if (!renderer) return;

    const interval = setInterval(() => {
      if (isPlaying) {
        setProgress(renderer.getAnimationProgress());
      }
    }, 50);

    return () => clearInterval(interval);
  }, [renderer, isPlaying]);

  useEffect(() => {
    if (!renderer) return;
    setAnimations(renderer.getAnimations());
  }, [renderer, renderer?.['model']]);

  const handlePlay = () => {
    if (!renderer || animations.length === 0) return;
    
    if (isPlaying) {
      renderer.pauseAnimation();
      setIsPlaying(false);
    } else {
      if (progress > 0) {
        renderer.resumeAnimation();
      } else {
        renderer.playAnimation(selectedAnimation);
      }
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (!renderer) return;
    renderer.stopAnimation();
    setIsPlaying(false);
    setProgress(0);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!renderer) return;
    const newProgress = parseFloat(e.target.value);
    setProgress(newProgress);
    renderer.setAnimationProgress(newProgress);
  };

  const handleTimeScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!renderer) return;
    const newScale = parseFloat(e.target.value);
    setTimeScale(newScale);
    renderer.setAnimationTimeScale(newScale);
  };

  const handleAnimationSelect = (index: number) => {
    if (!renderer) return;
    setSelectedAnimation(index);
    setProgress(0);
    setIsPlaying(false);
    renderer.stopAnimation();
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-96 bg-[#0d0d14]/95 backdrop-blur-sm border border-cyan-500/20 rounded-xl shadow-2xl overflow-hidden">
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">动画控制</span>
          {animations.length > 0 && (
            <span className="text-xs text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded">
              {animations.length} 个动画
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {animations.length === 0 ? (
            <div className="text-center py-4">
              <Film className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500">当前模型无动画</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-2">动画列表</label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {animations.map((anim, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnimationSelect(index)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedAnimation === index
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                          : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="truncate">{anim.name}</span>
                        <span className="text-xs text-gray-500">{anim.duration.toFixed(1)}s</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>进度</span>
                  <span className="font-mono">{(progress * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={progress}
                  onChange={handleProgressChange}
                  className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setProgress(Math.max(0, progress - 0.1))}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="后退10%"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePlay}
                  className="p-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-full transition-all shadow-lg shadow-cyan-500/30"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleStop}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="停止"
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setProgress(Math.min(1, progress + 0.1))}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="前进10%"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>速度</span>
                  <span className="font-mono text-cyan-400">{timeScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={timeScale}
                  onChange={handleTimeScaleChange}
                  className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
