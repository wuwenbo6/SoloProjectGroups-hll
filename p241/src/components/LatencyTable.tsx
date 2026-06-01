import { useSimulationStore } from "@/store/simulationStore";

export default function LatencyTable() {
  const { data } = useSimulationStore();

  if (!data) return null;

  const rows = data.rdma_results.map((r, i) => {
    const trad = data.traditional_results[i];
    return {
      label: data.config.packet_size_labels[i],
      rdma: r,
      traditional: trad,
    };
  });

  return (
    <div className="glow-border animate-slide-up rounded-xl bg-cyber-card p-5 transition-all duration-300">
      <h2 className="mb-4 font-mono text-sm font-semibold tracking-wider text-cyber-accent uppercase">
        延迟统计
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-cyber-border text-cyber-muted">
              <th className="px-2 py-2 text-left">报文</th>
              <th className="px-2 py-2 text-right">平均 (μs)</th>
              <th className="px-2 py-2 text-right">P50</th>
              <th className="px-2 py-2 text-right">P95</th>
              <th className="px-2 py-2 text-right">
                <span className="text-cyber-red">P99</span>
              </th>
              {data.traditional_results.length > 0 && (
                <th className="px-2 py-2 text-right">传统路径 P99</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-cyber-border/50 transition-colors hover:bg-cyber-bg/50"
              >
                <td className="px-2 py-2 text-cyber-fg font-medium">{row.label}</td>
                <td className="px-2 py-2 text-right text-cyber-accent">
                  {row.rdma.avg_latency_us.toFixed(3)}
                </td>
                <td className="px-2 py-2 text-right text-cyber-fg">
                  {row.rdma.p50_latency_us.toFixed(3)}
                </td>
                <td className="px-2 py-2 text-right text-cyber-blue">
                  {row.rdma.p95_latency_us.toFixed(3)}
                </td>
                <td className="px-2 py-2 text-right text-cyber-red font-semibold">
                  {row.rdma.p99_latency_us.toFixed(3)}
                </td>
                {row.traditional && (
                  <td className="px-2 py-2 text-right text-cyber-orange">
                    {row.traditional.p99_latency_us.toFixed(3)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
