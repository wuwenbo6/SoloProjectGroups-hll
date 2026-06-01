import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import PdoConfigPage from "@/pages/PdoConfigPage";
import EsiGeneratorPage from "@/pages/EsiGeneratorPage";
import ValidationPage from "@/pages/ValidationPage";
import TemplateManagerPage from "@/pages/TemplateManagerPage";
import CoEConfigPage from "@/pages/CoEConfigPage";
import MultiSlavePage from "@/pages/MultiSlavePage";

export default function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<PdoConfigPage />} />
          <Route path="/coe" element={<CoEConfigPage />} />
          <Route path="/esi-generator" element={<EsiGeneratorPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="/templates" element={<TemplateManagerPage />} />
          <Route path="/multi-slave" element={<MultiSlavePage />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}
