import React, { useCallback } from 'react';
import { Radio, AlertCircle } from 'lucide-react';
import { useDmrAnalysis } from '@/hooks/useDmrAnalysis';
import { FileImporter } from '@/components/FileImporter';
import { ControlPanel } from '@/components/ControlPanel';
import { TimeSlotChart } from '@/components/TimeSlotChart';
import { CallList } from '@/components/CallList';
import { SignalMeter } from '@/components/SignalMeter';
import { StatisticsPanel } from '@/components/StatisticsPanel';

export default function Home() {
  const {
    fileInfo,
    config,
    isAnalyzing,
    error,
    selectFile,
    startAnalysis,
    cancelAnalysis,
  } = useDmrAnalysis();

  const handleStart = useCallback(() => {
    if (fileInfo) {
      startAnalysis(fileInfo.path, config);
    }
  }, [fileInfo, config, startAnalysis]);

  const handleCancel = useCallback(() => {
    cancelAnalysis();
  }, [cancelAnalysis]);

  return (
    <div className="min-h-screen bg-[#0a0e17] text-gray-100 grid-bg relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      
      <header className="relative border-b border-gray-800/50 backdrop-blur-sm bg-[#0a0e17]/80">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Radio className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-100">
                  DMR 基带分析工具
                </h1>
                <p className="text-xs text-gray-500">
                  4FSK 解调 · 语音超帧解析 · CSBK 信令分析
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <StatusIndicator label="状态" value={isAnalyzing ? '分析中' : '就绪'} active={!isAnalyzing} />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-[1800px] mx-auto px-6 pt-4">
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <FileImporter onSelect={selectFile} />
            <ControlPanel onStart={handleStart} onCancel={handleCancel} />
          </div>

          <div className="col-span-12 lg:col-span-9 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2">
                <TimeSlotChart />
              </div>
              <div className="space-y-6">
                <SignalMeter />
                <StatisticsPanel />
              </div>
            </div>

            <CallList />
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-800/50 bg-[#0a0e17]/90 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>DMR Analyzer v1.0.0</span>
            <span>支持 WAV 格式 · 48kHz/44.1kHz/22.05kHz 采样率</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface StatusIndicatorProps {
  label: string;
  value: string;
  active: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ label, value, active }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
    <span className="text-xs text-gray-400">{label}:</span>
    <span className={`text-xs font-medium ${active ? 'text-green-400' : 'text-yellow-400'}`}>
      {value}
    </span>
  </div>
);
