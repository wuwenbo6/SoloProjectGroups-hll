import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import ConnectPage from "@/pages/ConnectPage";
import TopologyPage from "@/pages/TopologyPage";
import DevicesPage from "@/pages/DevicesPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ConnectPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/devices" element={<DevicesPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
