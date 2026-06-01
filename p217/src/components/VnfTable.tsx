import { useManoStore } from "@/store";
import { Shield, Router, MoreVertical, Scale, Trash2 } from "lucide-react";
import { useState } from "react";

const statusColors: Record<string, string> = {
  running: "bg-[#00FF88]",
  instantiating: "bg-cyan-400 animate-pulse",
  scaling: "bg-amber-400 animate-pulse",
  terminating: "bg-rose-400 animate-pulse",
  stopped: "bg-gray-500",
  error: "bg-[#FF3366]",
};

const statusLabels: Record<string, string> = {
  running: "运行中",
  instantiating: "实例化中",
  scaling: "伸缩中",
  terminating: "终止中",
  stopped: "已停止",
  error: "异常",
};

export default function VnfTable() {
  const { vnfs, selectVnf } = useManoStore();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-cyan-900/30 bg-[#0F1A2E] overflow-hidden">
      <div className="px-5 py-4 border-b border-cyan-900/20 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200 tracking-wide">VNF 实例列表</h2>
        <span className="text-xs text-gray-500 font-mono">{vnfs.length} 个实例</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-cyan-900/20">
              <th className="px-5 py-3">名称</th>
              <th className="px-5 py-3">类型</th>
              <th className="px-5 py-3">状态</th>
              <th className="px-5 py-3">CPU</th>
              <th className="px-5 py-3">内存</th>
              <th className="px-5 py-3">副本数</th>
              <th className="px-5 py-3">带宽</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {vnfs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-gray-600">
                  暂无 VNF 实例，请在拓扑页面创建
                </td>
              </tr>
            )}
            {vnfs.map((vnf) => (
              <tr
                key={vnf.id}
                className="border-b border-cyan-900/10 hover:bg-cyan-900/10 transition-colors cursor-pointer"
                onClick={() => selectVnf(vnf.id)}
              >
                <td className="px-5 py-3 font-medium text-gray-200">
                  <div className="flex items-center gap-2">
                    {vnf.type === "firewall" ? (
                      <Shield className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Router className="w-4 h-4 text-amber-400" />
                    )}
                    {vnf.name}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-400">
                  {vnf.type === "firewall" ? "虚拟防火墙" : "vRouter"}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColors[vnf.status] || "bg-gray-500"}`} />
                    <span className="text-gray-300">{statusLabels[vnf.status] || vnf.status}</span>
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-gray-400">{vnf.cpu}</td>
                <td className="px-5 py-3 font-mono text-gray-400">{vnf.memory}</td>
                <td className="px-5 py-3 font-mono text-gray-400">{vnf.replicaCount}</td>
                <td className="px-5 py-3 font-mono text-gray-400">{vnf.bandwidth}</td>
                <td className="px-5 py-3 text-right">
                  <div className="relative inline-block">
                    <button
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === vnf.id ? null : vnf.id);
                      }}
                    >
                      <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>
                    {menuOpen === vnf.id && (
                      <ActionMenu
                        vnfId={vnf.id}
                        status={vnf.status}
                        onClose={() => setMenuOpen(null)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionMenu({ vnfId, status, onClose }: { vnfId: string; status: string; onClose: () => void }) {
  const { scaleVnf, terminateVnf } = useManoStore();

  return (
    <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-cyan-900/40 bg-[#0F1A2E] shadow-xl py-1">
      {status === "running" && (
        <button
          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-cyan-900/20 flex items-center gap-2"
          onClick={async () => {
            await scaleVnf(vnfId, { replicaCount: 2 });
            onClose();
          }}
        >
          <Scale className="w-4 h-4 text-amber-400" />
          扩容至 2 副本
        </button>
      )}
      {status !== "terminating" && (
        <button
          className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-900/20 flex items-center gap-2"
          onClick={async () => {
            await terminateVnf(vnfId);
            onClose();
          }}
        >
          <Trash2 className="w-4 h-4" />
          终止实例
        </button>
      )}
    </div>
  );
}
