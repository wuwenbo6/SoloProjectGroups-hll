import React, { useState, useRef } from 'react';

interface CommandPanelProps {
  isConnected: boolean;
  onSendCommand: (command: string, isQuery: boolean) => void;
  isLoading: boolean;
  waveformData?: string;
  onWaveformDataChange?: (data: string) => void;
}

interface CommandMacro {
  label: string;
  command: string;
  isQuery: boolean;
  desc: string;
  category: string;
}

const COMMAND_MACROS: CommandMacro[] = [
  { label: '*IDN?', command: '*IDN?', isQuery: true, desc: '查询设备标识', category: '系统' },
  { label: '*RST', command: '*RST', isQuery: false, desc: '设备复位', category: '系统' },
  { label: '*OPC?', command: '*OPC?', isQuery: true, desc: '查询操作完成', category: '系统' },
  { label: 'SYST:ERR?', command: 'SYST:ERR?', isQuery: true, desc: '查询错误信息', category: '系统' },
  { label: 'MEAS:VOLT:DC?', command: 'MEAS:VOLT:DC?', isQuery: true, desc: '测量直流电压', category: '电压' },
  { label: 'MEAS:VOLT:AC?', command: 'MEAS:VOLT:AC?', isQuery: true, desc: '测量交流电压', category: '电压' },
  { label: 'MEAS:VOLT:DC:RANG?', command: 'MEAS:VOLT:DC:RANG?', isQuery: true, desc: '查询电压量程', category: '电压' },
  { label: 'MEAS:CURR:DC?', command: 'MEAS:CURR:DC?', isQuery: true, desc: '测量直流电流', category: '电流' },
  { label: 'MEAS:CURR:AC?', command: 'MEAS:CURR:AC?', isQuery: true, desc: '测量交流电流', category: '电流' },
  { label: 'MEAS:FREQ?', command: 'MEAS:FREQ?', isQuery: true, desc: '测量频率', category: '频率' },
  { label: 'MEAS:PER?', command: 'MEAS:PER?', isQuery: true, desc: '测量周期', category: '频率' },
  { label: 'MEAS:RES?', command: 'MEAS:RES?', isQuery: true, desc: '测量电阻', category: '其他' },
  { label: 'MEAS:CAP?', command: 'MEAS:CAP?', isQuery: true, desc: '测量电容', category: '其他' },
  { label: 'MEAS:DIODE?', command: 'MEAS:DIODE?', isQuery: true, desc: '二极管测试', category: '其他' },
  { label: 'TRIG:IMM', command: 'TRIG:IMM', isQuery: false, desc: '立即触发', category: '触发' },
  { label: 'TRIG:SOUR IMM', command: 'TRIG:SOUR IMM', isQuery: false, desc: '设置立即触发', category: '触发' },
  { label: 'TRIG:SOUR EXT', command: 'TRIG:SOUR EXT', isQuery: false, desc: '设置外部触发', category: '触发' },
];

const WAVEFORM_COMMANDS = [
  { label: '获取波形数据', command: 'WAV:DATA?', isQuery: true, desc: '读取波形数据' },
  { label: '设置波形格式 ASC', command: 'WAV:FORM ASC', isQuery: false, desc: '设置ASCII格式' },
  { label: '设置波形格式 BYTE', command: 'WAV:FORM BYTE', isQuery: false, desc: '设置字节格式' },
  { label: '查询波形点数', command: 'WAV:POIN?', isQuery: true, desc: '查询波形点数' },
  { label: '设置波形通道1', command: 'WAV:SOUR CH1', isQuery: false, desc: '选择通道1' },
  { label: '设置波形通道2', command: 'WAV:SOUR CH2', isQuery: false, desc: '选择通道2' },
  { label: '查询X增量', command: 'WAV:XINC?', isQuery: true, desc: '查询X轴增量' },
  { label: '查询X原点', command: 'WAV:XOR?', isQuery: true, desc: '查询X轴原点' },
  { label: '查询Y增量', command: 'WAV:YINC?', isQuery: true, desc: '查询Y轴增量' },
  { label: '查询Y原点', command: 'WAV:YOR?', isQuery: true, desc: '查询Y轴原点' },
];

const CATEGORIES = ['全部', '系统', '电压', '电流', '频率', '其他', '触发'];

export const CommandPanel: React.FC<CommandPanelProps> = ({
  isConnected,
  onSendCommand,
  isLoading,
  waveformData,
  onWaveformDataChange
}) => {
  const [command, setCommand] = useState('');
  const [isQuery, setIsQuery] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [showWaveformPanel, setShowWaveformPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMacros = COMMAND_MACROS.filter(
    (cmd) => activeCategory === '全部' || cmd.category === activeCategory
  );

  const handleSend = () => {
    if (command.trim()) {
      onSendCommand(command.trim(), isQuery);
      setCommand('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const parseWaveformData = (data: string): { x: number; y: number }[] => {
    try {
      const values = data.trim().split(',').map((s) => parseFloat(s.trim()));
      return values.map((y, index) => ({ x: index, y })).filter(p => !isNaN(p.y));
    } catch {
      return [];
    }
  };

  const exportToCsv = () => {
    if (!waveformData) return;
    const points = parseWaveformData(waveformData);
    if (points.length === 0) {
      alert('没有可导出的波形数据');
      return;
    }

    const csvContent = [
      'Index,Time,Voltage',
      ...points.map((p) => `${p.x},${p.x * 1e-6},${p.y.toExponential(6)}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `waveform_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importFromCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onWaveformDataChange) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split('\n').slice(1);
      const values = lines
        .map((line) => line.split(',')[2])
        .filter((v) => v && !isNaN(parseFloat(v)));
      onWaveformDataChange(values.join(','));
    };
    reader.readAsText(file);
  };

  const loadSampleWaveform = () => {
    if (!onWaveformDataChange) return;
    const samplePoints = Array.from({ length: 1000 }, (_, i) => {
      const t = i * 0.01;
      return (Math.sin(t) * 5 + Math.sin(3 * t) * 2 + Math.random() * 0.5).toFixed(6);
    });
    onWaveformDataChange(samplePoints.join(','));
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">SCPI 命令</h2>
        <button
          onClick={() => setShowWaveformPanel(!showWaveformPanel)}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            showWaveformPanel
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {showWaveformPanel ? '隐藏波形面板' : '波形数据'}
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">命令分类</label>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">常用命令</label>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
          {filteredMacros.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => onSendCommand(cmd.command, cmd.isQuery)}
              disabled={!isConnected || isLoading}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-mono rounded-lg transition-colors"
              title={cmd.desc}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>

      {showWaveformPanel && (
        <div className="mb-4 p-4 bg-slate-900/50 rounded-lg border border-slate-600">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">波形数据控制</h3>
            <div className="flex gap-2">
              <button
                onClick={loadSampleWaveform}
                className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
              >
                加载示例
              </button>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-400 mb-2">波形命令</label>
            <div className="flex flex-wrap gap-1.5">
              {WAVEFORM_COMMANDS.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => onSendCommand(cmd.command, cmd.isQuery)}
                  disabled={!isConnected || isLoading}
                  className="px-2 py-1 bg-purple-900/50 hover:bg-purple-800/50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-purple-300 text-xs font-mono rounded transition-colors"
                  title={cmd.desc}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-400">波形数据</label>
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={importFromCsv}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                >
                  导入CSV
                </button>
                <button
                  onClick={exportToCsv}
                  disabled={!waveformData}
                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                  导出CSV
                </button>
              </div>
            </div>
            <textarea
              value={waveformData || ''}
              onChange={(e) => onWaveformDataChange?.(e.target.value)}
              placeholder="波形数据将显示在这里，或粘贴逗号分隔的数值..."
              rows={4}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            {waveformData && (
              <p className="mt-1 text-xs text-slate-500">
                共 {parseWaveformData(waveformData).length} 个数据点
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">自定义命令</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入SCPI命令，如: *IDN?"
            disabled={!isConnected || isLoading}
            rows={2}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-mono resize-none"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isQuery}
              onChange={(e) => setIsQuery(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-300">查询命令（需要响应）</span>
          </label>
        </div>

        <button
          onClick={handleSend}
          disabled={!isConnected || isLoading || !command.trim()}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {isLoading ? '发送中...' : '发送命令'}
        </button>
      </div>
    </div>
  );
};
