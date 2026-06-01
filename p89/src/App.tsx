import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Dashboard } from '@/pages/Dashboard';
import { VirtualMachines } from '@/pages/VirtualMachines';
import { Cluster } from '@/pages/Cluster';
import { OperationLogs } from '@/pages/OperationLogs';
import { Settings } from '@/pages/Settings';
import { AutoScaler } from '@/pages/AutoScaler';
import { useStore } from '@/store/useStore';

const App: React.FC = () => {
  const { currentPage, setCurrentPage, sidebarCollapsed } = useStore();

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'vms':
        return <VirtualMachines />;
      case 'cluster':
        return <Cluster />;
      case 'logs':
        return <OperationLogs />;
      case 'autoscaler':
        return <AutoScaler />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar onNavigate={handleNavigate} />
      <main
        className="flex-1 overflow-auto p-8 transition-all duration-300"
      >
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
