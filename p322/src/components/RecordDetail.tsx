import { useState } from "react";
import type { ServiceRecords, MDnsService } from "@/utils/types";
import { setServiceAuthorized } from "@/hooks/useAPI";
import { useServices } from "@/hooks/useAPI";

interface RecordDetailProps {
  records: ServiceRecords;
  service: MDnsService;
  subnetId?: string;
}

export default function RecordDetail({ records, service, subnetId }: RecordDetailProps) {
  const [authSwitching, setAuthSwitching] = useState(false);
  const { refetch: refetchServices } = useServices(subnetId);

  const toggleAuthorization = async () => {
    setAuthSwitching(true);
    try {
      await setServiceAuthorized(service.id, !service.authorized);
      refetchServices();
    } catch (e) {
      console.error("Failed to toggle authorization", e);
    } finally {
      setAuthSwitching(false);
    }
  };
  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyber-primary" />
          <h3 className="font-dm text-sm font-semibold text-white">
            {service.name}
          </h3>
          <span className="text-[11px] text-gray-500 font-mono">
            {service.ip}:{service.port}
          </span>
        </div>
        <button
          onClick={toggleAuthorization}
          disabled={authSwitching}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200 ${
            service.authorized
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
              : "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
          } ${authSwitching ? "opacity-50 cursor-wait" : ""}`}
        >
          {authSwitching ? (
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : service.authorized ? (
            "ALLOWED"
          ) : (
            "BLOCKED"
          )}
        </button>
      </div>

      <div>
        <h4 className="text-[10px] text-gray-500 font-dm uppercase tracking-wider mb-2">
          PTR Record
        </h4>
        <div className="font-mono text-xs bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          <span className="text-gray-500">_service._tcp.local. → </span>
          <span className="text-cyber-primary">{records.ptr}</span>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] text-gray-500 font-dm uppercase tracking-wider mb-2">
          SRV Record <span className="text-cyber-primary">(Priority/Weight for instance selection)</span>
        </h4>
        <div className="font-mono text-xs bg-black/30 rounded-lg px-4 py-3 border border-white/5 space-y-1.5">
          <div className="flex gap-4">
            <span className="text-gray-500 w-20 shrink-0">target</span>
            <span className="text-white">{records.srv.target}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-gray-500 w-20 shrink-0">port</span>
            <span className="text-cyber-primary">{records.srv.port}</span>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-gray-500 w-20 shrink-0">priority</span>
            <span className="text-white">{records.srv.priority}</span>
            <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {records.srv.priority === 0 ? "Highest" : records.srv.priority <= 10 ? "High" : "Low"}
            </span>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-gray-500 w-20 shrink-0">weight</span>
            <span className="text-white">{records.srv.weight}</span>
            <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              {records.srv.weight >= 80 ? "High load" : records.srv.weight >= 50 ? "Medium" : "Low load"}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] text-gray-500 font-dm uppercase tracking-wider mb-2">
          TXT Records
        </h4>
        <div className="font-mono text-xs bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          {Object.keys(records.txt).length === 0 ? (
            <span className="text-gray-600">No TXT records</span>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {Object.entries(records.txt).map(([key, value]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="text-cyber-primary">{key}</span>
                  <span className="text-gray-600">=</span>
                  <span className="text-gray-300 truncate">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
