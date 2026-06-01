import { NavLink, Outlet } from "react-router-dom";
import { Server, Network, HardDrive } from "lucide-react";

const navItems = [
  { to: "/", label: "Connect", icon: Server },
  { to: "/topology", label: "Topology", icon: Network },
  { to: "/devices", label: "Devices", icon: HardDrive },
];

export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
      <aside className="flex w-16 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-sidebar)] py-6 lg:w-56">
        <div className="mb-8 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <Network className="h-5 w-5 text-[var(--bg-primary)]" />
          </div>
          <span className="hidden font-outfit text-sm font-semibold text-[var(--text-primary)] lg:block">
            SMI-S Viewer
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-2 w-full px-2 lg:px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 font-outfit text-sm ${
                  isActive
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-2 lg:px-3 w-full">
          <div className="hidden lg:block rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 font-mono text-[10px] text-[var(--text-secondary)]">
            SMI-S v1.6
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
