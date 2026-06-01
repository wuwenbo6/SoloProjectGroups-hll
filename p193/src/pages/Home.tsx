import { FileUpload } from '../components/FileUpload';
import { StatsCards } from '../components/StatsCards';
import { PacketList } from '../components/PacketList';
import { PacketDetail } from '../components/PacketDetail';
import { TypeFilter } from '../components/TypeFilter';
import { SettingsPanel } from '../components/SettingsPanel';
import { useAppStore } from '../store/useAppStore';
import { Cpu, Github, RefreshCw } from 'lucide-react';
import { formatDate } from '../utils/formatters';

export default function Home() {
  const { parseResult, clearAll, isLoading } = useAppStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  IRIG 106 Parser
                </h1>
                <p className="text-xs text-slate-500">
                  Chapter 10 Packet Analyzer
                </p>
              </div>
            </div>
            {parseResult && (
              <button
                onClick={clearAll}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg 
                  bg-slate-800 hover:bg-slate-700 border border-slate-700
                  text-slate-300 text-sm transition-all duration-200
                  hover:border-slate-600 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>New File</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!parseResult ? (
          <div className="max-w-2xl mx-auto py-12">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-100 mb-2">
                Analyze IRIG 106 Chapter 10 Files
              </h2>
              <p className="text-slate-400">
                Upload and parse telemetry data files to inspect packet contents.
                Supports TMATS, PCM, and MIL-STD-1553 packet types.
              </p>
            </div>
            <FileUpload />
            
            <div className="mt-12 grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <span className="text-purple-400 font-bold text-sm">TM</span>
                </div>
                <p className="text-sm font-medium text-slate-200">TMATS</p>
                <p className="text-xs text-slate-500 mt-1">Configuration</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <span className="text-blue-400 font-bold text-sm">PC</span>
                </div>
                <p className="text-sm font-medium text-slate-200">PCM</p>
                <p className="text-xs text-slate-500 mt-1">Analog Samples</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <span className="text-orange-400 font-bold text-sm">1553</span>
                </div>
                <p className="text-sm font-medium text-slate-200">1553 Bus</p>
                <p className="text-xs text-slate-500 mt-1">Avionics Data</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-slate-200 font-semibold">
                    {parseResult.fileName}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                    <span>Version {parseResult.fileHeader.versionMajor}.{parseResult.fileHeader.versionMinor}</span>
                    <span>Created: {formatDate(parseResult.fileHeader.creationTime)}</span>
                    <span>{parseResult.errors.length > 0 && (
                      <span className="text-orange-400">{parseResult.errors.length} warnings</span>
                    )}</span>
                  </div>
                </div>
              </div>
            </div>

            <StatsCards />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Packets</h3>
                <p className="text-sm text-slate-500">
                  {parseResult.totalPackets} packets found
                </p>
              </div>
              <TypeFilter />
            </div>

            <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <PacketList />
              </div>
            </div>

            {parseResult.errors.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                <h4 className="text-orange-400 font-medium mb-2">Parse Warnings</h4>
                <ul className="text-sm text-orange-300/80 space-y-1 max-h-32 overflow-y-auto">
                  {parseResult.errors.slice(0, 10).map((error, idx) => (
                    <li key={idx} className="font-mono text-xs">
                      {error}
                    </li>
                  ))}
                  {parseResult.errors.length > 10 && (
                    <li className="text-orange-400/60">
                      ... and {parseResult.errors.length - 10} more warnings
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-auto py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <p>IRIG 106 Chapter 10 Parser v1.0</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-slate-400 transition-colors flex items-center gap-1">
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

      <PacketDetail />
      <SettingsPanel />
    </div>
  );
}
