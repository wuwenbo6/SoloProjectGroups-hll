import { useState, useEffect, useRef, useCallback } from 'react';
import { SonarCanvas } from './components/SonarCanvas';
import { ControlPanel } from './components/ControlPanel';
import { AScope } from './components/AScope';
import { TargetPanel } from './components/TargetPanel';
import { LogPanel } from './components/LogPanel';
import { SonarSimulator } from './services/SonarSimulator';
import { SonarState, SonarParams } from './types/sonar';

function App() {
  const simulatorRef = useRef<SonarSimulator>(new SonarSimulator());
  const [sonarState, setSonarState] = useState<SonarState | null>(null);
  const animationRef = useRef<number>(0);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [logCount, setLogCount] = useState(0);

  const animate = useCallback((currentTime: number) => {
    const state = simulatorRef.current.update(currentTime);
    setSonarState(state);
    
    if (simulatorRef.current.isLoggingActive()) {
      setLogCount(simulatorRef.current.getLogData().length);
    }
    
    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  const handleParamsChange = useCallback((params: Partial<SonarParams>) => {
    simulatorRef.current.setParams(params);
  }, []);

  const handleReset = useCallback(() => {
    simulatorRef.current.reset();
    setSelectedTargetId(null);
    setIsLogging(false);
    setLogCount(0);
  }, []);

  const handleSelectTarget = useCallback((targetId: string | null) => {
    setSelectedTargetId(targetId);
  }, []);

  const handleCanvasClick = useCallback((distance: number, angle: number) => {
    if (!sonarState) return;

    let closestTarget: string | null = null;
    let closestDistance = Infinity;

    for (const echo of sonarState.echoes) {
      if (echo.isBottomEcho || echo.isNoise) continue;

      const angleDiff = Math.abs(echo.angle - angle);
      const normalizedAngleDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
      const distDiff = Math.abs(echo.distance - distance);

      const totalDiff = normalizedAngleDiff * 0.1 + distDiff * 100;

      if (totalDiff < closestDistance && totalDiff < 20) {
        closestDistance = totalDiff;
        closestTarget = echo.fishId;
      }
    }

    setSelectedTargetId(closestTarget);
  }, [sonarState]);

  const handleStartLogging = useCallback(() => {
    simulatorRef.current.startLogging();
    setIsLogging(true);
    setLogCount(0);
  }, []);

  const handleStopLogging = useCallback(() => {
    simulatorRef.current.stopLogging();
    setIsLogging(false);
  }, []);

  const handleDownloadJSON = useCallback(() => {
    simulatorRef.current.downloadLog('json');
  }, []);

  const handleDownloadCSV = useCallback(() => {
    simulatorRef.current.downloadLog('csv');
  }, []);

  if (!sonarState) {
    return (
      <div className="min-h-screen bg-sonar-dark flex items-center justify-center">
        <div className="text-sonar-scan font-mono text-xl animate-pulse">
          初始化声呐系统...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sonar-dark via-gray-900 to-sonar-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sonar-scan/5 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative z-10 py-6 px-4 border-b border-sonar-scan/20">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-center font-mono">
            <span className="text-sonar-scan">声呐模拟器</span>
            <span className="text-white/60"> | </span>
            <span className="text-white/80">Sonar Simulator</span>
          </h1>
          <p className="text-center text-gray-400 mt-2 font-mono text-sm">
            目标识别 · 轨迹跟踪 · 数据记录
          </p>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col xl:flex-row gap-6 items-start justify-center">
          <div className="flex-shrink-0 flex flex-col gap-4">
            <SonarCanvas 
              state={sonarState} 
              width={600} 
              height={600}
              selectedTargetId={selectedTargetId}
              onCanvasClick={handleCanvasClick}
            />
            <AScope 
              data={sonarState.aScopeData} 
              params={sonarState.params}
              width={600} 
              height={150} 
            />
          </div>

          <div className="w-full xl:w-80 flex-shrink-0 space-y-6">
            <ControlPanel
              params={sonarState.params}
              onParamsChange={handleParamsChange}
              onReset={handleReset}
            />

            <TargetPanel
              tracks={sonarState.tracks}
              classifications={sonarState.classifications}
              selectedTargetId={selectedTargetId}
              onSelectTarget={handleSelectTarget}
            />

            <LogPanel
              isLogging={isLogging}
              logCount={logCount}
              onStartLogging={handleStartLogging}
              onStopLogging={handleStopLogging}
              onDownloadJSON={handleDownloadJSON}
              onDownloadCSV={handleDownloadCSV}
            />
          </div>
        </div>

        <div className="mt-12 max-w-4xl mx-auto">
          <div className="bg-sonar-dark/60 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-sonar-scan font-mono text-lg mb-4">🔬 功能说明</h3>
            <div className="grid md:grid-cols-2 gap-6 text-gray-300 text-sm leading-relaxed">
              <div className="space-y-4">
                <div>
                  <h4 className="text-white font-mono mb-2">🎯 鱼类识别</h4>
                  <p className="text-gray-400">
                    基于回波特征（强度、波动、宽度）自动识别目标类型，包括小型鱼、中型鱼、大型鱼和鱼群。
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li><span className="text-green-400">●</span> 小型鱼类 - 弱回波</li>
                    <li><span className="text-yellow-400">●</span> 中型鱼类 - 中等回波</li>
                    <li><span className="text-orange-400">●</span> 大型鱼类 - 强回波</li>
                    <li><span className="text-pink-400">●</span> 鱼群 - 宽且不稳定</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-white font-mono mb-2">📍 轨迹跟踪</h4>
                  <p className="text-gray-400">
                    持续跟踪每个目标的运动轨迹，记录历史位置。点击声呐图上的目标或点击面板可选中查看详情。
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="text-white font-mono mb-2">📋 数据记录</h4>
                  <p className="text-gray-400">
                    支持实时记录声呐数据，可导出为 JSON 或 CSV 格式进行后续分析。CSV 文件可直接用 Excel 打开。
                  </p>
                </div>
                <div>
                  <h4 className="text-white font-mono mb-2">💡 操作提示</h4>
                  <ul className="text-gray-400 space-y-1 text-xs">
                    <li>• 点击声呐图上的亮点可选中目标</li>
                    <li>• 选中后显示白色虚线框和高亮轨迹</li>
                    <li>• 调节增益观察识别置信度变化</li>
                    <li>• 开始记录后可随时停止并导出</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-6 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-xs font-mono">
          Sonar Simulator Web Demo · 声呐系统可视化教学工具
        </div>
      </footer>
    </div>
  );
}

export default App;
