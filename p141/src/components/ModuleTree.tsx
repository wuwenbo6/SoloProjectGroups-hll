import React from 'react';
import { ChevronRight, ChevronDown, Cpu, Box, Database, ArrowRight, ArrowLeft, Server } from 'lucide-react';
import type { TreeNode } from '../types/gsdml';
import { useAppStore } from '../store/appStore';
import { cn } from '../lib/utils';

interface TreeNodeProps {
  node: TreeNode;
  level: number;
}

const TreeNodeComponent: React.FC<TreeNodeProps> = ({ node, level }) => {
  const { expandedNodes, selectedNodeId, toggleNodeExpanded, setSelectedNodeId } = useAppStore();

  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = () => {
    switch (node.type) {
      case 'device':
        return <Server className="w-4 h-4 text-[#165DFF]" />;
      case 'module':
        return <Cpu className="w-4 h-4 text-purple-500" />;
      case 'submodule':
        return <Box className="w-4 h-4 text-amber-500" />;
      case 'input':
        return <ArrowLeft className="w-4 h-4 text-green-500" />;
      case 'output':
        return <ArrowRight className="w-4 h-4 text-blue-500" />;
      default:
        return <Database className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    if (hasChildren) {
      toggleNodeExpanded(node.id);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-all duration-150',
          'hover:bg-gray-100',
          isSelected && 'bg-[#165DFF]/10 text-[#165DFF]',
          !isSelected && 'text-gray-700'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="w-5 flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <span className="w-4 h-4" />
          )}
        </span>
        <span className="mr-2 flex-shrink-0">{getIcon()}</span>
        <span className="text-sm truncate">{node.name}</span>
      </div>

      {hasChildren && isExpanded && (
        <div className="overflow-hidden transition-all duration-200">
          {node.children!.map((child) => (
            <TreeNodeComponent key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ModuleTree: React.FC = () => {
  const { moduleTree, parsedGSDML } = useAppStore();

  if (!parsedGSDML || moduleTree.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
        <Database className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm text-center">上传GSDML文件后<br />在此显示设备模块树</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">设备模块树</h3>
        <p className="text-xs text-gray-500 mt-0.5">点击展开查看详情</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {moduleTree.map((node) => (
          <TreeNodeComponent key={node.id} node={node} level={0} />
        ))}
      </div>
    </div>
  );
};
