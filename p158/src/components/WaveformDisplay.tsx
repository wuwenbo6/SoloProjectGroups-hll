import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const WaveformDisplay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { waveformData, isLocked } = useAppStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const centerY = height / 2;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(75, 85, 99, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const y = (height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 20; i++) {
      const x = (width / 20) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    if (waveformData.length > 1) {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      if (isLocked) {
        gradient.addColorStop(0, '#00FF88');
        gradient.addColorStop(0.5, '#00FF88');
        gradient.addColorStop(1, '#00FF88');
      } else {
        gradient.addColorStop(0, '#3B82F6');
        gradient.addColorStop(0.5, '#60A5FA');
        gradient.addColorStop(1, '#3B82F6');
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const stepX = width / (waveformData.length - 1);

      for (let i = 0; i < waveformData.length; i++) {
        const x = i * stepX;
        const y = centerY + waveformData[i] * centerY * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      if (isLocked) {
        ctx.shadowColor = '#00FF88';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }, [waveformData, isLocked]);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          信号波形
        </h3>
        <div
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            isLocked
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
          }`}
        >
          {isLocked ? '已锁定' : '搜索中'}
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full rounded-lg border border-gray-700/50"
        />
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 font-mono">
          时间轴
        </div>
        <div className="absolute top-2 right-2 text-xs text-gray-500 font-mono">
          幅值
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-gray-400">音频信号</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-gray-400">已同步</span>
        </div>
      </div>
    </div>
  );
};
