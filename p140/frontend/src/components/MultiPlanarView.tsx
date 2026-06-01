import { useEffect, useState, useRef, useCallback } from 'react';
import { useVolumeStore } from '../store/useVolumeStore';
import { PlaneType } from '../types';
import { getMultiPlanarReconstruction } from '../services/api';

interface SliceViewProps {
  plane: PlaneType;
  title: string;
  color: string;
}

function SliceView({ plane, title, color }: SliceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sessionId, sliceIndex, setSliceIndex, volume, renderParams } = useVolumeStore();
  const [imageData, setImageData] = useState<string | null>(null);

  const currentIndex = sliceIndex[plane];
  const maxIndex = volume.meta
    ? plane === 'axial'
      ? volume.meta.dimensions.z
      : plane === 'sagittal'
      ? volume.meta.dimensions.x
      : volume.meta.dimensions.y
    : 0;

  useEffect(() => {
    if (!sessionId || !volume.loaded) return;

    const fetchSlice = async () => {
      try {
        const data = await getMultiPlanarReconstruction(sessionId, {
          [plane]: currentIndex,
          windowWidth: renderParams.windowWidth,
          windowLevel: renderParams.windowLevel,
        });

        const planeData = data[plane];
        const uint8Data = new Uint8Array(
          atob(planeData.data)
            .split('')
            .map((c) => c.charCodeAt(0))
        );

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = planeData.width;
            canvas.height = planeData.height;

            const imageDataObj = ctx.createImageData(planeData.width, planeData.height);
            for (let i = 0; i < uint8Data.length; i++) {
              const val = uint8Data[i];
              imageDataObj.data[i * 4] = val;
              imageDataObj.data[i * 4 + 1] = val;
              imageDataObj.data[i * 4 + 2] = val;
              imageDataObj.data[i * 4 + 3] = 255;
            }

            ctx.putImageData(imageDataObj, 0, 0);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch ${plane} slice:`, error);
      }
    };

    fetchSlice();
  }, [sessionId, plane, currentIndex, volume.loaded, renderParams.windowWidth, renderParams.windowLevel]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !volume.meta) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      console.log(`Clicked at ${plane}:`, x, y);
    },
    [plane, volume.meta]
  );

  if (!volume.loaded) {
    return (
      <div className="flex-1 bg-slate-900 rounded flex items-center justify-center">
        <span className="text-slate-500 text-sm">暂无数据</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${color}`}>{title}</span>
        <span className="text-xs text-slate-500">
          {currentIndex + 1} / {maxIndex}
        </span>
      </div>
      <div className="flex-1 bg-slate-900 rounded overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className="max-w-full max-h-full cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={maxIndex - 1}
        value={currentIndex}
        onChange={(e) => setSliceIndex(plane, parseInt(e.target.value))}
        className="w-full mt-2 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-2.5
                   [&::-webkit-slider-thumb]:h-2.5
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-slate-400
                   [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}

export default function MultiPlanarView() {
  const { volume } = useVolumeStore();

  return (
    <div className="w-64 bg-slate-800 h-full flex flex-col">
      <div className="p-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-100">多平面视图</h2>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-4 overflow-y-auto">
        {volume.loaded ? (
          <>
            <div className="flex-1 min-h-[140px]">
              <SliceView plane="axial" title="横断面 (Axial)" color="text-blue-400" />
            </div>
            <div className="flex-1 min-h-[140px]">
              <SliceView plane="sagittal" title="矢状面 (Sagittal)" color="text-red-400" />
            </div>
            <div className="flex-1 min-h-[140px]">
              <SliceView plane="coronal" title="冠状面 (Coronal)" color="text-green-400" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-500 text-sm">
              <p>请先上传</p>
              <p>DICOM 序列</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
