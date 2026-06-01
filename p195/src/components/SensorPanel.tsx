import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAppStore } from '@/store';
import { Activity, Gauge } from 'lucide-react';
import { TrajectoryMessage } from '@/types';

const MAX_POINTS = 100;

interface SensorPanelProps {
  overrideMessage?: TrajectoryMessage | null;
}

export function SensorPanel({ overrideMessage = null }: SensorPanelProps) {
  const trajectoryHistory = useAppStore((s) => s.trajectoryHistory);
  const currentMessage = useAppStore((s) => s.currentMessage);
  const displayMessage = overrideMessage ?? currentMessage;

  const chartData = useMemo(() => {
    const recent = trajectoryHistory.slice(-MAX_POINTS);
    return recent.map((m, i) => ({
      idx: i,
      t: m.timestamp.toFixed(1),
      'Ax (m/s²)': m.imu.accel[0],
      'Ay (m/s²)': m.imu.accel[1],
      'Az (m/s²)': m.imu.accel[2],
      'Gx (rad/s)': m.imu.gyro[0],
      'Gy (rad/s)': m.imu.gyro[1],
      'Gz (rad/s)': m.imu.gyro[2],
    }));
  }, [trajectoryHistory]);

  const accelColors = ['#4d9fff', '#7c3aed', '#06b6d4'];
  const gyroColors = ['#f59e0b', '#ef4444', '#84cc16'];

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/10">
        <Activity className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-text-primary">IMU 传感器数据</span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3">
        <div className="bg-bg-tertiary/60 rounded-lg p-2">
          <div className="text-[10px] text-text-dim mb-0.5">加速度 X</div>
          <div className="font-mono text-sm text-imu">
            {displayMessage?.imu.accel[0].toFixed(3) ?? '-'}
          </div>
          <div className="text-[9px] text-text-dim">m/s²</div>
        </div>
        <div className="bg-bg-tertiary/60 rounded-lg p-2">
          <div className="text-[10px] text-text-dim mb-0.5">加速度 Y</div>
          <div className="font-mono text-sm text-purple-400">
            {displayMessage?.imu.accel[1].toFixed(3) ?? '-'}
          </div>
          <div className="text-[9px] text-text-dim">m/s²</div>
        </div>
        <div className="bg-bg-tertiary/60 rounded-lg p-2">
          <div className="text-[10px] text-text-dim mb-0.5">加速度 Z</div>
          <div className="font-mono text-sm text-cyan-400">
            {displayMessage?.imu.accel[2].toFixed(3) ?? '-'}
          </div>
          <div className="text-[9px] text-text-dim">m/s²</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-2">
        <div className="text-[10px] text-text-dim mb-1 flex items-center gap-1 px-2">
          <Gauge className="w-3 h-3" />
          加速度曲线
        </div>
        <ResponsiveContainer width="100%" height="45%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="t"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(20, 25, 38, 0.95)',
                border: '1px solid rgba(0, 255, 200, 0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line type="monotone" dataKey="Ax (m/s²)" stroke={accelColors[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Ay (m/s²)" stroke={accelColors[1]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Az (m/s²)" stroke={accelColors[2]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>

        <div className="text-[10px] text-text-dim mb-1 mt-2 flex items-center gap-1 px-2">
          <Activity className="w-3 h-3" />
          角速度曲线
        </div>
        <ResponsiveContainer width="100%" height="45%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="t"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: '#5c6778', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(20, 25, 38, 0.95)',
                border: '1px solid rgba(0, 255, 200, 0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line type="monotone" dataKey="Gx (rad/s)" stroke={gyroColors[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Gy (rad/s)" stroke={gyroColors[1]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Gz (rad/s)" stroke={gyroColors[2]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-3 py-2 border-t border-accent/10 text-[10px] text-text-dim font-mono">
        采样率: 20Hz · 时间: {displayMessage?.timestamp.toFixed(2) ?? '0.00'}s
      </div>
    </div>
  );
}
