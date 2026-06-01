import { useEffect } from 'react';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { useCollectionStore } from '../store/index.js';
import { api } from '../services/api.js';
import { cn } from '../lib/utils.js';

interface CollectionViewProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function CollectionView({ onSuccess, onError }: CollectionViewProps) {
  const { documents, setDocuments, setLoading, loading } = useCollectionStore();

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const result = await api.getCollection();
      if (result.success && result.data) {
        setDocuments(result.data.documents);
      }
    } catch (e) {
      onError?.('获取集合数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('确定要清空所有文档和事件日志吗？')) return;
    try {
      const result = await api.clear();
      if (result.success) {
        setDocuments([]);
        onSuccess?.('已清空集合和事件日志');
      } else {
        onError?.(result.error || '清空失败');
      }
    } catch (e) {
      onError?.('清空失败');
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-zinc-100">模拟集合</h3>
          <span className="text-xs text-zinc-500 font-mono">
            {documents.length} 文档
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocuments}
            disabled={loading}
            className={cn(
              'p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors',
              loading && 'animate-spin'
            )}
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="清空"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <Database className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">集合为空</p>
            <p className="text-xs mt-1">执行 Insert 操作添加文档</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc._id}
                className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <code className="text-xs text-green-400 font-mono truncate">
                    _id: {doc._id}
                  </code>
                </div>
                <pre className="text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
{JSON.stringify(
  Object.fromEntries(
    Object.entries(doc).filter(([k]) => !k.startsWith('_'))
  ),
  null,
  2
)}
                </pre>
                <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                  <span>
                    创建: {new Date(doc._createdAt).toLocaleString('zh-CN')}
                  </span>
                  {doc._updatedAt !== doc._createdAt && (
                    <span>
                      更新: {new Date(doc._updatedAt).toLocaleString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
