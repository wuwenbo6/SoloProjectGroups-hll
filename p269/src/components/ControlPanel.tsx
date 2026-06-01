import React, { useCallback } from 'react';
import { Play, Square, RotateCcw, Settings, Filter } from 'lucide-react';
import { useDmrStore } from '@/store/useDmrStore';
import { CALL_TYPE_LABELS, CALL_TYPE_COLORS } from '@/types';
import type { CallType, DmrSlot, DemodulationConfig } from '@/types';

interface ControlPanelProps {
  onStart: () => void;
  onCancel: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ onStart, onCancel }) => {
  const {
    fileInfo,
    config,
    isAnalyzing,
    progress,
    result,
    setConfig,
    selectedCallType,
    selectedSlot,
    setSelectedCallType,
    setSelectedSlot,
    reset,
  } = useDmrStore();

  const handleConfigChange = useCallback((key: keyof DemodulationConfig, value: number) => {
    setConfig({ [key]: value });
  }, [setConfig]);

  const handleReset = useCallback(() => {
    if (!isAnalyzing) {
      reset();
    }
  }, [reset, isAnalyzing]);

  const phaseLabels: Record<string, string> = {
    reading: '读取文件',
    demodulating: '4FSK 解调',
    parsing: '协议解析',
    complete: '分析完成',
  };

  const canStart = fileInfo && !isAnalyzing;

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700 space-y-6">
      <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
        <Settings className="w-5 h-5 text-cyan-400" />
        分析控制
      </h2>

      {isAnalyzing && progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{phaseLabels[progress.phase]}</span>
            <span className="text-cyan-400 font-mono">{progress.progress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300 rounded-full"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          解调参数
        </h3>

        <div className="space-y-3">
          <SliderInput
            label="符号率 (Hz)"
            value={config.symbolRate}
            min={2400}
            max={9600}
            step={100}
            disabled={isAnalyzing}
            onChange={(v) => handleConfigChange('symbolRate', v)}
          />
          <SliderInput
            label="频偏 (Hz)"
            value={config.frequencyDeviation}
            min={1200}
            max={4800}
            step={100}
            disabled={isAnalyzing}
            onChange={(v) => handleConfigChange('frequencyDeviation', v)}
          />
          <SliderInput
            label="中心频率偏移 (Hz)"
            value={config.centerFrequency}
            min={-5000}
            max={5000}
            step={10}
            disabled={isAnalyzing}
            onChange={(v) => handleConfigChange('centerFrequency', v)}
          />
        </div>
      </div>

      {result && (
        <div className="space-y-4 pt-4 border-t border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            筛选过滤
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-2 block">呼叫类型</label>
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={selectedCallType === 'all'}
                  onClick={() => setSelectedCallType('all')}
                  color="#6b7280"
                >
                  全部
                </FilterButton>
                {(Object.keys(CALL_TYPE_LABELS) as CallType[]).map((type) => (
                  <FilterButton
                    key={type}
                    active={selectedCallType === type}
                    onClick={() => setSelectedCallType(type)}
                    color={CALL_TYPE_COLORS[type]}
                  >
                    {CALL_TYPE_LABELS[type]}
                  </FilterButton>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-2 block">时隙</label>
              <div className="flex gap-2">
                <FilterButton
                  active={selectedSlot === 'all'}
                  onClick={() => setSelectedSlot('all')}
                  color="#6b7280"
                >
                  全部
                </FilterButton>
                {([1, 2] as DmrSlot[]).map((slot) => (
                  <FilterButton
                    key={slot}
                    active={selectedSlot === slot}
                    onClick={() => setSelectedSlot(slot)}
                    color="#00d4ff"
                  >
                    时隙 {slot}
                  </FilterButton>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {!isAnalyzing ? (
          <>
            <button
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                canStart
                  ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-gray-900 hover:from-cyan-400 hover:to-cyan-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
              onClick={onStart}
              disabled={!canStart}
            >
              <Play className="w-5 h-5" />
              开始分析
            </button>
            <button
              className={`p-3 rounded-lg transition-all duration-200 ${
                fileInfo && !isAnalyzing
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              onClick={handleReset}
              disabled={!fileInfo || isAnalyzing}
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400 shadow-lg shadow-orange-500/20 transition-all duration-200"
            onClick={onCancel}
          >
            <Square className="w-5 h-5" />
            取消分析
          </button>
        )}
      </div>

      {!fileInfo && !isAnalyzing && (
        <p className="text-xs text-gray-500 text-center">
          请先导入 WAV 文件
        </p>
      )}
    </div>
  );
};

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const SliderInput: React.FC<SliderInputProps> = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">{label}</label>
        <span className="text-xs font-mono text-cyan-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-cyan-400
                   [&::-webkit-slider-thumb]:shadow-lg
                   [&::-webkit-slider-thumb]:shadow-cyan-400/50
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:transition-transform
                   [&::-webkit-slider-thumb]:hover:scale-110
                   disabled:opacity-50
                   disabled:cursor-not-allowed"
      />
    </div>
  );
};

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}

const FilterButton: React.FC<FilterButtonProps> = ({ active, onClick, color, children }) => {
  return (
    <button
      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all duration-200 ${
        active
          ? 'text-white shadow-md'
          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
      }`}
      style={active ? { backgroundColor: color, boxShadow: `0 4px 12px ${color}40` } : {}}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
