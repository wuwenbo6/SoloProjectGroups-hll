import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, ListChecks } from 'lucide-react';
import { VerificationStep } from '../types';

interface VerificationStepsProps {
  steps: VerificationStep[];
}

const statusIcon = {
  passed: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

const statusColor = {
  passed: {
    icon: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  failed: {
    icon: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  pending: {
    icon: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
};

export default function VerificationSteps({ steps }: VerificationStepsProps) {
  const passedCount = steps.filter(s => s.status === 'passed').length;
  const totalCount = steps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-emerald-400" />
          验证步骤
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">进度</span>
          <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${totalCount > 0 ? (passedCount / totalCount) * 100 : 0}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            />
          </div>
          <span className="text-sm font-mono text-slate-300">
            {passedCount}/{totalCount}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => {
          const StatusIcon = statusIcon[step.status];
          const colors = statusColor[step.status];

          return (
            <motion.div
              key={step.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.45 + index * 0.08 }}
              className={`p-4 rounded-xl border ${colors.border} ${colors.bg} backdrop-blur-xl transition-all duration-300`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${colors.bg} shrink-0 mt-0.5`}>
                  <StatusIcon className={`w-5 h-5 ${colors.icon} ${step.status === 'pending' ? 'animate-spin' : ''}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <h4 className={`font-semibold ${colors.text}`}>
                      {index + 1}. {step.name}
                    </h4>
                    <div className="flex items-center gap-2 shrink-0">
                      {step.durationMs !== undefined && (
                        <span className="text-xs font-mono text-slate-500">
                          {step.durationMs}ms
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {step.status === 'passed' ? '通过' : step.status === 'failed' ? '失败' : '进行中'}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 mt-1">{step.message}</p>

                  {step.details && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ delay: 0.2 }}
                      className="mt-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30"
                    >
                      <p className="text-xs text-slate-400 font-mono">{step.details}</p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
