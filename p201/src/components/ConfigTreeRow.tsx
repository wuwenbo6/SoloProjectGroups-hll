import { ChevronRight, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KconfigNode } from '../../shared/types';
import { useKconfigStore } from '@/store/kconfigStore';

const ROW_HEIGHT = 34;

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
  const diffResult = useKconfigStore((s) => s.diffResult);
  const selectNode = useKconfigStore((s) => s.selectNode);
  const toggleExpand = useKconfigStore((s) => s.toggleExpand);
  const toggleValue = useKconfigStore((s) => s.toggleValue);
  const setTristateValue = useKconfigStore((s) => s.setTristateValue);

  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const diffItem = node.name ? diffResult?.items.find((i) => i.name === node.name) : undefined;
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

  const handleSelect = () => selectNode(node.id);

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
        <button onClick={handleCheckboxClick} disabled={isDisabled}
          className={cn('mr-2 transition-opacity', isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80')}>
          {isChecked ? <CheckSquare className="w-4 h-4 text-green-400" fill="currentColor" /> : <Square className="w-4 h-4 text-gray-500" />}
        </button>
      );
    }
    if (symbol.type === 'tristate') {
      const isY = currentValue === 'y' || currentValue === true;
      const isM = currentValue === 'm';
      return (
        <button onClick={handleTristateClick} disabled={isDisabled}
          className={cn('mr-2 font-mono text-xs w-6', isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80')}>
          {isY ? <span className="text-green-400">{'<*>'}</span> : isM ? <span className="text-blue-400">{'<M>'}</span> : <span className="text-gray-500">{'< >'}</span>}
        </button>
      );
    }
    return (
      <span className="mr-2 font-mono text-xs text-cyan-400">
        {String(currentValue || '').slice(0, 10)}{String(currentValue || '').length > 10 ? '...' : ''}
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
      <span className={cn('ml-2 px-1.5 py-0.5 text-[10px] rounded font-mono', colors[symbol.type] || 'bg-gray-700 text-gray-300')}>
        {symbol.type}
      </span>
    );
  };

  const diffBorderClass = diffItem
    ? diffItem.type === 'added'
      ? 'border-green-500'
      : diffItem.type === 'removed'
      ? 'border-red-500'
      : diffItem.type === 'modified'
      ? 'border-yellow-500'
      : 'border-transparent'
    : 'border-transparent';

  return (
    <div
      className={cn('flex items-center px-2 cursor-pointer border-l-2 transition-colors absolute w-full',
        isSelected ? 'bg-gray-800 border-green-500' : diffItem && diffItem.type !== 'unchanged' ? `hover:bg-gray-800/50 ${diffBorderClass}` : 'border-transparent hover:bg-gray-800/50')}
      style={{ paddingLeft: `${level * 16 + 8}px`, top: `${top}px`, height: `${ROW_HEIGHT}px`, boxSizing: 'border-box' }}
      onClick={handleSelect}
    >
      <button onClick={handleToggleExpand}
        className={cn('mr-1 p-0.5 rounded transition-colors', hasChildren ? 'hover:bg-gray-700' : 'invisible')}>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {renderValue()}
      <span className={cn('flex-1 text-sm font-mono truncate', isDisabled ? 'text-gray-600' : 'text-gray-200')}>
        {node.prompt || node.name || (node.type === 'choice' ? 'Choice' : '')}
        {node.name && node.prompt && <span className="ml-2 text-gray-500 text-xs">({node.name})</span>}
      </span>
      {isAutoEnabled && !isAutoSelected && <span className="ml-1 text-[10px] text-green-500 font-mono">auto</span>}
      {isAutoSelected && <span className="ml-1 text-[10px] text-cyan-400 font-mono">select</span>}
      {renderTypeTag()}
      {isDisabled && <span className="ml-2 text-[10px] text-amber-500">deps unmet</span>}
    </div>
  );
}
