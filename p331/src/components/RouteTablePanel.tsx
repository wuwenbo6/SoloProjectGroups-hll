import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import type { MRouteEntry, RouteEntry } from '@/types/simulator';
import { fetchMrouteTable, fetchUnicastRoutes } from '@/api/simulator';

interface RouteTablePanelProps {
  selectedRouterId: string | null;
}

export default function RouteTablePanel({ selectedRouterId }: RouteTablePanelProps) {
  const [mrouteEntries, setMrouteEntries] = useState<MRouteEntry[]>([]);
  const [unicastEntries, setUnicastEntries] = useState<RouteEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'mroute' | 'unicast'>('mroute');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedRouterId) {
      setMrouteEntries([]);
      setUnicastEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMrouteTable(selectedRouterId),
      fetchUnicastRoutes(selectedRouterId),
    ])
      .then(([mroute, unicast]) => {
        if (!cancelled) {
          setMrouteEntries(mroute);
          setUnicastEntries(unicast);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMrouteEntries([]);
          setUnicastEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRouterId]);

  const handleRefresh = async () => {
    if (!selectedRouterId) return;
    setLoading(true);
    try {
      if (activeTab === 'mroute') {
        const data = await fetchMrouteTable(selectedRouterId);
        setMrouteEntries(data);
      } else {
        const data = await fetchUnicastRoutes(selectedRouterId);
        setUnicastEntries(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  if (!selectedRouterId) {
    return (
      <div className="w-[300px] h-full bg-gray-900/80 border-l border-gray-700/50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">请选择路由器</p>
      </div>
    );
  }

  return (
    <div className="w-[300px] h-full bg-gray-900/80 border-l border-gray-700/50 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
            路由表 - {selectedRouterId}
          </h2>
          <button
            onClick={handleRefresh}
            className="text-gray-400 hover:text-cyan-400 transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('mroute')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeTab === 'mroute'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'text-gray-400 hover:text-gray-300 border border-transparent'
            }`}
          >
            组播
          </button>
          <button
            onClick={() => setActiveTab('unicast')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeTab === 'unicast'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                : 'text-gray-400 hover:text-gray-300 border border-transparent'
            }`}
          >
            单播
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {activeTab === 'mroute' ? (
          <>
            {mrouteEntries.length === 0 && !loading && (
              <p className="text-gray-500 text-sm text-center mt-4">无组播路由条目</p>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/30">
                  <th className="text-left py-1.5 pr-2">类型</th>
                  <th className="text-left py-1.5 pr-2">组</th>
                  <th className="text-left py-1.5 pr-2">源</th>
                  <th className="text-left py-1.5 pr-2">上行</th>
                  <th className="text-left py-1.5">下行</th>
                </tr>
              </thead>
              <tbody>
                {mrouteEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-1.5 pr-2">
                      <span
                        className={
                          entry.entry_type === 'starg'
                            ? 'text-cyan-400 font-mono'
                            : 'text-orange-400 font-mono'
                        }
                      >
                        {entry.entry_type === 'starg' ? '(*,G)' : '(S,G)'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-gray-300 font-mono">{entry.group}</td>
                    <td className="py-1.5 pr-2 text-gray-400 font-mono">
                      {entry.source || '*'}
                    </td>
                    <td className="py-1.5 pr-2 text-emerald-400 font-mono">
                      {entry.upstream_if || '-'}
                    </td>
                    <td className="py-1.5 text-blue-400 font-mono">
                      {entry.downstream_ifs.join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            {unicastEntries.length === 0 && !loading && (
              <p className="text-gray-500 text-sm text-center mt-4">无单播路由条目</p>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/30">
                  <th className="text-left py-1.5 pr-2">目标</th>
                  <th className="text-left py-1.5 pr-2">下一跳</th>
                  <th className="text-left py-1.5 pr-2">接口</th>
                  <th className="text-left py-1.5">度量</th>
                </tr>
              </thead>
              <tbody>
                {unicastEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-1.5 pr-2 text-emerald-400 font-mono">
                      {entry.destination}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-300 font-mono">{entry.next_hop}</td>
                    <td className="py-1.5 pr-2 text-gray-400 font-mono">
                      {entry.interface}
                    </td>
                    <td className="py-1.5 text-gray-400 font-mono">{entry.metric}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
