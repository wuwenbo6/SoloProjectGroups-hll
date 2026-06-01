import { useLogStore } from '@/stores/logStore';
import LogEntryCard from './LogEntryCard';
import { Loader2, Inbox } from 'lucide-react';
import { useEffect, useCallback } from 'react';

export default function LogList() {
  const { logs, total, query, loading, loadMore } = useLogStore();

  const handleScroll = useCallback(() => {
    if (loading) return;
    const el = document.documentElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      loadMore();
    }
  }, [loading, loadMore]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (logs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gelf-muted">
        <Inbox size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-1">暂无日志</p>
        <p className="text-sm">
          向 UDP 端口 12201 发送 GELF 消息，或使用下方的测试按钮
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gelf-muted px-1">
        <span className="font-mono">
          {total > 0 ? `${total} 条日志` : '无结果'}
          {query && ` · 搜索 "${query}"`}
        </span>
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="animate-slide-in">
            <LogEntryCard log={log} query={query} />
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gelf-accent" />
          <span className="ml-2 text-sm text-gelf-muted">加载中...</span>
        </div>
      )}
    </div>
  );
}
