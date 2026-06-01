import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { StatCards } from '@/components/StatCards';
import { SlotGrid } from '@/components/SlotGrid';
import { TempPanel } from '@/components/TempPanel';
import { ControlPanel } from '@/components/ControlPanel';
import { useApi } from '@/hooks/useApi';
import { useAppStore } from '@/store';
import type { LedMode, LedModeInfo } from '@/types';

const LED_MODE_DESCRIPTIONS: Record<LedMode, string> = {
  'off': '关闭LED灯，无任何显示',
  'on': 'LED常亮，持续显示',
  'blink': 'LED闪烁，约1Hz频率',
  'flash': 'LED快速闪烁，约2Hz频率',
};

function App() {
  const {
    status,
    loading,
    error,
    autoRefresh,
    setAutoRefresh,
    fetchStatus,
    setLed,
    setLedMode,
    fetchLedModes,
    downloadDiagnostics,
  } = useApi();

  const [ledModeInfo, setLedModeInfo] = useState<LedModeInfo | null>(null);

  const { selectedSlot, setSelectedSlot, setSelectedSlotData } = useAppStore();

  const selectedSlotData = useMemo(() => {
    if (!status || selectedSlot === null) return null;
    return status.slots.find((s) => s.slot === selectedSlot) || null;
  }, [status, selectedSlot]);

  useEffect(() => {
    setSelectedSlotData(selectedSlotData);
  }, [selectedSlotData, setSelectedSlotData]);

  useEffect(() => {
    const loadLedModes = async () => {
      try {
        const modes = await fetchLedModes();
        setLedModeInfo(modes);
      } catch (e) {
        console.error('Failed to fetch LED modes:', e);
      }
    };
    loadLedModes();
  }, [fetchLedModes]);

  const handleExportDiagnostics = async (format: 'json' | 'text') => {
    try {
      await downloadDiagnostics(format);
    } catch (e) {
      console.error('Failed to export diagnostics:', e);
    }
  };

  if (error && !status) {
    return (
      <div className="min-h-screen bg-[#0D1117] bg-gradient-radial bg-grid-pattern flex items-center justify-center">
        <div className="bg-dark-100 border border-dark-300 rounded-2xl p-8 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">连接失败</h2>
          <p className="text-dark-500 mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            重试连接
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-[#0D1117] bg-gradient-radial bg-grid-pattern flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
          <p className="text-dark-500">正在连接到 SAS Backplane...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] bg-gradient-radial bg-grid-pattern">
      <Header
        loading={loading}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={fetchStatus}
        simulationMode={status.simulation_mode}
        enclosure={status.enclosure}
        updatedAt={status.updated_at}
        onExportDiagnostics={handleExportDiagnostics}
      />

      <main className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-danger" />
            <span className="text-danger">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <StatCards
            slots={status.slots}
            temperatures={status.temperatures}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <SlotGrid
                slots={status.slots}
                selectedSlot={selectedSlot}
                onSlotSelect={setSelectedSlot}
              />
            </div>

            <div className="space-y-6">
              <TempPanel sensors={status.temperatures} />
              <ControlPanel 
                slot={selectedSlotData} 
                onSetLed={setLed}
                onSetLedMode={setLedMode}
                ledModes={ledModeInfo?.modes || ['off', 'on', 'blink', 'flash']}
                ledModeDescriptions={LED_MODE_DESCRIPTIONS}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
