import { useState } from 'react';
import { Activity, RotateCcw, Network, Radio, Layers } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import FrameResults from '../components/FrameResults';
import SkeletonPanel from '../components/SkeletonPanel';
import CsmaCaSimulation from '../components/CsmaCaSimulation';
import NetworkTopology from '../components/NetworkTopology';
import { useParserStore } from '../store/parserStore';
import { cn } from '../lib/utils';

type TabType = 'frames' | 'topology' | 'simulation';

export default function Home() {
  const { result, loading, reset } = useParserStore();
  const [activeTab, setActiveTab] = useState<TabType>('frames');

  const allTEIs = result
    ? [...new Set(result.frames.flatMap((f) => [f.macHeader.sourceTEI, f.macHeader.destinationTEI]).filter((t) => t !== 255))]
    : [];

  const tabs: { id: TabType; label: string; icon: typeof Activity }[] = [
    { id: 'frames', label: '帧解析', icon: Layers },
    { id: 'topology', label: '网络拓扑', icon: Network },
    { id: 'simulation', label: 'CSMA/CA模拟', icon: Radio },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120]">
      <header className="border-b border-slate-800 bg-[#0B1120]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#00E5CC]" />
            <h1 className="font-mono text-sm font-bold tracking-wider text-slate-200">
              HPAV FRAME PARSER
            </h1>
          </div>
          {(result || loading) && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300"
            >
              <RotateCcw className="h-3 w-3" />
              重新上传
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!result && !loading && (
          <div className="mx-auto max-w-xl">
            <div className="mb-8 text-center">
              <h2 className="mb-2 text-2xl font-bold text-slate-100">
                HomePlug AV 帧解析器
              </h2>
              <p className="text-sm text-slate-500">
                上传捕获的二进制数据，自动解析 MAC 报头、SOF 帧、TEI 标识和信令信息
              </p>
            </div>
            <FileUploader />
          </div>
        )}

        {loading && (
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#00E5CC] border-t-transparent" />
              <span className="text-sm text-slate-400">正在解析帧数据...</span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <SkeletonPanel />
              <SkeletonPanel />
            </div>
            <SkeletonPanel />
          </div>
        )}

        {result && !loading && (
          <div className="space-y-6">
            <FileUploader />

            <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-800/30 p-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all',
                      activeTab === tab.id
                        ? 'bg-[#00E5CC]/15 text-[#00E5CC] shadow-sm'
                        : 'text-slate-400 hover:bg-slate-700/30 hover:text-slate-300'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'frames' && <FrameResults frames={result.frames} />}

            {activeTab === 'topology' && <NetworkTopology frames={result.frames} />}

            {activeTab === 'simulation' && <CsmaCaSimulation stationTEIs={allTEIs} />}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 py-4 text-center">
        <span className="text-[10px] text-slate-700">
          HomePlug AV Frame Parser · IEEE 1901 Protocol Analysis Tool
        </span>
      </footer>
    </div>
  );
}
