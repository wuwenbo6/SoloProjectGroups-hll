import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TestConfig from './pages/TestConfig';
import TestExecution from './pages/TestExecution';
import ResultsAnalysis from './pages/ResultsAnalysis';
import TestCases from './pages/TestCases';
import Reports from './pages/Reports';

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<TestConfig />} />
          <Route path="/execution" element={<TestExecution />} />
          <Route path="/results" element={<ResultsAnalysis />} />
          <Route path="/cases" element={<TestCases />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
