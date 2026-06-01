import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Sidebar from "@/components/Sidebar"
import Dashboard from "@/pages/Dashboard"
import Logs from "@/pages/Logs"
import Leaks from "@/pages/Leaks"

export default function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-navy">
        <Sidebar />
        <main className="flex-1 ml-60 p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/leaks" element={<Leaks />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
