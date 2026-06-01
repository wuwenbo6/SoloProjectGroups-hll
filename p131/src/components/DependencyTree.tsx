import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Package, AlertTriangle, CheckCircle, Repeat, AlertCircle } from 'lucide-react';

export interface DependencyNode {
  id: string;
  name: string;
  version?: string;
  dependencies: DependencyNode[];
  optional: boolean;
  resolved: boolean;
  circular: boolean;
  error?: string;
}

interface DependencyTreeProps {
  dependencies: DependencyNode[];
  maxDepth?: number;
}

export const DependencyTree: React.FC<DependencyTreeProps> = ({
  dependencies,
  maxDepth = 5,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const renderNode = (
    node: DependencyNode,
    depth: number,
    parentPath: string = ''
  ): React.ReactNode => {
    const nodeId = `${parentPath}/${node.id}`;
    const isExpanded = expandedNodes.has(nodeId);
    const hasChildren = node.dependencies && node.dependencies.length > 0;

    if (depth > maxDepth) {
      return (
        <div className="ml-4 pl-4 border-l border-slate-700 text-xs text-slate-500">
          Maximum depth reached
        </div>
      );
    }

    return (
      <div key={nodeId} className="pl-4">
        <div className="flex items-start gap-2 py-1">
          {hasChildren ? (
            <button
              onClick={() => toggleNode(nodeId)}
              className="p-0.5 hover:bg-slate-700 rounded transition-colors flex-shrink-0 mt-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>
          ) : (
            <div className="w-5 flex-shrink-0" />
          )}

          <div className="flex-shrink-0 mt-0.5">
            {node.circular ? (
              <Repeat className="w-4 h-4 text-orange-400" />
            ) : !node.resolved ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : node.optional ? (
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            ) : (
              <Package className="w-4 h-4 text-teal-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-white truncate">
                {node.name}
              </span>
              {node.version && (
                <span className="text-xs text-slate-500 font-mono">
                  v{node.version}
                </span>
              )}
              {node.circular && (
                <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                  循环依赖
                </span>
              )}
              {!node.resolved && !node.circular && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                  未解析
                </span>
              )}
              {node.optional && node.resolved && (
                <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                  可选
                </span>
              )}
            </div>
            {node.error && (
              <div className="text-xs text-red-400/80 mt-0.5">
                {node.error}
              </div>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-slate-700 pl-4 mt-1">
            {node.dependencies.map((child) =>
              renderNode(child, depth + 1, nodeId)
            )}
          </div>
        )}
      </div>
    );
  };

  if (dependencies.length === 0) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <CheckCircle className="w-4 h-4 text-green-500" />
        <span>该插件无外部依赖</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {dependencies.map((dep) => renderNode(dep, 0))}
    </div>
  );
};
