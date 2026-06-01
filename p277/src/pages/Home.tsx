import React, { useEffect } from 'react';
import { TWTTimeline } from '../components/TWTTimeline';
import { PowerStats } from '../components/PowerStats';
import { SavingCurve } from '../components/SavingCurve';
import { ControlPanel } from '../components/ControlPanel';
import { useTWTWebSocket } from '../hooks/useTWTWebSocket';
import { useAPIService } from '../store/useSimulationStore';
import { Wifi, Cpu, Zap, Info } from 'lucide-react';

const Home: React.FC = () => {
  const { isConnected } = useTWTWebSocket();
  const api = useAPIService();

  useEffect(() => {
    const init = async () => {
      try {
        await api.fetchState();
      } catch (error) {
        console.error('Failed to fetch initial state:', error);
      }
    };
    init();
  }, [api]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-xl">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  TWT 模拟器
                </h1>
                <p className="text-xs text-slate-400">
                  Target Wake Time 功耗模拟可视化
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Cpu className="w-4 h-4" />
                  <span>AP + Multi-STA</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Zap className="w-4 h-4" />
                  <span>实时功耗计算</span>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-red-400'
                  }`}
                />
                {isConnected ? '实时同步' : '连接断开'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <ControlPanel />
          </div>

          <div className="lg:col-span-9 space-y-6">
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 flex items-start gap-3">
              <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-400">
                <p className="font-medium text-slate-300 mb-1">什么是 TWT？</p>
                <p>
                  Target Wake Time (TWT) 是 Wi-Fi 6/802.11ah 标准中的节能机制。
                  AP 与 STA 协商唤醒时间，使 STA 可以在大部分时间处于低功耗睡眠状态，
                  只在预定的唤醒时间醒来进行数据传输，从而大幅降低功耗。
                </p>
              </div>
            </div>

            <TWTTimeline />

            <SavingCurve />

            <PowerStats />
          </div>
        </div>
      </main>

      <footer className="mt-12 py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>TWT 模拟器 - Wi-Fi 6 Target Wake Time 功耗分析工具</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
