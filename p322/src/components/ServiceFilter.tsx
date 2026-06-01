import { Search, Filter } from "lucide-react";
import { SERVICE_TYPE_LABELS } from "@/utils/types";

interface ServiceFilterProps {
  type: string;
  setType: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
}

export default function ServiceFilter({
  type,
  setType,
  status,
  setStatus,
  search,
  setSearch,
}: ServiceFilterProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="appearance-none pl-8 pr-8 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-xs font-dm text-gray-300 focus:outline-none focus:border-cyber-primary focus:ring-1 focus:ring-cyber-primary/50 transition-colors cursor-pointer"
        >
          <option value="">All Types</option>
          {Object.entries(SERVICE_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden">
        {[
          { value: "", label: "All" },
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
        ].map(({ value: s, label }) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-2 text-xs font-dm transition-colors duration-150 ${
              status === s
                ? "bg-cyber-primary/15 text-cyber-primary"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative flex-1 max-w-xs min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-xs font-dm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-cyber-primary focus:ring-1 focus:ring-cyber-primary/50 transition-colors"
        />
      </div>
    </div>
  );
}
