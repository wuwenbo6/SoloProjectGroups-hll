import { Play, Pause } from 'lucide-react'
import { usePDStore } from '../store/pd-store'
import type { SimulationScenario } from '../types/pd'

export function SimulationControl() {
  const {
    scenarios,
    currentScenario,
    simulationSpeed,
    isSimulating,
    setCurrentScenario,
    setSimulationSpeed,
    setSimulating,
  } = usePDStore()

  const handleToggleSimulation = () => {
    setSimulating(!isSimulating)
  }

  return (
    <div className="h-20 bg-[#1A2733] border-t border-[#2A3B4C] px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">场景:</span>
          <select
            value={currentScenario}
            onChange={(e) => setCurrentScenario(e.target.value)}
            disabled={isSimulating}
            className="bg-[#0F1923] border border-[#2A3B4C] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF] disabled:opacity-50 min-w-[200px]"
          >
            {scenarios.map((scenario: SimulationScenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-gray-500 max-w-[300px]">
          {scenarios.find((s: SimulationScenario) => s.id === currentScenario)?.description}
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">速度:</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={simulationSpeed}
              onChange={(e) => setSimulationSpeed(Number(e.target.value))}
              className="w-24 h-1 bg-[#2A3B4C] rounded-lg appearance-none cursor-pointer accent-[#00D4FF]"
            />
            <span className="text-sm font-mono text-[#00D4FF] w-10">{simulationSpeed}x</span>
          </div>
        </div>
        <button
          onClick={handleToggleSimulation}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
            isSimulating
              ? 'bg-[#FF4757] text-white glow-red hover:bg-[#ff3344]'
              : 'bg-[#00FF88] text-[#0F1923] glow-green hover:bg-[#00dd77]'
          }`}
        >
          {isSimulating ? (
            <>
              <Pause className="w-5 h-5" />
              停止
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              开始
            </>
          )}
        </button>
      </div>
    </div>
  )
}
