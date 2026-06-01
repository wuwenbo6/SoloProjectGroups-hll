import React, { useEffect, useRef } from 'react';
import { AScopeData, SonarParams } from '../types/sonar';

interface AScopeProps {
  data: AScopeData[];
  params: SonarParams;
  width?: number;
  height?: number;
}

export const AScope: React.FC<AScopeProps> = ({
  data,
  params,
  width = 600,
  height = 150,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0, 255, 170, 0.1)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
      const x = (width * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let i = 0; i <= 5; i++) {
      const y = (height * i) / 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const chartPadding = { left: 10, right: 10, top: 20, bottom: 30 };
    const chartWidth = width - chartPadding.left - chartPadding.right;
    const chartHeight = height - chartPadding.top - chartPadding.bottom;

    ctx.strokeStyle = 'rgba(0, 255, 170, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const hasData = data.length > 0 && data.some(d => d.intensity > 0);
    
    if (hasData) {
      for (let i = 0; i < data.length; i++) {
        const point = data[i];
        const x = chartPadding.left + point.distance * chartWidth;
        const y = chartPadding.top + chartHeight - point.intensity * chartHeight;

        if (i === 0) {
          ctx.moveTo(chartPadding.left, chartPadding.top + chartHeight);
          ctx.lineTo(x, chartPadding.top + chartHeight);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.lineTo(chartPadding.left + chartWidth, chartPadding.top + chartHeight);
      ctx.lineTo(chartPadding.left, chartPadding.top + chartHeight);
    } else {
      ctx.moveTo(chartPadding.left, chartPadding.top + chartHeight);
      ctx.lineTo(chartPadding.left + chartWidth, chartPadding.top + chartHeight);
    }
    
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, chartPadding.top, 0, chartPadding.top + chartHeight);
    gradient.addColorStop(0, 'rgba(0, 255, 170, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 255, 170, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    
    for (let i = 0; i <= 5; i++) {
      const distance = Math.round((i / 5) * params.maxRange);
      const x = chartPadding.left + (i / 5) * chartWidth;
      ctx.fillText(`${distance}m`, x, height - 8);
    }

    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const intensity = (100 - i * 25);
      const y = chartPadding.top + (i / 4) * chartHeight;
      ctx.fillText(`${intensity}%`, chartPadding.left - 5, y + 3);
    }

    ctx.fillStyle = '#00ffaa';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('📊 A显示模式 (A-Scope)', 10, 14);

  }, [data, params, width, height]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-lg"
        style={{
          background: '#0a1628',
          boxShadow: '0 0 20px rgba(0, 255, 170, 0.15)',
        }}
      />
    </div>
  );
};
