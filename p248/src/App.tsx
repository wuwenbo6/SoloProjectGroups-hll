import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ValidatorPage from "@/pages/ValidatorPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ValidatorPage />} />
      </Routes>
    </Router>
  );
}
