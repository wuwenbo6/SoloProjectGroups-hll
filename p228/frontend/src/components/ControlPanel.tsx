import { useState } from 'react';
import {
  HardDrive,
  MapPin,
  AlertCircle,
  Activity,
  Info,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import type { SlotStatus, LedType, LedAction, LedMode } from '@/types';

interface ControlPanelProps {
  slot: SlotStatus | null;
  onSetLed: (slot: number, type: LedType, action: LedAction) => Promise<void>;
  onSetLedMode: (slot: number, type: LedType, mode: LedMode) => Promise<void>;
  ledModes: LedMode[];
  ledModeDescriptions: Record<LedMode, string>;
}

const MODE_LABELS: Record<LedMode, string> = {
  'off': '熄灭',
  'on': '常亮',
  'blink': '闪灯',
  'flash': '爆闪',
};

export function ControlPanel({ 
  slot, 
  onSetLed, 
  onSetLedMode, 
  ledModes,
  ledModeDescriptions 
}: ControlPanelProps) {
  const [controlling, setControlling] = useState<LedType | null>(null);
  const [expandedMode, setExpandedMode] = useState<LedType | null>(null);

  const handleLedToggle = async (type: LedType) => {
    if (!slot) return;

    const currentState = slot[type];
    const action: LedAction = currentState !== 'off' ? 'off' : 'on';

    try {
      setControlling(type);
      await onSetLed(slot.slot, type, action);
    } catch (error) {
      console.error(`Failed to set ${type} LED:`, error);
    } finally {
      setControlling(null);
    }
  };

  const handleModeChange = async (type: LedType, mode: LedMode) => {
    if (!slot) return;

    try {
      setControlling(type);
      await onSetLedMode(slot.slot, type, mode);
      setExpandedMode(null);
    } catch (error) {
      console.error(`Failed to set ${type} LED mode:`, error);
    } finally {
      setControlling(null);
    }
  };

  if (!slot) {
    return (
      <div className="bg-dark-100 rounded-2xl p-5 border border-dark-300">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-dark-200 rounded-full flex items-center justify-center mb-4">
            <Info className="w-8 h-8 text-dark-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">选择槽位</h3>
          <p className="text-sm text-dark-500">点击任意槽位查看详情并控制LED灯</p>
        </div>
      </div>
    );
  }

  const ledControls = [
    {
      type: 'locate' as LedType,
      label: '定位灯',
      icon: MapPin,
      activeColor: 'text-warning',
      activeBg: 'bg-warning/20',
      activeBorder: 'border-warning/50',
      description: '快速定位物理槽位',
    },
    {
      type: 'fault' as LedType,
      label: '错误灯',
      icon: AlertCircle,
      activeColor: 'text-danger',
      activeBg: 'bg-danger/20',
      activeBorder: 'border-danger/50',
      description: '标记故障硬盘',
    },
    {
      type: 'active' as LedType,
      label: '活动灯',
      icon: Activity,
      activeColor: 'text-success',
      activeBg: 'bg-success/20',
      activeBorder: 'border-success/50',
      description: '显示硬盘活动状态',
    },
  ];

  return (
    <div className="bg-dark-100 rounded-2xl p-5 border border-dark-300 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-dark-300">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            slot.present ? 'bg-primary-500/20' : 'bg-dark-200'
          }`}
        >
          <HardDrive
            className={`w-6 h-6 ${slot.present ? 'text-primary-400' : 'text-dark-400'}`}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            槽位 #{String(slot.slot).padStart(2, '0')}
          </h3>
          <span
            className={`text-sm ${
              slot.present ? 'text-success' : 'text-dark-400'
            }`}
          >
            {slot.present ? '硬盘已安装' : '槽位空闲'}
          </span>
        </div>
      </div>

      {slot.present && (
        <div className="space-y-3 bg-dark-200/50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-dark-500 mb-2">设备信息</h4>
          {slot.device && (
            <div className="flex justify-between text-sm">
              <span className="text-dark-500">设备</span>
              <span className="font-mono text-white">{slot.device}</span>
            </div>
          )}
          {slot.model && (
            <div className="flex justify-between text-sm">
              <span className="text-dark-500">型号</span>
              <span className="font-mono text-white">{slot.model}</span>
            </div>
          )}
          {slot.serial && (
            <div className="flex justify-between text-sm">
              <span className="text-dark-500">序列号</span>
              <span className="font-mono text-white">{slot.serial}</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-dark-500">LED 控制</h4>
        {ledControls.map((control) => {
          const Icon = control.icon;
          const currentMode = slot[control.type];
          const isActive = currentMode !== 'off';
          const isControlling = controlling === control.type;
          const isExpanded = expandedMode === control.type;

          return (
            <div key={control.type} className="space-y-2">
              <button
                onClick={() => handleLedToggle(control.type)}
                disabled={isControlling || !slot.present}
                className={`
                  w-full p-4 rounded-xl border-2 transition-all duration-300
                  flex items-center justify-between
                  ${isActive
                    ? `${control.activeBg} ${control.activeBorder}`
                    : 'bg-dark-200/50 border-dark-300 hover:border-dark-400'
                  }
                  ${!slot.present || isControlling ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01]'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isActive ? control.activeBg : 'bg-dark-300'
                    }`}
                  >
                    {isControlling ? (
                      <Loader2 className={`w-5 h-5 animate-spin ${control.activeColor}`} />
                    ) : (
                      <Icon
                        className={`w-5 h-5 ${isActive ? control.activeColor : 'text-dark-400'}`}
                      />
                    )}
                  </div>
                  <div className="text-left">
                    <p
                      className={`font-medium ${
                        isActive ? control.activeColor : 'text-white'
                      }`}
                    >
                      {control.label}
                    </p>
                    <p className="text-xs text-dark-500">{control.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isActive ? control.activeColor : 'text-dark-400'
                    }`}
                  >
                    {MODE_LABELS[currentMode]}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMode(isExpanded ? null : control.type);
                    }}
                    disabled={!slot.present}
                    className="p-1 rounded hover:bg-dark-300 transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 ${isExpanded ? 'rotate-180' : ''} transition-transform`} />
                  </button>
                </div>
              </button>

              {isExpanded && slot.present && (
                <div className="bg-dark-200 rounded-lg p-2 grid grid-cols-2 gap-2">
                  {ledModes.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleModeChange(control.type, mode)}
                      disabled={isControlling}
                      className={`
                        px-3 py-2 rounded-lg text-sm transition-all
                        ${currentMode === mode
                          ? 'bg-primary-500 text-white'
                          : 'bg-dark-300 text-dark-500 hover:bg-dark-400 hover:text-white'
                        }
                      `}
                      title={ledModeDescriptions[mode]}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
