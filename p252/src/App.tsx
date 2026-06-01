import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Analysis from "@/pages/Analysis";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/analysis/:id" element={<Analysis />} />
      </Routes>
    </Router>
  );
}
