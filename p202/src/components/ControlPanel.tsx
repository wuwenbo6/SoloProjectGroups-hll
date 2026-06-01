import { useSignalStore } from "@/store/signalStore";
import { ModulationFormat, getBitsPerSymbol } from "@/utils/signal";

const FFT_OPTIONS = [16, 32, 64, 128, 256];
const MODULATION_OPTIONS: { value: ModulationFormat; label: string }[] = [
  { value: 'qpsk', label: 'QPSK' },
  { value: '16qam', label: '16QAM' },
  { value: '64qam', label: '64QAM' },
];

export default function ControlPanel() {
  const { params, result, isRunning, setParams, generate, startContinuous, stopContinuous } =
    useSignalStore();

  const maxSymbols = Math.floor((params.fftSize / 2) - 1 - Math.ceil((params.fftSize / 2 - 1) / params.pilotInterval));
  const bitsPerSymbol = getBitsPerSymbol(params.modulation);

  const handleModulationChange = (value: ModulationFormat) => {
    const modulationTypeMap: Record<ModulationFormat, 'QPSK' | '16QAM' | '64QAM'> = {
      'qpsk': 'QPSK',
      '16qam': '16QAM',
      '64qam': '64QAM',
    };
    setParams({
      modulation: value,
      modulationType: modulationTypeMap[value],
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      <h2 className="text-sm font-bold tracking-wider text-cyan-300 uppercase">
        OFDM 参数控制
      </h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">调制格式</label>
        <select
          value={params.modulation}
          onChange={(e) => handleModulationChange(e.target.value as ModulationFormat)}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1.5 text-sm text-cyan-100 font-mono focus:outline-none focus:border-cyan-500/60"
        >
          {MODULATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="text-xs text-cyan-400/50">
          每符号比特数: <span className="font-mono text-cyan-300">{bitsPerSymbol}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">FFT 大小</label>
        <select
          value={params.fftSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            const newMaxSymbols = Math.floor((v / 2) - 1 - Math.ceil((v / 2 - 1) / params.pilotInterval));
            setParams({ fftSize: v, numSymbols: Math.min(params.numSymbols, newMaxSymbols) });
          }}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1.5 text-sm text-cyan-100 font-mono focus:outline-none focus:border-cyan-500/60"
        >
          {FFT_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          CP 长度: <span className="font-mono text-cyan-200">{params.cpLength}</span>
        </label>
        <input
          type="range"
          min={1}
          max={64}
          value={params.cpLength}
          onChange={(e) => setParams({ cpLength: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={1}
          max={64}
          value={params.cpLength}
          onChange={(e) => setParams({ cpLength: Math.max(1, Math.min(64, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          SNR (dB): <span className="font-mono text-cyan-200">{params.snrDb}</span>
        </label>
        <input
          type="range"
          min={-5}
          max={40}
          step={0.5}
          value={params.snrDb}
          onChange={(e) => setParams({ snrDb: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={-5}
          max={40}
          step={0.5}
          value={params.snrDb}
          onChange={(e) => setParams({ snrDb: Math.max(-5, Math.min(40, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          数据子载波数: <span className="font-mono text-cyan-200">{params.numSymbols}</span>
        </label>
        <input
          type="range"
          min={1}
          max={maxSymbols}
          value={params.numSymbols}
          onChange={(e) => setParams({ numSymbols: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={1}
          max={maxSymbols}
          value={params.numSymbols}
          onChange={(e) => setParams({ numSymbols: Math.max(1, Math.min(maxSymbols, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          导频间隔 (Pilot): <span className="font-mono text-cyan-200">{params.pilotInterval}</span>
        </label>
        <input
          type="range"
          min={2}
          max={16}
          value={params.pilotInterval}
          onChange={(e) => {
            const v = Number(e.target.value);
            const newMaxSymbols = Math.floor((params.fftSize / 2) - 1 - Math.ceil((params.fftSize / 2 - 1) / v));
            setParams({ pilotInterval: v, numSymbols: Math.min(params.numSymbols, newMaxSymbols) });
          }}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={2}
          max={16}
          value={params.pilotInterval}
          onChange={(e) => {
            const v = Math.max(2, Math.min(16, Number(e.target.value)));
            const newMaxSymbols = Math.floor((params.fftSize / 2) - 1 - Math.ceil((params.fftSize / 2 - 1) / v));
            setParams({ pilotInterval: v, numSymbols: Math.min(params.numSymbols, newMaxSymbols) });
          }}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="useEqualization"
          checked={params.useEqualization}
          onChange={(e) => setParams({ useEqualization: e.target.checked })}
          className="w-4 h-4 accent-cyan-500"
        />
        <label htmlFor="useEqualization" className="text-xs text-cyan-400/70">
          信道均衡 (Equalization)
        </label>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <button
          onClick={generate}
          className="w-full py-2 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          生成信号
        </button>
        <button
          onClick={isRunning ? stopContinuous : startContinuous}
          className={`w-full py-2 rounded border text-sm font-medium transition-colors ${
            isRunning
              ? "bg-red-600/20 border-red-500/40 text-red-300 hover:bg-red-500/30"
              : "bg-amber-600/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
          }`}
        >
          {isRunning ? "停止运行" : "连续运行"}
        </button>
      </div>

      <div className="mt-3 p-3 rounded bg-[#111827] border border-cyan-900/30">
        <div className="text-xs text-cyan-400/60 mb-1">BER (误码率)</div>
        <div className="text-xl font-mono font-bold text-cyan-300">
          {result ? result.ber.toFixed(6) : "---"}
        </div>
      </div>
    </div>
  );
}
