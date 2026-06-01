import { useState } from 'react';
import { useVolumeStore } from '../store/useVolumeStore';
import { uploadCTForFusion, uploadPETForFusion, getFusionSlice } from '../services/advancedApi';

export default function FusionPanel() {
  const { sessionId } = useVolumeStore();
  const [ctSessionId, setCtSessionId] = useState<string | null>(null);
  const [petSessionId, setPetSessionId] = useState<string | null>(null);
  const [fusionEnabled, setFusionEnabled] = useState(false);
  const [blendMode, setBlendMode] = useState<'alpha' | 'checkerboard' | 'color_overlay'>('color_overlay');
  const [alpha, setAlpha] = useState(0.5);
  const [uploading, setUploading] = useState<'ct' | 'pet' | null>(null);
  const [fusionSlice, setFusionSlice] = useState<{
    data: Uint8Array;
    width: number;
    height: number;
    channels: number;
  } | null>(null);

  const handleCTUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading('ct');
    try {
      const result = await uploadCTForFusion(files);
      setCtSessionId(result.sessionId);
    } catch (error) {
      console.error('CT upload failed:', error);
    } finally {
      setUploading(null);
    }
  };

  const handlePETUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading('pet');
    try {
      const result = await uploadPETForFusion(files);
      setPetSessionId(result.sessionId);
    } catch (error) {
      console.error('PET upload failed:', error);
    } finally {
      setUploading(null);
    }
  };

  const handlePreviewFusion = async () => {
    if (!ctSessionId || !petSessionId) return;

    try {
      const slice = await getFusionSlice(
        ctSessionId,
        petSessionId,
        'axial',
        32,
        { blendMode, alpha }
      );
      setFusionSlice(slice);
    } catch (error) {
      console.error('Fusion preview failed:', error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-white font-medium text-sm">PET/CT 融合</h3>

      <div>
        <label className="block text-slate-400 text-xs mb-2">CT 数据</label>
        <label className="flex items-center justify-center w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded cursor-pointer transition-colors">
          <input
            type="file"
            multiple
            accept=".dcm"
            onChange={handleCTUpload}
            className="hidden"
            disabled={uploading === 'ct'}
          />
          {uploading === 'ct' ? '上传中...' : ctSessionId ? '✓ 已上传 CT' : '上传 CT DICOM'}
        </label>
      </div>

      <div>
        <label className="block text-slate-400 text-xs mb-2">PET 数据</label>
        <label className="flex items-center justify-center w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded cursor-pointer transition-colors">
          <input
            type="file"
            multiple
            accept=".dcm"
            onChange={handlePETUpload}
            className="hidden"
            disabled={uploading === 'pet'}
          />
          {uploading === 'pet' ? '上传中...' : petSessionId ? '✓ 已上传 PET' : '上传 PET DICOM'}
        </label>
      </div>

      <div className="border-t border-slate-700 pt-4">
        <label className="flex items-center gap-2 text-slate-300 text-xs mb-3">
          <input
            type="checkbox"
            checked={fusionEnabled}
            onChange={(e) => setFusionEnabled(e.target.checked)}
            disabled={!ctSessionId || !petSessionId}
            className="rounded"
          />
          启用融合显示
        </label>

        <div className="space-y-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1">融合模式</label>
            <select
              value={blendMode}
              onChange={(e) => setBlendMode(e.target.value as any)}
              disabled={!fusionEnabled}
              className="w-full px-2 py-1.5 bg-slate-700 text-white text-xs rounded border border-slate-600"
            >
              <option value="alpha">Alpha 混合</option>
              <option value="color_overlay">彩色叠加</option>
              <option value="checkerboard">棋盘格</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">
              混合比例: {(alpha * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={alpha * 100}
              onChange={(e) => setAlpha(parseInt(e.target.value) / 100)}
              disabled={!fusionEnabled}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <button
            onClick={handlePreviewFusion}
            disabled={!ctSessionId || !petSessionId}
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded disabled:opacity-50 transition-colors"
          >
            预览融合切片
          </button>
        </div>
      </div>

      {fusionSlice && (
        <div className="bg-slate-800 rounded p-2">
          <p className="text-slate-400 text-xs mb-2">融合预览 (横断面)</p>
          <img
            src={`data:image/png;base64,${btoa(
              String.fromCharCode(...fusionSlice.data)
            )}`}
            alt="Fusion preview"
            className="w-full rounded"
          />
        </div>
      )}
    </div>
  );
}
