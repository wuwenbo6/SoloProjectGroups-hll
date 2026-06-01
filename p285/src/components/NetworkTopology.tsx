import { useState, useMemo } from 'react';
import { Network, Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { ParsedFrame } from '../types';
import { cn } from '../lib/utils';

interface Props {
  frames: ParsedFrame[];
}

interface Node {
  id: number;
  tei: number;
  type: 'cco' | 'proxy' | 'station' | 'broadcast';
  label: string;
  x: number;
  y: number;
  txCount: number;
  rxCount: number;
}

interface Edge {
  id: string;
  source: number;
  target: number;
  count: number;
  frameTypes: string[];
}

interface TopologyData {
  nodes: Node[];
  edges: Edge[];
  ccoTEI: number | null;
}

export default function NetworkTopology({ frames }: Props) {
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);

  const topology = useMemo(() => analyzeTopology(frames), [frames]);

  const exportTopology = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      nodes: topology.nodes.map((n) => ({
        tei: n.tei,
        type: n.type,
        txCount: n.txCount,
        rxCount: n.rxCount,
      })),
      edges: topology.edges.map((e) => ({
        sourceTEI: topology.nodes.find((n) => n.id === e.source)?.tei,
        targetTEI: topology.nodes.find((n) => n.id === e.target)?.tei,
        count: e.count,
        frameTypes: e.frameTypes,
      })),
      ccoTEI: topology.ccoTEI,
      totalFrames: frames.length,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hpav-topology-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = () => {
    const svg = document.getElementById('topology-svg');
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hpav-topology-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Network className="h-4 w-4 text-blue-400" />
          网络拓扑
          {topology.ccoTEI !== null && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
              CCo: TEI {topology.ccoTEI}
            </span>
          )}
        </h3>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:text-slate-300"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
            className="rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:text-slate-300"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="rounded border border-slate-700 p-1 text-slate-400 hover:border-slate-600 hover:text-slate-300"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="mx-2 h-4 w-px bg-slate-700" />
          <button
            onClick={exportTopology}
            className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-300"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
          <button
            onClick={exportSvg}
            className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-300"
          >
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
        </div>
      </div>

      <div className="relative h-80 overflow-hidden rounded-lg border border-slate-700/30 bg-slate-900/50">
        <div
          className="h-full w-full transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          <svg id="topology-svg" viewBox="0 0 400 300" className="h-full w-full">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#64748b" />
              </marker>
            </defs>

            {topology.edges.map((edge) => {
              const source = topology.nodes.find((n) => n.id === edge.source);
              const target = topology.nodes.find((n) => n.id === edge.target);
              if (!source || !target) return null;

              const opacity = Math.min(0.3 + edge.count * 0.15, 1);
              const strokeWidth = Math.max(1, Math.min(4, edge.count));

              return (
                <g key={edge.id}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="#64748b"
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    markerEnd="url(#arrowhead)"
                  />
                  {showLabels && edge.count > 1 && (
                    <text
                      x={(source.x + target.x) / 2}
                      y={(source.y + target.y) / 2 - 5}
                      fill="#94a3b8"
                      fontSize="9"
                      textAnchor="middle"
                    >
                      {edge.count}
                    </text>
                  )}
                </g>
              );
            })}

            {topology.nodes.map((node) => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.type === 'cco' ? 22 : node.type === 'broadcast' ? 24 : 18}
                  fill={getNodeColor(node.type)}
                  stroke={getNodeStroke(node.type)}
                  strokeWidth={node.type === 'cco' ? 3 : 1.5}
                  className="drop-shadow-lg"
                />
                {showLabels && (
                  <>
                    <text
                      x={node.x}
                      y={node.y + 3}
                      fill="#fff"
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {node.type === 'broadcast' ? 'BC' : node.tei}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 35}
                      fill="#64748b"
                      fontSize="8"
                      textAnchor="middle"
                    >
                      {node.type.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-400/50" />
            CCo
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            Proxy
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-slate-500" />
            Station
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            Broadcast
          </div>
        </div>

        <button
          onClick={() => setShowLabels(!showLabels)}
          className={cn(
            'rounded px-2 py-0.5 text-[10px] transition-colors',
            showLabels
              ? 'bg-[#00E5CC]/20 text-[#00E5CC]'
              : 'border border-slate-700 text-slate-500'
          )}
        >
          标签: {showLabels ? '开' : '关'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-[10px]">
        <div className="rounded-lg border border-slate-700/30 bg-slate-900/30 p-2">
          <div className="mb-1 font-semibold text-slate-400">终端统计</div>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-slate-500">总终端数</span>
              <span className="font-mono text-slate-300">
                {topology.nodes.filter((n) => n.type !== 'broadcast').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">CCo</span>
              <span className="font-mono text-emerald-400">
                {topology.nodes.filter((n) => n.type === 'cco').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">连接数</span>
              <span className="font-mono text-slate-300">{topology.edges.length}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-700/30 bg-slate-900/30 p-2">
          <div className="mb-1 font-semibold text-slate-400">流量统计</div>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-slate-500">总帧数</span>
              <span className="font-mono text-slate-300">{frames.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">单播帧</span>
              <span className="font-mono text-blue-300">
                {frames.filter((f) => f.macHeader.destinationTEI !== 255).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">广播帧</span>
              <span className="font-mono text-amber-300">
                {frames.filter((f) => f.macHeader.destinationTEI === 255).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function analyzeTopology(frames: ParsedFrame[]): TopologyData {
  const teiSet = new Set<number>();
  const edgeMap = new Map<string, Edge>();
  const txCounts = new Map<number, number>();
  const rxCounts = new Map<number, number>();
  let ccoTEI: number | null = null;

  for (const frame of frames) {
    const srcTEI = frame.macHeader.sourceTEI;
    const dstTEI = frame.macHeader.destinationTEI;

    teiSet.add(srcTEI);
    if (dstTEI !== 255) {
      teiSet.add(dstTEI);
    }

    txCounts.set(srcTEI, (txCounts.get(srcTEI) || 0) + 1);
    if (dstTEI !== 255) {
      rxCounts.set(dstTEI, (rxCounts.get(dstTEI) || 0) + 1);
    }

    if (frame.signaling.beacon.present || frame.signaling.ccoInfo.present) {
      if (frame.signaling.beacon.ccoTEI > 0) {
        ccoTEI = frame.signaling.beacon.ccoTEI;
      } else if (frame.signaling.ccoInfo.ccoTEI > 0) {
        ccoTEI = frame.signaling.ccoInfo.ccoTEI;
      }
    }

    const edgeKey = `${srcTEI}-${dstTEI}`;
    const existing = edgeMap.get(edgeKey);
    if (existing) {
      existing.count++;
      if (!existing.frameTypes.includes(frame.frameType)) {
        existing.frameTypes.push(frame.frameType);
      }
    } else {
      edgeMap.set(edgeKey, {
        id: edgeKey,
        source: srcTEI,
        target: dstTEI,
        count: 1,
        frameTypes: [frame.frameType],
      });
    }
  }

  const centerX = 200;
  const centerY = 150;
  const radius = 100;
  const teis = Array.from(teiSet).sort((a, b) => a - b);

  const nodes: Node[] = [];
  const nodeIdMap = new Map<number, number>();

  if (teis.includes(255)) {
    nodeIdMap.set(255, 0);
    nodes.push({
      id: 0,
      tei: 255,
      type: 'broadcast',
      label: 'Broadcast',
      x: 350,
      y: 50,
      txCount: 0,
      rxCount: txCounts.get(255) || 0,
    });
  }

  let nodeIndex = nodes.length;

  if (ccoTEI !== null && teis.includes(ccoTEI)) {
    nodeIdMap.set(ccoTEI, nodeIndex);
    nodes.push({
      id: nodeIndex,
      tei: ccoTEI,
      type: 'cco',
      label: `CCo ${ccoTEI}`,
      x: centerX,
      y: centerY,
      txCount: txCounts.get(ccoTEI) || 0,
      rxCount: rxCounts.get(ccoTEI) || 0,
    });
    nodeIndex++;
  }

  const otherTEIs = teis.filter((t) => t !== 255 && t !== ccoTEI);
  otherTEIs.forEach((tei, i) => {
    const angle = (2 * Math.PI * i) / otherTEIs.length - Math.PI / 2;
    nodeIdMap.set(tei, nodeIndex);
    nodes.push({
      id: nodeIndex,
      tei,
      type: 'station',
      label: `TEI ${tei}`,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      txCount: txCounts.get(tei) || 0,
      rxCount: rxCounts.get(tei) || 0,
    });
    nodeIndex++;
  });

  const edges: Edge[] = [];
  edgeMap.forEach((edge) => {
    const sourceId = nodeIdMap.get(edge.source);
    let targetId = nodeIdMap.get(edge.target);

    if (edge.target === 255 && targetId === undefined) {
      return;
    }

    if (sourceId !== undefined && targetId !== undefined) {
      edges.push({
        ...edge,
        source: sourceId,
        target: targetId,
      });
    }
  });

  return { nodes, edges, ccoTEI };
}

function getNodeColor(type: string): string {
  switch (type) {
    case 'cco':
      return '#10b981';
    case 'proxy':
      return '#3b82f6';
    case 'station':
      return '#64748b';
    case 'broadcast':
      return '#f59e0b';
    default:
      return '#64748b';
  }
}

function getNodeStroke(type: string): string {
  switch (type) {
    case 'cco':
      return '#34d399';
    case 'proxy':
      return '#60a5fa';
    case 'station':
      return '#94a3b8';
    case 'broadcast':
      return '#fbbf24';
    default:
      return '#94a3b8';
  }
}
