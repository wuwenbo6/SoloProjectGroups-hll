import { useState } from 'react';
import { Search, X, Filter, Activity, AlertTriangle, Tag } from 'lucide-react';
import { api } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import type { SmartSearchResult, TimeRange, Event } from '../../shared/types.js';

interface SmartSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onEventSelect?: (event: Event) => void;
  onTimeRangeSelect?: (range: TimeRange) => void;
}

export function SmartSearch({ isOpen, onClose, onEventSelect, onTimeRangeSelect }: SmartSearchProps) {
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState<string>('all');
  const [minIntensity, setMinIntensity] = useState(0);
  const [result, setResult] = useState<SmartSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch() {
    setIsSearching(true);
    try {
      const data = await api.smartSearch({
        query: query || undefined,
        eventType: eventType !== 'all' ? eventType : undefined,
        minIntensity: minIntensity > 0 ? minIntensity : undefined,
      }) as SmartSearchResult;
      setResult(data);
    } catch (error) {
      console.error('Smart search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }

  if (!isOpen) return null;

  const eventTypeConfig: Record<string, { icon: any; color: string }> = {
    motion: { icon: Activity, color: 'text-yellow-400 bg-yellow-500/20' },
    alert: { icon: AlertTriangle, color: 'text-red-400 bg-red-500/20' },
    custom: { icon: Tag, color: 'text-blue-400 bg-blue-500/20' },
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-800 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Search className="text-cyan-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">智能检索</h3>
              <p className="text-sm text-slate-500">按事件类型、运动强度搜索录像</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-slate-800">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索事件关键词..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-5 py-2.5 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 text-sm"
            >
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-500" />
              <span className="text-xs text-slate-400">类型</span>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'all', label: '全部' },
                { value: 'motion', label: '移动侦测' },
                { value: 'alert', label: '告警' },
                { value: 'custom', label: '自定义' },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setEventType(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    eventType === t.value
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {eventType === 'motion' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-400">最低强度</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minIntensity}
                  onChange={(e) => setMinIntensity(parseInt(e.target.value))}
                  className="w-24 h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-yellow-400"
                />
                <span className="text-xs font-mono text-yellow-400 w-8">{minIntensity}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {result && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                找到 <span className="text-white font-medium">{result.totalMatches}</span> 个匹配事件，
                分为 <span className="text-white font-medium">{result.timeRanges.length}</span> 个时间段
              </div>

              {result.timeRanges.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">时间段聚类</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.timeRanges.map((range, i) => (
                      <button
                        key={i}
                        onClick={() => onTimeRangeSelect?.(range)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm hover:border-cyan-500/50 transition-colors"
                      >
                        <div className="text-white text-xs font-medium">{range.label}</div>
                        <div className="text-slate-500 text-xs mt-0.5">{range.eventCount} 个事件</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-2">匹配事件</h4>
                <div className="space-y-2">
                  {result.events.map((event) => {
                    const config = eventTypeConfig[event.type] || eventTypeConfig.custom;
                    const Icon = config.icon;
                    return (
                      <div
                        key={event.id}
                        onClick={() => onEventSelect?.(event)}
                        className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{event.title}</div>
                          {event.description && (
                            <div className="text-xs text-slate-500 truncate">{event.description}</div>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(event.timestamp)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!result && !isSearching && (
            <div className="text-center py-8 text-slate-500">
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>输入关键词或选择筛选条件开始搜索</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
