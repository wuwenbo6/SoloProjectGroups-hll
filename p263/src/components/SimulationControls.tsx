import { Play, Pause, RotateCcw, SkipForward, Settings } from 'lucide-react';
import type { SimulationStatus, SimulationConfig } from '@/types';

interface SimulationControlsProps {
  status: SimulationStatus | null;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onConfigChange: (config: Partial<SimulationConfig>) => void;
}

export function SimulationControls({
  status,
  onStart,
  onPause,
  onReset,
  onStep,
  onConfigChange,
}: SimulationControlsProps) {
  const config = status?.config;

  return (
    <div className="bg-bg-secondary/40 rounded-lg border border-bg-tertiary p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-semibold text-text-primary flex items-center gap-2">
          <Settings className="w-4 h-4 text-accent-primary" />
          Simulation Control
        </h3>
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              status?.running ? 'text-accent-primary' : 'text-text-secondary'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status?.running ? 'bg-accent-primary animate-pulse' : 'bg-text-muted'
              }`}
            />
            {status?.running ? 'Running' : 'Paused'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={status?.running ? onPause : onStart}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-display font-semibold text-sm transition-all ${
            status?.running
              ? 'bg-accent-warning text-white hover:bg-accent-warning/80'
              : 'bg-accent-primary text-bg-primary hover:bg-accent-primary/80'
          }`}
        >
          {status?.running ? (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start
            </>
          )}
        </button>
        <button
          onClick={onStep}
          disabled={status?.running}
          className="px-3 py-2.5 bg-bg-tertiary text-text-primary rounded-lg hover:bg-bg-tertiary/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-4 h-4" />
        </button>
        <button
          onClick={onReset}
          className="px-3 py-2.5 bg-bg-tertiary text-text-primary rounded-lg hover:bg-bg-tertiary/70 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Step Count</span>
              <span className="font-mono text-accent-primary">{status?.step_count || 0}</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Reselections</span>
              <span className="font-mono text-accent-warning">{status?.reselection_count || 0}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">Speed (ms)</span>
              <span className="font-mono text-text-primary">{config?.speed || 1000}</span>
            </div>
            <input
              type="range"
              min="200"
              max="3000"
              step="100"
              value={config?.speed || 1000}
              onChange={(e) => onConfigChange({ speed: Number(e.target.value) })}
              className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">T<sub>reselection</sub> Threshold</span>
              <span className="font-mono text-text-primary">{config?.treselection || 3} steps</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={config?.treselection || 3}
              onChange={(e) => onConfigChange({ treselection: Number(e.target.value) })}
              className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-bg-tertiary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="w-2 h-2 bg-accent-primary rounded-full animate-pulse" />
            T<sub>reselection</sub> Timer Status
          </span>
          <span className="text-[10px] text-text-muted">
            Counters reset when best neighbor changes
          </span>
        </div>
        {status?.treselection_counters && Object.keys(status.treselection_counters).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(status.treselection_counters).map(([pci, count]) => {
              const threshold = config?.treselection || 3;
              const progress = (count / threshold) * 100;
              const isTriggered = count >= threshold;
              return (
                <div key={pci} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-primary">
                      Candidate PCI <span className="font-mono font-semibold">{pci}</span>
                    </span>
                    <span className={`font-mono font-semibold ${isTriggered ? 'text-accent-warning' : 'text-accent-info'}`}>
                      {count} / {threshold} steps
                      {isTriggered && ' → TRIGGER'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isTriggered ? 'bg-accent-warning' : 'bg-accent-info'
                      }`}
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-text-muted">
            No candidate neighbors currently being tracked
          </div>
        )}
        <div className="mt-2 p-2 bg-bg-tertiary/30 rounded text-[10px] text-text-muted">
          <strong className="text-text-secondary">How it works:</strong> When a neighbor's R<sub>n</sub> {'>>'} R<sub>s</sub> 
          for <strong>T<sub>reselection</sub></strong> consecutive steps, cell reselection is triggered. 
          This prevents ping-pong reselections in fluctuating signal conditions.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-bg-tertiary">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-secondary">Q<sub>rxlevmin</sub></span>
            <span className="font-mono text-text-primary">{config?.q_rxlevmin || -128} dBm</span>
          </div>
          <input
            type="range"
            min="-150"
            max="-110"
            step="1"
            value={config?.q_rxlevmin || -128}
            onChange={(e) => onConfigChange({ q_rxlevmin: Number(e.target.value) })}
            className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-secondary">Q<sub>hyst</sub></span>
            <span className="font-mono text-text-primary">{config?.q_hyst || 2} dB</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={config?.q_hyst || 2}
            onChange={(e) => onConfigChange({ q_hyst: Number(e.target.value) })}
            className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
