import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import SubnetDetail from "@/pages/SubnetDetail";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subnet/:id" element={<SubnetDetail />} />
      </Routes>
    </Router>
  );
}
