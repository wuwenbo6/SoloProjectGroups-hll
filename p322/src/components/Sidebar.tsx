import { NavLink } from "react-router-dom";
import { Radio, LayoutDashboard, Wifi, WifiOff } from "lucide-react";
import type { ReflectorStatus } from "@/utils/types";

interface SidebarProps {
  wsConnected: boolean;
  reflectorStatus: ReflectorStatus | null;
}

export default function Sidebar({ wsConnected, reflectorStatus }: SidebarProps) {
  const isRunning = reflectorStatus?.status === "running";

  return (
    <aside className="w-56 h-screen flex flex-col bg-cyber-card border-r border-cyber-border shrink-0">
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyber-primary/10 flex items-center justify-center">
          <Radio className="w-5 h-5 text-cyber-primary" />
        </div>
        <div>
          <h1 className="font-dm text-sm font-bold text-white tracking-wide leading-none">
            mDNS
          </h1>
          <p className="font-dm text-[10px] text-cyber-primary tracking-[0.2em] uppercase mt-0.5">
            Reflector
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-dm transition-all duration-200 ${
              isActive
                ? "bg-cyber-primary/10 text-cyber-primary shadow-[0_0_12px_rgba(0,212,255,0.1)]"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </NavLink>
      </nav>

      <div className="px-5 py-4 border-t border-cyber-border space-y-3">
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="w-3.5 h-3.5 text-cyber-primary" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-500" />
          )}
          <span className="text-[11px] text-gray-500 font-mono">
            {wsConnected ? "WS Connected" : "WS Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isRunning ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </span>
          <span
            className={`text-[11px] font-dm font-medium ${
              isRunning ? "text-green-400" : "text-red-400"
            }`}
          >
            {isRunning ? "Running" : "Stopped"}
          </span>
        </div>
      </div>
    </aside>
  );
}
