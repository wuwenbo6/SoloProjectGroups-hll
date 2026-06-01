import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Console from "@/pages/Console";
import Terminals from "@/pages/Terminals";
import Admissions from "@/pages/Admissions";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Console />} />
          <Route path="/terminals" element={<Terminals />} />
          <Route path="/admissions" element={<Admissions />} />
        </Route>
      </Routes>
    </Router>
  );
}
