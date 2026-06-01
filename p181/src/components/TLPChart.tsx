import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTLPStore } from '@/store/tlpStore';

const COLORS = [
  '#06b6d4',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#e11d48',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Memory Read': '#06b6d4',
  'Memory Write': '#8b5cf6',
  'Completion': '#f59e0b',
  'I/O': '#10b981',
  'Configuration': '#ef4444',
  'Message': '#3b82f6',
  'Atomic': '#ec4899',
  'Other': '#6b7280',
};

function getCategoryFromType(type: string): string {
  if (type.includes('MRd') || type.includes('Memory Read')) return 'Memory Read';
  if (type.includes('MWr') || type.includes('Memory Write')) return 'Memory Write';
  if (type.includes('Cpl')) return 'Completion';
  if (type.includes('IO') || type.includes('I/O')) return 'I/O';
  if (type.includes('Cfg') || type.includes('Config')) return 'Configuration';
  if (type.includes('Msg') || type.includes('Message')) return 'Message';
  if (type.includes('Atomic')) return 'Atomic';
  return 'Other';
}

interface ChartData {
  name: string;
  value: number;
  category: string;
  color: string;
}

export function TLPChart() {
  const parseResult = useTLPStore((s) => s.parseResult);

  const { pieData, barData, categoryData } = useMemo(() => {
    if (!parseResult || parseResult.tlps.length === 0) {
      return { pieData: [], barData: [], categoryData: [] };
    }

    const typeCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();

    for (const tlp of parseResult.tlps) {
      const typeName = tlp.header.type.split(' (')[0];
      const category = getCategoryFromType(tlp.header.type);

      typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
    }

    const sortedTypes = [...typeCount.entries()].sort((a, b) => b[1] - a[1]);

    const pieData: ChartData[] = sortedTypes.map(([name, value], idx) => ({
      name,
      value,
      category: getCategoryFromType(name),
      color: COLORS[idx % COLORS.length],
    }));

    const barData: ChartData[] = sortedTypes.map(([name, value], idx) => ({
      name,
      value,
      category: getCategoryFromType(name),
      color: COLORS[idx % COLORS.length],
    }));

    const sortedCategories = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]);
    const categoryData: ChartData[] = sortedCategories.map(([name, value]) => ({
      name,
      value,
      category: name,
      color: CATEGORY_COLORS[name] || '#6b7280',
    }));

    return { pieData, barData, categoryData };
  }, [parseResult]);

  if (!parseResult || parseResult.tlps.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">TLP 类型分布</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => [
                  `${value} 个 (${((value / parseResult!.tlps.length) * 100).toFixed(1)}%)`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
                iconSize={8}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">TLP 分类统计</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [
                  `${value} 个 (${((value / parseResult!.tlps.length) * 100).toFixed(1)}%)`,
                  '数量',
                ]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {categoryData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">各TLP类型数量</h3>
        <ResponsiveContainer width="100%" height={Math.max(barData.length * 30, 100)}>
          <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(value: number) => [
                `${value} 个 (${((value / parseResult!.tlps.length) * 100).toFixed(1)}%)`,
                '数量',
              ]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
              {barData.map((entry, index) => (
                <Cell key={`vbar-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
