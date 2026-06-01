import { useState } from 'react';
import { Cpu, Github, BookOpen, AlertTriangle, Activity, Database } from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { ChipInfoCard, ChipList } from '@/components/ChipInfo';
import { PinTable } from '@/components/PinTable';
import { JTAGVisualizer } from '@/components/JTAGVisualizer';
import { SVFGenerator } from '@/components/SVFGenerator';
import { BoundaryScanTester } from '@/components/BoundaryScanTester';
import { useBSDLStore, useSelectedChip } from '@/hooks/useBSDLStore';

type TabType = 'pins' | 'jtag' | 'svf' | 'test';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('pins');
  const { chips, parsingErrors, clearAll } = useBSDLStore();
  const selectedChip = useSelectedChip();

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'pins', label: '引脚详情', icon: <Cpu className="w-4 h-4" /> },
    { id: 'jtag', label: 'JTAG 链', icon: <Cpu className="w-4 h-4" /> },
    { id: 'svf', label: 'SVF 生成', icon: <Database className="w-4 h-4" /> },
    { id: 'test', label: '测试模拟', icon: <Activity className="w-4 h-4" /> }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                <Cpu className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                  JTAG 链分析工具
                </h1>
                <p className="text-xs text-slate-500">
                  BSDL 解析 · JTAG 可视化 · SVF 生成
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {chips.length > 0 && (
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 
                             rounded-lg transition-colors border border-red-500/20"
                >
                  清除全部
                </button>
              )}
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 
                           hover:bg-slate-800 transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {parsingErrors.length > 0 && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-400 mb-2">解析警告</h4>
                <ul className="space-y-1">
                  {parsingErrors.map((error, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-amber-300/80">
                      <span className="text-amber-500">•</span>
                      {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4 space-y-6">
            <FileUpload />
            
            {chips.length > 0 && selectedChip && (
              <div className="space-y-4">
                <ChipInfoCard chip={selectedChip} isSelected showRemove />
              </div>
            )}
            
            <ChipList />
          </aside>

          <section className="lg:col-span-8 space-y-6">
            {chips.length === 0 ? (
              <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-12 text-center">
                <div className="inline-flex p-4 rounded-full bg-slate-700/50 mb-6">
                  <BookOpen className="w-12 h-12 text-slate-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-200 mb-3">
                  开始使用 JTAG 链分析工具
                </h2>
                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                  上传 BSDL 文件以解析芯片引脚信息、构建 JTAG 链并生成 SVF 测试命令
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="text-cyan-400 font-bold text-lg mb-1">1</div>
                    <div className="text-sm text-slate-300">上传 BSDL 文件</div>
                    <div className="text-xs text-slate-500 mt-1">支持 .bsdl / .bsd 格式</div>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="text-emerald-400 font-bold text-lg mb-1">2</div>
                    <div className="text-sm text-slate-300">构建 JTAG 链</div>
                    <div className="text-xs text-slate-500 mt-1">拖拽排序设备顺序</div>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="text-amber-400 font-bold text-lg mb-1">3</div>
                    <div className="text-sm text-slate-300">生成 SVF 命令</div>
                    <div className="text-xs text-slate-500 mt-1">导出测试向量文件</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-xl border border-slate-700">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                        ${activeTab === tab.id
                          ? 'bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'pins' && (
                  <div className="animate-fadeIn">
                    <PinTable />
                  </div>
                )}

                {activeTab === 'jtag' && (
                  <div className="animate-fadeIn">
                    <JTAGVisualizer />
                  </div>
                )}

                {activeTab === 'svf' && (
                  <div className="animate-fadeIn">
                    <SVFGenerator />
                  </div>
                )}

                {activeTab === 'test' && (
                  <div className="animate-fadeIn">
                    <BoundaryScanTester />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              JTAG 链分析工具 · BSDL Parser & SVF Generator
            </p>
            <p className="text-sm text-slate-600">
              Built with React + TypeScript + Vite
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
