import { useDHTStore } from '@/hooks/useDHTStore';
import { CheckCircle, XCircle, AlertTriangle, Users, Megaphone, Key } from 'lucide-react';

export default function QueryResult() {
  const { pingResult, findNodeResult, getPeersResult, announcePeerResult } = useDHTStore();

  if (!pingResult && !findNodeResult && !getPeersResult && !announcePeerResult) return null;

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle className="w-5 h-5 text-cyber-green" />
        <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
          查询结果
        </h2>
      </div>

      {pingResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {pingResult.error ? (
              <XCircle className="w-4 h-4 text-cyber-red" />
            ) : (
              <CheckCircle className="w-4 h-4 text-cyber-green" />
            )}
            <span className="text-sm font-mono text-cyber-text">
              PING → {pingResult.error ? '失败' : '成功'}
            </span>
            <span className="text-xs font-mono text-cyber-muted ml-auto">
              {pingResult.elapsed_ms}ms
            </span>
          </div>
          {pingResult.node_id && (
            <div className="bg-cyber-bg rounded-lg p-3 border border-cyber-border">
              <span className="text-xs text-cyber-muted font-mono">响应节点:</span>
              <p className="text-sm font-mono text-cyber-green mt-1 break-all">{pingResult.node_id}</p>
            </div>
          )}
          {pingResult.error && (
            <div className="bg-cyber-red/5 rounded-lg p-3 border border-cyber-red/20">
              <span className="text-xs text-cyber-red font-mono">{pingResult.error}</span>
            </div>
          )}
        </div>
      )}

      {findNodeResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {findNodeResult.error ? (
              <AlertTriangle className="w-4 h-4 text-cyber-yellow" />
            ) : (
              <CheckCircle className="w-4 h-4 text-cyber-green" />
            )}
            <span className="text-sm font-mono text-cyber-text">
              FIND_NODE → {findNodeResult.error ? '失败' : `找到 ${findNodeResult.nodes.length} 个节点`}
            </span>
            <span className="text-xs font-mono text-cyber-muted ml-auto">
              {findNodeResult.elapsed_ms}ms
            </span>
          </div>
          {findNodeResult.error && (
            <div className="bg-cyber-red/5 rounded-lg p-3 border border-cyber-red/20">
              <span className="text-xs text-cyber-red font-mono">{findNodeResult.error}</span>
            </div>
          )}
          {findNodeResult.nodes.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {findNodeResult.nodes.map((node, i) => (
                <div
                  key={`${node.node_id}-${i}`}
                  className="bg-cyber-bg rounded-lg p-3 border border-cyber-border animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-cyber-blue flex-shrink-0" />
                    <span className="text-xs font-mono text-cyber-green truncate" title={node.node_id}>
                      {node.node_id}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-mono text-cyber-muted">
                    {node.ip}:{node.port}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {getPeersResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {getPeersResult.error ? (
              <AlertTriangle className="w-4 h-4 text-cyber-yellow" />
            ) : (
              <CheckCircle className="w-4 h-4 text-cyber-green" />
            )}
            <span className="text-sm font-mono text-cyber-text">
              GET_PEERS → {getPeersResult.error ? '失败' : getPeersResult.has_peers ? `找到 ${getPeersResult.peers.length} 个 Peers` : `无 Peers，返回 ${getPeersResult.nodes.length} 个节点`}
            </span>
            <span className="text-xs font-mono text-cyber-muted ml-auto">
              {getPeersResult.elapsed_ms}ms
            </span>
          </div>
          {getPeersResult.token && (
            <div className="bg-cyber-purple/5 rounded-lg p-3 border border-cyber-purple/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Key className="w-3.5 h-3.5 text-cyber-purple" />
                <span className="text-xs text-cyber-purple font-mono">Token (用于 ANNOUNCE_PEER):</span>
              </div>
              <p className="text-sm font-mono text-cyber-text break-all">{getPeersResult.token}</p>
            </div>
          )}
          {getPeersResult.error && (
            <div className="bg-cyber-red/5 rounded-lg p-3 border border-cyber-red/20">
              <span className="text-xs text-cyber-red font-mono">{getPeersResult.error}</span>
            </div>
          )}
          {getPeersResult.has_peers && getPeersResult.peers.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-xs text-cyber-muted font-mono">Peers 列表:</span>
              {getPeersResult.peers.map((peer, i) => (
                <div
                  key={`peer-${i}`}
                  className="bg-cyber-bg rounded-lg p-3 border border-cyber-purple/30 animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-cyber-purple flex-shrink-0" />
                    <span className="text-sm font-mono text-cyber-text">
                      {peer.ip}:{peer.port}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!getPeersResult.has_peers && getPeersResult.nodes.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-xs text-cyber-muted font-mono">邻近节点 (无 Peers):</span>
              {getPeersResult.nodes.map((node, i) => (
                <div
                  key={`node-${node.node_id}-${i}`}
                  className="bg-cyber-bg rounded-lg p-3 border border-cyber-border animate-fade-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-cyber-blue flex-shrink-0" />
                    <span className="text-xs font-mono text-cyber-green truncate" title={node.node_id}>
                      {node.node_id}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-mono text-cyber-muted">
                    {node.ip}:{node.port}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {announcePeerResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {announcePeerResult.error || !announcePeerResult.success ? (
              <XCircle className="w-4 h-4 text-cyber-red" />
            ) : (
              <CheckCircle className="w-4 h-4 text-cyber-green" />
            )}
            <span className="text-sm font-mono text-cyber-text">
              ANNOUNCE_PEER → {announcePeerResult.error || !announcePeerResult.success ? '失败' : '成功'}
            </span>
            <span className="text-xs font-mono text-cyber-muted ml-auto">
              {announcePeerResult.elapsed_ms}ms
            </span>
          </div>
          {announcePeerResult.message && (
            <div className={`rounded-lg p-3 border ${announcePeerResult.success ? 'bg-cyber-green/5 border-cyber-green/20' : 'bg-cyber-red/5 border-cyber-red/20'}`}>
              <div className="flex items-center gap-1.5">
                <Megaphone className={`w-3.5 h-3.5 ${announcePeerResult.success ? 'text-cyber-green' : 'text-cyber-red'}`} />
                <span className={`text-xs font-mono ${announcePeerResult.success ? 'text-cyber-green' : 'text-cyber-red'}`}>
                  {announcePeerResult.message}
                </span>
              </div>
            </div>
          )}
          {announcePeerResult.error && (
            <div className="bg-cyber-red/5 rounded-lg p-3 border border-cyber-red/20">
              <span className="text-xs text-cyber-red font-mono">{announcePeerResult.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
