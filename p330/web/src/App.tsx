import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import TopologyPage from "@/pages/TopologyPage"
import DeviceDetailPage from "@/pages/DeviceDetailPage"

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TopologyPage />} />
        <Route path="/device/:id" element={<DeviceDetailPage />} />
      </Routes>
    </Router>
  )
}
