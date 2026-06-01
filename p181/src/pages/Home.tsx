import React, { useState } from 'react';
import { Cpu, Database, Zap, AlertTriangle, X, BarChart3 } from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { TLPList } from '@/components/TLPList';
import { TLPDetail } from '@/components/TLPDetail';
import { ErrorInjector } from '@/components/ErrorInjector';
import { TLPChart } from '@/components/TLPChart';
import { ExportPanel } from '@/components/ExportPanel';
import { useTLPStore } from '@/store/tlpStore';

type TabType = 'detail' | 'injector' | 'chart';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('detail');
  const { error, clearAll, parseResult, modifiedTLPs } = useTLPStore();

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'detail', label: 'TLP详情', icon: <Database className="w-4 h-4" /> },
    { id: 'injector', label: '错误注入', icon: <Zap className="w-4 h-4" /> },
    { id: 'chart', label: '图表分析', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Cpu className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">PCIe TLP 分析工具</h1>
                <p className="text-xs text-slate-500">TLP 解析、错误注入与Wireshark导出</p>
              </div>
            </div>
            {parseResult && (
              <div className="flex items-center gap-4">
                <ExportPanel />
                {modifiedTLPs.size > 0 && (
                  <span className="px-3 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                    {modifiedTLPs.size} 处修改
                  </span>
                )}
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                >
                  重置
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
              <button
                onClick={() => useTLPStore.setState({ error: null })}
                className="p-1 hover:bg-red-500/20 rounded"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <FileUpload />
        </div>

        {parseResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 min-h-[500px]">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                <Database className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">TLP 列表</h2>
                <span className="ml-auto text-xs text-slate-500">
                  共 {parseResult.tlps.length} 个数据包
                </span>
              </div>
              <div className="h-[450px] overflow-hidden">
                <TLPList />
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 min-h-[500px]">
              <div className="flex gap-1 mb-4 pb-3 border-b border-slate-800">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-slate-800 text-cyan-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className={activeTab === 'chart' ? 'h-[450px] overflow-auto' : 'h-[450px] overflow-hidden'}>
                {activeTab === 'detail' && <TLPDetail />}
                {activeTab === 'injector' && <ErrorInjector />}
                {activeTab === 'chart' && <TLPChart />}
              </div>
            </div>
          </div>
        )}

        {!parseResult && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-800/50 rounded-full mb-6">
              <Cpu className="w-10 h-10 text-slate-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-400 mb-2">
              上传PCIe捕获文件开始分析
            </h2>
            <p className="text-slate-500 max-w-md mx-auto">
              支持 PCIeSnoop 格式 (.hex, .txt) 以及原始二进制文件 (.bin, .dat)
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-xs text-slate-600">
            PCIe TLP 分析工具 - 支持解析 Memory Read/Write, Completion, Configuration 等 TLP 类型 · 导出 Wireshark PCAP/PCAPNG
          </p>
        </div>
      </footer>
    </div>
  );
}
