import { motion } from 'framer-motion';
import { Timer, ArrowRight } from 'lucide-react';
import type { TimelineEntry } from '../../shared/types';

interface VerificationTimelineProps {
  timeline: TimelineEntry[];
  totalDuration: number;
}

const statusColor = {
  passed: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  failed: {
    bar: 'bg-red-500',
    text: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  pending: {
    bar: 'bg-blue-500',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
};

export default function VerificationTimeline({ timeline, totalDuration }: VerificationTimelineProps) {
  if (!timeline || timeline.length === 0) return null;

  const maxDuration = Math.max(...timeline.map(t => t.durationMs), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Timer className="w-5 h-5 text-cyan-400" />
          验证时间线
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">总耗时</span>
          <span className="font-mono text-cyan-400 font-semibold">{totalDuration}ms</span>
        </div>
      </div>

      <div className="space-y-3">
        {timeline.map((entry, index) => {
          const colors = statusColor[entry.status];
          const widthPercent = Math.max((entry.durationMs / maxDuration) * 100, 4);
          const percentage = totalDuration > 0 ? ((entry.durationMs / totalDuration) * 100).toFixed(1) : '0';

          return (
            <motion.div
              key={entry.step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.06 }}
              className="group"
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className={`text-xs font-medium ${colors.text} shrink-0`}>
                    {index + 1}.
                  </span>
                  <span className="text-sm text-white truncate">{entry.step}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-mono ${colors.text}`}>
                    {entry.durationMs}ms
                  </span>
                  <span className="text-xs text-slate-500">
                    ({percentage}%)
                  </span>
                </div>
              </div>

              <div className="relative h-2 bg-slate-800/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPercent}%` }}
                  transition={{ duration: 0.6, delay: 0.6 + index * 0.06, ease: 'easeOut' }}
                  className={`h-full rounded-full ${colors.bar}`}
                />
              </div>

              {index < timeline.length - 1 && (
                <div className="flex justify-center my-1">
                  <ArrowRight className="w-3 h-3 text-slate-600 rotate-90" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-400">通过</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-slate-400">失败</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-slate-400">进行中</span>
            </span>
          </div>
          <span className="text-slate-500">
            最慢步骤: {timeline.reduce((max, t) => t.durationMs > max.durationMs ? t : max, timeline[0]).step}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
