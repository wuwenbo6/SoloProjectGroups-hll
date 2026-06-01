import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Console from "@/pages/Console";
import Scenes from "@/pages/Scenes";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Console />} />
        <Route path="/scenes" element={<Scenes />} />
      </Routes>
    </Router>
  );
}
