import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { PluginList } from './pages/PluginList';
import { PluginDetail } from './pages/PluginDetail';
import { PluginUpload } from './pages/PluginUpload';
import { PluginDevelopment } from './pages/PluginDevelopment';
import { Login } from './pages/Login';
import { QgisServerManagement } from './pages/QgisServerManagement';
import { useAuthStore } from './store/authStore';

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <Routes>
          <Route path="/" element={<PluginList />} />
          <Route path="/plugins/:id" element={<PluginDetail />} />
          <Route path="/upload" element={<PluginUpload />} />
          <Route path="/develop" element={<PluginDevelopment />} />
          <Route path="/develop/:id" element={<PluginDevelopment />} />
          <Route path="/login" element={<Login />} />
          <Route path="/servers" element={<QgisServerManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
