import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, ReferenceLine } from 'recharts';
import { useAppStore } from '@/store';
import { Compass, CheckCircle2, AlertTriangle } from 'lucide-react';

const MAX_POINTS = 200;

export function MagCalibrationPanel() {
  const currentMessage = useAppStore((s) => s.currentMessage);
  const trajectoryHistory = useAppStore((s) => s.trajectoryHistory);

  const magCal = currentMessage?.mag_calibration;

  const scatterData = useMemo(() => {
    const recent = trajectoryHistory.slice(-MAX_POINTS);
    return recent.map((m, i) => ({
      idx: i,
      x: m.mag.raw[0],
      y: m.mag.raw[1],
      z: m.mag.raw[2],
    }));
  }, [trajectoryHistory]);

  const correctedData = useMemo(() => {
    const recent = trajectoryHistory.slice(-MAX_POINTS);
    return recent.map((m, i) => ({
      idx: i,
      x: m.mag.data[0],
      y: m.mag.data[1],
      z: m.mag.data[2],
    }));
  }, [trajectoryHistory]);

  const avgMag = useMemo(() => {
    if (correctedData.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = correctedData.reduce(
      (acc, d) => ({ x: acc.x + d.x, y: acc.y + d.y, z: acc.z + d.z }),
      { x: 0, y: 0, z: 0 }
    );
    const n = correctedData.length;
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }, [correctedData]);

  const magMagnitude = Math.sqrt(avgMag.x ** 2 + avgMag.y ** 2 + avgMag.z ** 2);

  const tooltipStyle = {
    backgroundColor: 'rgba(20, 25, 38, 0.95)',
    border: '1px solid rgba(0, 255, 200, 0.3)',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: 'JetBrains Mono, monospace',
  };

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/10">
        <Compass className="w-4 h-4 text-rtk" />
        <span className="text-sm font-medium text-text-primary">磁力计校准</span>
        {magCal?.is_calibrated ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 ml-auto" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3">
        <div className="bg-bg-tertiary/60 rounded-lg p-1.5 text-center">
          <div className="text-[9px] text-text-dim">Mx</div>
          <div className="font-mono text-xs text-rtk">
            {currentMessage?.mag.data[0].toFixed(1) ?? '-'}
          </div>
        </div>
        <div className="bg-bg-tertiary/60 rounded-lg p-1.5 text-center">
          <div className="text-[9px] text-text-dim">My</div>
          <div className="font-mono text-xs text-purple-400">
            {currentMessage?.mag.data[1].toFixed(1) ?? '-'}
          </div>
        </div>
        <div className="bg-bg-tertiary/60 rounded-lg p-1.5 text-center">
          <div className="text-[9px] text-text-dim">Mz</div>
          <div className="font-mono text-xs text-cyan-400">
            {currentMessage?.mag.data[2].toFixed(1) ?? '-'}
          </div>
        </div>
      </div>

      <div className="px-3">
        <div className="bg-bg-tertiary/60 rounded-lg p-2 flex items-center justify-between font-mono text-xs">
          <span className="text-text-dim">|M| 场强</span>
          <span className={magMagnitude > 25 && magMagnitude < 65 ? 'text-green-400' : 'text-yellow-500'}>
            {magMagnitude.toFixed(1)} μT
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-2">
        <div className="text-[10px] text-text-dim mb-1 px-1">原始数据 (XY)</div>
        <ResponsiveContainer width="100%" height="40%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              type="number"
              dataKey="x"
              name="Mx"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 8 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="My"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <ZAxis range={[12, 12]} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine x={magCal?.hard_iron[0] ?? 0} stroke="#ff6b35" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={magCal?.hard_iron[1] ?? 0} stroke="#ff6b35" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Scatter data={scatterData} fill="#ff6b35" fillOpacity={0.5} />
          </ScatterChart>
        </ResponsiveContainer>

        <div className="text-[10px] text-text-dim mb-1 mt-1 px-1">
          校正后 (XY) {magCal?.is_calibrated ? '✓' : '— 待校准'}
        </div>
        <ResponsiveContainer width="100%" height="40%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              type="number"
              dataKey="x"
              name="Mx"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 8 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="My"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <ZAxis range={[12, 12]} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine x={0} stroke="rgba(0,255,200,0.3)" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="rgba(0,255,200,0.3)" strokeDasharray="3 3" />
            <Scatter data={correctedData} fill="#00ffc8" fillOpacity={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="px-3 space-y-1.5">
        {magCal && (
          <div className="bg-bg-tertiary/60 rounded-lg p-2">
            <div className="text-[10px] text-text-dim mb-1">校准参数</div>
            <div className="space-y-0.5 font-mono text-[10px]">
              <div className="flex justify-between">
                <span className="text-text-dim">硬铁偏移</span>
                <span className="text-rtk">
                  [{magCal.hard_iron.map((v) => v.toFixed(1)).join(', ')}]
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">采样数</span>
                <span className="text-text-primary">{magCal.sample_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">校准次数</span>
                <span className="text-accent">{magCal.calibration_count}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-accent/10 text-[10px] text-text-dim font-mono">
        {magCal?.is_calibrated ? '磁力计已校准' : `采集中... ${magCal?.sample_count ?? 0}/20`}
      </div>
    </div>
  );
}
