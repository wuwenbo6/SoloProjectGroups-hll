import { useCallback, useEffect } from 'react';
import { Target, Plus, Trash2, ChevronDown, ChevronRight, Calculator, Layers } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useMeasurement } from '../hooks/useMeasurement';

const formatArea = (mm2: number): string => {
  if (mm2 >= 100) {
    return `${(mm2 / 100).toFixed(2)} cm²`;
  }
  return `${mm2.toFixed(2)} mm²`;
};

const formatVolume = (mm3: number): string => {
  if (mm3 >= 1000) {
    return `${(mm3 / 1000).toFixed(2)} cm³`;
  }
  return `${mm3.toFixed(2)} mm³`;
};

export const RoiPanel = () => {
  const {
    series,
    rois,
    activeRoiId,
    currentSliceIndex,
    setActiveRoi,
    removeRoi,
    updateRoi,
    addRoi,
  } = useAppStore();

  const { updateRoiMeasurements } = useMeasurement();

  useEffect(() => {
    rois.forEach((roi) => {
      if (roi.contours.length > 0 && (roi.areaMm2 === undefined || roi.volumeMm3 === undefined)) {
        updateRoiMeasurements(roi.id);
      }
    });
  }, [rois.length, updateRoiMeasurements]);

  const handleAddRoi = useCallback(() => {
    addRoi();
  }, [addRoi]);

  const handleRenameRoi = useCallback(
    (roiId: string, newName: string) => {
      updateRoi(roiId, { name: newName });
    },
    [updateRoi]
  );

  const handleRemoveRoi = useCallback(
    (roiId: string) => {
      if (confirm('确定要删除这个 ROI 吗？')) {
        removeRoi(roiId);
      }
    },
    [removeRoi]
  );

  const handleRecalculate = useCallback(
    (roiId: string) => {
      updateRoiMeasurements(roiId);
    },
    [updateRoiMeasurements]
  );

  if (!series) {
    return (
      <div className="w-72 bg-slate-900/80 border-l border-slate-700/50 p-4 flex flex-col items-center justify-center text-slate-500">
        <Target size={48} className="mb-4 opacity-50" />
        <p className="text-center text-sm">加载 DICOM 后</p>
        <p className="text-center text-sm">可在此管理 ROI</p>
      </div>
    );
  }

  return (
    <div className="w-72 bg-slate-900/80 border-l border-slate-700/50 flex flex-col">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
          <Target size={14} />
          感兴趣区 (ROI)
        </h3>
        <button
          onClick={handleAddRoi}
          className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          title="新建 ROI"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {rois.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Target size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无 ROI</p>
            <p className="text-xs mt-1">选择"勾画"工具开始绘制</p>
          </div>
        ) : (
          rois.map((roi) => {
            const hasContourOnCurrentSlice = roi.contours.some(
              (c) => c.sliceIndex === currentSliceIndex
            );
            const isActive = activeRoiId === roi.id;

            return (
              <div
                key={roi.id}
                className={`rounded-lg border transition-all ${
                  isActive
                    ? 'border-cyan-400/50 bg-slate-800/80'
                    : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600'
                }`}
              >
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer"
                  onClick={() => setActiveRoi(isActive ? null : roi.id)}
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white/20"
                    style={{ backgroundColor: roi.color }}
                  />
                  <input
                    type="text"
                    value={roi.name}
                    onChange={(e) => handleRenameRoi(roi.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm text-slate-200 font-medium outline-none border-b border-transparent focus:border-cyan-400 transition-colors"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.5 bg-slate-700/50 rounded">
                      <Layers size={10} className="inline mr-1" />
                      {roi.contours.length}
                    </span>
                    {isActive ? (
                      <ChevronDown size={14} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                  </div>
                </div>

                {isActive && (
                  <div className="px-3 pb-3 border-t border-slate-700/50 pt-3 space-y-2">
                    {hasContourOnCurrentSlice && (
                      <div className="text-xs text-emerald-400 flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        当前切片已有轮廓
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-700/30 rounded p-2">
                        <div className="text-slate-500">总面积</div>
                        <div className="text-cyan-300 font-mono font-semibold mt-0.5">
                          {roi.areaMm2 !== undefined ? formatArea(roi.areaMm2) : '-'}
                        </div>
                      </div>
                      <div className="bg-slate-700/30 rounded p-2">
                        <div className="text-slate-500">体积</div>
                        <div className="text-cyan-300 font-mono font-semibold mt-0.5">
                          {roi.volumeMm3 !== undefined ? formatVolume(roi.volumeMm3) : '-'}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRecalculate(roi.id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 text-xs transition-colors"
                      >
                        <Calculator size={12} />
                        重新计算
                      </button>
                      <button
                        onClick={() => handleRemoveRoi(roi.id)}
                        className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        title="删除 ROI"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="text-[10px] text-slate-500">
                      轮廓分布在 {roi.contours.length} 个切片上
                      {roi.contours.length > 0 && (
                        <span className="block mt-1">
                          切片: {roi.contours.map((c) => c.sliceIndex + 1).sort((a, b) => a - b).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {rois.length > 0 && (
        <div className="p-3 border-t border-slate-700/50 bg-slate-800/50">
          <div className="text-xs text-slate-400 mb-2">总计</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-xs">
              <span className="text-slate-500">ROI 数量:</span>
              <span className="ml-2 text-cyan-300 font-mono font-semibold">{rois.length}</span>
            </div>
            <div className="text-xs">
              <span className="text-slate-500">总轮廓:</span>
              <span className="ml-2 text-cyan-300 font-mono font-semibold">
                {rois.reduce((acc, r) => acc + r.contours.length, 0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
