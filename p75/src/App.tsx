import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import History from "@/pages/History";
import Programs from "@/pages/Programs";
import Recipes from "@/pages/Recipes";
import Alarms from "@/pages/Alarms";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}
