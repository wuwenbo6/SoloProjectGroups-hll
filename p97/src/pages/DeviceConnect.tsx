import { useState, useEffect } from 'react';
import { Bluetooth, BluetoothOff, Battery, Signal, Activity, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBluetooth } from '../hooks/useBluetooth';

export function DeviceConnect() {
  const navigate = useNavigate();
  const { device, isScanning, isConnected, eegData, scanAndConnect, disconnect } = useBluetooth();
  const [signalStrength, setSignalStrength] = useState(0);

  useEffect(() => {
    if (eegData) {
      const strength = Math.min(100, Math.abs(eegData.channelData.reduce((a, b) => a + b, 0)) * 1000);
      setSignalStrength(strength);
    }
  }, [eegData]);

  const handleConnect = async () => {
    await scanAndConnect();
  };

  const handleStartMonitoring = () => {
    if (isConnected) {
      navigate('/monitor');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            EEG 癫痫检测系统
          </h1>
          <p className="text-slate-400 text-lg">
            连接您的 Muse EEG 头带，开始实时监测
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 p-8 mb-6">
            <div className="flex items-center justify-center mb-8">
              <div className={`relative p-8 rounded-full transition-all duration-500 ${
                isConnected ? 'bg-green-500/20' : isScanning ? 'bg-blue-500/20 animate-pulse' : 'bg-slate-700/50'
              }`}>
                {isScanning ? (
                  <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                ) : isConnected ? (
                  <Bluetooth className="w-16 h-16 text-green-400" />
                ) : (
                  <BluetoothOff className="w-16 h-16 text-slate-500" />
                )}
              </div>
            </div>

            {device ? (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold mb-1">{device.name}</h2>
                  <p className="text-slate-400 text-sm">ID: {device.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                    <Battery className="w-6 h-6 mx-auto mb-2 text-green-400" />
                    <div className="text-2xl font-bold text-white">
                      {device.battery !== undefined ? `${device.battery}%` : '--'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">电量</div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                    <Signal className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                    <div className="text-2xl font-bold text-white">
                      {signalStrength.toFixed(0)}%
                    </div>
                    <div className="text-xs text-slate-400 mt-1">信号质量</div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={disconnect}
                    className="flex-1 py-3 px-6 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors font-medium"
                  >
                    断开连接
                  </button>
                  <button
                    onClick={handleStartMonitoring}
                    disabled={!isConnected}
                    className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                  >
                    <Activity className="w-5 h-5" />
                    开始监测
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-slate-400 mb-6">
                  点击下方按钮搜索并连接 Muse EEG 头带设备
                </p>
                <button
                  onClick={handleConnect}
                  disabled={isScanning}
                  className="py-4 px-8 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 transition-all font-semibold text-lg flex items-center justify-center gap-3 mx-auto"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      正在搜索设备...
                    </>
                  ) : (
                    <>
                      <Bluetooth className="w-6 h-6" />
                      搜索并连接
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-800/30 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              使用说明
            </h3>
            <ul className="space-y-3 text-slate-400 text-sm">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                确保您的 Muse EEG 头带已开机并处于配对模式
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                点击"搜索并连接"按钮，在弹出的对话框中选择您的设备
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                连接成功后，点击"开始监测"进入实时监测页面
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                系统将自动检测癫痫样放电并在检测到异常时触发报警
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
