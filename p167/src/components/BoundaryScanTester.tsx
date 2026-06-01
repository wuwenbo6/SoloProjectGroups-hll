import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Activity,
  Zap,
  Database,
  ArrowRight,
  Cpu
} from 'lucide-react';
import { useBSDLStore } from '../hooks/useBSDLStore';
import { boundaryScanSimulator, downloadChainConfig } from '../simulator/boundaryScanSimulator';
import { BoundaryScanTestResult, PinState } from '../types';

type TestType = 'BYPASS' | 'SAMPLE' | 'PRELOAD' | 'EXTEST';

const TEST_CONFIGS: Record<TestType, { name: string; description: string; color: string }> = {
  BYPASS: { name: 'BYPASS 测试', description: '旁路寄存器链连通性测试', color: 'cyan' },
  SAMPLE: { name: 'SAMPLE 采样', description: '采样引脚当前状态', color: 'emerald' },
  PRELOAD: { name: 'PRELOAD 预载', description: '预加载边界扫描寄存器', color: 'amber' },
  EXTEST: { name: 'EXTEST 测试', description: '外部边界扫描测试', color: 'violet' }
};

export const BoundaryScanTester: React.FC = () => {
  const { jtagChain } = useBSDLStore();
  const [selectedTest, setSelectedTest] = useState<TestType>('BYPASS');
  const [targetDevice, setTargetDevice] = useState(0);
  const [testResults, setTestResults] = useState<BoundaryScanTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [pinStates, setPinStates] = useState<PinState[]>([]);
  const [preloadData, setPreloadData] = useState('');
  const [bsrValue, setBsrValue] = useState('');

  useEffect(() => {
    if (jtagChain && jtagChain.devices.length > 0) {
      boundaryScanSimulator.init(jtagChain);
      updatePinStates();
    }
  }, [jtagChain]);

  const updatePinStates = useCallback(() => {
    if (jtagChain) {
      const states = boundaryScanSimulator.getPinStates(targetDevice);
      setPinStates(states);
      const bsr = boundaryScanSimulator.getBoundaryRegister(targetDevice);
      setBsrValue(bsr);
    }
  }, [jtagChain, targetDevice]);

  const runTest = async () => {
    if (!jtagChain || isRunning) return;

    setIsRunning(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    let result: BoundaryScanTestResult;

    switch (selectedTest) {
      case 'BYPASS':
        result = boundaryScanSimulator.runBYPASSTest(targetDevice);
        break;
      case 'SAMPLE':
        result = boundaryScanSimulator.runSAMPLETest(targetDevice);
        break;
      case 'PRELOAD':
        result = boundaryScanSimulator.runPRELOADTest(targetDevice, preloadData || undefined);
        break;
      case 'EXTEST':
        result = boundaryScanSimulator.runEXTESTTest(targetDevice, preloadData || '0');
        break;
      default:
        return;
    }

    setTestResults(prev => [result, ...prev].slice(0, 10));
    updatePinStates();
    setIsRunning(false);
  };

  const resetSimulator = () => {
    if (jtagChain) {
      boundaryScanSimulator.reset();
      updatePinStates();
      setTestResults([]);
    }
  };

  const handlePinValueChange = (pinName: string, value: '0' | '1' | 'Z') => {
    boundaryScanSimulator.setPinValue(targetDevice, pinName, value);
    updatePinStates();
  };

  const handleExportConfig = () => {
    if (jtagChain) {
      downloadChainConfig(jtagChain, `jtag_chain_${Date.now()}`);
    }
  };

  if (!jtagChain || jtagChain.devices.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-slate-100">边界扫描测试模拟器</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-slate-700/50 mb-4">
            <Cpu className="w-12 h-12 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-2">请先构建 JTAG 链</p>
          <p className="text-sm text-slate-500">
            在 JTAG 可视化面板中添加设备后即可进行边界扫描测试
          </p>
        </div>
      </div>
    );
  }

  const currentInstruction = boundaryScanSimulator.getCurrentInstruction();

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-100">边界扫描测试模拟器</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg">
              <span className="text-xs text-slate-400">当前指令:</span>
              <span className="text-sm font-mono text-cyan-400">{currentInstruction}</span>
            </div>
            <button
              onClick={resetSimulator}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
              title="重置模拟器"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30
                         rounded-lg text-sm text-cyan-400 hover:bg-cyan-500/30 transition-colors"
            >
              <Database className="w-4 h-4" />
              导出配置
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                测试类型
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TEST_CONFIGS) as TestType[]).map(test => {
                  const config = TEST_CONFIGS[test];
                  const isSelected = selectedTest === test;
                  return (
                    <button
                      key={test}
                      onClick={() => setSelectedTest(test)}
                      className={`p-3 rounded-lg border text-left transition-all duration-200
                        ${isSelected
                          ? `bg-${config.color}-500/10 border-${config.color}-500 text-${config.color}-400`
                          : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/50'
                        }`}
                      style={{
                        backgroundColor: isSelected ? `var(--tw-${config.color}-500/10)` : undefined,
                        borderColor: isSelected ? `var(--tw-${config.color}-500)` : undefined,
                        color: isSelected ? `var(--tw-${config.color}-400)` : undefined
                      }}
                    >
                      <div className="font-medium text-sm">{config.name}</div>
                      <div className="text-xs opacity-70 mt-0.5">{config.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                目标设备
              </label>
              <select
                value={targetDevice}
                onChange={(e) => {
                  setTargetDevice(Number(e.target.value));
                  setTimeout(updatePinStates, 0);
                }}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                           text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              >
                {jtagChain.devices.map((device, index) => (
                  <option key={device.id} value={index}>
                    #{index + 1} - {device.name} (IR: {device.irLength}bit, BSR: {device.boundaryCells.length}bit)
                  </option>
                ))}
              </select>
            </div>

            {(selectedTest === 'PRELOAD' || selectedTest === 'EXTEST') && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  预载数据 (十六进制)
                </label>
                <input
                  type="text"
                  value={preloadData}
                  onChange={(e) => setPreloadData(e.target.value.toUpperCase())}
                  placeholder="例如: AAAA5555"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg
                             text-slate-200 text-sm font-mono focus:outline-none focus:border-cyan-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  留空将使用安全默认值
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                BSR 寄存器值 ({bsrValue.length} bit)
              </label>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                <code className="text-xs font-mono text-cyan-400 break-all">
                  {bsrValue || '-'}
                </code>
              </div>
            </div>

            <button
              onClick={runTest}
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 
                         hover:bg-emerald-400 text-white font-medium rounded-lg
                         transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  运行中...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  运行 {TEST_CONFIGS[selectedTest].name}
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                引脚状态 ({pinStates.filter(p => p.cellNumber >= 0).length} 个可观测引脚)
              </label>
              <div className="max-h-[300px] overflow-auto bg-slate-900/50 rounded-lg border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">引脚</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Cell</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">方向</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">值</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {pinStates.filter(p => p.cellNumber >= 0).slice(0, 20).map(pin => (
                      <tr key={pin.name} className="hover:bg-slate-800/30">
                        <td className="px-3 py-1.5 text-slate-200 font-mono text-xs">
                          {pin.name}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400 font-mono text-xs">
                          {pin.cellNumber}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded
                            ${pin.direction === 'input' ? 'bg-blue-500/20 text-blue-400' :
                              pin.direction === 'output' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-emerald-500/20 text-emerald-400'}`}>
                            {pin.direction}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <select
                            value={pin.value}
                            onChange={(e) => handlePinValueChange(pin.name, e.target.value as '0' | '1' | 'Z')}
                            className={`w-10 px-1 py-0.5 rounded text-xs font-mono text-center
                              ${pin.value === '1' ? 'bg-emerald-500/30 text-emerald-400 border-emerald-500/50' :
                                pin.value === '0' ? 'bg-slate-700 text-slate-300 border-slate-600' :
                                'bg-violet-500/30 text-violet-400 border-violet-500/50'}
                              border`}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="Z">Z</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pinStates.filter(p => p.cellNumber >= 0).length > 20 && (
                  <div className="px-3 py-2 text-center text-xs text-slate-500 border-t border-slate-700/50">
                    还有 {pinStates.filter(p => p.cellNumber >= 0).length - 20} 个引脚...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-slate-100">测试历史</h3>
        </div>

        {testResults.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            暂无测试记录，运行测试后结果将显示在此处
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {testResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.success
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-medium text-slate-200">{result.testType}</span>
                    <span className="text-slate-500">-</span>
                    <span className="text-slate-400">{result.deviceName}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    {result.duration}ms
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">TDI:</span>
                    <span className="text-cyan-400">{result.dataIn}</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-600" />
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">TDO:</span>
                    <span className="text-emerald-400">{result.dataOut}</span>
                  </div>
                </div>
                {result.error && (
                  <div className="mt-1 text-xs text-red-400">
                    错误: {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
