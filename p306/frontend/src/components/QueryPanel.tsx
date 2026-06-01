import { useState } from 'react';
import { useDHTStore } from '@/hooks/useDHTStore';
import { Send, Search, Radio, Loader2, Plus, Users, Megaphone } from 'lucide-react';

export default function QueryPanel() {
  const { sendPing, sendFindNode, sendGetPeers, sendAnnouncePeer, bootstrap, loading, simulatedNodes, fetchRoutingTable, fetchLogs, lastToken, lastInfoHash } = useDHTStore();
  const [activeTab, setActiveTab] = useState<'ping' | 'find_node' | 'get_peers'>('ping');
  const [targetAddr, setTargetAddr] = useState('');
  const [targetId, setTargetId] = useState('');
  const [askAddr, setAskAddr] = useState('');
  const [infoHash, setInfoHash] = useState('');
  const [askAddrPeers, setAskAddrPeers] = useState('');
  const [announcePort, setAnnouncePort] = useState(6881);
  const [announceToken, setAnnounceToken] = useState('');
  const [announceInfoHash, setAnnounceInfoHash] = useState('');
  const [announceAskAddr, setAnnounceAskAddr] = useState('');
  const [bootstrapCount, setBootstrapCount] = useState(5);

  const handlePing = async () => {
    if (!targetAddr.trim()) return;
    await sendPing(targetAddr.trim());
    await Promise.all([fetchRoutingTable(), fetchLogs()]);
  };

  const handleFindNode = async () => {
    if (!targetId.trim() || !askAddr.trim()) return;
    await sendFindNode(targetId.trim(), askAddr.trim());
    await Promise.all([fetchRoutingTable(), fetchLogs()]);
  };

  const handleGetPeers = async () => {
    if (!infoHash.trim() || !askAddrPeers.trim()) return;
    await sendGetPeers(infoHash.trim(), askAddrPeers.trim());
    await Promise.all([fetchRoutingTable(), fetchLogs()]);
  };

  const handleAnnouncePeer = async () => {
    if (!announceInfoHash.trim() || !announceAskAddr.trim() || !announceToken.trim()) return;
    await sendAnnouncePeer(announceInfoHash.trim(), announceAskAddr.trim(), announcePort, announceToken.trim());
    await Promise.all([fetchRoutingTable(), fetchLogs()]);
  };

  const handleBootstrap = async () => {
    await bootstrap(bootstrapCount);
    await Promise.all([fetchRoutingTable(), fetchLogs()]);
  };

  const fillSimulatedAddr = (addr: string) => {
    setTargetAddr(addr);
    setAskAddr(addr);
    setAskAddrPeers(addr);
    setAnnounceAskAddr(addr);
  };

  const fillFromLastResult = () => {
    if (lastInfoHash) setAnnounceInfoHash(lastInfoHash);
    if (lastToken) setAnnounceToken(lastToken);
  };

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-5 h-5 text-cyber-green" />
        <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
          查询面板
        </h2>
      </div>

      <div className="flex gap-1 mb-4 bg-cyber-bg rounded-lg p-1">
        <button
          onClick={() => setActiveTab('ping')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-mono transition-all ${
            activeTab === 'ping'
              ? 'bg-cyber-green/10 text-cyber-green border border-cyber-green/30'
              : 'text-cyber-muted hover:text-cyber-text'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          PING
        </button>
        <button
          onClick={() => setActiveTab('find_node')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-mono transition-all ${
            activeTab === 'find_node'
              ? 'bg-cyber-blue/10 text-cyber-blue border border-cyber-blue/30'
              : 'text-cyber-muted hover:text-cyber-text'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          FIND_NODE
        </button>
        <button
          onClick={() => setActiveTab('get_peers')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-mono transition-all ${
            activeTab === 'get_peers'
              ? 'bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/30'
              : 'text-cyber-muted hover:text-cyber-text'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          GET_PEERS
        </button>
      </div>

      {activeTab === 'ping' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1.5 block">目标节点地址</label>
            <input
              type="text"
              value={targetAddr}
              onChange={(e) => setTargetAddr(e.target.value)}
              placeholder="127.0.0.1:9401"
              className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-green/50 focus:outline-none focus:ring-1 focus:ring-cyber-green/20 transition-all"
            />
          </div>
          {simulatedNodes.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-cyber-muted font-mono">快速选择模拟节点:</span>
              <div className="flex flex-wrap gap-1">
                {simulatedNodes.slice(0, 5).map((n) => (
                  <button
                    key={n.node_id}
                    onClick={() => fillSimulatedAddr(n.address)}
                    className="px-2 py-0.5 bg-cyber-bg border border-cyber-border rounded text-xs font-mono text-cyber-muted hover:text-cyber-green hover:border-cyber-green/30 transition-all"
                  >
                    {n.address}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handlePing}
            disabled={loading || !targetAddr.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green font-mono text-sm hover:bg-cyber-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            发送 PING
          </button>
        </div>
      ) : activeTab === 'find_node' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1.5 block">目标 NodeID (十六进制)</label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="a1b2c3d4e5f6..."
              className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-blue/50 focus:outline-none focus:ring-1 focus:ring-cyber-blue/20 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1.5 block">向哪个节点查询</label>
            <input
              type="text"
              value={askAddr}
              onChange={(e) => setAskAddr(e.target.value)}
              placeholder="127.0.0.1:9401"
              className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-blue/50 focus:outline-none focus:ring-1 focus:ring-cyber-blue/20 transition-all"
            />
          </div>
          {simulatedNodes.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-cyber-muted font-mono">快速选择模拟节点:</span>
              <div className="flex flex-wrap gap-1">
                {simulatedNodes.slice(0, 5).map((n) => (
                  <button
                    key={n.node_id}
                    onClick={() => {
                      setAskAddr(n.address);
                      if (!targetId) setTargetId(n.node_id);
                    }}
                    className="px-2 py-0.5 bg-cyber-bg border border-cyber-border rounded text-xs font-mono text-cyber-muted hover:text-cyber-blue hover:border-cyber-blue/30 transition-all"
                  >
                    {n.address}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleFindNode}
            disabled={loading || !targetId.trim() || !askAddr.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyber-blue/10 border border-cyber-blue/30 text-cyber-blue font-mono text-sm hover:bg-cyber-blue/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            发送 FIND_NODE
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1.5 block">资源 InfoHash (十六进制)</label>
            <input
              type="text"
              value={infoHash}
              onChange={(e) => setInfoHash(e.target.value)}
              placeholder="a1b2c3d4e5f6..."
              className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-purple/50 focus:outline-none focus:ring-1 focus:ring-cyber-purple/20 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1.5 block">向哪个节点查询</label>
            <input
              type="text"
              value={askAddrPeers}
              onChange={(e) => setAskAddrPeers(e.target.value)}
              placeholder="127.0.0.1:9401"
              className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-purple/50 focus:outline-none focus:ring-1 focus:ring-cyber-purple/20 transition-all"
            />
          </div>
          {simulatedNodes.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-cyber-muted font-mono">快速选择模拟节点:</span>
              <div className="flex flex-wrap gap-1">
                {simulatedNodes.slice(0, 5).map((n) => (
                  <button
                    key={n.node_id}
                    onClick={() => {
                      setAskAddrPeers(n.address);
                      if (!infoHash) setInfoHash(n.node_id);
                    }}
                    className="px-2 py-0.5 bg-cyber-bg border border-cyber-border rounded text-xs font-mono text-cyber-muted hover:text-cyber-purple hover:border-cyber-purple/30 transition-all"
                  >
                    {n.address}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleGetPeers}
            disabled={loading || !infoHash.trim() || !askAddrPeers.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyber-purple/10 border border-cyber-purple/30 text-cyber-purple font-mono text-sm hover:bg-cyber-purple/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            发送 GET_PEERS
          </button>

          <div className="mt-4 pt-4 border-t border-cyber-border">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-cyber-orange" />
              <span className="text-xs font-mono text-cyber-muted">ANNOUNCE_PEER (宣布有资源)</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-cyber-muted font-mono mb-1 block">InfoHash</label>
                <input
                  type="text"
                  value={announceInfoHash}
                  onChange={(e) => setAnnounceInfoHash(e.target.value)}
                  placeholder="资源 InfoHash"
                  className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-orange/50 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-cyber-muted font-mono mb-1 block">向哪个节点宣布</label>
                <input
                  type="text"
                  value={announceAskAddr}
                  onChange={(e) => setAnnounceAskAddr(e.target.value)}
                  placeholder="127.0.0.1:9401"
                  className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-orange/50 focus:outline-none transition-all"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-cyber-muted font-mono mb-1 block">Token</label>
                  <input
                    type="text"
                    value={announceToken}
                    onChange={(e) => setAnnounceToken(e.target.value)}
                    placeholder="从 get_peers 获取"
                    className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyber-text placeholder:text-cyber-muted/50 focus:border-cyber-orange/50 focus:outline-none transition-all"
                  />
                </div>
                <div className="w-20">
                  <label className="text-xs text-cyber-muted font-mono mb-1 block">端口</label>
                  <input
                    type="number"
                    value={announcePort}
                    onChange={(e) => setAnnouncePort(parseInt(e.target.value) || 6881)}
                    min={1}
                    max={65535}
                    className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyber-text focus:border-cyber-orange/50 focus:outline-none transition-all"
                  />
                </div>
              </div>
              {lastToken && (
                <button
                  onClick={fillFromLastResult}
                  className="text-xs text-cyber-orange hover:underline font-mono"
                >
                  ← 填充上次 get_peers 的 token 和 infohash
                </button>
              )}
              <button
                onClick={handleAnnouncePeer}
                disabled={loading || !announceInfoHash.trim() || !announceAskAddr.trim() || !announceToken.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cyber-orange/10 border border-cyber-orange/30 text-cyber-orange font-mono text-xs hover:bg-cyber-orange/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
                发送 ANNOUNCE_PEER
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-cyber-border">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-cyber-yellow" />
          <span className="text-xs font-mono text-cyber-muted">添加模拟节点</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={bootstrapCount}
            onChange={(e) => setBootstrapCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            min={1}
            max={50}
            className="w-20 bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-text focus:border-cyber-yellow/50 focus:outline-none transition-all"
          />
          <button
            onClick={handleBootstrap}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-cyber-yellow/10 border border-cyber-yellow/30 text-cyber-yellow font-mono text-sm hover:bg-cyber-yellow/20 disabled:opacity-40 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            生成节点
          </button>
        </div>
      </div>
    </div>
  );
}
