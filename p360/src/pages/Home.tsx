import { useEffect, useState, useCallback } from 'react';
import { Database, GitBranch, Info } from 'lucide-react';
import { useChangeStreams } from '../hooks/useChangeStreams.js';
import { useToast, ToastContainer } from '../components/Toast.jsx';
import { ConnectionStatus } from '../components/ConnectionStatus.jsx';
import { MatchFilter } from '../components/MatchFilter.jsx';
import { DataOperationPanel } from '../components/DataOperationPanel.jsx';
import { ChangeStreamsListener } from '../components/ChangeStreamsListener.jsx';
import { CollectionView } from '../components/CollectionView.jsx';
import { EventLogPanel } from '../components/EventLogPanel.jsx';
import { useCollectionStore } from '../store/index.js';

type TabType = 'operations' | 'streams' | 'collection' | 'logs';

export default function Home() {
  const { toasts, removeToast, success, error, info } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('streams');
  const { documents } = useCollectionStore();

  const {
    isConnected,
    isManuallyDisconnected,
    isResuming,
    lastToken,
    events,
    missedEventCount,
    resumedCount,
    tokenError,
    currentTerm,
    currentOptime,
    filter,
    matchedCount,
    connect,
    disconnect,
    clearEvents,
    resetToken,
    clearTokenError,
    setFilter,
  } = useChangeStreams({
    url: '/ws',
    autoReconnect: true,
  });

  const handleAdvanceTerm = useCallback(async () => {
    try {
      const res = await fetch('/api/collection/advance-term', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        success?.(`Term 已推进: ${data.data.previousTerm} → ${data.data.currentTerm}`);
      }
    } catch (e) {
      error?.('推进Term失败');
    }
  }, [success, error]);

  useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[0];
      info?.(`收到 ${latestEvent.operationType.toUpperCase()} 事件`);
    }
  }, [events.length, info]);

  useEffect(() => {
    if (tokenError) {
      error?.(`Token错误 [${tokenError.code}]: ${tokenError.message}`);
    }
  }, [tokenError, error]);

  const handleSuccess = (message: string) => {
    success(message);
  };

  const handleError = (message: string) => {
    error(message);
  };

  const tabs: { id: TabType; label: string; icon: any; count?: number }[] = [
    { id: 'operations', label: '操作', icon: Database },
    { id: 'streams', label: '变更流', icon: GitBranch, count: events.length },
    { id: 'collection', label: '集合', icon: Database, count: documents.length },
    { id: 'logs', label: '日志', icon: Info, count: events.length },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">
                  MongoDB Change Streams 模拟器
                </h1>
                <p className="text-xs text-zinc-500">
                  Oplog-like 顺序 · 逻辑时钟(Term) · OpTime(ts:inc) · ResumeToken 断点续传
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-zinc-400">后端:</span>
                <span className="text-zinc-200 font-mono">localhost:3001</span>
              </div>
              {currentTerm && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full">
                  <span className="text-purple-400 font-mono text-xs">Term {currentTerm}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 py-4">
        <ConnectionStatus
          isConnected={isConnected}
          isResuming={isResuming}
          lastToken={lastToken}
          missedEventCount={missedEventCount}
          resumedCount={resumedCount}
          tokenError={tokenError}
          currentTerm={currentTerm}
          currentOptime={currentOptime}
          onConnect={connect}
          onDisconnect={disconnect}
          onClearEvents={clearEvents}
          onResetToken={resetToken}
          onClearTokenError={clearTokenError}
          onAdvanceTerm={handleAdvanceTerm}
        />

        <MatchFilter
          currentFilter={filter}
          matchedCount={matchedCount}
          onFilterChange={setFilter}
        />

        <div className="flex md:hidden border-b border-zinc-800 mb-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-green-400 border-green-400'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="hidden md:block lg:col-span-1 space-y-4">
            <DataOperationPanel
              onSuccess={handleSuccess}
              onError={handleError}
            />
            <CollectionView
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </div>

          <div className="md:hidden">
            {activeTab === 'operations' && (
              <DataOperationPanel
                onSuccess={handleSuccess}
                onError={handleError}
              />
            )}
            {activeTab === 'collection' && (
              <CollectionView
                onSuccess={handleSuccess}
                onError={handleError}
              />
            )}
            {activeTab === 'streams' && (
              <div className="h-[500px]">
                <ChangeStreamsListener
                  events={events}
                  isConnected={isConnected}
                />
              </div>
            )}
            {activeTab === 'logs' && (
              <div className="h-[500px]">
                <EventLogPanel
                  events={events}
                  onClear={clearEvents}
                  currentFilter={filter}
                  currentToken={lastToken}
                />
              </div>
            )}
          </div>

          <div className="hidden md:block lg:col-span-1 h-[calc(100vh-280px)]">
            <ChangeStreamsListener
              events={events}
              isConnected={isConnected}
            />
          </div>

          <div className="hidden md:block lg:col-span-1 h-[calc(100vh-280px)]">
            <EventLogPanel
              events={events}
              onClear={clearEvents}
              currentFilter={filter}
              currentToken={lastToken}
            />
          </div>
        </div>

        <div className="mt-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-zinc-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-zinc-400">
              <p className="font-medium text-zinc-300 mb-1">使用说明</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  点击<span className="text-green-400 font-mono">"连接"</span>
                  建立WebSocket连接，观察<span className="text-purple-400 font-mono">Term</span>和<span className="text-cyan-400 font-mono">OpTime</span>
                </li>
                <li>
                  执行 Insert/Update/Delete 操作，每个事件携带
                  <span className="text-amber-400 font-mono">resumeToken</span>
                  (编码: term:ts:inc)
                </li>
                <li>
                  点击<span className="text-red-400 font-mono">"断开"</span>
                  模拟网络中断，期间继续执行数据操作
                </li>
                <li>
                  点击<span className="text-green-400 font-mono">"重连（续传）"</span>
                  ，使用resumeToken从断点恢复
                </li>
                <li>
                  点击<span className="text-purple-400 font-mono">"推进Term"</span>
                  模拟服务器重启，旧Token将返回
                  <span className="text-red-400 font-mono">40603 TERM_MISMATCH</span>错误
                </li>
                <li>
                  Oplog截断后，过期Token将返回
                  <span className="text-orange-400 font-mono">40602 TOKEN_EXPIRED</span>错误
                </li>
                <li>
                  展开<span className="text-blue-400 font-mono">"$match 过滤条件"</span>
                  ，设置字段过滤规则，仅接收匹配的变更事件
                </li>
                <li>
                  在<span className="text-amber-400 font-mono">"日志"</span>
                  面板点击"导出"，支持 JSON/CSV/NDJSON 格式，可应用过滤条件
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
