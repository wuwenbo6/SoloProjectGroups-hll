import { useEffect, useRef, useState, useCallback } from 'react';
import { useSimulationStore } from '@/hooks/useSimulation';
import ParameterPanel from '@/components/ParameterPanel';
import WaveformChart from '@/components/WaveformChart';
import SpectrumChart from '@/components/SpectrumChart';
import StatsPanel from '@/components/StatsPanel';
import BitStreamView from '@/components/BitStreamView';
import InbandNoiseChart from '@/components/InbandNoiseChart';

export default function Home() {
  const { result, fftResult, dbSpectrum, params, run } = useSimulationStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  const [hasAutoRun, setHasAutoRun] = useState(false);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      setChartWidth(Math.max(400, w));
    }
  }, []);

  useEffect(() => {
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [updateWidth]);

  useEffect(() => {
    if (!hasAutoRun) {
      run();
      setHasAutoRun(true);
    }
  }, [hasAutoRun, run]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-72 xl:w-80 flex-shrink-0 border-r border-slate-800/60 bg-slate-900/80 p-5 overflow-y-auto">
        <ParameterPanel />
      </aside>

      <main ref={containerRef} className="flex-1 p-5 overflow-y-auto flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className={params.order === 2 ? 'text-emerald-400' : 'text-blue-400'}>Σ-Δ</span> Modulator Simulator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {params.order === 2 ? '二阶CRFF结构' : '一阶标准结构'} · 过采样率 {params.oversampleRatio}x · 噪声整形与频谱分析
            </p>
          </div>
        </header>

        {result && fftResult && dbSpectrum ? (
          <>
            <StatsPanel />

            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">时域波形</h2>
              </div>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-3">
                <WaveformChart
                  time={result.time}
                  signals={[
                    { data: result.inputSignal, color: '#3b82f6', label: 'Input Signal' },
                    { data: result.outputBits, color: '#10b981', label: 'Δ-Σ Output' },
                  ]}
                  width={chartWidth - 24}
                  height={220}
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">输出比特流</h2>
              </div>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-3">
                <BitStreamView
                  bits={result.outputBits}
                  width={chartWidth - 24}
                  height={100}
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-purple-500 rounded-full" />
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">频谱分析 (FFT)</h2>
              </div>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-3">
                <SpectrumChart
                  fftResult={fftResult}
                  dbSpectrum={dbSpectrum}
                  oversampleRatio={params.oversampleRatio}
                  width={chartWidth - 24}
                  height={300}
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-orange-500 rounded-full" />
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">带内噪声功率分析</h2>
              </div>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-3">
                <InbandNoiseChart
                  fftResult={fftResult}
                  width={chartWidth - 24}
                  height={280}
                  order={result.order}
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-amber-500 rounded-full" />
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">量化噪声</h2>
              </div>
              <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-3">
                <WaveformChart
                  time={result.time}
                  signals={[
                    { data: result.quantNoise, color: '#f59e0b', label: 'Quantization Noise' },
                  ]}
                  width={chartWidth - 24}
                  height={160}
                />
              </div>
            </section>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-950/50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                  <path d="M2 12h4l3-9 4 18 3-9h6" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm">点击「运行仿真」开始</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
