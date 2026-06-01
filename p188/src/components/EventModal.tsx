import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatDateTime } from '../utils/format.js';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { type: 'motion' | 'alert' | 'custom'; title: string; description: string }) => void;
  timestamp: number;
}

const eventTypes = [
  { value: 'motion', label: '移动侦测', color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30' },
  { value: 'alert', label: '告警事件', color: 'text-red-400 bg-red-500/20 border-red-500/30' },
  { value: 'custom', label: '自定义标记', color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
];

export function EventModal({ isOpen, onClose, onSubmit, timestamp }: EventModalProps) {
  const [type, setType] = useState<'motion' | 'alert' | 'custom'>('custom');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ type, title, description });
    setTitle('');
    setDescription('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-md border border-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Flag className="text-cyan-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">添加事件标记</h3>
              <p className="text-sm text-slate-500">{formatDateTime(timestamp)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-3">事件类型</label>
            <div className="grid grid-cols-3 gap-2">
              {eventTypes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value as any)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                    type === t.value
                      ? t.color
                      : 'text-slate-400 bg-slate-800 border-slate-700 hover:text-slate-300'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">事件标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入事件标题..."
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入事件描述..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-3 rounded-xl bg-cyan-500 text-white font-medium hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              添加标记
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
