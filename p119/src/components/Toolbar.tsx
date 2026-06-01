import { useCallback } from 'react';
import {
  FolderOpen,
  Palette,
  PenTool,
  Move,
  ZoomIn,
  SlidersHorizontal,
  Download,
  RotateCcw,
  FileOutput,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useDicomLoader } from '../hooks/useDicomLoader';
import { useMeasurement } from '../hooks/useMeasurement';
import type { ColormapType, ToolType } from '../types/dicom';

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const ToolButton = ({ icon, label, active, onClick, disabled }: ToolButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center gap-1 px-3 py-2 rounded border transition-all duration-200 ${
      active
        ? 'border-cyan-400 bg-cyan-400/20 text-cyan-300 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
        : 'border-slate-600/50 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    title={label}
  >
    {icon}
    <span className="text-[10px] font-mono">{label}</span>
  </button>
);

export const Toolbar = () => {
  const {
    series,
    colormap,
    activeTool,
    setColormap,
    setActiveTool,
    resetView,
    loading,
  } = useAppStore();

  const { selectAndLoadFolder } = useDicomLoader();
  const { exportToRtstruct } = useMeasurement();

  const colormaps: { value: ColormapType; label: string; colors: string[] }[] = [
    { value: 'gray', label: '灰度', colors: ['#000', '#888', '#fff'] },
    { value: 'rainbow', label: '彩虹', colors: ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff'] },
    { value: 'hotmetal', label: '热金属', colors: ['#000', '#f00', '#ff0', '#fff'] },
  ];

  const tools: { value: ToolType; label: string; icon: React.ReactNode }[] = [
    { value: 'pan', label: '平移', icon: <Move size={18} /> },
    { value: 'zoom', label: '缩放', icon: <ZoomIn size={18} /> },
    { value: 'window', label: '窗宽', icon: <SlidersHorizontal size={18} /> },
    { value: 'polygon', label: '勾画', icon: <PenTool size={18} /> },
  ];

  const handleExport = useCallback(async () => {
    const result = await exportToRtstruct();
    if (result) {
      console.log('Exported to:', result);
    }
  }, [exportToRtstruct]);

  return (
    <div className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-700/50 px-4 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
          <FileOutput size={18} className="text-white" />
        </div>
        <span className="font-bold text-white tracking-wide">DICOM 工作站</span>
      </div>

      <div className="h-8 w-px bg-slate-700" />

      <button
        onClick={selectAndLoadFolder}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-all duration-200 font-medium text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/40"
      >
        <FolderOpen size={16} />
        加载 DICOM
      </button>

      <div className="h-8 w-px bg-slate-700" />

      <div className="flex items-center gap-2">
        <Palette size={16} className="text-slate-400" />
        <div className="flex gap-1">
          {colormaps.map((cm) => (
            <button
              key={cm.value}
              onClick={() => setColormap(cm.value)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all ${
                colormap === cm.value
                  ? 'border-cyan-400 bg-cyan-400/20 text-cyan-300'
                  : 'border-slate-600/50 text-slate-400 hover:border-cyan-400/50'
              }`}
            >
              <div className="flex">
                {cm.colors.map((c, i) => (
                  <div
                    key={i}
                    className="w-3 h-3"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {cm.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-8 w-px bg-slate-700" />

      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <ToolButton
            key={tool.value}
            icon={tool.icon}
            label={tool.label}
            active={activeTool === tool.value}
            onClick={() => setActiveTool(activeTool === tool.value ? 'none' : tool.value)}
            disabled={!series}
          />
        ))}
      </div>

      <div className="h-8 w-px bg-slate-700" />

      <button
        onClick={resetView}
        disabled={!series}
        className="flex items-center gap-1 px-3 py-2 rounded border border-slate-600/50 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title="重置视图"
      >
        <RotateCcw size={16} />
        重置
      </button>

      <div className="flex-1" />

      <button
        onClick={handleExport}
        disabled={!series || loading}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-all duration-200 font-medium text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={16} />
        导出 RTSTRUCT
      </button>
    </div>
  );
};
