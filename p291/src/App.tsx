import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Sidebar from "@/components/Sidebar"
import TrapMonitor from "@/pages/TrapMonitor"
import ConfigPage from "@/pages/ConfigPage"

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-[#0a0e17]">
        <Sidebar />
        <main className="ml-16 flex-1 lg:ml-56">
          <Routes>
            <Route path="/" element={<TrapMonitor />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
