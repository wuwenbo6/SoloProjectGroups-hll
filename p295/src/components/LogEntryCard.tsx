import { ChevronDown, ChevronRight, Copy, Check, ArrowRight } from 'lucide-react';
import type { LogEntry } from '@/types';
import { LEVEL_NAMES, LEVEL_COLORS, FIELD_MAPPINGS } from '@/types';
import HighlightText from './HighlightText';
import { useLogStore } from '@/stores/logStore';
import { useState } from 'react';

const HOST_COLORS = [
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
];

function getHostColor(host: string): string {
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = host.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length];
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getMappedFields(log: LogEntry): Array<{ from: string; to: string; value: string | number }> {
  return [
    {
      from: 'level',
      to: 'level_name',
      value: LEVEL_NAMES[log.level] || `LEVEL_${log.level}`,
    },
    {
      from: 'timestamp',
      to: 'timestamp_iso',
      value: log.timestamp,
    },
    {
      from: 'timestamp',
      to: 'timestamp_unix',
      value: Math.floor(new Date(log.timestamp).getTime() / 1000),
    },
  ];
}

interface LogEntryCardProps {
  log: LogEntry;
  query: string;
}

export default function LogEntryCard({ log, query }: LogEntryCardProps) {
  const { expandedIds, toggleExpand } = useLogStore();
  const [copied, setCopied] = useState(false);
  const isExpanded = expandedIds.has(log.id);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(log._raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`group bg-gelf-surface border border-gelf-border rounded-lg overflow-hidden transition-all duration-200 hover:border-gelf-accent/30 ${
        isExpanded ? 'ring-1 ring-gelf-accent/20' : ''
      }`}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => toggleExpand(log.id)}
      >
        <div className="mt-0.5 text-gelf-muted flex-shrink-0">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-mono border ${getHostColor(log.host)}`}>
              {log.host}
            </span>
            <span className={`text-xs font-mono font-semibold ${LEVEL_COLORS[log.level] || 'text-gelf-text'}`}>
              {LEVEL_NAMES[log.level] || `L${log.level}`}
            </span>
            <span className="text-xs text-gelf-muted font-mono">
              {formatTimestamp(log.timestamp)}
            </span>
          </div>
          <div className="font-mono text-sm text-gelf-text truncate">
            <HighlightText text={log.short_message} query={query} />
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gelf-muted hover:text-gelf-accent flex-shrink-0"
          title="复制原始日志"
        >
          {copied ? <Check size={14} className="text-gelf-success" /> : <Copy size={14} />}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-gelf-border px-4 py-3 animate-fade-in">
          {log.full_message && (
            <div className="mb-3">
              <div className="text-xs text-gelf-muted mb-1 uppercase tracking-wider">Full Message</div>
              <pre className="bg-gelf-bg rounded-lg p-3 text-sm font-mono text-gelf-text whitespace-pre-wrap break-words overflow-auto max-h-60">
                <HighlightText text={log.full_message} query={query} />
              </pre>
            </div>
          )}

          <div className="mb-3">
            <div className="text-xs text-gelf-muted mb-2 uppercase tracking-wider">Field Mappings</div>
            <div className="space-y-1.5">
              {getMappedFields(log).map((mapping) => (
                <div
                  key={mapping.to}
                  className="flex items-center gap-2 bg-gelf-bg rounded px-2 py-1.5"
                >
                  <span className="text-xs font-mono text-gelf-accent">{mapping.from}</span>
                  <ArrowRight size={12} className="text-gelf-muted flex-shrink-0" />
                  <span className="text-xs font-mono text-gelf-warn">{mapping.to}</span>
                  <span className="text-xs text-gelf-muted">=</span>
                  <span className="text-xs font-mono text-gelf-text font-semibold">
                    {String(mapping.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {[
              ['Host', log.host],
              ['Level', `${LEVEL_NAMES[log.level] || log.level} (${log.level})`],
              ['Timestamp', log.timestamp],
              ['Facility', log.facility || '—'],
              ['Line', log.line?.toString() || '—'],
              ['File', log.file || '—'],
            ].map(([key, val]) => (
              <div key={key} className="bg-gelf-bg rounded px-2 py-1.5">
                <div className="text-xs text-gelf-muted">{key}</div>
                <div className="text-xs font-mono text-gelf-text truncate">{val}</div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="text-xs text-gelf-muted mb-1 uppercase tracking-wider">Raw</div>
            <pre className="bg-gelf-bg rounded-lg p-3 text-xs font-mono text-gelf-muted whitespace-pre-wrap break-words overflow-auto max-h-40">
              {log._raw}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
