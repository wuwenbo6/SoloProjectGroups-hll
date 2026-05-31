import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Game } from "@/pages/Game";
import { Records } from "@/pages/Records";
import { Tsumego } from "@/pages/Tsumego";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game" element={<Game />} />
        <Route path="/records" element={<Records />} />
        <Route path="/tsumego" element={<Tsumego />} />
      </Routes>
    </Router>
  );
}
