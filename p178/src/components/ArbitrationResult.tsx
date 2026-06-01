import { Trophy, XCircle, Star } from 'lucide-react';
import type { BusNode } from '../types/bus';
import { cn } from '../lib/utils';

interface ArbitrationResultProps {
  nodes: BusNode[];
  winnerNodeId: string | null;
  loserNodeIds: string[];
  hasSimulation: boolean;
}

export default function ArbitrationResult({
  nodes,
  winnerNodeId,
  loserNodeIds,
  hasSimulation,
}: ArbitrationResultProps) {
  const activeNodes = nodes.filter(
    n => n.id === winnerNodeId || loserNodeIds.includes(n.id)
  );

  const sortedByPriority = [...activeNodes].sort((a, b) => a.address - b.address);

  if (!hasSimulation || activeNodes.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-[#1a2332] bg-[#0f1623]">
        <h2 className="text-lg font-semibold text-[#00d4ff] mb-3">仲裁结果</h2>
        <div className="flex items-center justify-center h-24 text-[#3a4556] text-sm">
          暂无仲裁结果
        </div>
      </div>
    );
  }

  const winner = nodes.find(n => n.id === winnerNodeId);

  return (
    <div className="p-4 rounded-lg border border-[#1a2332] bg-[#0f1623]">
      <h2 className="text-lg font-semibold text-[#00d4ff] mb-4">仲裁结果</h2>

      {winner && (
        <div
          className={cn(
            'p-3 rounded-lg mb-4 border',
            'border-[#10b981]/50 bg-[#10b981]/10'
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="text-[#10b981]" size={18} />
            <span className="text-[#10b981] font-medium">获胜节点</span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: winner.color, boxShadow: `0 0 10px ${winner.color}` }}
            />
            <div>
              <div className="text-[#e0e6ed] font-medium">{winner.name}</div>
              <div className="text-xs text-[#8899aa] font-mono">
                地址: 0x{winner.address.toString(16).padStart(2, '0').toUpperCase()} |
                数据: {winner.data}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-[#667788] mb-2">优先级排序（地址越低优先级越高）</div>
        {sortedByPriority.map((node, idx) => {
          const isWinner = node.id === winnerNodeId;
          const isLoser = loserNodeIds.includes(node.id);
          return (
            <div
              key={node.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg border',
                isWinner
                  ? 'border-[#10b981]/50 bg-[#10b981]/5'
                  : isLoser
                    ? 'border-[#f59e0b]/50 bg-[#f59e0b]/5'
                    : 'border-[#1a2332] bg-[#0a0e17]'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  isWinner
                    ? 'bg-[#10b981] text-[#0a0e17]'
                    : 'bg-[#1a2332] text-[#667788]'
                )}
              >
                {idx + 1}
              </div>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: node.color, boxShadow: `0 0 8px ${node.color}` }}
              />
              <div className="flex-1">
                <div className="text-sm text-[#e0e6ed]">{node.name}</div>
                <div className="text-xs text-[#667788] font-mono">
                  0x{node.address.toString(16).padStart(2, '0').toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                {isWinner ? (
                  <Star className="text-[#10b981]" size={16} />
                ) : isLoser ? (
                  <XCircle className="text-[#f59e0b]" size={16} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
