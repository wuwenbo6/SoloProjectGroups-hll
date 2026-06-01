import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Filter, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { PacketInfo } from '../../types';

interface PacketListProps {
  packets: PacketInfo[];
  type: 'original' | 'mirror';
  title: string;
  onSelectPacket: (packet: PacketInfo) => void;
  selectedPacketId?: string;
}

export function PacketList({ packets, type, title, onSelectPacket, selectedPacketId }: PacketListProps) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(true);

  const filteredPackets = useMemo(() => {
    if (!filter) return packets;
    const lowerFilter = filter.toLowerCase();
    return packets.filter(
      (p) =>
        p.ethernet.srcMac.toLowerCase().includes(lowerFilter) ||
        p.ethernet.dstMac.toLowerCase().includes(lowerFilter) ||
        p.ip?.srcIp.toLowerCase().includes(lowerFilter) ||
        p.ip?.dstIp.toLowerCase().includes(lowerFilter) ||
        p.transport?.protocol.toLowerCase().includes(lowerFilter)
    );
  }, [packets, filter]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  };

  const getProtocolColor = (protocol?: string) => {
    switch (protocol) {
      case 'tcp':
        return 'bg-blue-500/20 text-blue-400';
      case 'udp':
        return 'bg-green-500/20 text-green-400';
      case 'icmp':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const typeColors = {
    original: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      accent: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-400',
      highlight: 'hover:bg-emerald-500/20',
      selected: 'ring-emerald-500/50',
    },
    mirror: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      accent: 'text-orange-400',
      badge: 'bg-orange-500/20 text-orange-400',
      highlight: 'hover:bg-orange-500/20',
      selected: 'ring-orange-500/50',
    },
  };

  const colors = typeColors[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: type === 'original' ? 0.1 : 0.2 }}
      className={`bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border ${colors.border} backdrop-blur-sm flex flex-col h-full`}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          <Network className={`w-5 h-5 ${colors.accent}`} />
          <h3 className={`font-semibold ${colors.accent}`}>{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
            {filteredPackets.length}
          </span>
        </div>
        <div className="relative">
          <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="过滤..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-700/50 border border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-slate-500 w-40"
          />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-1 overflow-hidden"
          >
            <div className="overflow-y-auto h-full max-h-96 p-2 space-y-1">
              {filteredPackets.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无数据包</p>
                  <p className="text-xs mt-1">发送测试流量后将显示在此处</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredPackets.map((packet, index) => (
                    <motion.div
                      key={packet.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index === 0 ? 0 : 0.01 }}
                      onClick={() => onSelectPacket(packet)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${colors.highlight} ${
                        selectedPacketId === packet.id
                          ? `${colors.bg} ring-2 ${colors.selected}`
                          : 'bg-slate-800/30'
                      }`}
                    >
                      {index === 0 && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`absolute top-0 left-0 w-1 h-full rounded-l-lg ${
                            type === 'original' ? 'bg-emerald-400' : 'bg-orange-400'
                          }`}
                        />
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-400 font-mono">
                            {formatTime(packet.timestamp)}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${getProtocolColor(
                              packet.transport?.protocol
                            )}`}
                          >
                            {packet.transport?.protocol?.toUpperCase() || 'OTHER'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{packet.size} B</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-slate-500">In:</span>
                          <span className="text-cyan-400 ml-1">Port {packet.sourcePort}</span>
                        </div>
                        {packet.destPort && (
                          <div>
                            <span className="text-slate-500">Out:</span>
                            <span className="text-blue-400 ml-1">Port {packet.destPort}</span>
                          </div>
                        )}
                      </div>
                      {packet.ip && (
                        <div className="mt-2 text-xs font-mono">
                          <span className="text-emerald-400">{packet.ip.srcIp}</span>
                          <span className="text-slate-500 mx-2">→</span>
                          <span className="text-blue-400">{packet.ip.dstIp}</span>
                          {packet.transport && packet.transport.srcPort && (
                            <span className="text-slate-500 ml-2">
                              :{packet.transport.srcPort} → :{packet.transport.dstPort}
                            </span>
                          )}
                        </div>
                      )}
                      {type === 'mirror' && packet.mirrorSourcePort !== undefined && (
                        <div className="mt-2 text-xs">
                          <span className="text-orange-400">
                            ← 复制自 Port {packet.mirrorSourcePort}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
