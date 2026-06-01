import { useState } from 'react';
import { ArrowRightLeft, Play, Send, CheckCircle2, XCircle, Plus, Layers, Clock, Hash } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';

interface TxnMessage {
  content: string;
  partition: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function TransactionPanel() {
  const {
    status,
    loading,
    transactions,
    beginTransaction,
    sendTransactionalMessage,
    commitTransaction,
    abortTransaction,
  } = useProducerStore();

  const [txnMessages, setTxnMessages] = useState<TxnMessage[]>([
    { content: '', partition: 0 },
  ]);

  const activeTxn = status?.activeTransaction;

  const addMessageRow = () => {
    setTxnMessages([...txnMessages, { content: '', partition: 0 }]);
  };

  const removeMessageRow = (index: number) => {
    if (txnMessages.length <= 1) return;
    setTxnMessages(txnMessages.filter((_, i) => i !== index));
  };

  const updateMessageRow = (index: number, field: keyof TxnMessage, value: string | number) => {
    const updated = [...txnMessages];
    updated[index] = { ...updated[index], [field]: value };
    setTxnMessages(updated);
  };

  const handleBegin = async () => {
    await beginTransaction();
  };

  const handleSendAll = async () => {
    for (const msg of txnMessages) {
      if (msg.content.trim()) {
        await sendTransactionalMessage(msg.content, msg.partition);
      }
    }
  };

  const handleCommit = async () => {
    await commitTransaction();
    setTxnMessages([{ content: '', partition: 0 }]);
  };

  const handleAbort = async () => {
    await abortTransaction();
    setTxnMessages([{ content: '', partition: 0 }]);
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
          事务演示 (Transactional)
        </h2>
        {activeTxn && (
          <span className="px-3 py-1 text-xs font-mono font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
            事务进行中: {activeTxn.transactionId}
          </span>
        )}
      </div>

      <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <p className="text-sm text-emerald-200">
          <strong>事务特性:</strong> 原子写入多个分区。commit 时所有消息同时可见，abort 时所有消息全部回滚。
          消息在 commit 前状态为 <code className="font-mono bg-emerald-500/20 px-1 rounded">TX_PENDING</code>，
          commit 后变为 <code className="font-mono bg-emerald-500/20 px-1 rounded">TX_COMMITTED</code>，
          abort 后变为 <code className="font-mono bg-emerald-500/20 px-1 rounded">TX_ABORTED</code>。
        </p>
      </div>

      {!activeTxn ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {txnMessages.map((msg, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-6">#{index + 1}</span>
                <input
                  type="text"
                  value={msg.content}
                  onChange={(e) => updateMessageRow(index, 'content', e.target.value)}
                  placeholder="消息内容"
                  className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                />
                <select
                  value={msg.partition}
                  onChange={(e) => updateMessageRow(index, 'partition', parseInt(e.target.value))}
                  className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm font-mono"
                >
                  {[0, 1, 2, 3].map((p) => (
                    <option key={p} value={p}>分区 {p}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeMessageRow(index)}
                  disabled={txnMessages.length <= 1}
                  className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-30 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addMessageRow}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white border border-dashed border-slate-600 rounded-lg hover:border-emerald-500/50 transition-all w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            添加消息（可发往不同分区）
          </button>

          <button
            onClick={handleBegin}
            disabled={loading || txnMessages.every(m => !m.content.trim())}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-emerald-500/25"
          >
            <Play className="w-4 h-4" />
            开启事务并发送
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">事务详情</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">事务ID:</span>
                <span className="ml-2 font-mono text-white">{activeTxn.transactionId}</span>
              </div>
              <div>
                <span className="text-gray-500">阶段:</span>
                <span className="ml-2 font-mono text-yellow-400">{activeTxn.phase}</span>
              </div>
              <div>
                <span className="text-gray-500">涉及分区:</span>
                <span className="ml-2 font-mono text-cyan-400">
                  {activeTxn.partitions.length > 0 ? activeTxn.partitions.join(', ') : '暂无'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">消息数:</span>
                <span className="ml-2 font-mono text-white">{activeTxn.messageIds.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCommit}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-4 h-4" />
              提交事务 (Commit)
            </button>
            <button
              onClick={handleAbort}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/25"
            >
              <XCircle className="w-4 h-4" />
              回滚事务 (Abort)
            </button>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-700/50">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            事务历史
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {[...transactions].reverse().map((txn, index) => {
              const isCommitted = txn.phase === 'COMMITTING';
              const isAborted = txn.phase === 'ABORTING';

              return (
                <div
                  key={txn.transactionId + index}
                  className={`p-3 rounded-lg border text-sm ${
                    isCommitted
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : isAborted
                      ? 'bg-orange-500/5 border-orange-500/20'
                      : 'bg-yellow-500/5 border-yellow-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-white">
                      {txn.transactionId}
                    </span>
                    <span className={`text-xs font-medium ${
                      isCommitted ? 'text-emerald-400' : isAborted ? 'text-orange-400' : 'text-yellow-400'
                    }`}>
                      {isCommitted ? '已提交' : isAborted ? '已回滚' : txn.phase}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      <Layers className="w-3 h-3 inline mr-1" />
                      分区: [{txn.partitions.join(', ')}]
                    </span>
                    <span>消息数: {txn.messageIds.length}</span>
                    <span>
                      {isCommitted && txn.committedAt ? formatTime(txn.committedAt) : ''}
                      {isAborted && txn.abortedAt ? formatTime(txn.abortedAt) : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
