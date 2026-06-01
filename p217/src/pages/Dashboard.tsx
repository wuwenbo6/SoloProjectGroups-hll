import { useEffect } from "react";
import { useManoStore } from "@/store";
import StatsCards from "@/components/StatsCards";
import VnfTable from "@/components/VnfTable";
import EventPanel from "@/components/EventPanel";

export function Dashboard() {
  const fetchAll = useManoStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100 tracking-tight">NFV MANO 控制台</h1>
        <p className="text-sm text-gray-500 mt-1">虚拟网络功能管理与编排</p>
      </div>

      <StatsCards />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <VnfTable />
        </div>
        <div>
          <EventPanel />
        </div>
      </div>
    </div>
  );
}
