import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { VTPMList } from "@/pages/VTPMList";
import { VTPMDetail } from "@/pages/VTPMDetail";
import { VMList } from "@/pages/VMList";
import { CertificateList } from "@/pages/CertificateList";
import { CryptoTest } from "@/pages/CryptoTest";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/vtpm" element={<VTPMList />} />
            <Route path="/vtpm/:id" element={<VTPMDetail />} />
            <Route path="/vms" element={<VMList />} />
            <Route path="/certificates" element={<CertificateList />} />
            <Route path="/crypto-test" element={<CryptoTest />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  );
}
