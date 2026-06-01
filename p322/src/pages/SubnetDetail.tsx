import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Server, Download } from "lucide-react";
import { useStore } from "@/stores/appStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSubnets, useServices, useServiceRecords, exportServices } from "@/hooks/useAPI";
import Sidebar from "@/components/Sidebar";
import ReflectorStatusBar from "@/components/ReflectorStatusBar";
import ServiceTable from "@/components/ServiceTable";
import RecordDetail from "@/components/RecordDetail";
import ServiceFilter from "@/components/ServiceFilter";
import type { MDnsService } from "@/utils/types";
import { SERVICE_TYPE_LABELS } from "@/utils/types";

export default function SubnetDetail() {
  const { id: subnetId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useWebSocket();

  const { subnets } = useSubnets();
  const setSubnets = useStore((s) => s.setSubnets);
  const storeSubnets = useStore((s) => s.subnets);
  const wsConnected = useStore((s) => s.wsConnected);
  const reflectorStatus = useStore((s) => s.reflectorStatus);

  useEffect(() => {
    if (subnets.length > 0) setSubnets(subnets);
  }, [subnets, setSubnets]);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<MDnsService | null>(null);

  const { services } = useServices(subnetId, typeFilter || undefined, statusFilter || undefined);
  const { records } = useServiceRecords(selectedService?.id ?? null);

  const filteredServices = useMemo(() => {
    let result = services;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.ip.toLowerCase().includes(q) ||
          SERVICE_TYPE_LABELS[s.type]?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [services, search]);

  const subnet = storeSubnets.find((s) => s.id === subnetId);

  if (!subnet) {
    return (
      <div className="flex h-screen items-center justify-center bg-cyber-bg">
        <div className="text-center">
          <p className="font-dm text-gray-400 mb-4">Subnet not found</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-cyber-primary/10 text-cyber-primary rounded-lg text-sm font-dm hover:bg-cyber-primary/20 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-cyber-bg overflow-hidden">
      <Sidebar wsConnected={wsConnected} reflectorStatus={reflectorStatus} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ReflectorStatusBar />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-400" />
            </button>
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: subnet.color }}
              />
              <div>
                <h1 className="font-dm text-lg font-bold text-white">
                  {subnet.name}
                </h1>
                <p className="font-mono text-xs text-gray-500">
                  {subnet.cidr} · {subnet.interface}
                </p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => exportServices(subnetId, typeFilter || undefined, statusFilter || undefined)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary hover:bg-cyber-primary/20 transition-all duration-200 font-dm text-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                <Server className="w-4 h-4 text-gray-500" />
                <span className="font-mono text-lg font-bold text-white">
                  {subnet.serviceCount}
                </span>
                <span className="text-xs text-gray-500 font-dm">services</span>
              </div>
            </div>
          </div>

          <ServiceFilter
            type={typeFilter}
            setType={setTypeFilter}
            status={statusFilter}
            setStatus={setStatusFilter}
            search={search}
            setSearch={setSearch}
          />

          <ServiceTable
            services={filteredServices}
            onRowClick={(svc) => setSelectedService(svc)}
          />

          {selectedService && records && (
            <div className="animate-fade-in">
              <RecordDetail records={records} service={selectedService} subnetId={subnetId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
