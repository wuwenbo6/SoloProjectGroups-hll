import React, { useRef, useEffect, useState } from 'react';
import { Layer } from '../types';
import { compositeLayers } from '../utils/layerBlend';

interface PreviewCanvasProps {
  layers: Layer[];
  width: number;
  height: number;
  showOriginal: boolean;
  originalImageData: ImageData | null;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  layers,
  width,
  height,
  showOriginal,
  originalImageData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    if (showOriginal && originalImageData) {
      ctx.putImageData(originalImageData, 0, 0);
    } else if (layers.length > 0) {
      const composited = compositeLayers(layers, width, height);
      ctx.putImageData(composited, 0, 0);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, width, height);
    }
  }, [layers, width, height, showOriginal, originalImageData]);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || width === 0 || height === 0) return;

      const container = containerRef.current;
      const maxWidth = container.clientWidth - 48;
      const maxHeight = container.clientHeight - 48;

      const scaleX = maxWidth / width;
      const scaleY = maxHeight / height;
      setScale(Math.min(scaleX, scaleY, 1));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [width, height]);

  if (width === 0 || height === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center p-6 overflow-hidden"
    >
      <div
        className="relative bg-gray-900 rounded-lg shadow-2xl overflow-hidden"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 212, 255, 0.1)',
        }}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ imageRendering: 'auto' }}
        />
        {showOriginal && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
            原图
          </div>
        )}
      </div>
    </div>
  );
};
