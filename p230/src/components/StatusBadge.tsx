import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { VerificationStatus } from '../types';

interface StatusBadgeProps {
  status: VerificationStatus;
  domain: string;
  recordType: string;
  duration?: number;
}

const statusConfig = {
  passed: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    glowColor: 'shadow-emerald-500/20',
    label: '验证通过',
    description: 'DNSSEC签名验证成功，数据完整可信',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    glowColor: 'shadow-red-500/20',
    label: '验证失败',
    description: 'DNSSEC签名验证失败，数据可能已被篡改',
  },
  pending: {
    icon: Clock,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    glowColor: 'shadow-blue-500/20',
    label: '验证中',
    description: '正在进行DNSSEC验证...',
  },
  unsigned: {
    icon: ShieldAlert,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    glowColor: 'shadow-amber-500/20',
    label: '未签名',
    description: '该域名未启用DNSSEC，数据完整性无法保证',
  },
};

export default function StatusBadge({ status, domain, recordType, duration }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`w-full max-w-3xl mx-auto p-6 rounded-2xl border ${config.bgColor} ${config.borderColor} shadow-xl ${config.glowColor} backdrop-blur-xl`}
    >
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <motion.div
          animate={status === 'passed' ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.6, repeat: status === 'passed' ? Infinity : 0, repeatDelay: 2 }}
          className={`p-4 rounded-full ${config.bgColor}`}
        >
          <Icon className={`w-12 h-12 ${config.color}`} />
        </motion.div>

        <div className="flex-1 text-center sm:text-left">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`text-3xl font-bold ${config.color} mb-1`}
          >
            {config.label}
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-slate-300 text-lg"
          >
            <span className="font-mono text-slate-100">{domain}</span>
            <span className="mx-2 text-slate-500">•</span>
            <span className="px-2 py-0.5 bg-slate-700/50 rounded text-sm font-mono">{recordType}</span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-slate-400 text-sm mt-1"
          >
            {config.description}
          </motion.p>
        </div>

        {duration !== undefined && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <div className="text-3xl font-bold text-slate-100">{duration}</div>
            <div className="text-xs text-slate-400">毫秒</div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
