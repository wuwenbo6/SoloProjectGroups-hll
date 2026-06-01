import { useEffect } from 'react';
import { useSimulationStore } from '@/store';
import { CellMap } from '@/components/CellMap';
import { CellPanel } from '@/components/CellPanel';
import { SCriterionPanel } from '@/components/SCriterionPanel';
import { SimulationControls } from '@/components/SimulationControls';
import { LogPanel } from '@/components/LogPanel';
import { Radio, Zap } from 'lucide-react';

export default function Home() {
  const {
    cells,
    servingPci,
    mapSize,
    status,
    logs,
    fetchCells,
    fetchStatus,
    fetchLogs,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    stepSimulation,
    updateConfig,
    startPolling,
    stopPolling,
  } = useSimulationStore();

  useEffect(() => {
    fetchCells();
    fetchStatus();
    fetchLogs();
  }, [fetchCells, fetchStatus, fetchLogs]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const uePosition = status?.ue_position || { x: 0, y: 0 };

  const handleStart = async () => {
    await startSimulation();
    startPolling(status?.config.speed || 1000);
  };

  const handlePause = async () => {
    await pauseSimulation();
  };

  const handleReset = async () => {
    stopPolling();
    await resetSimulation();
    startPolling();
  };

  const handleStep = async () => {
    await stepSimulation();
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="bg-bg-secondary/80 backdrop-blur-sm border-b border-bg-tertiary px-6 py-4">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-primary/20 rounded-lg flex items-center justify-center">
              <Radio className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-text-primary">
                NB-IoT Cell Reselection Simulator
              </h1>
              <p className="text-xs text-text-secondary">
                S-Criterion Based Neighbor Cell Measurement & Reselection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-accent-primary" />
              <span className="text-text-secondary">Serving Cell:</span>
              <span className="font-mono font-bold text-accent-primary">
                PCI {servingPci}
              </span>
            </div>
            <div className="h-6 w-px bg-bg-tertiary" />
            <div className="text-sm">
              <span className="text-text-secondary">Step:</span>{' '}
              <span className="font-mono text-text-primary">{status?.step_count || 0}</span>
              <span className="text-text-secondary mx-2">|</span>
              <span className="text-text-secondary">Reselections:</span>{' '}
              <span className="font-mono text-accent-warning">
                {status?.reselection_count || 0}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8 space-y-6">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8">
                <CellMap
                  cells={cells}
                  uePosition={uePosition}
                  servingPci={servingPci}
                  mapSize={mapSize}
                />
              </div>
              <div className="col-span-4">
                <CellPanel cells={cells} servingPci={servingPci} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <SimulationControls
                status={status}
                onStart={handleStart}
                onPause={handlePause}
                onReset={handleReset}
                onStep={handleStep}
                onConfigChange={updateConfig}
              />
              <SCriterionPanel cells={cells} />
            </div>
          </div>
          <div className="col-span-4">
            <LogPanel logs={logs} />
          </div>
        </div>
      </main>

      <footer className="bg-bg-secondary/50 border-t border-bg-tertiary px-6 py-3 mt-6">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between text-xs text-text-muted">
          <div>
            S<sub>rxlev</sub> = Q<sub>rxlevmeas</sub> - (Q<sub>rxlevmin</sub> + Q<sub>rxlevminoffset</sub>) - P<sub>compensation</sub>
          </div>
          <div>
            R<sub>s</sub> = Q<sub>meas,s</sub> + Q<sub>hyst</sub> &nbsp;&nbsp;|&nbsp;&nbsp;
            R<sub>n</sub> = Q<sub>meas,n</sub> - Q<sub>offset</sub>
          </div>
        </div>
      </footer>
    </div>
  );
}
