import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Network, Activity } from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "仪表盘" },
  { to: "/topology", icon: Network, label: "拓扑管理" },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#0B1120] text-gray-100">
      <aside className="w-[72px] flex flex-col items-center py-6 border-r border-cyan-900/30 bg-[#060D1B]">
        <div className="mb-8">
          <Activity className="w-7 h-7 text-cyan-400" />
        </div>
        <nav className="flex flex-col gap-3 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center justify-center w-11 h-11 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.15)]"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>
        <div className="text-[10px] text-gray-600 font-mono tracking-wider">MANO</div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
