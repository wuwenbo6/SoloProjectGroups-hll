import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Logs } from "@/pages/Logs";
import { Settings } from "@/pages/Settings";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}
