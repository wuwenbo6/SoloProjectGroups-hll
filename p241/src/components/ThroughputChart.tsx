import { useSimulationStore } from "@/store/simulationStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const BAR_COLORS = [
  "#22d3ee",
  "#06b6d4",
  "#0891b2",
  "#0e7490",
  "#155e75",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#1e3a8a",
];

function formatBandwidth(value: number): string {
  return `${value.toFixed(2)} GB/s`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { packet_size: number; avg_bandwidth_gbps: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-cyber-border bg-cyber-card/95 px-3 py-2 font-mono text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1 text-cyber-fg font-semibold">
        报文大小: {d.packet_size >= 1048576 ? `${(d.packet_size / 1048576).toFixed(0)}MB` : d.packet_size >= 1024 ? `${(d.packet_size / 1024).toFixed(0)}KB` : `${d.packet_size}B`}
      </p>
      <p className="text-cyber-accent">
        吞吐量: {formatBandwidth(d.avg_bandwidth_gbps)}
      </p>
    </div>
  );
}

export default function ThroughputChart() {
  const { data } = useSimulationStore();

  if (!data) return null;

  const chartData = data.rdma_results.map((r, i) => ({
    ...r,
    label: data.config.packet_size_labels[i],
  }));

  return (
    <div className="glow-border animate-slide-up rounded-xl bg-cyber-card p-5 transition-all duration-300">
      <h2 className="mb-4 font-mono text-sm font-semibold tracking-wider text-cyber-accent uppercase">
        GPUDirect RDMA 吞吐量
      </h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#475569" }}
              tickLine={{ stroke: "#475569" }}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#475569" }}
              tickLine={{ stroke: "#475569" }}
              tickFormatter={(v: number) => `${v}`}
              label={{
                value: "GB/s",
                angle: -90,
                position: "insideLeft",
                offset: -5,
                style: { fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" },
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(34,211,238,0.05)" }} />
            <Bar dataKey="avg_bandwidth_gbps" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
