import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Topology } from "@/pages/Topology";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/topology" element={<Topology />} />
      </Route>
    </Routes>
  );
}
