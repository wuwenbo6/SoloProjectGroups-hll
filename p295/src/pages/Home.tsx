import { useEffect } from 'react';
import SearchBar from '@/components/SearchBar';
import LogList from '@/components/LogList';
import StatsPanel from '@/components/StatsPanel';
import TestSender from '@/components/TestSender';
import ExportMenu from '@/components/ExportMenu';
import { useLogStore } from '@/stores/logStore';
import { Activity } from 'lucide-react';

export default function Home() {
  const { searchLogs, fetchStats } = useLogStore();

  useEffect(() => {
    searchLogs('', 1);
    fetchStats();
    const interval = setInterval(() => {
      fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [searchLogs, fetchStats]);

  return (
    <div className="min-h-screen bg-gelf-bg relative">
      <div className="scanline-overlay" />

      <header className="sticky top-0 z-40 bg-gelf-bg/80 backdrop-blur-xl border-b border-gelf-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Activity size={28} className="text-gelf-accent" />
                <div className="absolute inset-0 animate-glow-pulse rounded-full" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gelf-text tracking-tight font-sans">
                  GELF <span className="text-gelf-accent">LogView</span>
                </h1>
                <p className="text-xs text-gelf-muted -mt-0.5 font-mono">UDP:12201 · Real-time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ExportMenu />
              <TestSender />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <SearchBar />
        </div>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <LogList />
          </div>
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24">
              <StatsPanel />
            </div>
          </aside>
        </div>
      </div>

      <footer className="border-t border-gelf-border mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between text-xs text-gelf-muted">
            <span className="font-mono">GELF LogView v1.0</span>
            <span className="font-mono">GELF over UDP · Port 12201</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
