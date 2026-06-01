import { useAppStore } from '../store/useAppStore';
import { useDicomLoader } from '../hooks/useDicomLoader';
import { Cpu, HardDrive, Activity } from 'lucide-react';

export const StatusBar = () => {
  const {
    series,
    currentSliceIndex,
    windowCenter,
    windowWidth,
    colormap,
    activeTool,
    pythonServerPort,
    isDrawing,
    drawingPoints,
  } = useAppStore();

  const { pixelMinMax, isPythonReady } = useDicomLoader();

  if (!series) {
    return (
      <div className="h-6 bg-slate-900/90 backdrop-blur border-t border-slate-700/50 px-4 flex items-center justify-between text-xs text-slate-500">
        <span>DICOM 医学影像工作站 v1.0</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Cpu size={12} className={isPythonReady ? 'text-emerald-400' : 'text-amber-400'} />
            Python 后端: {isPythonReady ? `端口 ${pythonServerPort}` : '启动中...'}
          </span>
        </div>
      </div>
    );
  }

  const currentSlice = series.slices[currentSliceIndex];
  const toolLabels: Record<string, string> = {
    none: '无',
    pan: '平移',
    zoom: '缩放',
    window: '窗宽窗位',
    polygon: '多边形勾画',
  };

  const colormapLabels: Record<string, string> = {
    gray: '灰度',
    rainbow: '彩虹',
    hotmetal: '热金属',
  };

  return (
    <div className="h-6 bg-slate-900/90 backdrop-blur border-t border-slate-700/50 px-4 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4 text-slate-400">
        <span className="flex items-center gap-1">
          <HardDrive size={12} />
          {series.patientName}
        </span>
        <span className="text-slate-600">|</span>
        <span>
          {series.modality} · {series.seriesDescription}
        </span>
        <span className="text-slate-600">|</span>
        <span>
          位置: {currentSlice?.sliceLocation.toFixed(2)} mm
        </span>
      </div>

      <div className="flex items-center gap-4">
        {isDrawing && (
          <span className="flex items-center gap-1 text-cyan-400 animate-pulse">
            <Activity size={12} />
            勾画中 - {drawingPoints.length} 个顶点
          </span>
        )}
        
        <span className="text-slate-500">
          工具: <span className="text-slate-300 font-mono">{toolLabels[activeTool]}</span>
        </span>
        
        <span className="text-slate-500">
          伪彩: <span className="text-slate-300 font-mono">{colormapLabels[colormap]}</span>
        </span>
        
        <span className="text-slate-500">
          窗: <span className="text-cyan-400 font-mono">{windowWidth.toFixed(0)}</span>
          <span className="text-slate-600"> / </span>
          <span className="text-cyan-400 font-mono">{windowCenter.toFixed(0)}</span>
        </span>
        
        <span className="text-slate-500">
          值范围: <span className="text-slate-300 font-mono">{pixelMinMax[0].toFixed(0)}</span>
          <span className="text-slate-600"> ~ </span>
          <span className="text-slate-300 font-mono">{pixelMinMax[1].toFixed(0)}</span>
        </span>
        
        <span className="text-slate-600">|</span>
        
        <span className="flex items-center gap-1">
          <Cpu size={12} className={isPythonReady ? 'text-emerald-400' : 'text-amber-400'} />
          <span className={isPythonReady ? 'text-emerald-400' : 'text-amber-400'}>
            {isPythonReady ? 'Python 就绪' : 'Python 启动中'}
          </span>
        </span>
      </div>
    </div>
  );
};
