import { motion } from 'framer-motion';
import { Activity, Server, Wifi, WifiOff } from 'lucide-react';
import type { SwitchStatus } from '../../types';

interface StatusCardProps {
  status: SwitchStatus | null;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function StatusCard({ status, onStart, onStop, onReset }: StatusCardProps) {
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const animateNumber = (value: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  });

  if (!status) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="animate-pulse h-32 bg-slate-700/50 rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${status.running ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
            <Server className={`w-6 h-6 ${status.running ? 'text-emerald-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{status.name}</h2>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  status.running
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    status.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {status.running ? '运行中' : '已停止'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStart}
            disabled={status.running}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <Wifi className="w-4 h-4" />
            启动
          </button>
          <button
            onClick={onStop}
            disabled={!status.running}
            className="px-3 py-1.5 bg-rose-500/20 text-rose-400 text-sm rounded-lg hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <WifiOff className="w-4 h-4" />
            停止
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">运行时间</div>
          <motion.div
            key={status.uptime}
            {...animateNumber(status.uptime)}
            className="text-xl font-mono text-cyan-400"
          >
            {formatUptime(status.uptime)}
          </motion.div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">接收包数</div>
          <motion.div
            key={status.totalRxPackets}
            {...animateNumber(status.totalRxPackets)}
            className="text-xl font-mono text-emerald-400"
          >
            {status.totalRxPackets.toLocaleString()}
          </motion.div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">转发包数</div>
          <motion.div
            key={status.totalTxPackets}
            {...animateNumber(status.totalTxPackets)}
            className="text-xl font-mono text-blue-400"
          >
            {status.totalTxPackets.toLocaleString()}
          </motion.div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">镜像包数</div>
          <motion.div
            key={status.totalMirrorPackets}
            {...animateNumber(status.totalMirrorPackets)}
            className="text-xl font-mono text-orange-400"
          >
            {status.totalMirrorPackets.toLocaleString()}
          </motion.div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">MAC表项</div>
          <motion.div
            key={status.macTableSize}
            {...animateNumber(status.macTableSize)}
            className="text-xl font-mono text-purple-400"
          >
            {status.macTableSize}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
