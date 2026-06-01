import React, { useState } from 'react';
import { Link2, Plus, X, GripVertical, Cpu, ArrowRight, Info, Download } from 'lucide-react';
import { useBSDLStore } from '../hooks/useBSDLStore';
import { ChipInfo } from '../types';
import { downloadChainConfig } from '../simulator/boundaryScanSimulator';

export const JTAGVisualizer: React.FC = () => {
  const { chips, jtagChain, addToChain, removeFromChain, reorderChain } = useBSDLStore();

  const handleExportConfig = () => {
    if (jtagChain) {
      downloadChainConfig(jtagChain, `jtag_chain_${Date.now()}`);
    }
  };
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const availableChips = chips.filter(
    chip => !jtagChain?.devices.some(d => d.id === chip.id)
  );

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    reorderChain(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  if (!jtagChain || jtagChain.devices.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">JTAG 链可视化</h3>
        </div>
        
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-slate-700/50 mb-4">
            <Link2 className="w-12 h-12 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-2">JTAG 链为空</p>
          <p className="text-sm text-slate-500 mb-4">
            从下方添加芯片到 JTAG 链中
          </p>
          
          {availableChips.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {availableChips.map(chip => (
                <button
                  key={chip.id}
                  onClick={() => addToChain(chip.id)}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 
                             border border-slate-600 rounded-lg text-sm text-slate-300
                             hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-cyan-400
                             transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  <span className="font-mono">{chip.name}</span>
                </button>
              ))}
            </div>
          )}
          
          {availableChips.length === 0 && chips.length === 0 && (
            <p className="text-sm text-slate-500">
              请先上传 BSDL 文件
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">JTAG 链可视化</h3>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">
            设备: <span className="text-cyan-400 font-mono">{jtagChain.devices.length}</span>
          </span>
          <span className="text-slate-400">
            总 IR 长度: <span className="text-emerald-400 font-mono">{jtagChain.totalIRLength} bits</span>
          </span>
          <button
            onClick={handleExportConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30
                       rounded-lg text-sm text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出配置
          </button>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-4">
        <svg
          className="w-full min-w-[600px]"
          height="200"
          viewBox={`0 0 ${Math.max(600, jtagChain.devices.length * 180 + 100)} 200`}
        >
          <defs>
            <linearGradient id="signalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <text x="20" y="30" className="text-xs fill-slate-500 font-mono">TDI</text>
          <line x1="50" y1="30" x2="80" y2="30" stroke="#06b6d4" strokeWidth="2" />
          
          {jtagChain.devices.map((device, index) => {
            const x = 100 + index * 170;
            const isHovered = hoveredDevice === device.id;
            
            return (
              <g key={device.id}>
                {index > 0 && (
                  <line
                    x1={x - 20}
                    y1="100"
                    x2={x - 60}
                    y2="100"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    markerEnd="url(#arrow)"
                  />
                )}
                
                <line x1="80" y1="30" x2="100" y2="100" stroke="#06b6d4" strokeWidth="2" />
                
                <rect
                  x={x - 50}
                  y={isHovered ? 55 : 60}
                  width="100"
                  height="80"
                  rx="8"
                  fill={isHovered ? '#1e3a5f' : '#1e293b'}
                  stroke={isHovered ? '#06b6d4' : '#475569'}
                  strokeWidth={isHovered ? 2 : 1}
                  filter={isHovered ? 'url(#glow)' : undefined}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredDevice(device.id)}
                  onMouseLeave={() => setHoveredDevice(null)}
                />
                
                <text
                  x={x}
                  y="95"
                  textAnchor="middle"
                  className="text-sm font-mono fill-slate-100 font-semibold"
                >
                  {device.name.length > 10 ? device.name.slice(0, 10) + '...' : device.name}
                </text>
                <text
                  x={x}
                  y="115"
                  textAnchor="middle"
                  className="text-xs fill-slate-400"
                >
                  IR: {device.irLength}bit
                </text>
                <text
                  x={x}
                  y="130"
                  textAnchor="middle"
                  className="text-xs fill-slate-500"
                >
                  #{index + 1}
                </text>

                <rect x={x - 55} y="70" width="8" height="4" fill="#06b6d4" rx="1" />
                <rect x={x + 47} y="70" width="8" height="4" fill="#06b6d4" rx="1" />
                <rect x={x - 55} y="85" width="8" height="4" fill="#64748b" rx="1" />
                <rect x={x + 47} y="85" width="8" height="4" fill="#64748b" rx="1" />
              </g>
            );
          })}
          
          <line
            x1={100 + jtagChain.devices.length * 170 - 60}
            y1="100"
            x2={100 + jtagChain.devices.length * 170 - 20}
            y2="30"
            stroke="#06b6d4"
            strokeWidth="2"
          />
          <line
            x1={100 + jtagChain.devices.length * 170 - 20}
            y1="30"
            x2={100 + jtagChain.devices.length * 170 + 10}
            y2="30"
            stroke="#06b6d4"
            strokeWidth="2"
          />
          <text
            x={100 + jtagChain.devices.length * 170 + 15}
            y="35"
            className="text-xs fill-slate-500 font-mono"
          >
            TDO
          </text>
        </svg>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700">
        <h4 className="text-sm font-medium text-slate-400 mb-3">链设备顺序（可拖拽排序）</h4>
        <div className="space-y-2">
          {jtagChain.devices.map((device, index) => (
            <ChainDeviceItem
              key={device.id}
              device={device}
              index={index}
              onRemove={() => removeFromChain(device.id)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      {availableChips.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-400 mb-3">可添加的设备</h4>
          <div className="flex flex-wrap gap-2">
            {availableChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => addToChain(chip.id)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 
                           border border-slate-600 rounded-lg text-sm text-slate-400
                           hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-cyan-400
                           transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span className="font-mono">{chip.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hoveredDevice && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <DeviceTooltip device={jtagChain.devices.find(d => d.id === hoveredDevice)} />
        </div>
      )}
    </div>
  );
};

interface ChainDeviceItemProps {
  device: ChipInfo;
  index: number;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const ChainDeviceItem: React.FC<ChainDeviceItemProps> = ({
  device,
  index,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd
}) => (
  <div
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDragEnd={onDragEnd}
    className="flex items-center gap-3 p-3 bg-slate-700/30 border border-slate-600 
               rounded-lg cursor-move hover:bg-slate-700/50 hover:border-slate-500
               transition-all duration-200"
  >
    <GripVertical className="w-4 h-4 text-slate-500" />
    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-mono">
      {index + 1}
    </div>
    <Cpu className="w-4 h-4 text-slate-400" />
    <span className="flex-1 font-mono text-slate-200">{device.name}</span>
    <span className="text-xs text-slate-400">
      IR: {device.irLength}bit
    </span>
    <button
      onClick={onRemove}
      className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400
                 transition-colors pointer-events-auto"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

const DeviceTooltip: React.FC<{ device?: ChipInfo }> = ({ device }) => {
  if (!device) return null;
  
  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                    pointer-events-none bg-slate-900 border border-slate-600 rounded-lg
                    shadow-xl p-4 min-w-[200px] z-50">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-cyan-400" />
        <span className="font-mono text-slate-100 font-semibold">{device.name}</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">文件:</span>
          <span className="text-slate-200 font-mono text-xs">{device.fileName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">IR 长度:</span>
          <span className="text-cyan-400 font-mono">{device.irLength} bits</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">引脚数:</span>
          <span className="text-emerald-400 font-mono">{device.pins.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">BS单元:</span>
          <span className="text-amber-400 font-mono">{device.boundaryCells.length}</span>
        </div>
        {device.idcode && (
          <div className="flex justify-between">
            <span className="text-slate-400">IDCODE:</span>
            <span className="text-violet-400 font-mono text-xs">{device.idcode}</span>
          </div>
        )}
      </div>
    </div>
  );
};
