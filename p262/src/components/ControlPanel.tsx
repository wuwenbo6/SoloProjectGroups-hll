import { useState } from 'react';
import { Send, RefreshCw, Copy, Zap, Layers } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';

export function ControlPanel() {
  const [messageContent, setMessageContent] = useState('');
  const [customPid, setCustomPid] = useState('');
  const [customSequence, setCustomSequence] = useState('');
  const [partition, setPartition] = useState('0');
  const [customPartition, setCustomPartition] = useState('0');
  const {
    status,
    loading,
    sendMessage,
    sendDuplicateMessage,
    resetProducer,
    toggleIdempotence,
  } = useProducerStore();

  const handleSend = async () => {
    if (!messageContent.trim()) return;
    await sendMessage(messageContent, parseInt(partition));
    setMessageContent('');
  };

  const handleSendDuplicate = async () => {
    if (!messageContent.trim() || !customPid || !customSequence) return;
    await sendDuplicateMessage(
      messageContent,
      parseInt(customPid),
      parseInt(customSequence),
      parseInt(customPartition)
    );
    setMessageContent('');
  };

  const handleSendCurrentDuplicate = async () => {
    if (!messageContent.trim() || !status) return;
    const partitionSeq = status.partitionSequences?.[parseInt(partition)];
    const prevSequence = partitionSeq !== undefined ? partitionSeq : Math.max(0, status.currentSequence - 1);
    await sendDuplicateMessage(
      messageContent,
      status.pid,
      prevSequence,
      parseInt(partition)
    );
    setMessageContent('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          控制面板
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">幂等性</span>
          <button
            onClick={() => toggleIdempotence(!status?.enableIdempotence)}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              status?.enableIdempotence ? 'bg-amber-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${
                status?.enableIdempotence ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${
              status?.enableIdempotence ? 'text-amber-400' : 'text-gray-500'
            }`}
          >
            {status?.enableIdempotence ? '开启' : '关闭'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            消息内容
          </label>
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入要发送的消息内容..."
            className="w-full h-24 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <Layers className="w-4 h-4 inline mr-1" />
            目标分区
          </label>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setPartition(String(p))}
                className={`flex-1 py-2 rounded-lg font-mono text-sm transition-all ${
                  partition === String(p)
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                分区 {p}
              </button>
            ))}
          </div>
          {status?.partitionSequences && status.partitionSequences[parseInt(partition)] !== undefined && (
            <p className="text-xs text-cyan-400 mt-2">
              当前分区 {partition} 最新序列号: <span className="font-mono font-bold">{status.partitionSequences[parseInt(partition)]}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              自定义 PID
            </label>
            <input
              type="number"
              value={customPid}
              onChange={(e) => setCustomPid(e.target.value)}
              placeholder="指定PID"
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              自定义 Seq
            </label>
            <input
              type="number"
              value={customSequence}
              onChange={(e) => setCustomSequence(e.target.value)}
              placeholder="指定Sequence"
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              自定义分区
            </label>
            <select
              value={customPartition}
              onChange={(e) => setCustomPartition(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono text-sm"
            >
              {[0, 1, 2, 3].map((p) => (
                <option key={p} value={p}>分区 {p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleSend}
            disabled={loading || !messageContent.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
          >
            <Send className="w-4 h-4" />
            发送消息
          </button>
          <button
            onClick={handleSendCurrentDuplicate}
            disabled={loading || !messageContent.trim() || !status || status.currentSequence === 0}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium rounded-xl hover:from-red-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-red-500/25 hover:shadow-red-500/40"
          >
            <Copy className="w-4 h-4" />
            发送重复消息
          </button>
        </div>

        <button
          onClick={handleSendDuplicate}
          disabled={loading || !messageContent.trim() || !customPid || !customSequence}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 text-white font-medium rounded-xl hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <Copy className="w-4 h-4" />
          发送自定义PID+序列号的重复消息
        </button>

        <button
          onClick={resetProducer}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-slate-600 text-gray-300 font-medium rounded-xl hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          重置生产者
        </button>
      </div>
    </div>
  );
}
