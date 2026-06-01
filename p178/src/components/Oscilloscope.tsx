import { useRef, useEffect, useCallback } from 'react';
import type { BusNode, WaveformSample } from '../types/bus';

interface OscilloscopeProps {
  nodes: BusNode[];
  waveform: WaveformSample[];
  winnerNodeId: string | null;
  loserNodeIds: string[];
}

interface ChannelConfig {
  id: string;
  label: string;
  color: string;
  isBus?: boolean;
}

const CHANNEL_HEIGHT = 50;
const CHANNEL_GAP = 12;
const LEFT_MARGIN = 120;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 30;
const BIT_WIDTH = 12;

export default function Oscilloscope({
  nodes,
  waveform,
  winnerNodeId,
  loserNodeIds,
}: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getNodeColor = useCallback(
    (nodeId: string): string => {
      if (nodeId === 'bus') return '#ffffff';
      const node = nodes.find(n => n.id === nodeId);
      return node?.color ?? '#888888';
    },
    [nodes]
  );

  const isLoser = useCallback(
    (nodeId: string): boolean => {
      return loserNodeIds.includes(nodeId);
    },
    [loserNodeIds]
  );

  const drawToCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, totalWidth: number, totalHeight: number) => {
      const channels: ChannelConfig[] = [
        { id: 'bus', label: 'BUS', color: '#ffffff', isBus: true },
        ...nodes.map(n => ({
          id: n.id,
          label: `${n.name} (0x${n.address.toString(16).padStart(2, '0')})`,
          color: n.color,
        })),
      ];

      const maxTime = waveform.length > 0 ? Math.max(...waveform.map(w => w.time)) : 20;

      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      ctx.strokeStyle = '#1a2332';
      ctx.lineWidth = 1;
      const gridStep = 5;
      for (let t = 0; t <= maxTime + 5; t += gridStep) {
        const x = LEFT_MARGIN + t * BIT_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, TOP_MARGIN);
        ctx.lineTo(x, totalHeight - BOTTOM_MARGIN);
        ctx.stroke();
      }

      channels.forEach((channel, idx) => {
        const yBase = TOP_MARGIN + idx * (CHANNEL_HEIGHT + CHANNEL_GAP) + CHANNEL_HEIGHT;
        const yHigh = TOP_MARGIN + idx * (CHANNEL_HEIGHT + CHANNEL_GAP) + 10;
        const yLow = yBase - 5;

        ctx.fillStyle = '#8899aa';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        let displayLabel = channel.label;
        if (channel.id === winnerNodeId) {
          displayLabel += ' ★';
        } else if (isLoser(channel.id)) {
          displayLabel += ' ✗';
        }
        ctx.fillText(displayLabel, LEFT_MARGIN - 10, (yHigh + yLow) / 2);

        ctx.strokeStyle = '#1a2332';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LEFT_MARGIN, yHigh);
        ctx.lineTo(totalWidth - RIGHT_MARGIN, yHigh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(LEFT_MARGIN, yLow);
        ctx.lineTo(totalWidth - RIGHT_MARGIN, yLow);
        ctx.stroke();

        ctx.fillStyle = '#3a4556';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('1', LEFT_MARGIN + 2, yHigh - 2);
        ctx.fillText('0', LEFT_MARGIN + 2, yLow + 10);
      });

      ctx.strokeStyle = '#2a3a4e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, TOP_MARGIN);
      ctx.lineTo(LEFT_MARGIN, totalHeight - BOTTOM_MARGIN);
      ctx.stroke();

      ctx.fillStyle = '#667788';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let t = 0; t <= maxTime + 5; t += gridStep) {
        const x = LEFT_MARGIN + t * BIT_WIDTH;
        ctx.fillText(`${t}`, x, totalHeight - BOTTOM_MARGIN + 15);
      }

      ctx.fillStyle = '#8899aa';
      ctx.textAlign = 'right';
      ctx.fillText('时间 (bit)', totalWidth - RIGHT_MARGIN, totalHeight - BOTTOM_MARGIN + 15);

      const samplesByChannel: Record<string, WaveformSample[]> = {};
      waveform.forEach(sample => {
        if (!samplesByChannel[sample.nodeId]) {
          samplesByChannel[sample.nodeId] = [];
        }
        samplesByChannel[sample.nodeId].push(sample);
      });

      Object.keys(samplesByChannel).forEach(nodeId => {
        const nodeSamples = samplesByChannel[nodeId];
        const sortedSamples = [...nodeSamples].sort((a, b) => a.time - b.time);

        const channelIdx = channels.findIndex(c => c.id === nodeId);
        if (channelIdx === -1) return;

        const yHigh = TOP_MARGIN + channelIdx * (CHANNEL_HEIGHT + CHANNEL_GAP) + 10;
        const yLow = yHigh + CHANNEL_HEIGHT - 15;

        const color = getNodeColor(nodeId);
        const isWinner = nodeId === winnerNodeId;
        const isLoserNode = isLoser(nodeId);

        ctx.lineWidth = isWinner ? 3 : isLoserNode ? 1.5 : 2;
        ctx.strokeStyle = color;

        if (isLoserNode) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        const firstLevel = sortedSamples[0]?.level === 1 ? yHigh : yLow;
        ctx.moveTo(LEFT_MARGIN, firstLevel);

        for (let i = 0; i < sortedSamples.length - 1; i++) {
          const curr = sortedSamples[i];
          const next = sortedSamples[i + 1];

          const xCurr = LEFT_MARGIN + curr.time * BIT_WIDTH;
          const xNext = LEFT_MARGIN + next.time * BIT_WIDTH;

          const yCurr = curr.level === 1 ? yHigh : yLow;
          const yNext = next.level === 1 ? yHigh : yLow;

          ctx.lineTo(xCurr, yCurr);

          if (curr.level !== next.level) {
            ctx.lineTo(xCurr, yNext);
          }
        }

        if (sortedSamples.length > 0) {
          const last = sortedSamples[sortedSamples.length - 1];
          const xLast = LEFT_MARGIN + last.time * BIT_WIDTH;
          const yLast = last.level === 1 ? yHigh : yLow;
          ctx.lineTo(xLast, yLast);
        }

        ctx.stroke();
        ctx.setLineDash([]);
      });

      const busSamples = samplesByChannel['bus'] || [];
      const sortedBusSamples = [...busSamples].sort((a, b) => a.time - b.time);

      let collisionStart = -1;
      let collisionEnd = -1;
      let inCollision = false;

      for (let i = 1; i < sortedBusSamples.length; i++) {
        const prev = sortedBusSamples[i - 1];
        const curr = sortedBusSamples[i];

        if (prev.level !== curr.level) {
          if (!inCollision && curr.level === 0) {
            collisionStart = curr.time;
            inCollision = true;
          } else if (inCollision && curr.level === 1) {
            collisionEnd = curr.time;
            inCollision = false;
          }
        }
      }

      if (collisionStart >= 0) {
        const xStart = LEFT_MARGIN + collisionStart * BIT_WIDTH;
        const xEnd = LEFT_MARGIN + (collisionEnd > 0 ? collisionEnd : maxTime) * BIT_WIDTH;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(xStart, TOP_MARGIN, xEnd - xStart, totalHeight - TOP_MARGIN - BOTTOM_MARGIN);

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(xStart, TOP_MARGIN);
        ctx.lineTo(xStart, totalHeight - BOTTOM_MARGIN);
        ctx.stroke();

        if (collisionEnd > 0) {
          ctx.beginPath();
          ctx.moveTo(xEnd, TOP_MARGIN);
          ctx.lineTo(xEnd, totalHeight - BOTTOM_MARGIN);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    },
    [nodes, waveform, winnerNodeId, loserNodeIds, getNodeColor, isLoser]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const channels: ChannelConfig[] = [
      { id: 'bus', label: 'BUS', color: '#ffffff', isBus: true },
      ...nodes.map(n => ({
        id: n.id,
        label: `${n.name} (0x${n.address.toString(16).padStart(2, '0')})`,
        color: n.color,
      })),
    ];

    const totalHeight =
      TOP_MARGIN +
      channels.length * (CHANNEL_HEIGHT + CHANNEL_GAP) +
      BOTTOM_MARGIN;

    const maxTime = waveform.length > 0 ? Math.max(...waveform.map(w => w.time)) : 20;
    const totalWidth = LEFT_MARGIN + (maxTime + 5) * BIT_WIDTH + RIGHT_MARGIN;

    const dpr = window.devicePixelRatio || 1;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offscreenCanvas = offscreenCanvasRef.current;
    offscreenCanvas.width = totalWidth * dpr;
    offscreenCanvas.height = totalHeight * dpr;

    const offCtx = offscreenCanvas.getContext('2d');
    if (!offCtx) return;
    offCtx.scale(dpr, dpr);

    drawToCanvas(offCtx, totalWidth, totalHeight);

    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(offscreenCanvas, 0, 0);
  }, [nodes, waveform, winnerNodeId, loserNodeIds, drawToCanvas]);

  return (
    <div ref={containerRef} className="overflow-auto bg-[#0a0e17] rounded-lg border border-[#1a2332]">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
