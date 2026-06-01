#!/usr/bin/env python3
import os

BASE = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p201'

files = {}

files['src/components/ConfigTree.tsx'] = r"""import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useKconfigStore } from '@/store/kconfigStore';
import { ConfigTreeRow } from './ConfigTreeRow';
import { FileWarning } from 'lucide-react';

const ROW_HEIGHT = 34;
const OVERSCAN = 8;

export function ConfigTree() {
  const loaded = useKconfigStore((s) => s.loaded);
  const tree = useKconfigStore((s) => s.tree);
  const expandedNodes = useKconfigStore((s) => s.expandedNodes);
  const searchQuery = useKconfigStore((s) => s.searchQuery);
  const values = useKconfigStore((s) => s.values);
  const getFlatItems = useKconfigStore((s) => s.getFlatItems);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const flatItems = useMemo(() => getFlatItems(), [tree, expandedNodes, searchQuery, values]);

  const totalCount = flatItems.length;
  const totalHeight = totalCount * ROW_HEIGHT;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalCount - 1,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  );

  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileWarning className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-mono">No Kconfig loaded</p>
        <p className="text-sm mt-2">Upload a Kconfig file or load a sample</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, idx) => (
          <ConfigTreeRow
            key={item.nodeId}
            node={item.node}
            level={item.level}
            top={(startIndex + idx) * ROW_HEIGHT}
          />
        ))}
      </div>
    </div>
  );
}
"""

files['src/components/ConfigTreeRow.tsx'] = r"""import { ChevronRight, ChevronDown, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KconfigNode } from '../../shared/types';
import { useKconfigStore } from '@/store/kconfigStore';

interface ConfigTreeRowProps {
  node: KconfigNode;
  level: number;
  top: number;
}

export function ConfigTreeRow({ node, level, top }: ConfigTreeRowProps) {
  const values = useKconfigStore((s) => s.values);
  const symbols = useKconfigStore((s) => s.symbols);
  const expandedNodes = useKconfigStore((s) => s.expandedNodes);
  const selectedNodeId = useKconfigStore((s) => s.selectedNodeId);
  const lastAutoEnabled = useKconfigStore((s) => s.lastAutoEnabled);
  const lastAutoSelected = useKconfigStore((s) => s.lastAutoSelected);
  const selectNode = useKconfigStore((s) => s.selectNode);
  const toggleExpand = useKconfigStore((s) => s.toggleExpand);
  const toggleValue = useKconfigStore((s) => s.toggleValue);
  const setTristateValue = useKconfigStore((s) => s.setTristateValue);

  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = ((node.children?.length ?? 0) > 0) || ((node.choiceOptions?.length ?? 0) > 0);

  const symbol = node.name ? symbols[node.name] : undefined;
  const currentValue = node.name ? values[node.name] : undefined;

  const isDisabled = symbol?.dependencies?.some((dep: string) => {
    const v = values[dep];
    return v !== true && v !== 'y' && v !== 'm';
  });

  const isAutoEnabled = lastAutoEnabled.includes(node.name || '');
  const isAutoSelected = lastAutoSelected.includes(node.name || '');

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) toggleExpand(node.id);
  };

  const handleSelect = () => {
    selectNode(node.id);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.name || isDisabled) return;
    toggleValue(node.name);
  };

  const handleTristateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.name || isDisabled) return;
    const cv = currentValue;
    if (cv === true || cv === 'y') setTristateValue(node.name, 'm');
    else if (cv === 'm') setTristateValue(node.name, 'n');
    else setTristateValue(node.name, 'y');
  };

  const renderValue = () => {
    if (node.type === 'comment' || node.type === 'menu' || node.type === 'choice') return null;
    if (!symbol) return null;

    if (symbol.type === 'bool') {
      const isChecked = currentValue === true || currentValue === 'y';
      return (
        <button
          onClick={handleCheckboxClick}
          disabled={isDisabled}
          className={cn(
            'mr-2 transition-opacity',
            isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
          )}
        >
          {isChecked ? (
            <CheckSquare className="w-4 h-4 text-green-400" fill="currentColor" />
          ) : (
            <Square className="w-4 h-4 text-gray-500" />
          )}
        </button>
      );
    }

    if (symbol.type === 'tristate') {
      const isY = currentValue === 'y' || currentValue === true;
      const isM = currentValue === 'm';
      return (
        <button
          onClick={handleTristateClick}
          disabled={isDisabled}
          className={cn(
            'mr-2 font-mono text-xs w-6',
            isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
          )}
        >
          {isY ? (
            <span className="text-green-400">&lt;*&gt;</span>
          ) : isM ? (
            <span className="text-blue-400">&lt;M&gt;</span>
          ) : (
            <span className="text-gray-500">&lt; &gt;</span>
          )}
        </button>
      );
    }

    return (
      <span className="mr-2 font-mono text-xs text-cyan-400">
        {String(currentValue || '').slice(0, 10)}
        {String(currentValue || '').length > 10 ? '...' : ''}
      </span>
    );
  };

  const renderTypeTag = () => {
    if (!symbol) return null;
    const colors: Record<string, string> = {
      bool: 'bg-purple-900 text-purple-300',
      tristate: 'bg-blue-900 text-blue-300',
      string: 'bg-green-900 text-green-300',
      int: 'bg-orange-900 text-orange-300',
      hex: 'bg-yellow-900 text-yellow-300',
    };
    return (
      <span className={cn(
        'ml-2 px-1.5 py-0.5 text-[10px] rounded font-mono',
        colors[symbol.type] || 'bg-gray-700 text-gray-300'
      )}>
        {symbol.type}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center py-1 px-2 cursor-pointer border-l-2 transition-colors absolute w-full',
        isSelected
          ? 'bg-gray-800 border-green-500'
          : 'border-transparent hover:bg-gray-800/50'
      )}
      style={{
        paddingLeft: `${level * 16 + 8}px`,
        top: `${top}px`,
        height: `${ROW_HEIGHT}px`,
        boxSizing: 'border-box',
      }}
      onClick={handleSelect}
    >
      <button
        onClick={handleToggleExpand}
        className={cn(
          'mr-1 p-0.5 rounded transition-colors',
          hasChildren ? 'hover:bg-gray-700' : 'invisible'
        )}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {renderValue()}

      <span
        className={cn(
          'flex-1 text-sm font-mono truncate',
          isDisabled ? 'text-gray-600' : 'text-gray-200'
        )}
      >
        {node.prompt || node.name || (node.type === 'choice' ? 'Choice' : '')}
        {node.name && node.prompt && (
          <span className="ml-2 text-gray-500 text-xs">({node.name})</span>
        )}
      </span>

      {isAutoEnabled && !isAutoSelected && (
        <span className="ml-1 text-[10px] text-green-500 font-mono">
          auto
        </span>
      )}
      {isAutoSelected && (
        <span className="ml-1 text-[10px] text-cyan-400 font-mono">
          select
        </span>
      )}

      {renderTypeTag()}

      {isDisabled && (
        <span className="ml-2 text-[10px] text-amber-500">
          deps unmet
        </span>
      )}
    </div>
  );
}
"""

for path, content in files.items():
    full_path = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f'Written: {path}')
