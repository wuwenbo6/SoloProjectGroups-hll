import { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Unlock, Eye, EyeOff, Network } from 'lucide-react';
import type { PacketDetail } from '@/types';

interface PacketViewerProps {
  request: PacketDetail;
  response: PacketDetail;
  title: string;
}

export default function PacketViewer({ request, response, title }: PacketViewerProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('request-header');
  const [showEncrypted, setShowEncrypted] = useState(true);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
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
        <div className="py-1.5">
          <span className="text-cyan-400 font-mono text-sm">{key}:</span>
          {typeof value === 'object' && value !== null ? (
            <div className="mt-1">{renderFields(value, depth + 1)}</div>
          ) : (
            <span className="ml-2 text-emerald-400 font-mono text-sm">
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

  const renderSection = (
    id: string,
    label: string,
    packet: PacketDetail,
    type: 'request' | 'response'
  ) => {
    const isExpanded = expandedSection === id;
    const isResponse = type === 'response';
    const statusField = packet.fields.status as { name?: string } | undefined;
    const statusName = statusField?.name;
    const isSuccess = statusName === 'Pass' || statusName === 'Pass Add' || statusName === 'Success';

    return (
      <div className="border border-slate-700 rounded-lg overflow-hidden mb-3">
        <button
          onClick={() => toggleSection(id)}
          className={`w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors ${
            isResponse
              ? isSuccess
                ? 'border-l-4 border-l-emerald-500'
                : 'border-l-4 border-l-red-500'
              : 'border-l-4 border-l-blue-500'
          }`}
        >
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
            {isResponse ? (
              isSuccess ? (
                <Unlock className="w-4 h-4 text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 text-red-400" />
              )
            ) : (
              <Lock className="w-4 h-4 text-blue-400" />
            )}
            <span className="font-medium">{label}</span>
            {isResponse && statusName && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  isSuccess
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {statusName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{packet.header.length} bytes</span>
          </div>
        </button>

        {isExpanded && (
          <div className="p-4 space-y-4 animate-in fade-in duration-200">
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                报文头部
              </h4>
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                {renderFields({
                  version: packet.fields.version,
                  type: packet.fields.type,
                  seqNo: packet.fields.seqNo,
                  flags: packet.fields.flags,
                  sessionId: packet.fields.sessionId,
                  length: packet.fields.length,
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  报文主体
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEncrypted(!showEncrypted);
                  }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                >
                  {showEncrypted ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {showEncrypted ? '显示解密数据' : '显示加密数据'}
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                {renderFields(
                  Object.fromEntries(
                    Object.entries(packet.fields).filter(
                      ([key]) =>
                        !['version', 'type', 'seqNo', 'flags', 'sessionId', 'length'].includes(key)
                    )
                  )
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {showEncrypted ? '原始加密数据 (Hex)' : '解密后数据 (Hex)'}
              </h4>
              <pre className="bg-slate-900 rounded-lg p-3 border border-slate-700 font-mono text-xs text-slate-300 overflow-x-auto">
                {formatHex(showEncrypted ? packet.rawHex : packet.decryptedHex || packet.rawHex)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Network className="w-5 h-5 text-cyan-400" />
        {title}
      </h3>
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500 via-slate-600 to-emerald-500" />
        <div className="space-y-3">
          {renderSection('request-header', '认证请求', request, 'request')}
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              TACACS+ 协议传输 · MD5 加密
            </div>
          </div>
          {renderSection('response-header', '认证响应', response, 'response')}
        </div>
      </div>
    </div>
  );
}
