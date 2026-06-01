import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import TrajectoryPage from '@/pages/TrajectoryPage';
import ReplayPage from '@/pages/ReplayPage';

function NavLinks() {
  const location = useLocation();

  return (
    <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
      <Link
        to="/"
        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
          location.pathname === '/'
            ? 'bg-accent/20 text-accent border border-accent/30'
            : 'glass-panel text-text-secondary hover:text-text-primary'
        }`}
      >
        实时轨迹
      </Link>
      <Link
        to="/replay"
        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
          location.pathname === '/replay'
            ? 'bg-accent/20 text-accent border border-accent/30'
            : 'glass-panel text-text-secondary hover:text-text-primary'
        }`}
      >
        历史回放
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <NavLinks />
      <Routes>
        <Route path="/" element={<TrajectoryPage />} />
        <Route path="/replay" element={<ReplayPage />} />
      </Routes>
    </Router>
  );
}
