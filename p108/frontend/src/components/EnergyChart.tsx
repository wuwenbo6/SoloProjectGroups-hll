import { useSimulationStore } from '../store/simulationStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function EnergyChart() {
  const { state } = useSimulationStore();

  const formatEnergy = (value: number) => {
    return value.toExponential(1);
  };

  return (
    <div className="p-4 bg-primary/90 backdrop-blur-sm border-t border-slate-700">
      <h3 className="text-slate-300 text-sm font-bold mb-3 uppercase tracking-wider">
        自由能变化
      </h3>
      <div className="h-32">
        {state.energyHistory.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={state.energyHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis
                dataKey="step"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                tickFormatter={formatEnergy}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0a192f',
                  border: '1px solid #64ffda',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#8892b0' }}
                formatter={(value: number) => [formatEnergy(value), '自由能']}
              />
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#64ffda"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">
            开始模拟后显示能量曲线
          </div>
        )}
      </div>
    </div>
  );
}
