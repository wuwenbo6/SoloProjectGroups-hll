import { useState, useCallback, useEffect } from 'react';
import { Play, Pause, LogIn, LogOut, ArrowRightLeft, Radio, Upload, Shield, CheckCircle, XCircle } from 'lucide-react';
import type { PresetType, Router, RPFCheckResult } from '@/types/simulator';
import { performRPFCheck } from '@/api/simulator';

interface ControlPanelProps {
  topology: {
    routers: Router[];
  } | null;
  onPreset: (preset: PresetType) => void;
  onJoin: (group: string, sourceId: string | undefined, joinType: 'starg' | 'sg') => void;
  onPrune: (group: string, sourceId: string | undefined, pruneType: 'starg' | 'sg') => void;
  onSwitchSPT: (group: string, sourceId: string) => void;
  onRegister: (sourceId: string, group: string, sourceIp?: string, packetSourceIp?: string) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  activePreset: PresetType | null;
  selectedReceiverId: string | null;
}

export default function ControlPanel({
  topology,
  onPreset,
  onJoin,
  onPrune,
  onSwitchSPT,
  onRegister,
  isPlaying,
  onTogglePlay,
  activePreset,
  selectedReceiverId,
}: ControlPanelProps) {
  const [group, setGroup] = useState('239.1.1.1');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [selectedReceiverIdLocal, setSelectedReceiverIdLocal] = useState<string>('');
  const [sourceIp, setSourceIp] = useState('');
  const [packetSourceIp, setPacketSourceIp] = useState('');
  const [rpfRouterId, setRpfRouterId] = useState('');
  const [rpfSourceAddr, setRpfSourceAddr] = useState('');
  const [rpfIncomingIf, setRpfIncomingIf] = useState('');
  const [rpfResult, setRpfResult] = useState<RPFCheckResult | null>(null);
  const [rpfLoading, setRpfLoading] = useState(false);

  const sources = topology?.routers.filter((r) => r.type === 'source') ?? [];
  const receivers = topology?.routers.filter((r) => r.type === 'receiver') ?? [];
  const allRouters = topology?.routers ?? [];

  const effectiveReceiverId = selectedReceiverId || selectedReceiverIdLocal;

  const handleStargJoin = useCallback(() => {
    onJoin(group, undefined, 'starg');
  }, [group, onJoin]);

  const handleSgJoin = useCallback(() => {
    onJoin(group, selectedSourceId || undefined, 'sg');
  }, [group, selectedSourceId, onJoin]);

  const handlePrune = useCallback(() => {
    onPrune(group, selectedSourceId || undefined, selectedSourceId ? 'sg' : 'starg');
  }, [group, selectedSourceId, onPrune]);

  const handleSwitchSPT = useCallback(() => {
    if (selectedSourceId && effectiveReceiverId) {
      onSwitchSPT(group, selectedSourceId);
    }
  }, [group, selectedSourceId, effectiveReceiverId, onSwitchSPT]);

  const handleRegister = useCallback(() => {
    if (selectedSourceId) {
      onRegister(
        selectedSourceId,
        group,
        sourceIp || undefined,
        packetSourceIp || undefined
      );
    }
  }, [selectedSourceId, group, sourceIp, packetSourceIp, onRegister]);

  const handleRPFCheck = useCallback(async () => {
    if (!rpfRouterId || !rpfSourceAddr) return;
    setRpfLoading(true);
    try {
      const result = await performRPFCheck({
        router_id: rpfRouterId,
        source_addr: rpfSourceAddr,
        incoming_if: rpfIncomingIf || undefined,
      });
      setRpfResult(result);
    } catch {
      setRpfResult(null);
    } finally {
      setRpfLoading(false);
    }
  }, [rpfRouterId, rpfSourceAddr, rpfIncomingIf]);

  useEffect(() => {
    if (sources.length > 0 && !selectedSourceId) {
      setSelectedSourceId(sources[0].id);
    }
  }, [sources, selectedSourceId]);

  useEffect(() => {
    if (allRouters.length > 0 && !rpfRouterId) {
      setRpfRouterId(allRouters[0].id);
    }
  }, [allRouters, rpfRouterId]);

  const btnBase =
    'w-full px-3 py-2 rounded text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';
  const btnCyan = `${btnBase} bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 hover:bg-cyan-800/60 hover:shadow-[0_0_10px_rgba(0,212,255,0.3)]`;
  const btnGreen = `${btnBase} bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-800/60 hover:shadow-[0_0_10px_rgba(0,255,136,0.3)]`;
  const btnOrange = `${btnBase} bg-orange-900/50 text-orange-300 border border-orange-700/50 hover:bg-orange-800/60 hover:shadow-[0_0_10px_rgba(255,140,0,0.3)]`;
  const btnRed = `${btnBase} bg-red-900/50 text-red-300 border border-red-700/50 hover:bg-red-800/60 hover:shadow-[0_0_10px_rgba(255,68,68,0.3)]`;
  const btnPurple = `${btnBase} bg-purple-900/50 text-purple-300 border border-purple-700/50 hover:bg-purple-800/60 hover:shadow-[0_0_10px_rgba(168,85,247,0.3)]`;

  const sourceIpMatch = !sourceIp || !packetSourceIp || sourceIp === packetSourceIp;

  return (
    <div className="w-[280px] h-full bg-gray-900/80 border-r border-gray-700/50 overflow-y-auto flex flex-col gap-4 p-4 custom-scrollbar">
      <div>
        <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">
          预设场景
        </h2>
        <div className="flex flex-col gap-2">
          {([
            ['BASIC_RPT', '基础 RPT', btnCyan],
            ['SPT_SWITCH', 'SPT 切换', btnOrange],
            ['MULTI_SOURCE', '多源组播', btnGreen],
            ['PRUNE_LEAVE', '剪枝离开', btnRed],
          ] as const).map(([preset, label, cls]) => (
            <button
              key={preset}
              className={`${cls} ${activePreset === preset ? 'ring-1 ring-cyan-400 shadow-[0_0_12px_rgba(0,212,255,0.4)]' : ''}`}
              onClick={() => onPreset(preset as PresetType)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-700/50 pt-4">
        <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">
          协议操作
        </h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">组播组地址</label>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-3 py-1.5 text-sm text-cyan-200 focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_8px_rgba(0,212,255,0.2)]"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">源路由器</label>
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-3 py-1.5 text-sm text-emerald-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- 选择源 --</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">接收路由器</label>
            <select
              value={selectedReceiverIdLocal}
              onChange={(e) => setSelectedReceiverIdLocal(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-3 py-1.5 text-sm text-blue-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">-- 选择接收者 --</option>
              {receivers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-gray-800/40 rounded p-3 border border-gray-700/30">
            <h3 className="text-xs font-semibold text-gray-300 mb-2">Register 源IP校验</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Register 消息源IP</label>
                <input
                  type="text"
                  value={sourceIp}
                  onChange={(e) => setSourceIp(e.target.value)}
                  placeholder="留空使用默认"
                  className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">数据包源IP</label>
                <input
                  type="text"
                  value={packetSourceIp}
                  onChange={(e) => setPacketSourceIp(e.target.value)}
                  placeholder="留空使用默认"
                  className={`w-full bg-gray-800/80 border rounded px-2 py-1 text-xs text-gray-300 focus:outline-none ${
                    sourceIp && packetSourceIp && sourceIp !== packetSourceIp
                      ? 'border-red-500/70'
                      : 'border-gray-600/50 focus:border-purple-500'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                {sourceIp && packetSourceIp && (
                  sourceIp === packetSourceIp ? (
                    <><CheckCircle className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">源IP一致</span></>
                  ) : (
                    <><XCircle className="w-3 h-3 text-red-400" /><span className="text-red-400">源IP不一致 (将被拒绝)</span></>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <button
              className={btnGreen}
              onClick={handleStargJoin}
              disabled={!effectiveReceiverId}
            >
              <LogIn className="inline w-4 h-4 mr-1" />
              (*,G) Join
            </button>
            <button
              className={btnOrange}
              onClick={handleSgJoin}
              disabled={!effectiveReceiverId || !selectedSourceId}
            >
              <ArrowRightLeft className="inline w-4 h-4 mr-1" />
              (S,G) Join
            </button>
            <button
              className={btnRed}
              onClick={handlePrune}
              disabled={!effectiveReceiverId}
            >
              <LogOut className="inline w-4 h-4 mr-1" />
              Prune
            </button>
            <button
              className={`${btnCyan} ${!sourceIpMatch ? 'opacity-60' : ''}`}
              onClick={handleRegister}
              disabled={!selectedSourceId}
            >
              <Upload className="inline w-4 h-4 mr-1" />
              Register {!sourceIpMatch && '(IP不匹配)'}
            </button>
            <button
              className={btnOrange}
              onClick={handleSwitchSPT}
              disabled={!effectiveReceiverId || !selectedSourceId}
            >
              <Radio className="inline w-4 h-4 mr-1" />
              Switch to SPT
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-700/50 pt-4">
        <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          RPF 校验工具
        </h2>
        <div className="bg-gray-800/40 rounded p-3 border border-gray-700/30 space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">校验路由器</label>
            <select
              value={rpfRouterId}
              onChange={(e) => setRpfRouterId(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
            >
              {allRouters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">源地址</label>
            <input
              type="text"
              value={rpfSourceAddr}
              onChange={(e) => setRpfSourceAddr(e.target.value)}
              placeholder="如: R3"
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">入接口 (可选)</label>
            <input
              type="text"
              value={rpfIncomingIf}
              onChange={(e) => setRpfIncomingIf(e.target.value)}
              placeholder="如: R6-eth0"
              className="w-full bg-gray-800/80 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            className={btnPurple}
            onClick={handleRPFCheck}
            disabled={!rpfRouterId || !rpfSourceAddr || rpfLoading}
          >
            {rpfLoading ? (
              <><div className="inline w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-1" />校验中...</>
            ) : (
              <><Shield className="inline w-4 h-4 mr-1" />执行 RPF 校验</>
            )}
          </button>

          {rpfResult && (
            <div className={`mt-2 p-2 rounded border text-xs ${
              rpfResult.passed
                ? 'bg-emerald-900/30 border-emerald-700/50'
                : 'bg-red-900/30 border-red-700/50'
            }`}>
              <div className="flex items-center gap-1 mb-1">
                {rpfResult.passed ? (
                  <><CheckCircle className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400 font-medium">RPF 校验通过</span></>
                ) : (
                  <><XCircle className="w-3 h-3 text-red-400" /><span className="text-red-400 font-medium">RPF 校验失败</span></>
                )}
              </div>
              <div className="text-gray-400 space-y-0.5">
                <div>RPF 接口: <span className="text-gray-200 font-mono">{rpfResult.rpf_interface || '-'}</span></div>
                {rpfResult.reason && (
                  <div className="text-red-400">{rpfResult.reason}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-700/50 pt-4 mt-auto">
        <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">
          流量控制
        </h2>
        <button className={btnCyan} onClick={onTogglePlay}>
          {isPlaying ? (
            <>
              <Pause className="inline w-4 h-4 mr-1" />
              暂停动画
            </>
          ) : (
            <>
              <Play className="inline w-4 h-4 mr-1" />
              播放动画
            </>
          )}
        </button>
      </div>
    </div>
  );
}
