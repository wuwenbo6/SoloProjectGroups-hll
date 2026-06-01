import { NavLink, useNavigate } from "react-router-dom"
import { HardDrive, LayoutDashboard, FileText, AlertTriangle, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import FileUpload from "@/components/FileUpload"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/logs", label: "Logs", icon: FileText },
  { to: "/leaks", label: "Leaks", icon: AlertTriangle },
]

export default function Sidebar() {
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <aside className="fixed left-0 top-0 bottom-0 w-60 bg-navy-dark border-r border-navy-light/50 flex flex-col z-20">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-navy-light/50">
          <HardDrive className="w-6 h-6 text-cyan" />
          <span className="font-mono font-semibold text-sm text-text tracking-wide">
            BlueStore Analyzer
          </span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-cyan/10 text-cyan border-l-2 border-cyan"
                    : "text-slate-400 hover:text-slate-200 hover:bg-navy-light/50 border-l-2 border-transparent"
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-cyan/10 text-cyan text-sm font-medium hover:bg-cyan/20 transition-colors border border-cyan/30"
          >
            <Upload className="w-4 h-4" />
            Upload File
          </button>
        </div>
      </aside>

      {showUpload && (
        <FileUpload onClose={() => setShowUpload(false)} onLoaded={() => { setShowUpload(false); navigate("/") }} />
      )}
    </>
  )
}
