import { useState, useEffect } from 'react';
import { User, Calendar, FileText, Layers } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getThumbnail } from '../utils/api';

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-300 font-mono text-right max-w-[60%] truncate">{value || '-'}</span>
  </div>
);

export const SeriesPanel = () => {
  const { series, currentSliceIndex, setCurrentSliceIndex } = useAppStore();
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loadingThumbs, setLoadingThumbs] = useState(false);

  useEffect(() => {
    if (series && series.slices.length > 0) {
      setLoadingThumbs(true);
      const loadThumbnails = async () => {
        const thumbs: Record<number, string> = {};
        const step = Math.max(1, Math.floor(series.slices.length / 20));
        
        for (let i = 0; i < series.slices.length; i += step) {
          try {
            const result = await getThumbnail(i);
            thumbs[i] = result.imageData;
          } catch (e) {
            console.error(`Failed to load thumbnail ${i}:`, e);
          }
        }
        setThumbnails(thumbs);
        setLoadingThumbs(false);
      };
      loadThumbnails();
    } else {
      setThumbnails({});
    }
  }, [series]);

  if (!series) {
    return (
      <div className="w-64 bg-slate-900/80 border-r border-slate-700/50 p-4 flex flex-col items-center justify-center text-slate-500">
        <Layers size={48} className="mb-4 opacity-50" />
        <p className="text-center text-sm">请加载 DICOM 序列</p>
        <p className="text-center text-xs mt-2 text-slate-600">
          点击工具栏"加载 DICOM"按钮
        </p>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900/80 border-r border-slate-700/50 flex flex-col">
      <div className="p-4 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
          <User size={14} />
          患者信息
        </h3>
        <div className="space-y-2">
          <InfoRow label="姓名" value={series.patientName} />
          <InfoRow label="ID" value={series.patientId} />
          <InfoRow label="检查日期" value={series.studyDate} />
        </div>
      </div>

      <div className="p-4 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
          <FileText size={14} />
          序列信息
        </h3>
        <div className="space-y-2">
          <InfoRow label="描述" value={series.seriesDescription} />
          <InfoRow label="模态" value={series.modality} />
          <InfoRow label="切片数" value={series.slices.length.toString()} />
          <InfoRow label="分辨率" value={`${series.cols} × ${series.rows}`} />
          <InfoRow label="像素间距" value={`${series.pixelSpacing[0].toFixed(2)}mm`} />
          <InfoRow label="层厚" value={`${series.sliceThickness.toFixed(2)}mm`} />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <h3 className="text-sm font-semibold text-cyan-400 p-4 pb-2 flex items-center gap-2">
          <Calendar size={14} />
          切片导航
          <span className="ml-auto text-slate-500 text-xs">
            {currentSliceIndex + 1} / {series.slices.length}
          </span>
        </h3>
        
        <div className="flex-1 overflow-y-auto p-2">
          {loadingThumbs ? (
            <div className="text-center text-slate-500 text-sm py-4">
              加载缩略图中...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(thumbnails)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([index, data]) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSliceIndex(Number(index))}
                    className={`aspect-square rounded overflow-hidden border transition-all ${
                      currentSliceIndex === Number(index)
                        ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                        : 'border-slate-700 hover:border-cyan-400/50'
                    }`}
                    title={`切片 ${Number(index) + 1}`}
                  >
                    <img
                      src={`data:image/png;base64,${data}`}
                      alt={`切片 ${Number(index) + 1}`}
                      className="w-full h-full object-contain bg-black"
                    />
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-700/50">
          <input
            type="range"
            min="0"
            max={series.slices.length - 1}
            value={currentSliceIndex}
            onChange={(e) => setCurrentSliceIndex(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1</span>
            <span className="font-mono text-cyan-400">{currentSliceIndex + 1}</span>
            <span>{series.slices.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
