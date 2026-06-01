import { useRef, useEffect, useCallback } from 'react';
import type { Topology, TrafficEdge, Router } from '@/types/simulator';

interface TopologyCanvasProps {
  topology: Topology | null;
  trafficEdges: TrafficEdge[];
  selectedRouterId: string | null;
  onRouterClick: (id: string) => void;
  onRouterDrag: (id: string, x: number, y: number) => void;
}

const BG_COLOR = '#0a0e1a';
const NODE_RADIUS = 28;
const HEX_SIDES = 6;
const RPT_COLOR = '#00ff88';
const SPT_COLOR = '#ff8c00';
const SELECTION_COLOR = '#00d4ff';

function getNodeColor(router: Router): string {
  if (router.is_rp) return '#ffd700';
  if (router.type === 'source') return '#00ff88';
  if (router.type === 'receiver') return '#4488ff';
  return '#6b7280';
}

function getNodeGlow(router: Router): string {
  if (router.is_rp) return 'rgba(255,215,0,0.5)';
  if (router.type === 'source') return 'rgba(0,255,136,0.4)';
  if (router.type === 'receiver') return 'rgba(68,136,255,0.4)';
  return 'rgba(107,114,128,0.3)';
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) {
  ctx.beginPath();
  for (let i = 0; i < HEX_SIDES; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export default function TopologyCanvas({
  topology,
  trafficEdges,
  selectedRouterId,
  onRouterClick,
  onRouterDrag,
}: TopologyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const dragRef = useRef<{ routerId: string; offsetX: number; offsetY: number } | null>(null);
  const packetProgressRef = useRef<Map<string, number>>(new Map());

  const getRouterById = useCallback(
    (id: string): Router | undefined => {
      return topology?.routers.find((r) => r.id === id);
    },
    [topology]
  );

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const findRouterAt = useCallback(
    (x: number, y: number): Router | undefined => {
      if (!topology) return undefined;
      return topology.routers.find((r) => {
        const dx = r.x - x;
        const dy = r.y - y;
        return Math.sqrt(dx * dx + dy * dy) <= NODE_RADIUS + 4;
      });
    },
    [topology]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      const gridSpacing = 40;
      ctx.strokeStyle = 'rgba(30,40,70,0.5)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (!topology) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      timeRef.current += 0.016;

      for (const link of topology.links) {
        const a = getRouterById(link.router_a_id);
        const b = getRouterById(link.router_b_id);
        if (!a || !b) continue;

        const isTraffic = trafficEdges.some(
          (te) =>
            (te.from === link.router_a_id && te.to === link.router_b_id) ||
            (te.from === link.router_b_id && te.to === link.router_a_id)
        );

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        if (isTraffic) {
          ctx.strokeStyle = 'rgba(100,140,200,0.4)';
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = 'rgba(50,70,120,0.5)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }

      for (const te of trafficEdges) {
        const from = getRouterById(te.from);
        const to = getRouterById(te.to);
        if (!from || !to) continue;

        const color = te.tree_type === 'rpt' ? RPT_COLOR : SPT_COLOR;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.restore();

        const key = `${te.from}-${te.to}-${te.tree_type}`;
        let progress = packetProgressRef.current.get(key) ?? 0;
        progress += 0.008;
        if (progress > 1) progress = 0;
        packetProgressRef.current.set(key, progress);

        const px = from.x + (to.x - from.x) * progress;
        const py = from.y + (to.y - from.y) * progress;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.restore();

        const px2 = from.x + (to.x - from.x) * ((progress + 0.5) % 1);
        const py2 = from.y + (to.y - from.y) * ((progress + 0.5) % 1);
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px2, py2, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.restore();
      }

      for (const router of topology.routers) {
        const color = getNodeColor(router);
        const glow = getNodeGlow(router);

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;

        drawHexagon(ctx, router.x, router.y, NODE_RADIUS);
        ctx.fillStyle = BG_COLOR;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        drawHexagon(ctx, router.x, router.y, NODE_RADIUS - 3);
        const gradient = ctx.createRadialGradient(
          router.x,
          router.y,
          0,
          router.x,
          router.y,
          NODE_RADIUS - 3
        );
        gradient.addColorStop(0, glow);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();

        if (router.is_rp) {
          const pulse = Math.sin(timeRef.current * 2) * 0.3 + 0.7;
          ctx.save();
          drawHexagon(ctx, router.x, router.y, NODE_RADIUS + 8);
          ctx.strokeStyle = `rgba(255,215,0,${pulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -timeRef.current * 20;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        if (selectedRouterId === router.id) {
          ctx.save();
          ctx.shadowColor = SELECTION_COLOR;
          ctx.shadowBlur = 25;
          drawHexagon(ctx, router.x, router.y, NODE_RADIUS + 6);
          ctx.strokeStyle = SELECTION_COLOR;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = router.name;
        const typeLabel = router.is_rp ? 'RP' : router.type.toUpperCase();
        ctx.fillText(label, router.x, router.y - 4);
        ctx.fillStyle = 'rgba(200,210,230,0.6)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(typeLabel, router.x, router.y + 10);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [topology, trafficEdges, selectedRouterId, getRouterById]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      const router = findRouterAt(x, y);
      if (router) {
        dragRef.current = {
          routerId: router.id,
          offsetX: x - router.x,
          offsetY: y - router.y,
        };
        onRouterClick(router.id);
      }
    },
    [getCanvasCoords, findRouterAt, onRouterClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return;
      const { x, y } = getCanvasCoords(e);
      const newX = x - dragRef.current.offsetX;
      const newY = y - dragRef.current.offsetY;
      onRouterDrag(dragRef.current.routerId, newX, newY);
    },
    [getCanvasCoords, onRouterDrag]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
