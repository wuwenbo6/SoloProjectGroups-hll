import { useDHTStore } from '@/hooks/useDHTStore';
import { Server, MapPin, Copy } from 'lucide-react';
import { useEffect } from 'react';

export default function SimulatedNodesList() {
  const { simulatedNodes, fetchSimulatedNodes } = useDHTStore();

  useEffect(() => {
    fetchSimulatedNodes();
    const interval = setInterval(fetchSimulatedNodes, 5000);
    return () => clearInterval(interval);
  }, [fetchSimulatedNodes]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-5 h-5 text-cyber-green" />
        <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
          模拟节点池
        </h2>
        <span className="ml-auto text-xs font-mono text-cyber-muted">{simulatedNodes.length} 个节点</span>
      </div>

      {simulatedNodes.length === 0 ? (
        <div className="text-center py-8 text-cyber-muted text-sm font-mono">
          暂无模拟节点
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {simulatedNodes.map((node, i) => (
            <div
              key={node.node_id}
              className="flex items-center gap-3 bg-cyber-bg rounded-lg px-3 py-2 border border-cyber-border group"
            >
              <span className="text-xs font-mono text-cyber-muted w-5">{i + 1}</span>
              <MapPin className="w-3 h-3 text-cyber-green flex-shrink-0" />
              <span className="text-xs font-mono text-cyber-text truncate flex-1" title={node.node_id}>
                {node.node_id.substring(0, 12)}...
              </span>
              <span className="text-xs font-mono text-cyber-muted">{node.address}</span>
              <button
                onClick={() => copyToClipboard(node.address)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-cyber-green"
                title="复制地址"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
