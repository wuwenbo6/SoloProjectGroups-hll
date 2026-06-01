import { useEffect, useRef } from 'react';
import type { Cell, Position } from '@/types';

interface CellMapProps {
  cells: Cell[];
  uePosition: Position;
  servingPci: number;
  mapSize: number;
}

export function CellMap({ cells, uePosition, servingPci, mapSize }: CellMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ueTrailRef = useRef<Position[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => {
    ueTrailRef.current = [...ueTrailRef.current, uePosition].slice(-50);
  }, [uePosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.min(width, height) / (mapSize * 1.4);
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.fillStyle = '#0A1628';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#131E33';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = -mapSize / 2; x <= mapSize / 2; x += gridSize) {
      const screenX = centerX + (x / mapSize) * scale * 2;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
      ctx.stroke();
    }
    for (let y = -mapSize / 2; y <= mapSize / 2; y += gridSize) {
      const screenY = centerY + (y / mapSize) * scale * 2;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(width, screenY);
      ctx.stroke();
    }

    const toScreen = (worldX: number, worldY: number) => ({
      x: centerX + (worldX / mapSize) * scale * 2,
      y: centerY + (worldY / mapSize) * scale * 2,
    });

    cells.forEach((cell) => {
      const { x, y } = toScreen(cell.position.x, cell.position.y);
      const cellRadius = Math.min(width, height) * 0.12;

      const rsrpNorm = Math.max(0, Math.min(1, (cell.rsrp + 140) / 100));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, cellRadius);
      if (cell.is_serving) {
        gradient.addColorStop(0, `rgba(0, 229, 160, ${0.3 * rsrpNorm + 0.1})`);
        gradient.addColorStop(1, 'rgba(0, 229, 160, 0)');
      } else {
        gradient.addColorStop(0, `rgba(74, 158, 255, ${0.25 * rsrpNorm + 0.1})`);
        gradient.addColorStop(1, 'rgba(74, 158, 255, 0)');
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, cellRadius, 0, Math.PI * 2);
      ctx.fill();

      const hexRadius = Math.min(width, height) * 0.05;
      ctx.strokeStyle = cell.is_serving ? '#00E5A0' : '#4A9EFF';
      ctx.lineWidth = cell.is_serving ? 3 : 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = x + hexRadius * Math.cos(angle);
        const hy = y + hexRadius * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = cell.is_serving ? '#00E5A0' : '#4A9EFF';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#E6EDF5';
      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`PCI ${cell.pci}`, x, y + hexRadius + 18);
      ctx.fillStyle = cell.s_rxlev > 0 ? '#00E5A0' : '#FF6B35';
      ctx.font = '11px Rajdhani, sans-serif';
      ctx.fillText(`${cell.rsrp.toFixed(0)} dBm`, x, y + hexRadius + 32);
    });

    const trail = ueTrailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const { x, y } = toScreen(trail[i].x, trail[i].y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const ueScreen = toScreen(uePosition.x, uePosition.y);
    const ueGlow = ctx.createRadialGradient(ueScreen.x, ueScreen.y, 0, ueScreen.x, ueScreen.y, 20);
    ueGlow.addColorStop(0, 'rgba(255, 107, 53, 0.5)');
    ueGlow.addColorStop(1, 'rgba(255, 107, 53, 0)');
    ctx.fillStyle = ueGlow;
    ctx.beginPath();
    ctx.arc(ueScreen.x, ueScreen.y, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF6B35';
    ctx.beginPath();
    ctx.moveTo(ueScreen.x, ueScreen.y - 8);
    ctx.lineTo(ueScreen.x + 6, ueScreen.y + 5);
    ctx.lineTo(ueScreen.x - 6, ueScreen.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#E6EDF5';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#E6EDF5';
    ctx.font = 'bold 11px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UE', ueScreen.x, ueScreen.y + 18);
  }, [cells, uePosition, servingPci, mapSize]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] relative bg-bg-primary rounded-lg border border-bg-tertiary overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 bg-bg-secondary/80 backdrop-blur-sm rounded px-3 py-2 text-xs">
        <div className="text-text-secondary mb-1">Legend</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-accent-primary"></div>
          <span className="text-text-primary">Serving Cell</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-accent-info"></div>
          <span className="text-text-primary">Neighbor Cell</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-accent-warning"></div>
          <span className="text-text-primary">UE Terminal</span>
        </div>
      </div>
      <div className="absolute top-3 right-3 bg-bg-secondary/80 backdrop-blur-sm rounded px-3 py-2 text-xs">
        <div className="text-text-secondary mb-1">UE Position</div>
        <div className="text-accent-primary font-display font-semibold">
          ({uePosition.x.toFixed(1)}, {uePosition.y.toFixed(1)})
        </div>
      </div>
    </div>
  );
}
