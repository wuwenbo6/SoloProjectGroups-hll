import { useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, Clock, Hash } from 'lucide-react';
import { cn, parseResumeToken, formatTime, formatOptime } from '../lib/utils.js';
import type { ChangeEvent } from '../../shared/types.js';

interface EventCardProps {
  event: ChangeEvent;
  isNew?: boolean;
  isResumed?: boolean;
}

export function EventCard({ event, isNew, isResumed }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);

  const operationConfig = {
    insert: { color: 'green', label: 'INSERT', icon: '+' },
    update: { color: 'blue', label: 'UPDATE', icon: '~' },
    delete: { color: 'red', label: 'DELETE', icon: '-' },
  };

  const config = operationConfig[event.operationType];
  const parsed = parseResumeToken(event._id._data);

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all duration-300',
        isNew ? 'animate-pulse-once' : '',
        isResumed
          ? 'bg-amber-500/5 border-amber-500/30'
          : 'bg-zinc-800/50 border-zinc-700',
        'hover:border-zinc-600'
      )}
    >
      <div
        className="p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-8 h-8 rounded flex items-center justify-center font-bold text-sm',
              config.color === 'green' && 'bg-green-500/20 text-green-400',
              config.color === 'blue' && 'bg-blue-500/20 text-blue-400',
              config.color === 'red' && 'bg-red-500/20 text-red-400'
            )}
          >
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={cn(
                  'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                  config.color === 'green' && 'bg-green-500/10 text-green-400',
                  config.color === 'blue' && 'bg-blue-500/10 text-blue-400',
                  config.color === 'red' && 'bg-red-500/10 text-red-400'
                )}
              >
                {config.label}
              </span>
              {isResumed && (
                <span className="text-xs font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
                  补发
                </span>
              )}
              {parsed && (
                <span className="text-xs font-mono bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">
                  T{parsed.term}
                </span>
              )}
              <span className="text-xs text-zinc-500 font-mono ml-auto">
                {parsed ? formatTime(parsed.timestamp) : ''}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
              <span className="truncate">
                _id: {event.documentKey._id.slice(0, 16)}...
              </span>
              {parsed && (
                <span className="text-cyan-500/70 flex-shrink-0">
                  {formatOptime(parsed.optime)}
                </span>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-700 p-3 bg-zinc-900/50">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {parsed && (
              <>
                <div className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="w-3 h-3 text-purple-400" />
                    <span className="text-[10px] text-zinc-500">Term (逻辑时钟)</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-purple-400">{parsed.term}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Hash className="w-3 h-3 text-cyan-400" />
                    <span className="text-[10px] text-zinc-500">OpTime (ts:inc)</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-cyan-400">
                    {formatOptime(parsed.optime)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <FileJson className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-400 font-mono font-semibold">
                Resume Token
              </span>
            </div>
            <code className="block text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-amber-300 font-mono break-all">
              {event._id._data}
            </code>
          </div>

          {event.fullDocument && (
            <div className="mb-3">
              <div className="text-xs text-zinc-400 mb-1.5 font-medium">
                完整文档
              </div>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(event.fullDocument, null, 2)}
              </pre>
            </div>
          )}

          {event.updateDescription && (
            <div className="mb-3">
              <div className="text-xs text-zinc-400 mb-1.5 font-medium">
                更新描述
              </div>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(event.updateDescription, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-xs text-zinc-400 mb-1.5 font-medium">
              完整事件结构
            </div>
            <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-400 font-mono overflow-x-auto max-h-60 overflow-y-auto">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
