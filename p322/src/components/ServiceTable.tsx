import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MDnsService } from "@/utils/types";
import { SERVICE_TYPE_LABELS, SERVICE_TYPE_COLORS } from "@/utils/types";
import type { ServiceType } from "@/utils/types";

interface ServiceTableProps {
  services: MDnsService[];
  onRowClick?: (service: MDnsService) => void;
}

export default function ServiceTable({ services, onRowClick }: ServiceTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider w-8" />
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              IP:Port
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              TTL
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              Auth
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-dm font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => {
            const isExpanded = expandedId === service.id;
            const typeColor =
              SERVICE_TYPE_COLORS[service.type as ServiceType] ?? "#94a3b8";
            return (
              <Fragment key={service.id}>
                <tr
                  onClick={() => {
                    toggleExpand(service.id);
                    onRowClick?.(service);
                  }}
                  className="border-b border-white/[0.03] cursor-pointer transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500 transition-transform duration-200" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-dm text-sm text-white">
                    {service.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium"
                      style={{
                        backgroundColor: `${typeColor}20`,
                        color: typeColor,
                        border: `1px solid ${typeColor}30`,
                      }}
                    >
                      {SERVICE_TYPE_LABELS[service.type as ServiceType] ??
                        service.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {service.ip}:{service.port}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-[11px] tabular-nums ${
                      service.ttlRemaining <= 0
                        ? "text-red-400"
                        : service.ttlRemaining < 60
                        ? "text-amber-400"
                        : "text-gray-300"
                    }`}>
                      {service.ttlRemaining > 0 ? `${service.ttlRemaining}s` : "expired"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${
                        service.authorized
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {service.authorized ? "ALLOWED" : "BLOCKED"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          service.status === "online"
                            ? "bg-green-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span
                        className={`text-[11px] font-dm ${
                          service.status === "online"
                            ? "text-green-400"
                            : "text-red-400"
                        }`}>
                        {service.status}
                      </span>
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-4 bg-white/[0.01] border-b border-white/[0.03]"
                    >
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-500 font-dm uppercase tracking-wider mb-1.5">
                          TXT Records
                        </p>
                        {Object.keys(service.txtRecords).length === 0 ? (
                          <p className="text-[11px] text-gray-600 font-mono">
                            No TXT records
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                            {Object.entries(service.txtRecords).map(
                              ([key, value]) => (
                                <div
                                  key={key}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-cyber-primary font-mono text-[11px]">
                                    {key}
                                  </span>
                                  <span className="text-gray-600 font-mono text-[11px]">
                                    =
                                  </span>
                                  <span className="text-gray-300 font-mono text-[11px] truncate">
                                    {value}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {services.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-gray-600 font-dm text-sm"
              >
                No services found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
