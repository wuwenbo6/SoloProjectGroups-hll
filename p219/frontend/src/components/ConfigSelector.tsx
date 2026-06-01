import React from 'react';
import { MCUConfig, ProgrammerConfig } from '../types';

interface ConfigSelectorProps {
  mcus: MCUConfig[];
  programmers: ProgrammerConfig[];
  selectedMcu: string;
  selectedProgrammer: string;
  port: string;
  baudRate: string;
  bitClock: string;
  verifySignature: boolean;
  onMcuChange: (value: string) => void;
  onProgrammerChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onBaudRateChange: (value: string) => void;
  onBitClockChange: (value: string) => void;
  onVerifySignatureChange: (value: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}

const BIT_CLOCK_OPTIONS = [
  { value: '', label: '默认' },
  { value: '1', label: '1 µs (快速)' },
  { value: '2', label: '2 µs' },
  { value: '5', label: '5 µs' },
  { value: '10', label: '10 µs (推荐)' },
  { value: '20', label: '20 µs' },
  { value: '50', label: '50 µs' },
  { value: '100', label: '100 µs (慢速)' },
];

export function ConfigSelector({
  mcus,
  programmers,
  selectedMcu,
  selectedProgrammer,
  port,
  baudRate,
  bitClock,
  verifySignature,
  onMcuChange,
  onProgrammerChange,
  onPortChange,
  onBaudRateChange,
  onBitClockChange,
  onVerifySignatureChange,
  disabled,
  compact,
}: ConfigSelectorProps) {
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">
              目标芯片
            </label>
            <select
              value={selectedMcu}
              onChange={(e) => onMcuChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-white text-sm
                focus:outline-none focus:border-accent-blue transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                appearance-none cursor-pointer"
            >
              <option value="">选择芯片...</option>
              {mcus.map((mcu) => (
                <option key={mcu.id} value={mcu.id}>
                  {mcu.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">
              烧录器
            </label>
            <select
              value={selectedProgrammer}
              onChange={(e) => onProgrammerChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-white text-sm
                focus:outline-none focus:border-accent-blue transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                appearance-none cursor-pointer"
            >
              <option value="">选择烧录器...</option>
              {programmers.map((prog) => (
                <option key={prog.id} value={prog.id}>
                  {prog.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">
              端口 (可选)
            </label>
            <input
              type="text"
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              disabled={disabled}
              placeholder="端口"
              className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-white text-sm
                focus:outline-none focus:border-accent-blue transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                placeholder-gray-600"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">
              ISP 时钟
            </label>
            <select
              value={bitClock}
              onChange={(e) => onBitClockChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-white text-sm
                focus:outline-none focus:border-accent-blue transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                appearance-none cursor-pointer"
            >
              {BIT_CLOCK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            目标芯片
          </label>
          <select
            value={selectedMcu}
            onChange={(e) => onMcuChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-white 
              focus:outline-none focus:border-accent-blue transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              appearance-none cursor-pointer"
          >
            <option value="">选择芯片...</option>
            {mcus.map((mcu) => (
              <option key={mcu.id} value={mcu.id}>
                {mcu.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            烧录器
          </label>
          <select
            value={selectedProgrammer}
            onChange={(e) => onProgrammerChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-white 
              focus:outline-none focus:border-accent-blue transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              appearance-none cursor-pointer"
          >
            <option value="">选择烧录器...</option>
            {programmers.map((prog) => (
              <option key={prog.id} value={prog.id}>
                {prog.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            端口 (可选)
          </label>
          <input
            type="text"
            value={port}
            onChange={(e) => onPortChange(e.target.value)}
            disabled={disabled}
            placeholder="例如: /dev/ttyUSB0 或 COM3"
            className="w-full px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-white 
              focus:outline-none focus:border-accent-blue transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder-gray-600"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            波特率 (可选)
          </label>
          <input
            type="number"
            value={baudRate}
            onChange={(e) => onBaudRateChange(e.target.value)}
            disabled={disabled}
            placeholder="例如: 115200"
            className="w-full px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-white 
              focus:outline-none focus:border-accent-blue transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder-gray-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            ISP 时钟 (降低时钟)
          </label>
          <select
            value={bitClock}
            onChange={(e) => onBitClockChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 bg-dark-card border border-dark-border rounded-lg text-white 
              focus:outline-none focus:border-accent-blue transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              appearance-none cursor-pointer"
          >
            {BIT_CLOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            降低 ISP 时钟可提高烧录稳定性，推荐使用 10 µs
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            高级选项
          </label>
          <div className="flex items-center gap-3 p-3 bg-dark-card border border-dark-border rounded-lg">
            <input
              type="checkbox"
              id="verifySignature"
              checked={verifySignature}
              onChange={(e) => onVerifySignatureChange(e.target.checked)}
              disabled={disabled}
              className="w-4 h-4 rounded border-gray-600 bg-dark-card text-accent-blue focus:ring-accent-blue"
            />
            <label htmlFor="verifySignature" className="text-sm text-gray-300 cursor-pointer">
              烧录前验证芯片签名
            </label>
          </div>
          <p className="text-xs text-gray-500">
            读取芯片签名并与预期对比，不匹配则告警并终止
          </p>
        </div>
      </div>
    </div>
  );
}
