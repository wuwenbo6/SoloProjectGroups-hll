import { useState } from 'react';
import { Plus, Edit3, Trash2, Database } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { api } from '../services/api.js';
import { useCollectionStore } from '../store/index.js';

interface DataOperationPanelProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

type OperationType = 'insert' | 'update' | 'delete';

export function DataOperationPanel({ onSuccess, onError }: DataOperationPanelProps) {
  const [operation, setOperation] = useState<OperationType>('insert');
  const [jsonInput, setJsonInput] = useState('{\n  "name": "测试文档",\n  "value": 100\n}');
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);
  const { documents } = useCollectionStore();

  const executeOperation = async () => {
    if (loading) return;
    setLoading(true);

    try {
      let data: Record<string, any>;
      try {
        data = JSON.parse(jsonInput);
      } catch (e) {
        onError?.('JSON 格式错误');
        return;
      }

      let result;
      switch (operation) {
        case 'insert':
          result = await api.insert(data);
          if (result.success) {
            onSuccess?.(`插入成功: ${result.data?.document._id}`);
          }
          break;
        case 'update':
          if (!documentId) {
            onError?.('请选择要更新的文档ID');
            return;
          }
          result = await api.update(documentId, data);
          if (result.success) {
            onSuccess?.(`更新成功: ${result.data?.document._id}`);
          }
          break;
        case 'delete':
          if (!documentId) {
            onError?.('请选择要删除的文档ID');
            return;
          }
          result = await api.delete(documentId);
          if (result.success) {
            onSuccess?.(`删除成功: ${result.data?.documentId}`);
          }
          break;
      }

      if (result && !result.success) {
        onError?.(result.error || '操作失败');
      }
    } catch (e) {
      onError?.('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const quickFillSample = () => {
    const samples: Record<OperationType, string> = {
      insert: '{\n  "name": "新文档",\n  "type": "insert",\n  "timestamp": ' + Date.now() + '\n}',
      update: '{\n  "name": "已更新",\n  "value": 200,\n  "updatedAt": ' + Date.now() + '\n}',
      delete: '{}',
    };
    setJsonInput(samples[operation]);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-5 h-5 text-green-400" />
        <h3 className="font-semibold text-zinc-100">数据操作</h3>
      </div>

      <div className="flex gap-2 mb-4">
        {(['insert', 'update', 'delete'] as OperationType[]).map((op) => (
          <button
            key={op}
            onClick={() => setOperation(op)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
              operation === op
                ? op === 'insert'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : op === 'update'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
            )}
          >
            {op === 'insert' && <Plus className="w-4 h-4" />}
            {op === 'update' && <Edit3 className="w-4 h-4" />}
            {op === 'delete' && <Trash2 className="w-4 h-4" />}
            {op === 'insert' ? 'Insert' : op === 'update' ? 'Update' : 'Delete'}
          </button>
        ))}
      </div>

      {operation !== 'insert' && (
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1.5">选择文档</label>
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-green-500"
          >
            <option value="">-- 选择文档ID --</option>
            {documents.map((doc) => (
              <option key={doc._id} value={doc._id}>
                {doc._id.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-zinc-400">数据 (JSON)</label>
          <button
            onClick={quickFillSample}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            快速填充
          </button>
        </div>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={6}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-green-500 resize-none"
          placeholder='{"key": "value"}'
        />
      </div>

      <button
        onClick={executeOperation}
        disabled={loading}
        className={cn(
          'w-full py-2.5 rounded-md text-sm font-medium transition-all',
          'flex items-center justify-center gap-2',
          operation === 'insert' && 'bg-green-500 hover:bg-green-600 text-white',
          operation === 'update' && 'bg-blue-500 hover:bg-blue-600 text-white',
          operation === 'delete' && 'bg-red-500 hover:bg-red-600 text-white',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {loading ? (
          <span className="animate-spin">⏳</span>
        ) : (
          <>
            {operation === 'insert' && <Plus className="w-4 h-4" />}
            {operation === 'update' && <Edit3 className="w-4 h-4" />}
            {operation === 'delete' && <Trash2 className="w-4 h-4" />}
            执行 {operation.toUpperCase()}
          </>
        )}
      </button>
    </div>
  );
}
