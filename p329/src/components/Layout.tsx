import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Binary, Radio, Clock } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Protocol Parser", icon: Binary },
  { path: "/simulator", label: "PLC Simulator", icon: Radio },
  { path: "/history", label: "History", icon: Clock },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] text-gray-100">
      <header className="flex h-12 shrink-0 items-center border-b border-gray-800 bg-[#161b22] px-4">
        <Link to="/" className="flex items-center gap-2 mr-8">
          <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: "#00d4aa20" }}>
            <Binary size={16} style={{ color: "#00d4aa" }} />
          </div>
          <span className="text-sm font-bold tracking-tight">
            <span style={{ color: "#00d4aa" }}>S7</span>comm Analyzer
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#00d4aa15] text-[#00d4aa]"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800"
          >
            <Binary size={18} />
          </button>
        </div>
      </header>
      {mobileMenuOpen && (
        <div className="border-b border-gray-800 bg-[#161b22] px-4 py-2 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  active ? "text-[#00d4aa]" : "text-gray-400"
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
