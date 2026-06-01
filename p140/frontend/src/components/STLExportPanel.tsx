import { useState } from 'react';
import { useVolumeStore } from '../store/useVolumeStore';
import { exportSTL, getMeshPreview } from '../services/advancedApi';
import { MeshInfo } from '../types';

export default function STLExportPanel() {
  const { sessionId, volume } = useVolumeStore();
  const [threshold, setThreshold] = useState(128);
  const [smooth, setSmooth] = useState(true);
  const [simplify, setSimplify] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handlePreview = async () => {
    if (!sessionId) return;

    setLoadingPreview(true);
    try {
      const info = await getMeshPreview(sessionId, threshold);
      setMeshInfo(info);
    } catch (error) {
      console.error('Mesh preview failed:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExportSTL = async () => {
    if (!sessionId) return;

    setExporting(true);
    try {
      const result = await exportSTL(sessionId, {
        threshold,
        smooth,
        simplify,
        format: 'stl'
      });

      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.click();
    } catch (error) {
      console.error('STL export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPLY = async () => {
    if (!sessionId) return;

    setExporting(true);
    try {
      const result = await exportSTL(sessionId, {
        threshold,
        smooth,
        simplify,
        format: 'ply'
      });

      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.click();
    } catch (error) {
      console.error('PLY export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  if (!volume.loaded) {
    return (
      <div className="p-4 text-slate-400 text-sm">
        请先加载体数据
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-white font-medium text-sm">STL 3D打印导出</h3>

      <div>
        <label className="block text-slate-400 text-xs mb-1">
          表面阈值: {threshold}
        </label>
        <input
          type="range"
          min="1"
          max="254"
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-slate-300 text-xs">
          <input
            type="checkbox"
            checked={smooth}
            onChange={(e) => setSmooth(e.target.checked)}
            className="rounded"
          />
          平滑网格
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-xs">
          <input
            type="checkbox"
            checked={simplify}
            onChange={(e) => setSimplify(e.target.checked)}
            className="rounded"
          />
          简化面数
        </label>
      </div>

      <button
        onClick={handlePreview}
        disabled={loadingPreview || exporting}
        className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded disabled:opacity-50 transition-colors"
      >
        {loadingPreview ? '计算中...' : '预览网格信息'}
      </button>

      {meshInfo && (
        <div className="bg-slate-800 rounded p-3 text-xs space-y-1">
          <div className="flex justify-between text-slate-300">
            <span>顶点数:</span>
            <span>{meshInfo.numVertices.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>三角面片:</span>
            <span>{meshInfo.numFaces.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>表面积:</span>
            <span>{meshInfo.surfaceArea.toFixed(2)} mm²</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>体积:</span>
            <span>{meshInfo.volume.toFixed(2)} mm³</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleExportSTL}
          disabled={exporting}
          className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded disabled:opacity-50 transition-colors"
        >
          {exporting ? '导出中...' : '导出 STL'}
        </button>
        <button
          onClick={handleExportPLY}
          disabled={exporting}
          className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded disabled:opacity-50 transition-colors"
        >
          导出 PLY
        </button>
      </div>
    </div>
  );
}
