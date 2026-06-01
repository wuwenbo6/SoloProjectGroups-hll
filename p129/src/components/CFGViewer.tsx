import React, { useMemo, useState, useRef } from 'react';
import { GitBranch, ChevronDown, ZoomIn, ZoomOut, Maximize2, Info, AlertTriangle, Eye, EyeOff, Download } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { exportCFGToDot, downloadBlob } from '@/services/api.service';
import dagre from 'dagre';
import type { ControlFlowGraph, BasicBlock } from '@shared/types';

interface PositionedBlock extends BasicBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WARNING_THRESHOLD = 50;
const NODE_HARD_LIMIT = 100;

const CFGViewer: React.FC = () => {
  const { compileResult, selectedFunction, setSelectedFunction } = useLLVMStore();
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showWarningDismissed, setShowWarningDismissed] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const currentCFG = useMemo(() => {
    if (!compileResult?.cfgs) return null;
    return compileResult.cfgs.find((cfg) => cfg.functionName === selectedFunction) || compileResult.cfgs[0];
  }, [compileResult?.cfgs, selectedFunction]);

  const layoutData = useMemo(() => {
    if (!currentCFG) return null;

    let displayBlocks = currentCFG.blocks;
    let displayEdges = currentCFG.edges;
    const totalBlocks = currentCFG.blocks.length;
    const isTruncated = totalBlocks > NODE_HARD_LIMIT && !showWarningDismissed;

    if (isTruncated) {
      displayBlocks = currentCFG.blocks.slice(0, NODE_HARD_LIMIT);
      const visibleBlockIds = new Set(displayBlocks.map((b) => b.id));
      displayEdges = currentCFG.edges.filter(
        (e) => visibleBlockIds.has(e.source) && visibleBlockIds.has(e.target)
      );
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', ranksep: simplifiedMode ? 40 : 60, nodesep: simplifiedMode ? 30 : 50 });
    g.setDefaultEdgeLabel(() => ({}));

    displayBlocks.forEach((block) => {
      if (simplifiedMode) {
        g.setNode(block.id, { width: 100, height: 40, label: block.label });
      } else {
        const width = Math.max(180, block.instructions.length * 12 + 80);
        const height = 60 + block.instructions.length * 20;
        g.setNode(block.id, { width, height, label: block.label });
      }
    });

    displayEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target, { type: edge.type });
    });

    try {
      dagre.layout(g);
    } catch {
      return null;
    }

    const positionedBlocks: PositionedBlock[] = displayBlocks.map((block) => {
      const node = g.node(block.id);
      return {
        ...block,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      };
    });

    const svgWidth = g.graph().width || 800;
    const svgHeight = g.graph().height || 600;

    return {
      blocks: positionedBlocks,
      edges: displayEdges,
      svgWidth,
      svgHeight,
      totalBlocks,
      isTruncated,
    };
  }, [currentCFG, simplifiedMode, showWarningDismissed]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !selectedBlock) {
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

  const getEdgePath = (
    source: PositionedBlock,
    target: PositionedBlock
  ): string => {
    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height;
    const targetX = target.x + target.width / 2;
    const targetY = target.y;

    const midY = (sourceY + targetY) / 2;

    return `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;
  };

  const getBlockColor = (block: PositionedBlock, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-blue-500/30 border-blue-400';
    }
    if (block.label === 'entry') {
      return 'bg-emerald-500/20 border-emerald-400';
    }
    if (block.successors.length === 0 || block.instructions.some((i) => i.includes('ret '))) {
      return 'bg-red-500/20 border-red-400';
    }
    return 'bg-slate-800/80 border-slate-600';
  };

  const viewportWidth = svgRef.current?.clientWidth || 800;
  const viewportHeight = svgRef.current?.clientHeight || 600;

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
          <GitBranch className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">等待编译</h3>
          <p className="text-slate-500 text-sm">编译后将显示控制流图</p>
        </div>
      </div>
    );
  }

  if (!layoutData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-center p-8">
          <Info className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">没有可用的 CFG 数据</h3>
          <p className="text-slate-500 text-sm">当前代码中没有检测到函数</p>
        </div>
      </div>
    );
  }

  const showWarning = layoutData && layoutData.totalBlocks > NODE_WARNING_THRESHOLD && !showWarningDismissed;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-slate-300">控制流图</span>
          </div>
          <div className="relative">
            <select
              value={selectedFunction}
              onChange={(e) => {
                setSelectedFunction(e.target.value);
                setSelectedBlock(null);
              }}
              className="appearance-none bg-slate-700 text-slate-200 text-sm pl-3 pr-8 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {compileResult.cfgs.map((cfg) => (
                <option key={cfg.functionName} value={cfg.functionName}>
                  @{cfg.functionName} ({cfg.blocks.length} 块)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className={`${layoutData?.isTruncated ? 'text-amber-400' : 'text-slate-500'}`}>
              {layoutData?.isTruncated ? `${layoutData.blocks.length}/${layoutData.totalBlocks}` : layoutData?.blocks.length} 个基本块
            </span>
            <span className="text-slate-500">{layoutData?.edges.length} 条边</span>
          </div>
          <button
            onClick={() => setSimplifiedMode(!simplifiedMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              simplifiedMode
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
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
              if (currentCFG) {
                try {
                  const blob = await exportCFGToDot(currentCFG);
                  downloadBlob(blob, `${currentCFG.functionName}_cfg.dot`);
                } catch (err) {
                  console.error('Failed to export:', err);
                }
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors text-xs"
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
            警告：当前函数包含 {layoutData.totalBlocks} 个基本块，可能导致性能问题。
            {layoutData.isTruncated && ` 已限制显示前 ${NODE_HARD_LIMIT} 个节点。`}
            建议使用「简化模式」或选择较小的函数。
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
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker
              id="arrowhead-cond"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
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
              const sourceBlock = layoutData.blocks.find((b) => b.id === edge.source);
              const targetBlock = layoutData.blocks.find((b) => b.id === edge.target);
              if (!sourceBlock || !targetBlock) return null;

              const isHighlighted =
                selectedBlock && (edge.source === selectedBlock || edge.target === selectedBlock);

              return (
                <g key={idx}>
                  <path
                    d={getEdgePath(sourceBlock, targetBlock)}
                    fill="none"
                    stroke={edge.type === 'conditional' ? '#f59e0b' : '#64748b'}
                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                    strokeOpacity={selectedBlock && !isHighlighted ? 0.2 : 1}
                    markerEnd={`url(#arrowhead${edge.type === 'conditional' ? '-cond' : ''})`}
                    filter={isHighlighted ? 'url(#glow)' : undefined}
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}

            {layoutData.blocks.map((block) => {
              const isSelected = selectedBlock === block.id;
              const isHighlighted =
                selectedBlock &&
                (block.predecessors.includes(selectedBlock) ||
                  block.successors.includes(selectedBlock) ||
                  isSelected);

              return (
                <g
                  key={block.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlock(isSelected ? null : block.id);
                  }}
                  style={{ cursor: 'pointer', opacity: selectedBlock && !isHighlighted ? 0.3 : 1 }}
                  className="transition-opacity duration-200"
                >
                  {simplifiedMode ? (
                    <>
                      <rect
                        x={block.x - block.width / 2}
                        y={block.y - block.height / 2}
                        width={block.width}
                        height={block.height}
                        rx={6}
                        fill={
                          isSelected
                            ? 'rgba(59, 130, 246, 0.3)'
                            : block.label === 'entry'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : block.successors.length === 0 ||
                              block.instructions.some((i) => i.includes('ret '))
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(30, 41, 59, 0.8)'
                        }
                        stroke={
                          isSelected
                            ? '#60a5fa'
                            : block.label === 'entry'
                            ? '#34d399'
                            : block.successors.length === 0 ||
                              block.instructions.some((i) => i.includes('ret '))
                            ? '#f87171'
                            : '#475569'
                        }
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        className="transition-all duration-200 hover:stroke-blue-400"
                        style={{ filter: isSelected ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' : undefined }}
                      />
                      <text
                        x={block.x}
                        y={block.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="11"
                        fill="#e2e8f0"
                        fontFamily="monospace"
                        fontWeight="500"
                      >
                        {block.label}
                      </text>
                    </>
                  ) : (
                    <foreignObject
                      x={block.x - block.width / 2}
                      y={block.y - block.height / 2}
                      width={block.width}
                      height={block.height}
                    >
                      <div
                        className={`w-full h-full rounded-lg border-2 p-3 overflow-hidden ${getBlockColor(
                          block,
                          isSelected
                        )} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' : ''} hover:border-blue-400 transition-all duration-200`}
                        style={{ filter: isSelected ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.5))' : undefined }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              block.label === 'entry'
                                ? 'bg-emerald-400'
                                : block.successors.length === 0 ||
                                  block.instructions.some((i) => i.includes('ret '))
                                ? 'bg-red-400'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="text-xs font-mono font-semibold text-slate-200">
                            {block.label}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {block.instructions.slice(0, 3).map((inst, i) => (
                            <div
                              key={i}
                              className="text-[10px] font-mono text-slate-400 truncate"
                              title={inst}
                            >
                              {inst}
                            </div>
                          ))}
                          {block.instructions.length > 3 && (
                            <div className="text-[10px] text-slate-500">
                              +{block.instructions.length - 3} more...
                            </div>
                          )}
                        </div>
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
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-slate-400">入口</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-slate-400">出口</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-slate-500" />
            <span className="text-slate-400">无条件</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span className="text-slate-400">条件</span>
          </div>
        </div>

        {selectedBlock && layoutData.blocks.find((b) => b.id === selectedBlock) && (
          <div className="absolute top-4 right-4 w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-700 bg-slate-800/50">
              <h4 className="text-sm font-semibold text-slate-200">
                基本块: {layoutData.blocks.find((b) => b.id === selectedBlock)?.label}
              </h4>
            </div>
            <div className="p-3 max-h-60 overflow-y-auto">
              <h5 className="text-xs font-medium text-slate-400 mb-2">指令</h5>
              <div className="space-y-1">
                {layoutData.blocks
                  .find((b) => b.id === selectedBlock)
                  ?.instructions.map((inst, i) => (
                    <div
                      key={i}
                      className="text-[11px] font-mono text-slate-300 bg-slate-900/50 px-2 py-1 rounded"
                    >
                      {inst}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CFGViewer;
