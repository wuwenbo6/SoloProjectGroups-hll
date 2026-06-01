import { useEffect } from "react";
import { Download, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "@/stores/appStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSubnets, useReflectorStatus, useServiceStats, useAuthPolicy, exportServices } from "@/hooks/useAPI";
import { useState } from "react";
import type { AuthPolicy, ServiceType } from "@/utils/types";
import { SERVICE_TYPE_LABELS } from "@/utils/types";
import Sidebar from "@/components/Sidebar";
import ReflectorStatusBar from "@/components/ReflectorStatusBar";
import TopologyGraph from "@/components/TopologyGraph";
import SubnetCard from "@/components/SubnetCard";
import ServiceStatsPanel from "@/components/ServiceStatsPanel";
import DiscoveryFeed from "@/components/DiscoveryFeed";

const ALL_SERVICE_TYPES: ServiceType[] = ["printer", "airplay", "homekit", "http", "chromecast", "nfs", "smb", "other"];

export default function Dashboard() {
  useWebSocket();
  const [showAuthPanel, setShowAuthPanel] = useState(false);

  const { subnets, loading: subnetsLoading } = useSubnets();
  const { status } = useReflectorStatus();
  const { stats } = useServiceStats();
  const { policy, updatePolicy } = useAuthPolicy();

  const setSubnets = useStore((s) => s.setSubnets);
  const setReflectorStatus = useStore((s) => s.setReflectorStatus);
  const storeSubnets = useStore((s) => s.subnets);
  const discoveryLog = useStore((s) => s.discoveryLog);
  const wsConnected = useStore((s) => s.wsConnected);
  const reflectorStatus = useStore((s) => s.reflectorStatus);

  useEffect(() => {
    if (subnets.length > 0) setSubnets(subnets);
  }, [subnets, setSubnets]);

  useEffect(() => {
    if (status) setReflectorStatus(status);
  }, [status, setReflectorStatus]);

  const handleExport = () => {
    exportServices();
  };

  const handlePolicyChange = (type: ServiceType, checked: boolean) => {
    if (!policy) return;
    let newAllowed: ServiceType[];
    if (checked) {
      newAllowed = [...policy.allowedTypes, type];
    } else {
      newAllowed = policy.allowedTypes.filter((t) => t !== type);
    }
    updatePolicy({ ...policy, allowedTypes: newAllowed });
  };

  const handleAllowUnauthChange = (checked: boolean) => {
    if (!policy) return;
    updatePolicy({ ...policy, allowUnauthorized: checked });
  };

  if (subnetsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-cyber-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-cyber-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-dm text-sm text-gray-400">Scanning networks...</span>
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-dm text-lg font-bold text-white mr-auto">
              mDNS Reflector Dashboard
            </h1>
            <button
              onClick={() => setShowAuthPanel(!showAuthPanel)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-gray-300 hover:bg-white/[0.08] hover:text-white transition-all duration-200 font-dm text-sm"
            >
              <Shield className="w-4 h-4" />
              Authorization
              {showAuthPanel ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary hover:bg-cyber-primary/20 transition-all duration-200 font-dm text-sm"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>

          {showAuthPanel && policy && (
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5 animate-slide-in-top">
              <h3 className="font-dm text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyber-primary" />
                Service Authorization Policy
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policy.allowUnauthorized}
                      onChange={(e) => handleAllowUnauthChange(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-black/30 text-cyber-primary focus:ring-cyber-primary"
                    />
                    <span className="font-dm text-sm text-gray-300">
                      Allow all services (bypass authorization)
                    </span>
                  </label>
                </div>
                {!policy.allowUnauthorized && (
                  <div>
                    <p className="font-dm text-xs text-gray-500 mb-3">
                      Select authorized service types:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {ALL_SERVICE_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={policy.allowedTypes.includes(type)}
                            onChange={(e) => handlePolicyChange(type, e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-white/20 bg-black/30 text-cyber-primary focus:ring-cyber-primary"
                          />
                          <span className="font-dm text-sm text-gray-300">
                            {SERVICE_TYPE_LABELS[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <p className="font-dm text-xs text-gray-500 pt-2 border-t border-white/5">
                  {policy.allowUnauthorized
                    ? "⚠ All services are currently allowed. Disable above to enforce authorization."
                    : `Currently allowing ${policy.allowedTypes.length} service type(s). Unauthorized services will be marked as BLOCKED.`}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TopologyGraph subnets={storeSubnets} />
            </div>
            <div>
              <ServiceStatsPanel stats={stats} />
            </div>
          </div>

          <div>
            <h2 className="font-dm text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-cyber-primary" />
              Subnets
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {storeSubnets.map((subnet) => (
                <SubnetCard key={subnet.id} subnet={subnet} />
              ))}
            </div>
          </div>

          <div>
            <DiscoveryFeed events={discoveryLog} subnets={storeSubnets} />
          </div>
        </main>
      </div>
    </div>
  );
}
