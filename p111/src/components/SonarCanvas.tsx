import React, { useEffect, useRef, useCallback } from 'react';
import { SonarState, FISH_SPECIES_INFO } from '../types/sonar';

interface SonarCanvasProps {
  state: SonarState;
  width?: number;
  height?: number;
  selectedTargetId: string | null;
  onCanvasClick: (distance: number, angle: number) => void;
}

export const SonarCanvas: React.FC<SonarCanvasProps> = ({
  state,
  width = 600,
  height = 600,
  selectedTargetId,
  onCanvasClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getClassificationColor = (targetId: string): { r: number; g: number; b: number } => {
    const classification = state.classifications.find((c) => c.targetId === targetId);
    if (classification) {
      const hex = FISH_SPECIES_INFO[classification.species].color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { r, g, b };
    }
    return { r: 255, g: 221, b: 0 };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) - 20;

    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy) / maxRadius;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    if (distance <= 1) {
      onCanvasClick(distance, angle);
    }
  };

  const initTrailCanvas = useCallback(() => {
    if (!trailCanvasRef.current && typeof document !== 'undefined') {
      trailCanvasRef.current = document.createElement('canvas');
      trailCanvasRef.current.width = width;
      trailCanvasRef.current.height = height;
    }
  }, [width, height]);

  useEffect(() => {
    initTrailCanvas();
  }, [initTrailCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trailCanvasRef.current) return;

    const ctx = canvas.getContext('2d');
    const trailCtx = trailCanvasRef.current.getContext('2d');
    if (!ctx || !trailCtx) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) - 20;

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, width, height);

    trailCtx.fillStyle = 'rgba(10, 22, 40, 0.02)';
    trailCtx.fillRect(0, 0, width, height);

    const rings = 5;
    for (let i = 1; i <= rings; i++) {
      const radius = (maxRadius * i) / rings;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 255, 170, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 255, 170, 0.5)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      const distance = Math.round((i / rings) * state.params.maxRange);
      ctx.fillText(`${distance}m`, centerX + radius + 5, centerY);
    }

    const degreeLines = 12;
    for (let i = 0; i < degreeLines; i++) {
      const angle = (i * 30 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(angle) * maxRadius,
        centerY + Math.sin(angle) * maxRadius
      );
      ctx.strokeStyle = 'rgba(0, 255, 170, 0.15)';
      ctx.stroke();

      const labelAngle = (i * 30 + 90) % 360;
      ctx.fillStyle = 'rgba(0, 255, 170, 0.6)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${labelAngle}°`,
        centerX + Math.cos(angle - Math.PI / 2) * (maxRadius + 15),
        centerY + Math.sin(angle - Math.PI / 2) * (maxRadius + 15)
      );
    }

    const scanAngleRad = ((state.scanAngle - 90) * Math.PI) / 180;
    const beamAngleRad = (state.params.beamAngle * Math.PI) / 180;

    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, maxRadius
    );
    gradient.addColorStop(0, 'rgba(0, 255, 170, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 255, 170, 0)');

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      maxRadius,
      scanAngleRad - beamAngleRad / 2,
      scanAngleRad + beamAngleRad / 2
    );
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(scanAngleRad) * maxRadius,
      centerY + Math.sin(scanAngleRad) * maxRadius
    );
    ctx.strokeStyle = 'rgba(0, 255, 170, 1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(scanAngleRad - beamAngleRad / 2) * maxRadius,
      centerY + Math.sin(scanAngleRad - beamAngleRad / 2) * maxRadius
    );
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(scanAngleRad + beamAngleRad / 2) * maxRadius,
      centerY + Math.sin(scanAngleRad + beamAngleRad / 2) * maxRadius
    );
    ctx.stroke();

    if (state.params.bottomEchoEnabled) {
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, 0.95 * maxRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 100, 50, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 100, 50, 0.5)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('海 底', centerX + 0.95 * maxRadius * Math.cos(Math.PI / 4), centerY + 0.95 * maxRadius * Math.sin(Math.PI / 4) - 10);
    }

    for (const track of state.tracks) {
      if (track.points.length < 2) continue;

      const trackColor = getClassificationColor(track.targetId);
      const isSelected = selectedTargetId === track.targetId;

      ctx.beginPath();
      for (let i = 0; i < track.points.length; i++) {
        const point = track.points[i];
        const angleRad = ((point.angle - 90) * Math.PI) / 180;
        const x = centerX + Math.cos(angleRad) * point.distance * maxRadius;
        const y = centerY + Math.sin(angleRad) * point.distance * maxRadius;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(${trackColor.r}, ${trackColor.g}, ${trackColor.b}, ${isSelected ? 0.8 : 0.3})`;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
    }

    for (const echo of state.echoes) {
      const echoAngleRad = ((echo.angle - 90) * Math.PI) / 180;
      const echoX = centerX + Math.cos(echoAngleRad) * echo.distance * maxRadius;
      const echoY = centerY + Math.sin(echoAngleRad) * echo.distance * maxRadius;

      const size = 3 + echo.intensity * 6;
      const isSelected = selectedTargetId === echo.fishId;

      let echoColor = { r: 255, g: 221, b: 0 };
      if (echo.isBottomEcho) {
        echoColor = { r: 255, g: 100, b: 50 };
      } else if (echo.isNoise) {
        echoColor = { r: 150, g: 150, b: 150 };
      } else {
        echoColor = getClassificationColor(echo.fishId);
      }

      const glowGradient = ctx.createRadialGradient(
        echoX, echoY, 0,
        echoX, echoY, size * 3
      );
      glowGradient.addColorStop(0, `rgba(${echoColor.r}, ${echoColor.g}, ${echoColor.b}, ${echo.intensity * 0.8})`);
      glowGradient.addColorStop(0.5, `rgba(${echoColor.r}, ${echoColor.g}, ${echoColor.b}, ${echo.intensity * 0.3})`);
      glowGradient.addColorStop(1, `rgba(${echoColor.r}, ${echoColor.g}, ${echoColor.b}, 0)`);

      ctx.beginPath();
      ctx.arc(echoX, echoY, size * 3, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(echoX, echoY, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${echoColor.r}, ${echoColor.g}, ${echoColor.b}, ${echo.intensity})`;
      ctx.fill();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(echoX, echoY, size + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      trailCtx.beginPath();
      trailCtx.arc(echoX, echoY, size * 0.5, 0, Math.PI * 2);
      trailCtx.fillStyle = `rgba(${echoColor.r}, ${echoColor.g}, ${echoColor.b}, ${echo.intensity * 0.1})`;
      trailCtx.fill();
    }

    ctx.drawImage(trailCanvasRef.current, 0, 0);

    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffaa';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1628';
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 14px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`角度: ${state.scanAngle.toFixed(1)}°`, 15, 25);
    ctx.fillText(`鱼群: ${state.echoes.length}`, 15, 45);

  }, [state, width, height]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-lg shadow-2xl cursor-crosshair"
        style={{ 
          background: '#0a1628',
          boxShadow: '0 0 40px rgba(0, 255, 170, 0.2)'
        }}
        onClick={handleCanvasClick}
      />
    </div>
  );
};
