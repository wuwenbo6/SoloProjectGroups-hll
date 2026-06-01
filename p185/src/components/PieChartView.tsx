import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useLogStore } from '@/store/useLogStore';

const COLORS: Record<string, string> = {
  file: '#3b82f6',
  dir: '#10b981',
  tcp_socket: '#f59e0b',
  udp_socket: '#f97316',
  sock_file: '#8b5cf6',
  chr_file: '#ec4899',
  process: '#ef4444',
  fifo_file: '#06b6d4',
  lnk_file: '#84cc16',
  other: '#6b7280',
};

interface ChartData {
  name: string;
  value: number;
  percentage: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartData }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg">
        <p className="font-semibold text-cyan-400">{data.name}</p>
        <p className="text-sm">数量: <span className="text-white font-medium">{data.value}</span></p>
        <p className="text-sm">占比: <span className="text-white font-medium">{data.percentage.toFixed(1)}%</span></p>
      </div>
    );
  }
  return null;
}

export function PieChartView() {
  const { parseResult } = useLogStore();

  const chartData = useMemo<ChartData[]>(() => {
    if (!parseResult) return [];
    return parseResult.tclassDistribution.map((item) => ({
      name: item.tclass,
      value: item.count,
      percentage: item.percentage,
    }));
  }, [parseResult]);

  if (!parseResult) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <PieChartIcon className="w-5 h-5 text-cyan-500" />
        策略类型分布
      </h2>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[entry.name] || COLORS.other}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => <span className="text-slate-600 text-sm">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
