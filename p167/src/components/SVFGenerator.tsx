import React, { useState, useMemo } from 'react';
import { FileCode, Download, Copy, Check, Play, Settings, Zap } from 'lucide-react';
import { useBSDLStore } from '../hooks/useBSDLStore';
import { 
  generateSVF, 
  generateIDCODETest, 
  generateSampleTest, 
  generateExtestTest, 
  generateBYPASSChain,
  generateFullChainTest,
  downloadSVF,
  STANDARD_INSTRUCTIONS
} from '../generator/svfGenerator';
import { SVFCommandType } from '../types';

const PRESET_COMMANDS: { type: SVFCommandType; name: string; description: string }[] = [
  { type: 'IDCODE', name: 'IDCODE 读取', description: '读取芯片 IDCODE 寄存器' },
  { type: 'SAMPLE', name: 'SAMPLE 采样', description: '采样引脚当前状态' },
  { type: 'EXTEST', name: 'EXTEST 测试', description: '外部边界扫描测试' },
  { type: 'BYPASS', name: 'BYPASS 链', description: '旁路寄存器链测试' },
  { type: 'USERCODE', name: 'USERCODE 读取', description: '读取用户代码' },
  { type: 'CUSTOM', name: '自定义指令', description: '自定义 SVF 指令' }
];

export const SVFGenerator: React.FC = () => {
  const { jtagChain, chips } = useBSDLStore();
  const [selectedPreset, setSelectedPreset] = useState<SVFCommandType>('IDCODE');
  const [targetDevice, setTargetDevice] = useState(0);
  const [customInstruction, setCustomInstruction] = useState('');
  const [customData, setCustomData] = useState('');
  const [customExpected, setCustomExpected] = useState('');
  const [customMask, setCustomMask] = useState('');
  const [generatedSVF, setGeneratedSVF] = useState('');
  const [copied, setCopied] = useState(false);
  const [runTestClocks, setRunTestClocks] = useState(100);

  const generateCommand = () => {
    if (!jtagChain || jtagChain.devices.length === 0) return;

    let svf = '';
    
    switch (selectedPreset) {
      case 'IDCODE':
        svf = generateIDCODETest(jtagChain, targetDevice);
        break;
      case 'SAMPLE':
        svf = generateSampleTest(jtagChain, targetDevice);
        break;
      case 'EXTEST':
        svf = generateExtestTest(jtagChain, targetDevice);
        break;
      case 'BYPASS':
        svf = generateBYPASSChain(jtagChain);
        break;
      case 'USERCODE':
        svf = generateSVF(jtagChain, {
          targetDevice,
          instruction: 'USERCODE',
          data: '0'.repeat(32),
          endIRState: 'IDLE',
          endDRState: 'IDLE',
          runTestClocks
        });
        break;
      case 'CUSTOM':
        svf = generateSVF(jtagChain, {
          targetDevice,
          instruction: customInstruction || 'BYPASS',
          data: customData || undefined,
          expectedData: customExpected || undefined,
          mask: customMask || undefined,
          endIRState: 'IDLE',
          endDRState: 'IDLE',
          runTestClocks
        });
        break;
    }

    setGeneratedSVF(svf);
  };

  const handleGenerateFullTest = () => {
    if (!jtagChain) return;
    const svf = generateFullChainTest(jtagChain);
    setGeneratedSVF(svf);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedSVF);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fileName = jtagChain?.devices[targetDevice]?.name || 'jtag_test';
    downloadSVF(generatedSVF, `${fileName}_${selectedPreset.toLowerCase()}.svf`);
  };

  if (!jtagChain || jtagChain.devices.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileCode className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">SVF 命令生成器</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-slate-700/50 mb-4">
            <FileCode className="w-12 h-12 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-2">请先构建 JTAG 链</p>
          <p className="text-sm text-slate-500">
            在 JTAG 可视化面板中添加设备后即可生成 SVF 命令
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileCode className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">SVF 命令生成器</h3>
        </div>
        <button
          onClick={handleGenerateFullTest}
          className="flex items-center gap-2 px-3 py-2 bg-violet-500/20 border border-violet-500/30
                     rounded-lg text-sm text-violet-400 hover:bg-violet-500/30 transition-colors"
        >
          <Zap className="w-4 h-4" />
          生成完整测试
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              预设命令
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_COMMANDS.map(cmd => (
                <button
                  key={cmd.type}
                  onClick={() => setSelectedPreset(cmd.type)}
                  className={`p-3 rounded-lg border text-left transition-all duration-200
                    ${selectedPreset === cmd.type
                      ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                      : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/50'
                    }`}
                >
                  <div className="font-medium text-sm">{cmd.name}</div>
                  <div className="text-xs opacity-70 mt-0.5">{cmd.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              目标设备
            </label>
            <select
              value={targetDevice}
              onChange={(e) => setTargetDevice(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                         text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {jtagChain.devices.map((device, index) => (
                <option key={device.id} value={index}>
                  #{index + 1} - {device.name} (IR: {device.irLength}bit)
                </option>
              ))}
            </select>
          </div>

          {selectedPreset === 'CUSTOM' && (
            <div className="space-y-4 p-4 bg-slate-900/30 rounded-lg border border-slate-600">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-300">自定义参数</span>
              </div>
              
              <div>
                <label className="block text-xs text-slate-400 mb-1">指令 (二进制或名称)</label>
                <input
                  type="text"
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder="例如: IDCODE, 1111, 0xA"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg
                             text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500"
                />
                <div className="mt-1 text-xs text-slate-500">
                  可用指令: {Object.keys(STANDARD_INSTRUCTIONS).join(', ')}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">数据 (TDI)</label>
                <input
                  type="text"
                  value={customData}
                  onChange={(e) => setCustomData(e.target.value)}
                  placeholder="二进制或十六进制数据"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg
                             text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">期望数据 (TDO)</label>
                  <input
                    type="text"
                    value={customExpected}
                    onChange={(e) => setCustomExpected(e.target.value)}
                    placeholder="可选"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg
                               text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">掩码 (MASK)</label>
                  <input
                    type="text"
                    value={customMask}
                    onChange={(e) => setCustomMask(e.target.value)}
                    placeholder="可选"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg
                               text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              RUNTEST 时钟数: {runTestClocks}
            </label>
            <input
              type="range"
              min="0"
              max="10000"
              step="100"
              value={runTestClocks}
              onChange={(e) => setRunTestClocks(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          <button
            onClick={generateCommand}
            className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 
                       hover:bg-cyan-400 text-white font-medium rounded-lg
                       transition-colors duration-200"
          >
            <Play className="w-5 h-5" />
            生成 SVF 命令
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-400">生成的 SVF 代码</label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                disabled={!generatedSVF}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400
                           hover:text-slate-200 hover:bg-slate-700/50 rounded-lg
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                onClick={handleDownload}
                disabled={!generatedSVF}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400
                           hover:text-slate-200 hover:bg-slate-700/50 rounded-lg
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                下载
              </button>
            </div>
          </div>
          
          <div className="relative">
            <pre className="p-4 bg-slate-900 rounded-lg border border-slate-700 
                           h-[400px] overflow-auto text-sm font-mono text-slate-300
                           leading-relaxed">
              {generatedSVF ? (
                <code>
                  {generatedSVF.split('\n').map((line, i) => (
                    <div key={i} className="flex">
                      <span className="w-8 text-slate-600 select-none">{i + 1}</span>
                      <span className={
                        line.startsWith('!') ? 'text-slate-500' :
                        line.startsWith('SIR') || line.startsWith('SDR') ? 'text-cyan-400' :
                        line.startsWith('END') || line.startsWith('STATE') ? 'text-emerald-400' :
                        line.startsWith('RUNTEST') ? 'text-amber-400' :
                        'text-slate-300'
                      }>
                        {line}
                      </span>
                    </div>
                  ))}
                </code>
              ) : (
                <span className="text-slate-500">
                  选择命令类型并点击"生成 SVF 命令"按钮
                </span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
