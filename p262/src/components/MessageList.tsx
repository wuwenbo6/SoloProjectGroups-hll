import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Hash, List, ArrowRightCircle, Ban, Loader2 } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';
import type { MessageRecord } from '../../shared/types';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function StatusBadge({ status }: { status: MessageRecord['status'] }) {
  const config: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    ACCEPTED: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20', label: '已接受' },
    DUPLICATE_DISCARDED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: '重复已丢弃' },
    TX_PENDING: { icon: Loader2, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '事务待提交' },
    TX_COMMITTED: { icon: ArrowRightCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: '事务已提交' },
    TX_ABORTED: { icon: Ban, color: 'text-orange-400', bg: 'bg-orange-500/20', label: '事务已回滚' },
  };

  const c = config[status] || config.ACCEPTED;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${c.color}`}>
      <div className={`p-1.5 rounded-lg ${c.bg}`}>
        <Icon className={`w-4 h-4 ${status === 'TX_PENDING' ? 'animate-spin' : ''}`} />
      </div>
      {c.label}
    </span>
  );
}

function MessageRow({
  message,
  isLatest,
  isDuplicate,
}: {
  message: MessageRecord;
  isLatest: boolean;
  isDuplicate: boolean;
}) {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (isLatest) {
      setShowAnimation(true);
      const timer = setTimeout(() => setShowAnimation(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isLatest]);

  const borderColors: Record<string, string> = {
    ACCEPTED: 'bg-green-500/5 border-green-500/20 hover:border-green-500/40',
    DUPLICATE_DISCARDED: 'bg-red-500/5 border-red-500/20 hover:border-red-500/40',
    TX_PENDING: 'bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40',
    TX_COMMITTED: 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40',
    TX_ABORTED: 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40',
  };

  const badgeColors: Record<string, string> = {
    ACCEPTED: 'bg-green-500 text-white',
    DUPLICATE_DISCARDED: 'bg-red-500 text-white',
    TX_PENDING: 'bg-yellow-500 text-white',
    TX_COMMITTED: 'bg-emerald-500 text-white',
    TX_ABORTED: 'bg-orange-500 text-white',
  };

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all duration-300 ${
        borderColors[message.status] || borderColors.ACCEPTED
      } ${showAnimation && isDuplicate ? 'animate-shake' : ''}`}
    >
      {isLatest && (
        <div
          className={`absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium rounded-full ${
            badgeColors[message.status] || badgeColors.ACCEPTED
          }`}
        >
          最新
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <StatusBadge status={message.status} />
            <div className="flex items-center gap-2">
              {message.transactionId && (
                <span className="text-xs font-mono text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">
                  {message.transactionId}
                </span>
              )}
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <Clock className="w-3 h-3" />
                {formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>

          <p className="text-white text-sm mb-3 break-all">
            {message.content}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-gray-400">PID:</span>
              <span className="font-mono text-xs text-amber-400">
                {message.pid}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <List className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-gray-400">Seq:</span>
              <span className="font-mono text-xs text-blue-400">
                {message.sequence}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">分区:</span>
              <span className="font-mono text-xs text-purple-400">
                {message.partition}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <div className="text-xs text-gray-500">
              唯一键:{' '}
              <span className="font-mono text-gray-400">
                {message.pid}-{message.partition}-{message.sequence}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageList() {
  const { messages, lastMessageId, isDuplicateMessage } = useProducerStore();

  if (messages.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
          <List className="w-8 h-8 text-gray-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-400 mb-2">暂无消息</h3>
        <p className="text-sm text-gray-500">
          在左侧控制面板输入消息内容并发送，即可看到消息记录
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <List className="w-5 h-5 text-amber-400" />
          消息记录
        </h2>
        <span className="text-sm text-gray-400">
          共 {messages.length} 条消息
        </span>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            isLatest={index === 0 && message.id === lastMessageId}
            isDuplicate={index === 0 && isDuplicateMessage}
          />
        ))}
      </div>
    </div>
  );
}
