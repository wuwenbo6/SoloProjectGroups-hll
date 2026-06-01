import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight, Copy, Download } from 'lucide-react';
import type { PacketInfo } from '../../types';

interface PacketDetailProps {
  packet: PacketInfo | null;
  onClose: () => void;
}

export function PacketDetail({ packet, onClose }: PacketDetailProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ethernet: true,
    ip: true,
    transport: true,
    mirror: true,
    payload: false,
    hex: false,
  });

  if (!packet) return null;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatHexDump = (hex: string) => {
    const lines: string[] = [];
    for (let i = 0; i < hex.length; i += 32) {
      const hexPart = hex.slice(i, i + 32);
      const offset = (i / 2).toString(16).padStart(4, '0');
      const hexBytes = hexPart.match(/.{2}/g)?.join(' ') || '';
      const asciiPart = hexPart
        .match(/.{2}/g)
        ?.map((h) => {
          const code = parseInt(h, 16);
          return code >= 32 && code < 127 ? String.fromCharCode(code) : '.';
        })
        .join('') || '';
      lines.push(
        `${offset}  ${hexBytes.padEnd(48, ' ')}  ${asciiPart}`
      );
    }
    return lines.join('\n');
  };

  const Section = ({
    title,
    section,
    children,
    color,
  }: {
    title: string;
    section: string;
    children: React.ReactNode;
    color: string;
  }) => (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => toggleSection(section)}
        className={`w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-700/50 transition-colors ${color}`}
      >
        <span className="font-medium text-sm">{title}</span>
        {expandedSections[section] ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      <AnimatePresence>
        {expandedSections[section] && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-slate-900/50">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const InfoRow = ({ label, value, monospaced = false }: { label: string; value: string; monospaced?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`${monospaced ? 'font-mono' : ''} text-white`}>{value}</span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed right-0 top-0 h-full w-96 bg-slate-900/95 backdrop-blur-sm border-l border-slate-700 z-50 overflow-y-auto"
    >
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-white">数据包详情</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => copyToClipboard(JSON.stringify(packet, null, 2))}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="复制JSON"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `packet-${packet.id}.json`;
              a.click();
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="下载"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              packet.type === 'original'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            {packet.type === 'original' ? '原始包' : '镜像包'}
          </span>
          <span className="text-slate-400 text-xs font-mono">{packet.size} bytes</span>
        </div>

        <Section title="Ethernet II" section="ethernet" color="text-cyan-400">
          <InfoRow label="源MAC" value={packet.ethernet.srcMac} monospaced />
          <InfoRow label="目的MAC" value={packet.ethernet.dstMac} monospaced />
          <InfoRow label="类型" value={`0x${packet.ethernet.etherType.toString(16).padStart(4, '0')}`} monospaced />
        </Section>

        {packet.ip && (
          <Section
            title={`IPv${packet.ip.version}`}
            section="ip"
            color="text-emerald-400"
          >
            <InfoRow label="源IP" value={packet.ip.srcIp} monospaced />
            <InfoRow label="目的IP" value={packet.ip.dstIp} monospaced />
            <InfoRow label="协议" value={packet.ip.protocol.toString()} />
            <InfoRow label="TTL" value={packet.ip.ttl.toString()} />
          </Section>
        )}

        {packet.transport && (
          <Section
            title={packet.transport.protocol.toUpperCase()}
            section="transport"
            color="text-blue-400"
          >
            {packet.transport.srcPort !== undefined && (
              <InfoRow label="源端口" value={packet.transport.srcPort.toString()} monospaced />
            )}
            {packet.transport.dstPort !== undefined && (
              <InfoRow label="目的端口" value={packet.transport.dstPort.toString()} monospaced />
            )}
            {packet.transport.flags && packet.transport.flags.length > 0 && (
              <InfoRow label="标志位" value={packet.transport.flags.join(', ')} />
            )}
            {packet.transport.type !== undefined && (
              <InfoRow label="类型" value={packet.transport.type.toString()} />
            )}
            {packet.transport.code !== undefined && (
              <InfoRow label="代码" value={packet.transport.code.toString()} />
            )}
          </Section>
        )}

        {packet.mirrorMetadata && (
          <Section title="镜像元数据" section="mirror" color="text-orange-400">
            <InfoRow label="原始源端口" value={`Port ${packet.mirrorMetadata.originalSourcePort}`} />
            <InfoRow
              label="原始时间戳"
              value={new Date(packet.mirrorMetadata.originalTimestamp * 1000).toLocaleString('zh-CN')}
            />
            <InfoRow
              label="镜像时间戳"
              value={new Date(packet.mirrorMetadata.mirrorTimestamp * 1000).toLocaleString('zh-CN')}
            />
            <InfoRow label="镜像规则ID" value={`#${packet.mirrorMetadata.mirrorRuleId}`} />
            <InfoRow label="数据包大小" value={`${packet.mirrorMetadata.packetSize} bytes`} />
          </Section>
        )}

        <Section title="Payload" section="payload" color="text-purple-400">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all bg-slate-950 p-3 rounded max-h-40 overflow-y-auto">
            {packet.payload || '(无 payload)'}
          </pre>
        </Section>

        <Section title="Hex Dump" section="hex" color="text-yellow-400">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre bg-slate-950 p-3 rounded max-h-60 overflow-auto">
            {formatHexDump(packet.hexDump)}
          </pre>
        </Section>

        <div className="pt-2 border-t border-slate-700">
          <InfoRow label="入端口" value={`Port ${packet.sourcePort}`} />
          {packet.destPort !== undefined && (
            <InfoRow label="出端口" value={`Port ${packet.destPort}`} />
          )}
          {packet.mirrorSourcePort !== undefined && (
            <InfoRow label="镜像源端口" value={`Port ${packet.mirrorSourcePort}`} />
          )}
          <InfoRow
            label="时间戳"
            value={new Date(packet.timestamp * 1000).toLocaleString('zh-CN')}
          />
        </div>
      </div>
    </motion.div>
  );
}
