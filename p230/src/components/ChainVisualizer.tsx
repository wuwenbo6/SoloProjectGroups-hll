import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, Shield, Key, Lock, Ban, Hash } from 'lucide-react';
import { ChainNode } from '../types';

interface ChainVisualizerProps {
  chain: ChainNode[];
}

const nodeConfig: Record<string, {
  icon: any;
  title: string;
  description: string;
  color: string;
}> = {
  ds: {
    icon: Shield,
    title: 'DS 记录',
    description: '父域中的委托签名记录',
    color: 'from-blue-500 to-cyan-500',
  },
  dnskey: {
    icon: Key,
    title: 'DNSKEY 记录',
    description: '区域公钥记录（KSK + ZSK）',
    color: 'from-purple-500 to-pink-500',
  },
  rrsig: {
    icon: Lock,
    title: 'RRSIG 签名',
    description: '资源记录集数字签名',
    color: 'from-emerald-500 to-teal-500',
  },
  nsec: {
    icon: Ban,
    title: 'NSEC 负响应证明',
    description: '证明域名/记录类型不存在',
    color: 'from-orange-500 to-amber-500',
  },
  nsec3: {
    icon: Hash,
    title: 'NSEC3 负响应证明',
    description: '哈希形式的域名不存在证明',
    color: 'from-orange-500 to-red-500',
  },
};

const statusIcon = {
  passed: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

const statusColor = {
  passed: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  failed: 'text-red-400 border-red-500/30 bg-red-500/10',
  pending: 'text-blue-400 border-blue-500/30 bg-blue-500/10 animate-pulse',
};

export default function ChainVisualizer({ chain }: ChainVisualizerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full max-w-4xl mx-auto"
    >
      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-400" />
        信任链验证
      </h3>

      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500/50 via-purple-500/50 to-emerald-500/50 transform -translate-x-1/2 hidden sm:block" />

        <div className="space-y-6 sm:space-y-0">
          {chain.map((node, index) => {
            const config = nodeConfig[node.id];
            const StatusIcon = statusIcon[node.status];
            const NodeIcon = config.icon;
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, x: isEven ? -50 : 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + index * 0.15 }}
                className="relative sm:grid sm:grid-cols-2 sm:gap-8 sm:items-center"
              >
                <div className={`hidden sm:flex ${isEven ? 'justify-end' : 'order-2 justify-start'}`}>
                  {isEven && (
                    <div className={`p-5 rounded-2xl border ${statusColor[node.status]} backdrop-blur-xl w-full max-w-md`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${config.color}`}>
                          <NodeIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-white">{config.title}</h4>
                            <StatusIcon className={`w-5 h-5 ${statusColor[node.status].split(' ')[0]}`} />
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{config.description}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {node.records.length} 条记录
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden sm:flex justify-center">
                  <div className="relative z-10">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center shadow-lg shadow-blue-500/30`}>
                      <NodeIcon className="w-6 h-6 text-white" />
                    </div>
                    <motion.div
                      animate={node.status === 'passed' ? { scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] } : {}}
                      transition={{ duration: 2, repeat: node.status === 'passed' ? Infinity : 0 }}
                      className={`absolute inset-0 rounded-full ${statusColor[node.status].split(' ')[2]}`}
                    />
                  </div>
                </div>

                <div className={`hidden sm:flex ${isEven ? 'justify-start' : 'order-1 justify-end'}`}>
                  {!isEven && (
                    <div className={`p-5 rounded-2xl border ${statusColor[node.status]} backdrop-blur-xl w-full max-w-md`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${config.color}`}>
                          <NodeIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-white">{config.title}</h4>
                            <StatusIcon className={`w-5 h-5 ${statusColor[node.status].split(' ')[0]}`} />
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{config.description}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {node.records.length} 条记录
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`sm:hidden p-4 rounded-2xl border ${statusColor[node.status]} backdrop-blur-xl`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${config.color} shrink-0`}>
                      <NodeIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-white text-sm">{config.title}</h4>
                        <StatusIcon className={`w-4 h-4 ${statusColor[node.status].split(' ')[0]} shrink-0`} />
                      </div>
                      <p className="text-xs text-slate-400">{config.description}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
