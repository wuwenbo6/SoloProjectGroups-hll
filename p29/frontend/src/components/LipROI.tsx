import React, { useEffect, useRef } from 'react';

interface LipROIProps {
  imageData: ImageData | null;
  processedImageData: ImageData | null;
  isProcessing: boolean;
  brightness?: number;
  noiseLevel?: number;
}

export const LipROI: React.FC<LipROIProps> = ({
  imageData,
  processedImageData,
  isProcessing,
  brightness,
  noiseLevel
}) => {
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = originalCanvasRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  useEffect(() => {
    const canvas = processedCanvasRef.current;
    if (!canvas || !processedImageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = processedImageData.width;
    canvas.height = processedImageData.height;
    ctx.putImageData(processedImageData, 0, 0);
  }, [processedImageData]);

  const getQualityColor = (value: number, threshold: number, isHigherWorse: boolean = true) => {
    if (isHigherWorse) {
      if (value < threshold * 0.5) return '#00ff88';
      if (value < threshold) return '#ffcc00';
      return '#ff4444';
    } else {
      if (value > 200 || value < 50) return '#ff4444';
      if (value > 150 || value < 80) return '#ffcc00';
      return '#00ff88';
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
        嘴唇区域 (ROI)
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-sm mb-2">原始</p>
          <div className="bg-gray-900 rounded-lg p-2 flex items-center justify-center" style={{ minHeight: '80px' }}>
            <canvas
              ref={originalCanvasRef}
              className="rounded border border-gray-600"
              style={{ 
                width: '100%', 
                maxWidth: '80px',
                imageRendering: 'pixelated',
                display: imageData ? 'block' : 'none'
              }}
            />
            {!imageData && (
              <div className="text-gray-600 text-xs">等待检测...</div>
            )}
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-sm mb-2">预处理后</p>
          <div className="bg-gray-900 rounded-lg p-2 flex items-center justify-center" style={{ minHeight: '80px' }}>
            <canvas
              ref={processedCanvasRef}
              className="rounded border border-cyan-600"
              style={{ 
                width: '100%', 
                maxWidth: '80px',
                imageRendering: 'pixelated',
                display: processedImageData ? 'block' : 'none'
              }}
            />
            {!processedImageData && (
              <div className="text-gray-600 text-xs">等待检测...</div>
            )}
          </div>
        </div>
      </div>

      {(brightness !== undefined || noiseLevel !== undefined) && (
        <div className="mt-4 space-y-2">
          {brightness !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">亮度</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, brightness / 2.55)}%`,
                      backgroundColor: getQualityColor(brightness, 100, false)
                    }}
                  />
                </div>
                <span style={{ color: getQualityColor(brightness, 100, false) }}>
                  {brightness.toFixed(0)}
                </span>
              </div>
            </div>
          )}
          
          {noiseLevel !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">噪点</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, noiseLevel * 5)}%`,
                      backgroundColor: getQualityColor(noiseLevel, 15, true)
                    }}
                  />
                </div>
                <span style={{ color: getQualityColor(noiseLevel, 15, true) }}>
                  {noiseLevel.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></div>
        <span className="text-xs text-gray-500">
          {isProcessing ? '正在发送到识别引擎...' : '空闲'}
        </span>
      </div>
    </div>
  );
};
