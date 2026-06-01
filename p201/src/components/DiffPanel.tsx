import { useState, useRef } from 'react';
import { useKconfigStore } from '@/store/kconfigStore';
import type { DiffType } from '../../shared/types';
import { Upload, X, ChevronDown, ChevronRight, FileDiff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const typeColors: Record<DiffType | 'all', string> = {
  all: 'bg-gray-700 text-gray-300',
  added: 'bg-green-900 text-green-400',
  removed: 'bg-red-900 text-red-400',
  modified: 'bg-yellow-900 text-yellow-400',
  unchanged: 'bg-gray-700 text-gray-400',
};

const typeLabels: Record<DiffType | 'all', string> = {
  all: 'All',
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

export function DiffPanel() {
  const diffResult = useKconfigStore((s) => s.diffResult);
  const diffFilter = useKconfigStore((s) => s.diffFilter);
  const showDiffOnly = useKconfigStore((s) => s.showDiffOnly);
  const loadReferenceConfig = useKconfigStore((s) => s.loadReferenceConfig);
  const clearReferenceConfig = useKconfigStore((s) => s.clearReferenceConfig);
  const setDiffFilter = useKconfigStore((s) => s.setDiffFilter);
  const toggleShowDiffOnly = useKconfigStore((s) => s.toggleShowDiffOnly);
  const selectNode = useKconfigStore((s) => s.selectNode);
  const tree = useKconfigStore((s) => s.tree);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['modified', 'added', 'removed']));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      await loadReferenceConfig(text);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (type: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const findAndSelectNode = (name: string) => {
    function find(nodes: any[]): string | null {
      for (const n of nodes) {
        if (n.name === name) return n.id;
        const child = n.children || n.choiceOptions || [];
        const found = find(child);
        if (found) return found;
      }
      return null;
    }
    const id = find(tree);
    if (id) selectNode(id);
  };

  if (!diffResult) {
    return (
      <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 text-gray-400 mb-4">
          <FileDiff className="w-5 h-5" />
          <span className="font-mono text-sm">Diff Compare</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".config,.conf"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-5 h-5" />
          <span>{loading ? 'Loading...' : 'Upload .config file'}</span>
        </button>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  const groupedItems = diffResult.items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, typeof diffResult.items>);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2 text-gray-300">
          <FileDiff className="w-4 h-4" />
          <span className="font-mono text-sm">Diff Results</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShowDiffOnly}
            className={cn(
              'text-xs px-2 py-1 rounded font-mono transition-colors',
              showDiffOnly
                ? 'bg-blue-900 text-blue-300'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            )}
          >
            {showDiffOnly ? 'Hide Same' : 'Show All'}
          </button>
          <button
            onClick={clearReferenceConfig}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-gray-700 flex gap-1 flex-wrap">
        {(['all', 'modified', 'added', 'removed', 'unchanged'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setDiffFilter(t)}
            className={cn(
              'text-xs px-2 py-1 rounded font-mono',
              diffFilter === t ? typeColors[t] : 'bg-gray-800 text-gray-500'
            )}
          >
            {typeLabels[t]}
            {t !== 'all' && (
              <span className="ml-1 opacity-70">
                ({t === 'modified' ? diffResult.modifiedCount : t === 'added' ? diffResult.addedCount : t === 'removed' ? diffResult.removedCount : diffResult.unchangedCount})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {Object.entries(groupedItems).map(([type, items]) => {
          if (diffFilter !== 'all' && diffFilter !== type) return null;
          const isExpanded = expandedSections.has(type);
          return (
            <div key={type} className="mb-2">
              <button
                onClick={() => toggleSection(type)}
                className="w-full flex items-center gap-1 text-xs text-gray-400 py-1 hover:text-gray-300"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span className={cn('px-1 rounded', typeColors[type as DiffType])}>
                  {typeLabels[type as DiffType]}
                </span>
                <span className="text-gray-500">({items.length})</span>
              </button>
              {isExpanded && (
                <div className="ml-4 space-y-0.5">
                  {items.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => findAndSelectNode(item.name)}
                      className="w-full text-left text-xs font-mono py-0.5 px-2 rounded hover:bg-gray-800 flex items-center justify-between"
                    >
                      <span className="text-gray-300">{item.name}</span>
                      <span className="text-gray-500">
                        {formatValue(item.referenceValue)} → {formatValue(item.currentValue)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(v: any): string {
  if (v === true || v === 'y') return 'y';
  if (v === false || v === undefined || v === null) return 'n';
  return String(v);
}
