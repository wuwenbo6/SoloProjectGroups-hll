import React from 'react';
import { MapPin, Download, Eye, EyeOff } from 'lucide-react';

interface ToolbarProps {
  showPoints: boolean;
  onTogglePoints: () => void;
  onExportKML: () => void;
  isExporting: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  showPoints,
  onTogglePoints,
  onExportKML,
  isExporting,
}) => {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 card p-2 z-[1000] flex items-center gap-2">
      <button
        onClick={onTogglePoints}
        className={`flex items-center gap-2 px-4 py-2 rounded transition-all ${
          showPoints
            ? 'bg-accent text-primary'
            : 'bg-transparent text-gray-300 hover:bg-gray-700/50'
        }`}
        title={showPoints ? '隐藏路测点' : '显示路测点'}
      >
        {showPoints ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">路测点</span>
      </button>
      <div className="w-px h-6 bg-gray-600" />
      <button
        onClick={onExportKML}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 rounded bg-transparent text-gray-300 hover:bg-gray-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="导出 KML"
      >
        <Download className="w-4 h-4" />
        <span className="text-sm font-medium">
          {isExporting ? '导出中...' : 'KML 导出'}
        </span>
      </button>
    </div>
  );
};
