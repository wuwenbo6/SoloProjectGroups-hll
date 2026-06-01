import { useState } from 'react';
import {
  Layers,
  Scissors,
  Camera,
  Settings,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Boxes,
  GitBranch,
  Palette,
} from 'lucide-react';
import { useVolumeStore } from '../store/useVolumeStore';
import { WINDOW_PRESETS, WindowPreset } from '../types';
import STLExportPanel from './STLExportPanel';
import FusionPanel from './FusionPanel';

type TabType = 'basic' | 'fusion' | 'stl' | 'curve';

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-700">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 text-slate-200">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {isOpen && <div className="p-3 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step = 1, onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-mono">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-blue-500
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:hover:bg-blue-400"
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function Toggle({ label, enabled, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-slate-400">{label}</span>
      <div
        className={`w-8 h-4 rounded-full transition-colors relative ${
          enabled ? 'bg-blue-500' : 'bg-slate-600'
        }`}
        onClick={() => onChange(!enabled)}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  );
}

function BasicTab() {
  const {
    renderParams,
    setRenderParams,
    clipPlanes,
    setClipPlane,
    showAxes,
    setShowAxes,
    showBoundingBox,
    setShowBoundingBox,
    volume,
  } = useVolumeStore();

  const applyPreset = (preset: WindowPreset) => {
    setRenderParams({
      windowWidth: preset.windowWidth,
      windowLevel: preset.windowLevel,
    });
  };

  const hasVolume = volume.loaded && volume.meta;

  return (
    <>
      <Section title="渲染参数" icon={<Layers className="w-4 h-4" />}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {WINDOW_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <Slider
            label="窗宽 (WW)"
            value={renderParams.windowWidth}
            min={100}
            max={4000}
            step={10}
            onChange={(v) => setRenderParams({ windowWidth: v })}
          />

          <Slider
            label="窗位 (WL)"
            value={renderParams.windowLevel}
            min={-1000}
            max={1000}
            step={10}
            onChange={(v) => setRenderParams({ windowLevel: v })}
          />

          <Slider
            label="不透明度阈值"
            value={renderParams.opacityThreshold}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setRenderParams({ opacityThreshold: v })}
          />

          <Slider
            label="采样步长"
            value={renderParams.sampleDistance}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => setRenderParams({ sampleDistance: v })}
          />

          <div className="space-y-1">
            <span className="text-xs text-slate-400">渲染模式</span>
            <div className="flex gap-2">
              {(['vr', 'mip'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRenderParams({ renderMode: mode })}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    renderParams.renderMode === mode
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {mode === 'vr' ? '体绘制' : '最大密度'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="裁剪平面" icon={<Scissors className="w-4 h-4" />}>
        <div className="space-y-4">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium ${
                    axis === 'x'
                      ? 'text-red-400'
                      : axis === 'y'
                      ? 'text-green-400'
                      : 'text-blue-400'
                  }`}
                >
                  {axis.toUpperCase()} 轴平面
                </span>
                <button
                  onClick={() => setClipPlane(axis, { enabled: !clipPlanes[axis].enabled })}
                  className="p-1 hover:bg-slate-700 rounded"
                >
                  {clipPlanes[axis].enabled ? (
                    <Eye className="w-3.5 h-3.5 text-slate-300" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
              </div>
              <Slider
                label="位置"
                value={clipPlanes[axis].position}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setClipPlane(axis, { position: v })}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="视图设置" icon={<Camera className="w-4 h-4" />}>
        <div className="space-y-2">
          <Toggle label="显示坐标轴" enabled={showAxes} onChange={setShowAxes} />
          <Toggle
            label="显示边界框"
            enabled={showBoundingBox}
            onChange={setShowBoundingBox}
          />
        </div>
      </Section>

      <Section title="体数据信息" icon={<Settings className="w-4 h-4" />} defaultOpen={!!hasVolume}>
        {hasVolume ? (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">尺寸</span>
              <span className="text-slate-300 font-mono">
                {volume.meta!.dimensions.x} × {volume.meta!.dimensions.y} × {volume.meta!.dimensions.z}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">体素间距</span>
              <span className="text-slate-300 font-mono">
                {volume.meta!.spacing.x.toFixed(2)} × {volume.meta!.spacing.y.toFixed(2)} ×{' '}
                {volume.meta!.spacing.z.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">值范围</span>
              <span className="text-slate-300 font-mono">
                {volume.meta!.minValue} ~ {volume.meta!.maxValue}
              </span>
            </div>
            {volume.meta!.patientInfo.name && (
              <div className="flex justify-between">
                <span className="text-slate-400">患者</span>
                <span className="text-slate-300 truncate ml-2">
                  {volume.meta!.patientInfo.name}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500 text-center py-2">
            暂未加载体数据
          </div>
        )}
      </Section>
    </>
  );
}

export default function ControlPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('basic');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'basic', label: '基础', icon: <Settings className="w-4 h-4" /> },
    { id: 'fusion', label: '融合', icon: <Palette className="w-4 h-4" /> },
    { id: 'stl', label: '导出', icon: <Boxes className="w-4 h-4" /> },
    { id: 'curve', label: '曲线', icon: <GitBranch className="w-4 h-4" /> },
  ];

  return (
    <div className="w-64 bg-slate-800 h-full flex flex-col">
      <div className="flex border-b border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-slate-700 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
            title={tab.label}
          >
            {tab.icon}
            <span className="text-[10px]">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'basic' && <BasicTab />}
        {activeTab === 'fusion' && <FusionPanel />}
        {activeTab === 'stl' && <STLExportPanel />}
        {activeTab === 'curve' && (
          <div className="p-4">
            <h3 className="text-white font-medium text-sm mb-4">沿血管曲线重建</h3>
            <p className="text-slate-400 text-xs">
              在3D视图中点击设置控制点，系统将自动沿路径提取曲面并展开。
            </p>
            <div className="mt-4 p-3 bg-slate-700/50 rounded">
              <p className="text-slate-300 text-xs">
                💡 提示：按住 Ctrl 键在多平面视图中点击添加控制点
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
