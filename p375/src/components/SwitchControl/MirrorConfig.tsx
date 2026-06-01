import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Plus, Trash2, GitBranch, ArrowRight, Download, Filter } from 'lucide-react';
import type { MirrorRule, Port, MirrorMatch } from '../../types';
import { api } from '../../utils/api';

interface MirrorConfigProps {
  rules: MirrorRule[];
  ports: Port[];
  onAddRule: (
    sourcePort: number,
    monitorPort: number,
    direction: 'ingress' | 'egress' | 'both',
    match?: MirrorMatch
  ) => void;
  onDeleteRule: (ruleId: number) => void;
}

export function MirrorConfig({ rules, ports, onAddRule, onDeleteRule }: MirrorConfigProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMatchFields, setShowMatchFields] = useState(false);
  const [sourcePort, setSourcePort] = useState<number>(1);
  const [monitorPort, setMonitorPort] = useState<number>(5);
  const [direction, setDirection] = useState<'ingress' | 'egress' | 'both'>('ingress');
  const [match, setMatch] = useState<MirrorMatch>({});

  const normalPorts = ports.filter((p) => p.type === 'normal');
  const monitorPorts = ports.filter((p) => p.type === 'monitor');

  const handleSubmit = () => {
    const hasMatch = Object.values(match).some((v) => v !== undefined && v !== '');
    onAddRule(sourcePort, monitorPort, direction, hasMatch ? match : undefined);
    setShowAddForm(false);
    setShowMatchFields(false);
    setMatch({});
  };

  const handleExportJson = async () => {
    try {
      const response = await api.exportMirrorStatsJson();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mirror_stats_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export JSON failed:', error);
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.exportMirrorStatsCsv();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mirror_stats_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export CSV failed:', error);
    }
  };

  const updateMatch = (key: keyof MirrorMatch, value: string | number | undefined) => {
    setMatch((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === null) {
        delete next[key];
      } else {
        (next as any)[key] = typeof value === 'string' && !isNaN(Number(value)) && (key === 'srcPort' || key === 'dstPort')
          ? Number(value)
          : value;
      }
      return next;
    });
  };

  const getDirectionLabel = (dir: string) => {
    switch (dir) {
      case 'ingress':
        return '入方向';
      case 'egress':
        return '出方向';
      case 'both':
        return '双向';
      default:
        return dir;
    }
  };

  const formatMatchDescription = (m?: MirrorMatch) => {
    if (!m) return null;
    const parts: string[] = [];
    if (m.protocol) parts.push(`协议: ${m.protocol.toUpperCase()}`);
    if (m.srcPort) parts.push(`源端口: ${m.srcPort}`);
    if (m.dstPort) parts.push(`目的端口: ${m.dstPort}`);
    if (m.srcIp) parts.push(`源IP: ${m.srcIp}`);
    if (m.dstIp) parts.push(`目的IP: ${m.dstIp}`);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Copy className="w-5 h-5 text-orange-400" />
          镜像配置 (Ingress Clone)
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportJson}
              title="导出 JSON"
              className="px-2 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>
            <button
              onClick={handleExportCsv}
              title="导出 CSV"
              className="px-2 py-1.5 bg-blue-500/20 text-blue-400 text-xs rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-orange-500/20 text-orange-400 text-sm rounded-lg hover:bg-orange-500/30 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            添加规则
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">源端口</label>
                  <select
                    value={sourcePort}
                    onChange={(e) => setSourcePort(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {normalPorts.map((port) => (
                      <option key={port.id} value={port.id}>
                        {port.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">方向</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="ingress">入方向 (Ingress)</option>
                    <option value="egress">出方向 (Egress)</option>
                    <option value="both">双向</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">监控端口</label>
                  <select
                    value={monitorPort}
                    onChange={(e) => setMonitorPort(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {monitorPorts.map((port) => (
                      <option key={port.id} value={port.id}>
                        {port.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowMatchFields(!showMatchFields)}
                  className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  {showMatchFields ? '隐藏匹配字段' : '添加匹配字段（可选）'}
                </button>

                <AnimatePresence>
                  {showMatchFields && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mt-3"
                    >
                      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                        <p className="text-xs text-slate-400 mb-2">
                          只镜像匹配以下条件的流量（留空表示不限制）
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">协议</label>
                            <select
                              value={match.protocol || ''}
                              onChange={(e) => updateMatch('protocol', e.target.value || undefined)}
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            >
                              <option value="">全部</option>
                              <option value="tcp">TCP</option>
                              <option value="udp">UDP</option>
                              <option value="icmp">ICMP</option>
                              <option value="http">HTTP (TCP/80)</option>
                              <option value="https">HTTPS (TCP/443)</option>
                              <option value="dns">DNS (UDP/53)</option>
                              <option value="ssh">SSH (TCP/22)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">源端口</label>
                            <input
                              type="number"
                              value={match.srcPort || ''}
                              onChange={(e) => updateMatch('srcPort', e.target.value || undefined)}
                              placeholder="如: 8080"
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">目的端口</label>
                            <input
                              type="number"
                              value={match.dstPort || ''}
                              onChange={(e) => updateMatch('dstPort', e.target.value || undefined)}
                              placeholder="如: 80"
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">源IP</label>
                            <input
                              type="text"
                              value={match.srcIp || ''}
                              onChange={(e) => updateMatch('srcIp', e.target.value || undefined)}
                              placeholder="如: 192.168.1.10"
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">目的IP</label>
                            <input
                              type="text"
                              value={match.dstIp || ''}
                              onChange={(e) => updateMatch('dstIp', e.target.value || undefined)}
                              placeholder="如: 192.168.1.20"
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">源MAC</label>
                            <input
                              type="text"
                              value={match.srcMac || ''}
                              onChange={(e) => updateMatch('srcMac', e.target.value || undefined)}
                              placeholder="如: 00:11:22:33:44:55"
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              setMatch({ protocol: 'tcp', dstPort: 80 });
                            }}
                            className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 transition-colors"
                          >
                            预设: HTTP
                          </button>
                          <button
                            onClick={() => {
                              setMatch({ protocol: 'tcp', dstPort: 443 });
                            }}
                            className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 transition-colors"
                          >
                            预设: HTTPS
                          </button>
                          <button
                            onClick={() => {
                              setMatch({ protocol: 'udp', dstPort: 53 });
                            }}
                            className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 transition-colors"
                          >
                            预设: DNS
                          </button>
                          <button
                            onClick={() => setMatch({})}
                            className="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded hover:bg-slate-600 transition-colors"
                          >
                            清空
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setShowMatchFields(false);
                    setMatch({});
                  }}
                  className="px-4 py-2 bg-slate-600 text-slate-300 text-sm rounded-lg hover:bg-slate-500 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {rules.length === 0 ? (
        <div className="text-center text-slate-400 py-8">
          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无镜像规则</p>
          <p className="text-xs mt-1">点击上方按钮添加 ingress clone 规则</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {rules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.03 }}
                className={`p-3 rounded-lg border ${
                  rule.enabled
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : 'bg-slate-800/50 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        rule.enabled ? 'bg-orange-400 animate-pulse' : 'bg-slate-500'
                      }`}
                    />
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded font-mono">
                        Port {rule.sourcePort}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                        {getDirectionLabel(rule.direction)}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded font-mono">
                        Port {rule.monitorPort}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {rule.match && formatMatchDescription(rule.match) && (
                  <div className="mt-2 ml-5 pl-3 border-l-2 border-orange-500/30">
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Filter className="w-3 h-3 text-orange-400" />
                      匹配: {formatMatchDescription(rule.match)}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
