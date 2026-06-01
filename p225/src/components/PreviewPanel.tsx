import { useState } from 'react';
import { Maximize2, Minimize2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { StagePreview } from './StagePreview';

interface PreviewPanelProps {
  channels: number[];
  grandMaster: number;
  blackout: boolean;
}

export function PreviewPanel({
  channels,
  grandMaster,
  blackout,
}: PreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-console-panel border border-console-border rounded-lg text-console-muted hover:text-console-accent hover:border-console-accent transition-all"
      >
        <Eye size={20} />
      </button>
    );
  }

  const containerClass = expanded
    ? 'fixed inset-4 z-50'
    : 'absolute bottom-4 right-4 w-80 h-56';

  return (
    <div
      className={`${containerClass} bg-console-panel border border-console-border rounded-lg overflow-hidden shadow-2xl transition-all duration-300`}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-console-bg border-b border-console-border">
        <span className="text-sm font-medium text-console-text flex items-center gap-2">
          <Eye size={14} className="text-console-accent" />
          3D 灯光预览
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded text-console-muted hover:text-console-text hover:bg-console-border transition-colors"
            title={expanded ? '缩小' : '放大'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={() => setVisible(false)}
            className="p-1.5 rounded text-console-muted hover:text-console-warning hover:bg-console-border transition-colors"
            title="隐藏"
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      <div className="relative" style={{ height: 'calc(100% - 38px)' }}>
        <StagePreview
          channels={channels}
          grandMaster={grandMaster}
          blackout={blackout}
        />

        {blackout && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-console-warning font-bold text-lg animate-pulse">
              BLACKOUT
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
