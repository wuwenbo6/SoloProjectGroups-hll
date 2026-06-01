import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import AuthPage from "@/pages/AuthPage";
import AuthorizePage from "@/pages/AuthorizePage";
import PacketsPage from "@/pages/PacketsPage";
import ConfigPage from "@/pages/ConfigPage";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/authorize" element={<AuthorizePage />} />
          <Route path="/packets" element={<PacketsPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
