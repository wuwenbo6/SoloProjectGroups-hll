import { useKconfigStore } from '@/store/kconfigStore';
import { Info, Link2, BookOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function findNodeById(nodes: any[], id: string): any | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
    if (node.choiceOptions) {
      const found = findNodeById(node.choiceOptions, id);
      if (found) return found;
    }
  }
  return null;
}

export function ConfigDetail() {
  const tree = useKconfigStore((s) => s.tree);
  const symbols = useKconfigStore((s) => s.symbols);
  const values = useKconfigStore((s) => s.values);
  const nodeSelects = useKconfigStore((s) => s.nodeSelects);
  const selectedNodeId = useKconfigStore((s) => s.selectedNodeId);
  const selectNode = useKconfigStore((s) => s.selectNode);

  const node = selectedNodeId ? findNodeById(tree, selectedNodeId) : null;
  const symbol = node?.name ? symbols[node.name] : null;

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <Info className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm font-mono">Select a configuration option</p>
        <p className="text-xs mt-2 text-gray-600">to view details</p>
      </div>
    );
  }

  const currentValue = node.name ? values[node.name] : undefined;
  const unmetDeps = symbol?.dependencies?.filter((dep: string) => {
    const depValue = values[dep];
    return depValue !== true && depValue !== 'y' && depValue !== 'm';
  }) || [];

  const dependents = node?.name ? Object.entries(symbols)
    .filter(([, sym]) => sym.dependencies.includes(node.name!))
    .map(([name]) => name) : [];

  const selectedByOthers = node?.name ? Object.entries(nodeSelects)
    .filter(([, selects]) => selects.includes(node.name!))
    .map(([name]) => name) : [];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-mono font-bold text-green-400">
            {node.prompt || node.type}
          </h3>
          {node.name && (
            <p className="text-sm text-gray-500 font-mono mt-1">
              CONFIG_{node.name}
            </p>
          )}
        </div>
        <button
          onClick={() => selectNode(null)}
          className="p-1 hover:bg-gray-700 rounded"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">Basic Info</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className={cn(
                'font-mono px-2 py-0.5 rounded',
                symbol?.type === 'bool' && 'bg-purple-900 text-purple-300',
                symbol?.type === 'tristate' && 'bg-blue-900 text-blue-300',
                symbol?.type === 'string' && 'bg-green-900 text-green-300',
                symbol?.type === 'int' && 'bg-orange-900 text-orange-300',
                symbol?.type === 'hex' && 'bg-yellow-900 text-yellow-300',
                !symbol && node.type === 'menu' && 'bg-gray-700 text-gray-300',
                !symbol && node.type === 'choice' && 'bg-cyan-900 text-cyan-300',
                !symbol && node.type === 'comment' && 'bg-gray-700 text-gray-300',
              )}>
                {symbol?.type || node.type}
              </span>
            </div>
            {symbol && (
              <div className="flex justify-between">
                <span className="text-gray-500">Value</span>
                <span className="font-mono text-green-400">
                  {String(currentValue ?? '(not set)')}
                </span>
              </div>
            )}
            {symbol?.defaultValue && (
              <div className="flex justify-between">
                <span className="text-gray-500">Default</span>
                <span className="font-mono text-yellow-400">
                  {symbol.defaultValue}
                </span>
              </div>
            )}
          </div>
        </div>

        {symbol?.dependencies?.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Dependencies ({symbol.dependencies.length})
              </span>
            </div>
            <div className="space-y-1">
              {symbol.dependencies.map((dep: string) => {
                const isMet = !unmetDeps.includes(dep);
                return (
                  <div
                    key={dep}
                    className={cn(
                      'flex items-center gap-2 text-sm font-mono px-2 py-1 rounded',
                      isMet ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'
                    )}
                  >
                    <span>{isMet ? '✓' : '✗'}</span>
                    <span>{dep}</span>
                    <span className="text-gray-500 text-xs ml-auto">
                      = {String(values[dep] ?? 'n')}
                    </span>
                  </div>
                );
              })}
            </div>
            {unmetDeps.length > 0 && (
              <p className="text-xs text-amber-500 mt-2">
                ⚠ {unmetDeps.length} unmet dependencies
              </p>
            )}
          </div>
        )}

        {node.help && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Help</span>
            </div>
            <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono text-xs leading-relaxed">
              {node.help}
            </div>
          </div>
        )}

        {node.select?.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Selects ({node.select.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {node.select.map((s: string) => (
                <span
                  key={s}
                  className="text-xs font-mono px-2 py-0.5 bg-green-900/30 text-green-400 rounded"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.implies?.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Implies ({node.implies.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {node.implies.map((s: string) => (
                <span
                  key={s}
                  className="text-xs font-mono px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {dependents.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Dependents ({dependents.length})
            </div>
            <div className="text-xs text-gray-500 mb-2">
              These options depend on this one
            </div>
            <div className="flex flex-wrap gap-1">
              {dependents.map((s: string) => {
                const depVal = values[s];
                const isActive = depVal === true || depVal === 'y' || depVal === 'm';
                return (
                  <span
                    key={s}
                    className={cn(
                      'text-xs font-mono px-2 py-0.5 rounded',
                      isActive ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-700/30 text-gray-400'
                    )}
                  >
                    {s}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {selectedByOthers.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Selected by ({selectedByOthers.length})
            </div>
            <div className="text-xs text-gray-500 mb-2">
              These options select this one via `select`
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedByOthers.map((s: string) => {
                const selVal = values[s];
                const isActive = selVal === true || selVal === 'y' || selVal === 'm';
                return (
                  <span
                    key={s}
                    className={cn(
                      'text-xs font-mono px-2 py-0.5 rounded',
                      isActive ? 'bg-cyan-900/30 text-cyan-400' : 'bg-gray-700/30 text-gray-400'
                    )}
                  >
                    {s}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
