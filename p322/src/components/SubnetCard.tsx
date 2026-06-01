import { useNavigate } from "react-router-dom";
import { Server } from "lucide-react";
import type { Subnet } from "@/utils/types";

interface SubnetCardProps {
  subnet: Subnet;
}

export default function SubnetCard({ subnet }: SubnetCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/subnet/${subnet.id}`)}
      className="group relative backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-white/20 hover:shadow-[0_0_30px_rgba(0,212,255,0.08)]"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5"
        style={{ backgroundColor: subnet.color }}
      />
      <div className="pl-4 pr-4 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-dm text-sm font-semibold text-white group-hover:text-cyber-primary transition-colors duration-200">
              {subnet.name}
            </h3>
            <p className="font-mono text-[11px] text-gray-500 mt-0.5">
              {subnet.cidr}
            </p>
          </div>
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/5 text-gray-400 border border-white/10">
            {subnet.interface}
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-gray-500" />
            <span className="font-mono text-2xl font-bold text-white">
              {subnet.serviceCount}
            </span>
          </div>
          <span className="text-[10px] text-gray-600 font-mono">
            {subnet.lastSeen}
          </span>
        </div>
      </div>
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 40px ${subnet.color}10` }}
      />
    </div>
  );
}
