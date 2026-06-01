import React, { useMemo, useState, useRef } from 'react';
import { GitMerge, ZoomIn, ZoomOut, Maximize2, Info, AlertTriangle, Eye, EyeOff, Download } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { exportDFGToDot, downloadBlob } from '@/services/api.service';
import dagre from 'dagre';
import type { DFGNode, DataFlowGraph } from '@shared/types';

interface PositionedDFGNode extends DFGNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DFG_NODE_WARNING_THRESHOLD = 80;
const DFG_NODE_HARD_LIMIT = 150;

const DFGViewer: React.FC = () => {
  const { compileResult } = useLLVMStore();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showWarningDismissed, setShowWarningDismissed] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const layoutData = useMemo(() => {
    if (!compileResult?.dfg || compileResult.dfg.nodes.length === 0) return null;

    let displayNodes = compileResult.dfg.nodes;
    let displayEdges = compileResult.dfg.edges;
    const totalNodes = compileResult.dfg.nodes.length;
    const isTruncated = totalNodes > DFG_NODE_HARD_LIMIT && !showWarningDismissed;

    if (isTruncated) {
      displayNodes = compileResult.dfg.nodes.slice(0, DFG_NODE_HARD_LIMIT);
      const visibleNodeIds = new Set(displayNodes.map((n) => n.id));
      displayEdges = compileResult.dfg.edges.filter(
        (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      );
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: simplifiedMode ? 60 : 80, nodesep: simplifiedMode ? 25 : 40 });
    g.setDefaultEdgeLabel(() => ({}));

    displayNodes.forEach((node) => {
      if (simplifiedMode) {
        g.setNode(node.id, { width: 60, height: 30 });
      } else {
        const label =
          node.type === 'constant'
            ? node.instruction
            : node.type === 'argument'
            ? `arg: ${node.valueName || node.instruction}`
            : `%${node.valueName} = ${node.instruction.split('=')[1]?.trim().slice(0, 30) || node.instruction.slice(0, 30)}`;

        const width = Math.max(120, label.length * 8 + 40);
        const height = node.type === 'instruction' ? 60 : 45;
        g.setNode(node.id, { width, height, label });
      }
    });

    displayEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target, { operandIndex: edge.operandIndex });
    });

    try {
      dagre.layout(g);
    } catch {
      return null;
    }

    const positionedNodes: PositionedDFGNode[] = displayNodes.map((node) => {
      const n = g.node(node.id);
      return {
        ...node,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      };
    });

    const svgWidth = g.graph().width || 800;
    const svgHeight = g.graph().height || 600;

    return {
      nodes: positionedNodes,
      edges: displayEdges,
      svgWidth,
      svgHeight,
      totalNodes,
      isTruncated,
    };
  }, [compileResult?.dfg, simplifiedMode, showWarningDismissed]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !selectedNode) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(3, Math.max(0.3, prev * delta)));
  };

  const getNodeColor = (node: DFGNode, isSelected: boolean) => {
    if (isSelected) return 'bg-purple-500/30 border-purple-400';
    switch (node.type) {
      case 'instruction':
        return 'bg-blue-500/20 border-blue-400/70';
      case 'argument':
        return 'bg-emerald-500/20 border-emerald-400/70';
      case 'constant':
        return 'bg-amber-500/20 border-amber-400/70';
      default:
        return 'bg-slate-700 border-slate-500';
    }
  };

  const getEdgePath = (
    source: PositionedDFGNode,
    target: PositionedDFGNode
  ): string => {
    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height / 2;
    const targetX = target.x - target.width / 2;
    const targetY = target.y + target.height / 2;

    const midX = (sourceX + targetX) / 2;

    return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
  };

  const viewportWidth = svgRef.current?.clientWidth || 800;

  const centeredPan = useMemo(() => {
    if (!layoutData) return { x: 0, y: 0 };
    return {
      x: (viewportWidth - layoutData.svgWidth * zoom) / 2,
      y: 40,
    };
  }, [layoutData, zoom, viewportWidth]);

  if (!compileResult) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-center p-8">
          <GitMerge className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">等待编译</h3>
          <p className="text-slate-500 text-sm">编译后将显示数据流图</p>
        </div>
      </div>
    );
  }

  if (!layoutData || layoutData.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-center p-8">
          <Info className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">没有可用的 DFG 数据</h3>
          <p className="text-slate-500 text-sm">当前 IR 中没有检测到数据流依赖</p>
        </div>
      </div>
    );
  }

  const showWarning = layoutData && layoutData.totalNodes > DFG_NODE_WARNING_THRESHOLD && !showWarningDismissed;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-slate-300">数据流图</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className={`${layoutData?.isTruncated ? 'text-amber-400' : 'text-slate-500'}`}>
              {layoutData?.isTruncated ? `${layoutData.nodes.length}/${layoutData.totalNodes}` : layoutData?.nodes.length} 个节点
            </span>
            <span className="text-slate-500">{layoutData?.edges.length} 条边</span>
          </div>
          <button
            onClick={() => setSimplifiedMode(!simplifiedMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              simplifiedMode
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-slate-700 text-slate-400 hover:text-slate-300'
            }`}
            title="简化显示模式"
          >
            {simplifiedMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            简化
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (compileResult?.dfg) {
                try {
                  const blob = await exportDFGToDot(compileResult.dfg);
                  downloadBlob(blob, 'dfg.dot');
                } catch (err) {
                  console.error('Failed to export:', err);
                }
              }
            }}
            disabled={!compileResult?.dfg || compileResult.dfg.nodes.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="导出 Dot 文件"
          >
            <Download className="w-4 h-4" />
            导出 Dot
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showWarning && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-400 flex-1">
            警告：当前数据流图包含 {layoutData.totalNodes} 个节点，可能导致性能问题。
            {layoutData.isTruncated && ` 已限制显示前 ${DFG_NODE_HARD_LIMIT} 个节点。`}
            建议使用「简化模式」获得更流畅的体验。
          </span>
          {layoutData.isTruncated && (
            <button
              onClick={() => setShowWarningDismissed(true)}
              className="px-2.5 py-1 text-xs bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition-colors"
            >
              显示全部
            </button>
          )}
          <button
            onClick={() => {
              setShowWarningDismissed(true);
              setSimplifiedMode(true);
            }}
            className="px-2.5 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
          >
            使用简化模式
          </button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden bg-slate-900/50" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            <marker
              id="dfg-arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#a855f7" />
            </marker>
            <filter id="dfg-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g
            transform={`translate(${isDragging ? pan.x : centeredPan.x}, ${isDragging ? pan.y : centeredPan.y}) scale(${zoom})`}
            style={{ transition: isDragging ? 'none' : 'transform 0.2s ease-out' }}
          >
            {layoutData.edges.map((edge, idx) => {
              const sourceNode = layoutData.nodes.find((n) => n.id === edge.source);
              const targetNode = layoutData.nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const isHighlighted =
                selectedNode && (edge.source === selectedNode || edge.target === selectedNode);

              return (
                <g key={idx}>
                  <path
                    d={getEdgePath(sourceNode, targetNode)}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth={isHighlighted ? 2.5 : simplifiedMode ? 1.2 : 1.5}
                    strokeOpacity={selectedNode && !isHighlighted ? 0.15 : simplifiedMode ? 0.5 : 0.7}
                    markerEnd="url(#dfg-arrowhead)"
                    filter={isHighlighted ? 'url(#dfg-glow)' : undefined}
                    className="transition-all duration-200"
                  />
                  {!simplifiedMode && (
                    <text
                      x={(sourceNode.x + targetNode.x) / 2}
                      y={(sourceNode.y + targetNode.y) / 2 - 5}
                      fontSize="10"
                      fill="#a855f7"
                      opacity={selectedNode && !isHighlighted ? 0.3 : 0.8}
                      textAnchor="middle"
                      className="transition-opacity duration-200"
                    >
                      op{edge.operandIndex}
                    </text>
                  )}
                </g>
              );
            })}

            {layoutData.nodes.map((node) => {
              const isSelected = selectedNode === node.id;
              const isHighlighted =
                selectedNode &&
                layoutData.edges.some(
                  (e) =>
                    (e.source === selectedNode && e.target === node.id) ||
                    (e.target === selectedNode && e.source === node.id)
                ) || isSelected;

              const getNodeFillColor = () => {
                if (isSelected) return 'rgba(168, 85, 247, 0.3)';
                switch (node.type) {
                  case 'instruction': return 'rgba(59, 130, 246, 0.2)';
                  case 'argument': return 'rgba(16, 185, 129, 0.2)';
                  case 'constant': return 'rgba(245, 158, 11, 0.2)';
                  default: return 'rgba(30, 41, 59, 0.8)';
                }
              };

              const getNodeStrokeColor = () => {
                if (isSelected) return '#a855f7';
                switch (node.type) {
                  case 'instruction': return '#60a5fa';
                  case 'argument': return '#34d399';
                  case 'constant': return '#fbbf24';
                  default: return '#475569';
                }
              };

              return (
                <g
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(isSelected ? null : node.id);
                  }}
                  style={{ cursor: 'pointer', opacity: selectedNode && !isHighlighted ? 0.25 : 1 }}
                  className="transition-opacity duration-200"
                >
                  {simplifiedMode ? (
                    <rect
                      x={node.x - node.width / 2}
                      y={node.y - node.height / 2}
                      width={node.width}
                      height={node.height}
                      rx={5}
                      fill={getNodeFillColor()}
                      stroke={getNodeStrokeColor()}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      className="transition-all duration-200 hover:stroke-purple-400"
                      style={{ filter: isSelected ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))' : undefined }}
                    />
                  ) : (
                    <foreignObject
                      x={node.x - node.width / 2}
                      y={node.y - node.height / 2}
                      width={node.width}
                      height={node.height}
                    >
                      <div
                        className={`w-full h-full rounded-lg border-2 px-2 py-1.5 flex flex-col justify-center ${getNodeColor(
                          node,
                          isSelected
                        )} ${isSelected ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-900' : ''} hover:border-purple-400 transition-all duration-200`}
                        style={{ filter: isSelected ? 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.5))' : undefined }}
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              node.type === 'instruction'
                                ? 'bg-blue-400'
                                : node.type === 'argument'
                                ? 'bg-emerald-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span className="text-[10px] font-mono font-semibold text-slate-200 truncate">
                            {node.type === 'constant'
                              ? node.instruction
                              : node.type === 'argument'
                              ? node.valueName || 'arg'
                              : `%${node.valueName}`}
                          </span>
                        </div>
                        {node.type === 'instruction' && (
                          <div className="text-[9px] font-mono text-slate-400 truncate mt-0.5">
                            {node.instruction.split('=')[1]?.trim().slice(0, 25) + (node.instruction.split('=')[1]?.length > 25 ? '...' : '') || node.instruction.slice(0, 25)}
                          </div>
                        )}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-4 left-4 flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-400" />
            <span className="text-slate-400">指令</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-400" />
            <span className="text-slate-400">参数</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-400" />
            <span className="text-slate-400">常量</span>
          </div>
        </div>

        {selectedNode && layoutData.nodes.find((n) => n.id === selectedNode) && (
          <div className="absolute top-4 right-4 w-96 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    layoutData.nodes.find((n) => n.id === selectedNode)?.type === 'instruction'
                      ? 'bg-blue-500/20 text-blue-400'
                      : layoutData.nodes.find((n) => n.id === selectedNode)?.type === 'argument'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {layoutData.nodes.find((n) => n.id === selectedNode)?.type}
                </span>
                <h4 className="text-sm font-semibold text-slate-200">
                  {layoutData.nodes.find((n) => n.id === selectedNode)?.valueName || '节点'}
                </h4>
              </div>
            </div>
            <div className="p-3 max-h-60 overflow-y-auto">
              <h5 className="text-xs font-medium text-slate-400 mb-2">完整指令</h5>
              <div className="text-[11px] font-mono text-slate-300 bg-slate-900/50 p-3 rounded break-all whitespace-pre-wrap">
                {layoutData.nodes.find((n) => n.id === selectedNode)?.instruction}
              </div>
              {layoutData.nodes.find((n) => n.id === selectedNode)?.type === 'instruction' && (
                <div className="mt-3">
                  <h5 className="text-xs font-medium text-slate-400 mb-2">操作数来源</h5>
                  <div className="space-y-1">
                    {layoutData.edges
                      .filter((e) => e.target === selectedNode)
                      .map((e, i) => {
                        const sourceNode = layoutData.nodes.find((n) => n.id === e.source);
                        return (
                          <div
                            key={i}
                            className="text-[11px] font-mono text-slate-300 bg-slate-900/50 px-2 py-1 rounded flex items-center gap-2"
                          >
                            <span className="text-purple-400">op{e.operandIndex}</span>
                            <span>←</span>
                            <span className="text-slate-400">
                              {sourceNode?.valueName || sourceNode?.instruction.slice(0, 20)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DFGViewer;
