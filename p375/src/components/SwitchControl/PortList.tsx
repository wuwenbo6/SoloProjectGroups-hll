import { motion } from 'framer-motion';
import { Ethernet, Monitor, ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react';
import type { Port } from '../../types';

interface PortListProps {
  ports: Port[];
}

export function PortList({ ports }: PortListProps) {
  if (ports.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="text-center text-slate-400 py-8">
          <Ethernet className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无端口</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700 backdrop-blur-sm"
    >
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
        端口列表
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {ports.map((port, index) => (
          <motion.div
            key={port.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * index }}
            className={`relative overflow-hidden rounded-lg p-4 border ${
              port.status === 'up'
                ? 'bg-slate-700/50 border-emerald-500/30'
                : 'bg-slate-800/50 border-slate-700'
            }`}
          >
            <div className="absolute top-0 right-0 w-20 h-20 opacity-10">
              {port.type === 'monitor' ? (
                <Monitor className="w-full h-full text-orange-400" />
              ) : (
                <Ethernet className="w-full h-full text-cyan-400" />
              )}
            </div>
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      port.status === 'up'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className="font-medium text-white">{port.name}</span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    port.type === 'monitor'
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-cyan-500/20 text-cyan-400'
                  }`}
                >
                  {port.type === 'monitor' ? '监控口' : '普通口'}
                </span>
              </div>
              {port.macAddress && (
                <div className="text-xs text-slate-400 font-mono mb-2">
                  {port.macAddress}
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-emerald-400">
                  <TrendingDown className="w-3 h-3" />
                  <span className="font-mono">{port.rxPackets}</span>
                </div>
                <div className="flex items-center gap-1 text-blue-400">
                  <TrendingUp className="w-3 h-3" />
                  <span className="font-mono">{port.txPackets}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
