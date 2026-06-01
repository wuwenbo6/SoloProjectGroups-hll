import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useDicomLoader } from '../hooks/useDicomLoader';
import { usePolygonDrawer } from '../hooks/usePolygonDrawer';
import { Loader2 } from 'lucide-react';

export const DicomCanvas = () => {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  
  const drawVersionRef = useRef(0);
  const [, forceRender] = useState(0);

  const {
    zoom,
    pan,
    series,
    currentSliceIndex,
    setCurrentSliceIndex,
    setZoom,
    setWindow,
    windowCenter,
    windowWidth,
    activeTool,
    loading,
    error,
  } = useAppStore();
  const setPan = useAppStore((s) => s.setPan);

  const { currentImageData } = useDicomLoader();

  const requestRedraw = useCallback(() => {
    drawVersionRef.current++;
    forceRender(drawVersionRef.current);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (series) {
      setImageSize({ width: series.cols, height: series.rows });
    }
  }, [series]);

  const { scale, offsetX, offsetY } = useMemo(() => {
    const baseScale = Math.min(
      canvasSize.width / (imageSize.width || 1),
      canvasSize.height / (imageSize.height || 1)
    );
    const sc = baseScale * zoom;
    const ox = (canvasSize.width - imageSize.width * sc) / 2 + pan.x;
    const oy = (canvasSize.height - imageSize.height * sc) / 2 + pan.y;
    return { scale: sc, offsetX: ox, offsetY: oy };
  }, [canvasSize, imageSize, zoom, pan]);

  const {
    handleCanvasClick,
    handleCanvasMouseMove,
    handleContextMenu,
    drawOverlays,
  } = usePolygonDrawer({
    canvasRef: overlayCanvasRef,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    offsetX,
    offsetY,
    scale,
    requestRedraw,
  });

  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      
      if (activeTool === 'polygon') {
        handleCanvasClick(e);
      } else {
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        isDragging.current = true;
      }
    },
    [activeTool, handleCanvasClick]
  );

  const handleMouseUp = useCallback(() => {
    lastMousePos.current = null;
    isDragging.current = false;
  }, []);

  const handleMouseDrag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleCanvasMouseMove(e);
      
      if (!lastMousePos.current || !isDragging.current) return;

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;

      if (activeTool === 'pan') {
        const currentPan = useAppStore.getState().pan;
        setPan({
          x: currentPan.x + dx,
          y: currentPan.y + dy,
        });
      } else if (activeTool === 'window') {
        setWindow(
          windowCenter + dy * 2,
          Math.max(10, windowWidth + dx * 2)
        );
      }

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [activeTool, setPan, setWindow, windowCenter, windowWidth, handleCanvasMouseMove]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoom * delta);
    },
    [zoom, setZoom]
  );

  useEffect(() => {
    const imageCanvas = imageCanvasRef.current;
    if (!imageCanvas) return;
    const ictx = imageCanvas.getContext('2d');
    if (!ictx) return;

    ictx.fillStyle = '#000000';
    ictx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);

    if (currentImageData) {
      const img = new window.Image();
      img.onload = () => {
        ictx.imageSmoothingEnabled = true;
        ictx.imageSmoothingQuality = 'high';
        ictx.drawImage(
          img,
          offsetX,
          offsetY,
          imageSize.width * scale,
          imageSize.height * scale
        );
      };
      img.src = `data:image/png;base64,${currentImageData}`;
    } else if (series) {
      ictx.fillStyle = '#0a1628';
      ictx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
      ictx.fillStyle = '#334155';
      ictx.font = '16px Inter';
      ictx.textAlign = 'center';
      ictx.fillText('加载中...', imageCanvas.width / 2, imageCanvas.height / 2);
    }
  }, [currentImageData, offsetX, offsetY, scale, imageSize, series, canvasSize]);

  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;
    const octx = overlayCanvas.getContext('2d');
    if (!octx) return;

    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    drawOverlays(octx);
  }, [drawOverlays, drawVersionRef.current, currentSliceIndex, offsetX, offsetY, scale, series]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!series) return;
      
      if (e.key === 'ArrowLeft') {
        setCurrentSliceIndex(Math.max(0, currentSliceIndex - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentSliceIndex(Math.min(series.slices.length - 1, currentSliceIndex + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [series, currentSliceIndex, setCurrentSliceIndex]);

  if (!series) {
    return (
      <div
        ref={containerRef}
        className="flex-1 bg-black flex items-center justify-center relative"
      >
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-20 h-20 opacity-50">
              <rect x="10" y="20" width="80" height="60" fill="none" stroke="#334155" strokeWidth="2" />
              <circle cx="50" cy="50" r="20" fill="none" stroke="#475569" strokeWidth="2" />
              <path d="M30 70 L70 70" stroke="#334155" strokeWidth="2" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-400 mb-2">DICOM 医学影像工作站</h2>
          <p className="text-slate-500 text-sm">请点击上方按钮加载 DICOM 序列文件夹</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-black relative overflow-hidden"
    >
      {loading && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-cyan-400 animate-spin" />
            <span className="text-cyan-300 text-sm">处理中...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm z-20">
          {error}
        </div>
      )}

      <canvas
        ref={imageCanvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute inset-0"
      />

      <canvas
        ref={overlayCanvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`absolute inset-0 ${
          activeTool === 'polygon' ? 'cursor-crosshair' : 
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
          activeTool === 'window' ? 'cursor-ew-resize' :
          'cursor-default'
        }`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseDrag}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      />

      <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-700/50 pointer-events-none">
        <span className="text-xs text-slate-400">切片</span>
        <span className="ml-2 text-cyan-400 font-mono font-bold">
          {currentSliceIndex + 1} / {series.slices.length}
        </span>
      </div>

      <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-700/50 pointer-events-none">
        <div className="text-xs">
          <span className="text-slate-400">窗宽: </span>
          <span className="text-cyan-400 font-mono">{windowWidth.toFixed(0)}</span>
        </div>
        <div className="text-xs">
          <span className="text-slate-400">窗位: </span>
          <span className="text-cyan-400 font-mono">{windowCenter.toFixed(0)}</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-700/50 pointer-events-none">
        <span className="text-xs text-slate-400">缩放: </span>
        <span className="text-cyan-400 font-mono">{(zoom * 100).toFixed(0)}%</span>
      </div>

      {activeTool === 'polygon' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-cyan-500/20 backdrop-blur px-4 py-2 rounded-lg border border-cyan-400/50 pointer-events-none">
          <span className="text-cyan-300 text-sm">
            点击添加顶点 · 点击起点或按 Enter 闭合 · ESC 取消
          </span>
        </div>
      )}
    </div>
  );
};
