import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/Layout/Sidebar.js";
import { LiveMonitor } from "@/pages/LiveMonitor.js";
import { Playback } from "@/pages/Playback.js";
import { Events } from "@/pages/Events.js";

export default function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<LiveMonitor />} />
            <Route path="/playback" element={<Playback />} />
            <Route path="/events" element={<Events />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
