import { useState, useMemo } from 'react';
import { Grid, Eye, Clock, Users, Wifi, Battery } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';
import { USER_COLORS, getUserName, RBAllocation, BSS_COLORS } from '@shared/types';

export default function RBGridView() {
  const { config, slotResults } = useSimulationStore();
  const [selectedSlot, setSelectedSlot] = useState<number>(-1);
  const [hoveredRB, setHoveredRB] = useState<RBAllocation | null>(null);

  const currentResult = useMemo(() => {
    if (selectedSlot >= 0 && selectedSlot < slotResults.length) {
      return slotResults[selectedSlot];
    }
    return slotResults.length > 0 ? slotResults[slotResults.length - 1] : null;
  }, [slotResults, selectedSlot]);

  const rbPerRow = Math.ceil(Math.sqrt(config.numRBs * 2));

  const getRBColor = (allocation: RBAllocation) => {
    const baseColor = USER_COLORS[allocation.userId % USER_COLORS.length];
    const snrNormalized = Math.max(0, Math.min(1, (allocation.snr - config.snrMin) / (config.snrMax - config.snrMin + 1)));
    const opacity = 0.4 + snrNormalized * 0.6;
    return baseColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
  };

  const getMimoGradient = (allocation: RBAllocation) => {
    if (!allocation.mimoLayers || allocation.mimoLayers.length <= 1) {
      return getRBColor(allocation);
    }

    const colors = allocation.mimoLayers.map((layer, idx) => {
      const baseColor = USER_COLORS[layer.userId % USER_COLORS.length];
      const snrNormalized = Math.max(0, Math.min(1, (layer.snr - config.snrMin) / (config.snrMax - config.snrMin + 1)));
      const opacity = 0.5 + snrNormalized * 0.5;
      const stop = (idx / (allocation.mimoLayers!.length - 1)) * 100;
      return `${baseColor}${Math.floor(opacity * 255).toString(16).padStart(2, '0')} ${stop}%`;
    });

    return `linear-gradient(135deg, ${colors.join(', ')})`;
  };

  const getBSSBorderColor = (bssColor: number) => {
    return BSS_COLORS[(bssColor - 1 + BSS_COLORS.length) % BSS_COLORS.length];
  };

  return (
    <div className="config-panel rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between pb-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Grid className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-white">资源块分配图</h2>
          {config.mimoMode === 'MU' && (
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full flex items-center gap-1">
              <Users className="w-3 h-3" />
              MU-MIMO
            </span>
          )}
          {config.enableBSSColoring && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              BSS着色
            </span>
          )}
          {config.enablePowerSave && (
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full flex items-center gap-1">
              <Battery className="w-3 h-3" />
              节电
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">时隙:</span>
          <span className="text-primary font-mono font-bold">
            {currentResult ? currentResult.slotIndex + 1 : 0} / {config.numSlots}
          </span>
        </div>
      </div>

      {currentResult ? (
        <>
          <div className="py-4">
            <div
              className="grid gap-1 mx-auto"
              style={{
                gridTemplateColumns: `repeat(${rbPerRow}, minmax(0, 1fr))`,
                maxWidth: `${rbPerRow * 36}px`,
              }}
            >
              {currentResult.allocations.map((alloc) => (
                <div
                  key={alloc.rbIndex}
                  className="rb-cell w-8 h-8 rounded cursor-pointer relative flex items-center justify-center overflow-hidden"
                  style={{
                    background: alloc.isMumo ? getMimoGradient(alloc) : getRBColor(alloc),
                    border: config.enableBSSColoring ? `2px solid ${getBSSBorderColor(alloc.bssColor)}` : 'none',
                    boxShadow: alloc.isSRAllowed ? '0 0 4px rgba(59, 130, 246, 0.8)' : 'none',
                  }}
                  onMouseEnter={() => setHoveredRB(alloc)}
                  onMouseLeave={() => setHoveredRB(null)}
                >
                  {alloc.isMumo && (
                    <div className="absolute top-0 right-0 w-3 h-3 bg-purple-500 rounded-bl flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">M</span>
                    </div>
                  )}
                  {config.enableBSSColoring && (
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ backgroundColor: getBSSBorderColor(alloc.bssColor) }} />
                  )}
                  {alloc.isSRAllowed && (
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500" />
                  )}
                  <span className="text-[8px] font-bold text-white/80 z-10">
                    {alloc.rbIndex}
                  </span>

                  {hoveredRB?.rbIndex === alloc.rbIndex && (
                    <div className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-2 bg-slate-900 border border-slate-600 rounded-lg p-3 min-w-[200px] shadow-xl">
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">RB索引:</span>
                          <span className="text-white font-mono">{alloc.rbIndex}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">模式:</span>
                          <span className={alloc.isMumo ? 'text-purple-400' : 'text-slate-300'}>
                            {alloc.isMumo ? 'MU-MIMO' : 'SU-MIMO'}
                          </span>
                        </div>

                        {alloc.mimoLayers && alloc.mimoLayers.length > 0 ? (
                          <div className="border-t border-slate-700 pt-2 space-y-2">
                            <div className="text-slate-400 font-semibold">配对用户:</div>
                            {alloc.mimoLayers.map((layer, idx) => (
                              <div key={idx} className="pl-2 border-l-2" style={{ borderColor: USER_COLORS[layer.userId % USER_COLORS.length] }}>
                                <div className="flex justify-between">
                                  <span style={{ color: USER_COLORS[layer.userId % USER_COLORS.length] }} className="font-bold">
                                    {getUserName(layer.userId)}
                                  </span>
                                  <span className="text-slate-500">层 {idx + 1}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                  <span>SNR: {layer.snr.toFixed(1)} dB</span>
                                  <span>MCS: {layer.mcs}</span>
                                </div>
                                <div className="text-primary font-mono">
                                  {layer.throughput.toFixed(2)} Mbps
                                </div>
                              </div>
                            ))}
                            <div className="border-t border-slate-700 pt-1 flex justify-between font-bold">
                              <span className="text-slate-400">总计:</span>
                              <span className="text-primary">{alloc.throughput.toFixed(2)} Mbps</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">用户:</span>
                              <span style={{ color: USER_COLORS[alloc.userId % USER_COLORS.length] }} className="font-bold">
                                {getUserName(alloc.userId)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">SNR:</span>
                              <span className="text-white font-mono">{alloc.snr.toFixed(1)} dB</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">MCS:</span>
                              <span className="text-white font-mono">{alloc.mcs}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">吞吐量:</span>
                              <span className="text-primary font-mono">{alloc.throughput.toFixed(2)} Mbps</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700 space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">时隙选择:</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(0, slotResults.length - 1)}
              value={selectedSlot >= 0 ? selectedSlot : Math.max(0, slotResults.length - 1)}
              onChange={(e) => setSelectedSlot(parseInt(e.target.value))}
              disabled={slotResults.length === 0}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>时隙 1</span>
              <span>时隙 {Math.max(1, slotResults.length)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <div className="stat-card rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">时隙吞吐</div>
              <div className="text-lg font-bold text-primary font-mono">
                {currentResult.totalThroughput.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>
            <div className="stat-card rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">公平性指数</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {currentResult.fairnessIndex.toFixed(3)}
              </div>
              <div className="text-xs text-slate-500">Jain's Index</div>
            </div>
            <div className="stat-card rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">已用RB</div>
              <div className="text-lg font-bold text-amber-400 font-mono">
                {config.numRBs}
              </div>
              <div className="text-xs text-slate-500">Resource Blocks</div>
            </div>
            <div className="stat-card rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">MU-MIMO RB</div>
              <div className="text-lg font-bold text-purple-400 font-mono">
                {currentResult.allocations.filter(a => a.isMumo).length}
              </div>
              <div className="text-xs text-slate-500">配对资源块</div>
            </div>
          </div>
        </>
      ) : (
        <div className="py-16 text-center text-slate-500">
          <Grid className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>点击"运行"或"单步"开始模拟</p>
        </div>
      )}
    </div>
  );
}
