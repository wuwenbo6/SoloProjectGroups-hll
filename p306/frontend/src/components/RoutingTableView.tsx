import { useState } from 'react';
import { useDHTStore } from '@/hooks/useDHTStore';
import { Network, ChevronRight, MapPin, Clock, Hash, FileText, Database } from 'lucide-react';
import { useEffect } from 'react';

export default function RoutingTableView() {
  const { routingTable, fetchRoutingTable, fetchResources, nodeStatus, exportRoutingTableAsText, resources } = useDHTStore();
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'buckets' | 'resources'>('buckets');

  useEffect(() => {
    fetchRoutingTable();
    fetchResources();
    const interval = setInterval(() => {
      fetchRoutingTable();
      fetchResources();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRoutingTable, fetchResources]);

  const nonEmptyBuckets = routingTable.filter((b) => b.nodes.length > 0);

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Network className="w-5 h-5 text-cyber-green" />
        <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
          路由表 (K-Buckets)
        </h2>
        <span className="ml-auto text-xs font-mono text-cyber-muted">
          {nonEmptyBuckets.length} 个活跃 bucket / {routingTable.reduce((sum, b) => sum + b.nodes.length, 0)} 个节点
        </span>
        <div className="flex gap-1">
          <button
            onClick={exportRoutingTableAsText}
            className="p-1.5 rounded-md bg-cyber-bg border border-cyber-border text-cyber-muted hover:text-cyber-text hover:border-cyber-green/30 transition-all"
            title="导出为文本格式"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-cyber-bg rounded-lg p-1">
        <button
          onClick={() => setActiveTab('buckets')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-mono transition-all ${
            activeTab === 'buckets'
              ? 'bg-cyber-green/10 text-cyber-green border border-cyber-green/30'
              : 'text-cyber-muted hover:text-cyber-text'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          路由表
        </button>
        <button
          onClick={() => setActiveTab('resources')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-mono transition-all ${
            activeTab === 'resources'
              ? 'bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/30'
              : 'text-cyber-muted hover:text-cyber-text'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          资源列表
          {resources && resources.total_resources > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyber-purple/20 text-[10px]">
              {resources.total_resources}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'buckets' ? (
        <>
          {nonEmptyBuckets.length === 0 ? (
            <div className="text-center py-12 text-cyber-muted">
              <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-mono">路由表为空</p>
              <p className="text-xs mt-1">请先生成模拟节点或发送查询</p>
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="w-48 flex-shrink-0 space-y-1 max-h-[500px] overflow-y-auto pr-1">
                {nonEmptyBuckets.map((bucket) => (
                  <button
                    key={bucket.bucket_index}
                    onClick={() => setSelectedBucket(selectedBucket === bucket.bucket_index ? null : bucket.bucket_index)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                      selectedBucket === bucket.bucket_index
                        ? 'bg-cyber-green/10 border-cyber-green/30 text-cyber-green'
                        : 'bg-cyber-bg border-cyber-border text-cyber-muted hover:text-cyber-text hover:border-cyber-border'
                    }`}
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${selectedBucket === bucket.bucket_index ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-mono">Bucket {bucket.bucket_index}</span>
                    <span className="ml-auto text-xs font-mono opacity-60">{bucket.nodes.length}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                {selectedBucket !== null ? (
                  <div className="space-y-2">
                    {(() => {
                      const bucket = nonEmptyBuckets.find((b) => b.bucket_index === selectedBucket);
                      if (!bucket) return null;
                      return (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-mono text-cyber-muted">Bucket #{bucket.bucket_index}</span>
                            <span className="text-xs font-mono text-cyber-muted">•</span>
                            <span className="text-xs font-mono text-cyber-muted">{bucket.max_prefix}</span>
                          </div>
                          {bucket.nodes.map((node, i) => (
                            <div
                              key={`${node.node_id}-${i}`}
                              className="bg-cyber-bg border border-cyber-border rounded-lg p-3 animate-fade-in"
                              style={{ animationDelay: `${i * 50}ms` }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-3.5 h-3.5 text-cyber-green" />
                                <span className="text-xs font-mono text-cyber-green truncate" title={node.node_id}>
                                  {node.node_id}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-cyber-muted">
                                <div className="flex items-center gap-1">
                                  <Hash className="w-3 h-3" />
                                  <span>{node.ip}:{node.port}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{new Date(node.last_seen).toLocaleTimeString()}</span>
                                </div>
                              </div>
                              {nodeStatus && (
                                <div className="mt-2 text-xs font-mono text-cyber-muted/60">
                                  距离: {computeDistance(nodeStatus.node_id, node.node_id)}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-cyber-muted text-sm font-mono py-12">
                    ← 选择一个 Bucket 查看节点详情
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {!resources || resources.total_resources === 0 ? (
            <div className="text-center py-12 text-cyber-muted">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-mono">暂无资源</p>
              <p className="text-xs mt-1">通过 ANNOUNCE_PEER 发布资源</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              <div className="text-xs font-mono text-cyber-muted mb-2">
                共 {resources.total_resources} 个资源，{resources.total_peers} 个 Peer
              </div>
              {resources.resources.map((res, i) => (
                <div
                  key={res.info_hash}
                  className="bg-cyber-bg border border-cyber-purple/20 rounded-lg p-3 animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-3.5 h-3.5 text-cyber-purple" />
                    <span className="text-xs font-mono text-cyber-purple truncate" title={res.info_hash}>
                      {res.info_hash}
                    </span>
                    <span className="ml-auto text-xs font-mono text-cyber-muted">
                      {res.peer_count} 个 Peer
                    </span>
                  </div>
                  <div className="text-xs font-mono text-cyber-muted mb-2">
                    发布时间: {new Date(res.announced_at).toLocaleString()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {res.peers.map((peer, pi) => (
                      <span
                        key={pi}
                        className="px-2 py-0.5 bg-cyber-purple/10 border border-cyber-purple/20 rounded text-xs font-mono text-cyber-text"
                      >
                        {peer}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function computeDistance(a: string, b: string): string {
  const aBytes = hexToBytes(a);
  const bBytes = hexToBytes(b);
  if (!aBytes || !bBytes) return 'unknown';
  const xor = aBytes.map((byte, i) => byte ^ bBytes[i]);
  return xor.reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
}

function hexToBytes(hex: string): number[] | null {
  if (hex.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) return null;
    bytes.push(byte);
  }
  return bytes;
}
