import { Play, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Scene } from '../../shared/types';

interface SceneQuickBarProps {
  scenes: Scene[];
  onLoadScene: (scene: Scene) => void;
  onSaveCurrent: () => void;
}

export function SceneQuickBar({
  scenes,
  onLoadScene,
  onSaveCurrent,
}: SceneQuickBarProps) {
  const nonZeroChannels = (scene: Scene) =>
    scene.channels.filter((v) => v > 0).length;

  return (
    <div className="flex items-center gap-2 p-3 bg-console-panel border-b border-console-border overflow-x-auto">
      <div className="text-xs text-console-muted uppercase tracking-wider font-medium mr-2 flex-shrink-0">
        场景:
      </div>

      <button
        onClick={onSaveCurrent}
        className="flex-shrink-0 px-3 py-1.5 rounded text-sm bg-console-accent/20 text-console-accent border border-console-accent/30 hover:bg-console-accent/30 transition-colors flex items-center gap-1.5"
      >
        <Plus size={14} />
        保存当前
      </button>

      {scenes.slice(0, 8).map((scene) => (
        <button
          key={scene.id}
          onClick={() => onLoadScene(scene)}
          className="flex-shrink-0 px-3 py-1.5 rounded text-sm bg-console-bg border border-console-border text-console-text hover:border-console-accent hover:text-console-accent transition-colors flex items-center gap-2 group"
        >
          <Play size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-console-active" />
          <span className="truncate max-w-[120px]">{scene.name}</span>
          <span className="text-xs text-console-muted">
            {nonZeroChannels(scene)}ch
          </span>
        </button>
      ))}

      <Link
        to="/scenes"
        className="flex-shrink-0 ml-auto px-3 py-1.5 rounded text-sm text-console-muted hover:text-console-accent hover:bg-console-border transition-colors"
      >
        管理场景 →
      </Link>
    </div>
  );
}
