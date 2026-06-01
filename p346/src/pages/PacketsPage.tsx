import { useState, useEffect } from 'react';
import { Network, Search, ChevronDown, ChevronRight, Lock, Unlock, Download, Filter } from 'lucide-react';
import { api } from '@/api';
import type { PacketRecord, TacacsSession } from '@/types';

export default function PacketsPage() {
  const [packets, setPackets] = useState<PacketRecord[]>([]);
  const [sessions, setSessions] = useState<TacacsSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedPacket, setExpandedPacket] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedSession]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessionsData, packetsData] = await Promise.all([
        api.getSessions(),
        api.getPackets(selectedSession ?? undefined),
      ]);
      setSessions(sessionsData);
      setPackets(packetsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatHex = (hex: string) => {
    const bytes = hex.split(' ');
    const rows: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const rowBytes = bytes.slice(i, i + 16);
      const offset = i.toString(16).padStart(4, '0');
      const hexPart = rowBytes.join(' ').padEnd(47, ' ');
      const asciiPart = rowBytes
        .map((b) => {
          const code = parseInt(b, 16);
          return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
        })
        .join('');
      rows.push(`${offset}  ${hexPart}  ${asciiPart}`);
    }
    return rows.join('\n');
  };

  const renderFields = (fields: Record<string, any>, depth: number = 0) => {
    return Object.entries(fields).map(([key, value]) => (
      <div key={key} className={`${depth > 0 ? 'ml-4 border-l border-slate-700 pl-3' : ''}`}>
        <div className="py-1">
          <span className="text-cyan-400 font-mono text-xs">{key}:</span>
          {typeof value === 'object' && value !== null ? (
            <div className="mt-1">{renderFields(value, depth + 1)}</div>
          ) : (
            <span className="ml-2 text-emerald-400 font-mono text-xs">
              {typeof value === 'boolean' ? (
                <span className={value ? 'text-emerald-400' : 'text-red-400'}>
                  {value.toString()}
                </span>
              ) : (
                String(value)
              )}
            </span>
          )}
        </div>
      </div>
    ));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'auth':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'authorize':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'accounting':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'auth':
        return '认证';
      case 'authorize':
        return '授权';
      case 'accounting':
        return '计费';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Network className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">报文记录</h1>
            <p className="text-slate-400 text-sm">查看所有 TACACS+ 协议报文的详细记录</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedType || ''}
              onChange={(e) => setSelectedType(e.target.value || null)}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="">全部类型</option>
              <option value="auth">认证</option>
              <option value="authorize">授权</option>
              <option value="accounting">计费</option>
            </select>
          </div>
          <button
            onClick={() => api.exportPacketsJSON(selectedSession ?? undefined, selectedType ?? undefined)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 JSON
          </button>
          <button
            onClick={() => api.exportPacketsCSV(selectedSession ?? undefined, selectedType ?? undefined)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 CSV
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-64 flex-shrink-0">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium">会话筛选</span>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedSession(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedSession === null
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                全部会话 ({packets.length})
              </button>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session.sessionId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedSession === session.sessionId
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-mono text-xs">{session.username}</div>
                  <div className="text-xs text-slate-500">
                    ID: {session.sessionId.toString(16).padStart(8, '0')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-slate-600 border-t-cyan-500 rounded-full" />
            </div>
          ) : packets.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-700 rounded-2xl">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                <Network className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-500">暂无报文记录</p>
              <p className="text-slate-600 text-sm">完成认证或授权操作后将在此处显示</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packets
                .filter((packet) => !selectedType || packet.type === selectedType)
                .map((packet) => {
                  const isExpanded = expandedPacket === packet.id;
                  const isRequest = packet.direction === 'request';
                  return (
                    <div
                      key={packet.id}
                      className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50"
                    >
                      <button
                        onClick={() => setExpandedPacket(isExpanded ? null : packet.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors ${
                          isRequest ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-emerald-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                          {isRequest ? (
                            <Lock className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Unlock className="w-4 h-4 text-emerald-400" />
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${getTypeColor(
                              packet.type
                            )}`}
                          >
                            {getTypeName(packet.type)}
                          </span>
                          <span className="text-sm">
                            {isRequest ? '请求' : '响应'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span className="font-mono">
                            会话: {packet.sessionId.toString(16).padStart(8, '0')}
                          </span>
                          <span>{new Date(packet.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </button>

                    {isExpanded && (
                      <div className="p-4 border-t border-slate-700 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                              头部字段
                            </h4>
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                              {renderFields(packet.headerFields)}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                              主体字段
                            </h4>
                            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                              {renderFields(packet.bodyFields)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            原始数据 (Hex)
                          </h4>
                          <pre className="bg-slate-900 rounded-lg p-3 border border-slate-700 font-mono text-xs text-slate-300 overflow-x-auto max-h-40 overflow-y-auto">
                            {formatHex(packet.rawHex)}
                          </pre>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            解密后数据 (Hex)
                          </h4>
                          <pre className="bg-slate-900 rounded-lg p-3 border border-slate-700 font-mono text-xs text-emerald-300 overflow-x-auto max-h-40 overflow-y-auto">
                            {formatHex(packet.decryptedBody)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
