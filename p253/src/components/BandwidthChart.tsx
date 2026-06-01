import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PIDInfo } from "../../shared/types";

const COLORS: Record<string, string> = {
  PAT: "#ff6b6b",
  PMT: "#ffe66d",
  "PES-Video": "#4ecdc4",
  "PES-Audio": "#a78bfa",
  "PES-Data": "#f59e0b",
  Null: "#4b5563",
  Other: "#6b7280",
};

interface BandwidthChartProps {
  pids: PIDInfo[];
  totalBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBitrate(bytes: number): string {
  const bitsPerSecond = bytes * 8;
  if (bitsPerSecond < 1000) return `${bitsPerSecond} bps`;
  if (bitsPerSecond < 1000000) return `${(bitsPerSecond / 1000).toFixed(1)} Kbps`;
  return `${(bitsPerSecond / 1000000).toFixed(2)} Mbps`;
}

interface ChartData {
  name: string;
  value: number;
  type: string;
  pid: number;
  percent: number;
}

export default function BandwidthChart({ pids, totalBytes }: BandwidthChartProps) {
  const data: ChartData[] = pids.map((p) => ({
    name: p.type === "Null" ? "Null (填充)" : `${p.type} (0x${p.pid.toString(16).padStart(4, "0")})`,
    value: p.byteCount,
    type: p.type,
    pid: p.pid,
    percent: p.bandwidthPercent,
  }));

  const grouped = data.reduce<Record<string, ChartData & { count: number }>>((acc, item) => {
    const key = item.type;
    if (!acc[key]) {
      acc[key] = { ...item, count: 1 };
    } else {
      acc[key].value += item.value;
      acc[key].percent += item.percent;
      acc[key].count += 1;
    }
    return acc;
  }, {});

  const chartData = Object.values(grouped).sort((a, b) => b.value - a.value);

  return (
    <div className="bg-[#2a2f42] rounded-2xl border border-[#3a3f55] p-6">
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#00d4aa]" />
        带宽占比分布
      </h3>
      <div className="flex items-center gap-6">
        <div className="relative" style={{ width: 260, height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                dataKey="value"
                strokeWidth={2}
                stroke="#1a1f2e"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[entry.type] || "#6b7280"}
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#232839",
                  border: "1px solid #3a3f55",
                  borderRadius: "12px",
                  color: "#fff",
                  fontSize: "12px",
                  fontFamily: "JetBrains Mono, monospace",
                }}
                formatter={(value: number, name: string, props: { payload: ChartData & { count: number } }) => [
                  `${formatBytes(value)} (${props.payload.percent.toFixed(1)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[#8b8fa3] text-xs">总大小</span>
            <span className="text-white font-mono text-sm font-bold">{formatBytes(totalBytes)}</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <Legend
            content={() => (
              <div className="space-y-2">
                {chartData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: COLORS[entry.type] || "#6b7280" }}
                    />
                    <span className="text-[#c8cad0] flex-1 font-mono">
                      {entry.type} {entry.count > 1 ? `×${entry.count}` : ""}
                    </span>
                    <span className="text-white font-mono font-medium">{entry.percent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export { formatBytes, formatBitrate, COLORS };
