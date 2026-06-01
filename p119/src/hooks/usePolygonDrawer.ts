import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { RoiPoint } from '../types/dicom';

interface UsePolygonDrawerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  imageWidth: number;
  imageHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  requestRedraw: () => void;
}

export const usePolygonDrawer = ({
  canvasRef,
  imageWidth,
  imageHeight,
  offsetX,
  offsetY,
  scale,
  requestRedraw,
}: UsePolygonDrawerOptions) => {
  const {
    activeTool,
    isDrawing,
    drawingPoints,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,
    series,
  } = useAppStore();

  const mousePositionRef = useRef<RoiPoint | null>(null);
  const offsetRef = useRef({ x: offsetX, y: offsetY });
  const scaleRef = useRef(scale);
  const imageSizeRef = useRef({ width: imageWidth, height: imageHeight });

  useEffect(() => {
    offsetRef.current = { x: offsetX, y: offsetY };
    scaleRef.current = scale;
    imageSizeRef.current = { width: imageWidth, height: imageHeight };
  }, [offsetX, offsetY, scale, imageWidth, imageHeight]);

  const screenToImageCoords = useCallback(
    (clientX: number, clientY: number): RoiPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (clientY - rect.top) * (canvas.height / rect.height);

      const ox = offsetRef.current.x;
      const oy = offsetRef.current.y;
      const sc = scaleRef.current;

      const imageX = (canvasX - ox) / sc;
      const imageY = (canvasY - oy) / sc;

      const iw = imageSizeRef.current.width;
      const ih = imageSizeRef.current.height;

      if (
        imageX >= 0 &&
        imageX < iw &&
        imageY >= 0 &&
        imageY < ih
      ) {
        return { x: Math.round(imageX), y: Math.round(imageY) };
      }
      return null;
    },
    [canvasRef]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'polygon' || !series) return;

      const coords = screenToImageCoords(e.clientX, e.clientY);
      if (!coords) return;

      if (!isDrawing) {
        startDrawing();
        addDrawingPoint(coords);
      } else {
        if (drawingPoints.length >= 2) {
          const firstPoint = drawingPoints[0];
          const distance = Math.sqrt(
            Math.pow(coords.x - firstPoint.x, 2) +
              Math.pow(coords.y - firstPoint.y, 2)
          );
          if (distance < 10) {
            finishDrawing();
            return;
          }
        }
        addDrawingPoint(coords);
      }
      requestRedraw();
    },
    [
      activeTool,
      series,
      isDrawing,
      drawingPoints,
      startDrawing,
      addDrawingPoint,
      finishDrawing,
      screenToImageCoords,
      requestRedraw,
    ]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = screenToImageCoords(e.clientX, e.clientY);
      mousePositionRef.current = coords;
      if (isDrawing) {
        requestRedraw();
      }
    },
    [screenToImageCoords, isDrawing, requestRedraw]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (activeTool !== 'polygon') return;

      if (e.key === 'Escape') {
        cancelDrawing();
        requestRedraw();
      } else if (e.key === 'Enter' && isDrawing && drawingPoints.length >= 3) {
        finishDrawing();
        requestRedraw();
      }
    },
    [activeTool, isDrawing, drawingPoints, cancelDrawing, finishDrawing, requestRedraw]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'polygon') {
        e.preventDefault();
        if (isDrawing) {
          cancelDrawing();
          requestRedraw();
        }
      }
    },
    [activeTool, isDrawing, cancelDrawing, requestRedraw]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const drawOverlays = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!series) return;

      const { rois, currentSliceIndex, activeRoiId } = useAppStore.getState();

      rois.forEach((roi) => {
        const contour = roi.contours.find(
          (c) => c.sliceIndex === currentSliceIndex
        );
        if (contour && contour.points.length >= 3) {
          ctx.save();
          ctx.strokeStyle = roi.color;
          ctx.lineWidth = roi.id === activeRoiId ? 3 : 2;
          ctx.fillStyle = roi.id === activeRoiId 
            ? roi.color + '40' 
            : roi.color + '20';

          ctx.beginPath();
          const first = contour.points[0];
          ctx.moveTo(offsetX + first.x * scale, offsetY + first.y * scale);
          contour.points.forEach((p, i) => {
            if (i > 0) {
              ctx.lineTo(offsetX + p.x * scale, offsetY + p.y * scale);
            }
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          contour.points.forEach((p) => {
            ctx.beginPath();
            ctx.arc(
              offsetX + p.x * scale,
              offsetY + p.y * scale,
              4,
              0,
              Math.PI * 2
            );
            ctx.fillStyle = roi.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          ctx.restore();
        }
      });

      if (isDrawing && drawingPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#00d4ff30';
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        const first = drawingPoints[0];
        ctx.moveTo(offsetX + first.x * scale, offsetY + first.y * scale);
        
        drawingPoints.forEach((p, i) => {
          if (i > 0) {
            ctx.lineTo(offsetX + p.x * scale, offsetY + p.y * scale);
          }
        });

        if (mousePositionRef.current) {
          ctx.lineTo(
            offsetX + mousePositionRef.current.x * scale,
            offsetY + mousePositionRef.current.y * scale
          );
        }

        ctx.stroke();
        ctx.setLineDash([]);

        drawingPoints.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(
            offsetX + p.x * scale,
            offsetY + p.y * scale,
            i === 0 ? 6 : 4,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = i === 0 ? '#00ff88' : '#00d4ff';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        ctx.restore();
      }
    },
    [series, offsetX, offsetY, scale, isDrawing, drawingPoints]
  );

  return {
    handleCanvasClick,
    handleCanvasMouseMove,
    handleContextMenu,
    drawOverlays,
    mousePosition: mousePositionRef.current,
  };
};
