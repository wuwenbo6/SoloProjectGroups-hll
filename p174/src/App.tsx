import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ImageManagement from './pages/ImageManagement';
import SnapshotTree from './pages/SnapshotTree';
import SnapshotSchedule from './pages/SnapshotSchedule';
import ConfirmDialog from './components/ConfirmDialog';
import CreateSnapshotDialog from './components/CreateSnapshotDialog';
import CloneDialog from './components/CloneDialog';
import ImageDetailDrawer from './components/ImageDetailDrawer';
import Notifications from './components/Notifications';
import ScheduleDialog from './components/ScheduleDialog';
import ExportDiffDialog from './components/ExportDiffDialog';

export default function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-slate-950 text-white">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/images" element={<ImageManagement />} />
            <Route path="/snapshot-tree" element={<SnapshotTree />} />
            <Route path="/schedules" element={<SnapshotSchedule />} />
          </Routes>
        </main>
        <ConfirmDialog />
        <CreateSnapshotDialog />
        <CloneDialog />
        <ImageDetailDrawer />
        <Notifications />
        <ScheduleDialog />
        <ExportDiffDialog />
      </div>
    </Router>
  );
}
