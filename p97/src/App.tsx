import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { DeviceConnect } from "@/pages/DeviceConnect";
import { Monitor } from "@/pages/Monitor";
import { History } from "@/pages/History";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DeviceConnect />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </Router>
  );
}
