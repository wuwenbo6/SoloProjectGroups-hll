import { useSimulationStore } from "@/store/simulationStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-cyber-border bg-cyber-card/95 px-3 py-2 font-mono text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1 text-cyber-fg font-semibold">报文: {label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.dataKey === "rdma" ? "#22d3ee" : "#f59e0b" }}>
          {p.dataKey === "rdma" ? "RDMA" : "传统路径"}: {p.value?.toFixed(2)} GB/s
        </p>
      ))}
    </div>
  );
}

export default function ComparisonChart() {
  const { data } = useSimulationStore();

  if (!data || data.traditional_results.length === 0) return null;

  const chartData = data.rdma_results.map((r, i) => ({
    label: data.config.packet_size_labels[i],
    rdma: r.avg_bandwidth_gbps,
    traditional: data.traditional_results[i].avg_bandwidth_gbps,
    rdmaGain: (
      ((r.avg_bandwidth_gbps - data.traditional_results[i].avg_bandwidth_gbps) /
        data.traditional_results[i].avg_bandwidth_gbps) *
      100
    ).toFixed(1),
  }));

  return (
    <div className="glow-border animate-slide-up rounded-xl bg-cyber-card p-5 transition-all duration-300">
      <h2 className="mb-4 font-mono text-sm font-semibold tracking-wider text-cyber-accent uppercase">
        RDMA vs 传统路径对比
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
              label={{
                value: "GB/s",
                angle: -90,
                position: "insideLeft",
                offset: -5,
                style: { fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 12 }}
              formatter={(value: string) => (
                <span style={{ color: value === "rdma" ? "#22d3ee" : "#f59e0b" }}>
                  {value === "rdma" ? "GPUDirect RDMA" : "传统 CPU 中转"}
                </span>
              )}
            />
            <Bar dataKey="rdma" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="traditional" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {chartData.slice(0, 5).map((d) => (
          <div
            key={d.label}
            className="rounded-md bg-cyber-bg px-2 py-1 text-center font-mono text-xs"
          >
            <span className="text-cyber-muted">{d.label}</span>{" "}
            <span className="text-cyber-green">+{d.rdmaGain}%</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {chartData.slice(5).map((d) => (
          <div
            key={d.label}
            className="rounded-md bg-cyber-bg px-2 py-1 text-center font-mono text-xs"
          >
            <span className="text-cyber-muted">{d.label}</span>{" "}
            <span className="text-cyber-green">+{d.rdmaGain}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
