import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { LipROI } from './components/LipROI';
import { RecognitionResult } from './components/RecognitionResult';
import { SentenceBuilder } from './components/SentenceBuilder';
import { MultiViewCamera } from './components/MultiViewCamera';
import { PersonalCalibration } from './components/PersonalCalibration';
import { RecognitionLog } from './components/RecognitionLog';
import { useCamera } from './hooks/useCamera';
import { useMediaPipe } from './hooks/useMediaPipe';
import { useWebSocket } from './hooks/useWebSocket';
import { cropLipROI, imageDataToBase64 } from './utils/lipExtraction';
import { preprocessLipROI, calculateBrightness, calculateNoiseLevel } from './utils/imagePreprocessing';
import { SlidingWindowBuffer } from './utils/frameBuffer';
import { RecognitionResult as RecognitionResultType, LipLandmarks, FaceOrientation } from './types';

type TabType = 'recognize' | 'multiview' | 'calibration' | 'log' | 'train';

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [lipROI, setLipROI] = useState<ImageData | null>(null);
  const [processedLipROI, setProcessedLipROI] = useState<ImageData | null>(null);
  const [brightness, setBrightness] = useState<number | undefined>();
  const [noiseLevel, setNoiseLevel] = useState<number | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResults, setRecognitionResults] = useState<RecognitionResultType[]>([]);
  const [latestResult, setLatestResult] = useState<RecognitionResultType | null>(null);
  const [lipLandmarks, setLipLandmarks] = useState<LipLandmarks | null>(null);
  const [faceOrientation, setFaceOrientation] = useState<FaceOrientation | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('recognize');
  const [useMultiView, setUseMultiView] = useState(false);

  const frameBufferRef = useRef<SlidingWindowBuffer>(new SlidingWindowBuffer(16, 8));
  const lastProcessTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const camera = useCamera({ width: 640, height: 480 });

  const handleMediaPipeResults = useCallback((results: any) => {
    setLipLandmarks(results.lipLandmarks);
    setFaceOrientation(results.orientation);
  }, []);

  const mediaPipe = useMediaPipe({
    onResults: handleMediaPipeResults
  });

  const handleRecognitionResult = useCallback((result: RecognitionResultType) => {
    setLatestResult(result);
    setRecognitionResults(prev => [...prev.slice(-50), result]);
    setIsProcessing(false);
  }, []);

  const webSocket = useWebSocket({
    url: 'http://localhost:9876',
    onResult: handleRecognitionResult
  });

  const handleMultiViewResult = useCallback((data: {
    lipLandmarks: LipLandmarks | null;
    orientation: FaceOrientation | null;
    lipROI: ImageData | null;
  }) => {
    if (useMultiView) {
      setLipLandmarks(data.lipLandmarks);
      setFaceOrientation(data.orientation);
      if (data.lipROI) {
        setLipROI(data.lipROI);
      }
    }
  }, [useMultiView]);

  const processFrame = useCallback(async () => {
    if (!isRunning || !camera.isStreaming || !mediaPipe.isInitialized || useMultiView) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    if (now - lastProcessTimeRef.current < 33) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastProcessTimeRef.current = now;

    try {
      if (camera.videoRef.current) {
        await mediaPipe.detect(camera.videoRef.current);
      }

      if (lipLandmarks && lipLandmarks.boundingBox && camera.canvasRef.current) {
        const cropped = cropLipROI(camera.canvasRef.current, lipLandmarks.boundingBox, 64);
        
        if (cropped) {
          setLipROI(cropped);
          
          const bright = calculateBrightness(cropped);
          const noise = calculateNoiseLevel(cropped);
          setBrightness(bright);
          setNoiseLevel(noise);

          if (faceOrientation?.isFrontal) {
            const processed = preprocessLipROI(cropped);
            setProcessedLipROI(processed);

            const frameBase64 = imageDataToBase64(processed);
            const window = frameBufferRef.current.addFrame(frameBase64);

            if (window && webSocket.isReady) {
              setIsProcessing(true);
              webSocket.sendFrames(window, now);
            }
          }
        }
      }
    } catch (err) {
      console.error('Frame processing error:', err);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isRunning, camera, mediaPipe, lipLandmarks, faceOrientation, webSocket, useMultiView]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [processFrame]);

  const handleStart = async () => {
    await camera.startCamera();
    webSocket.connect();
    setIsRunning(true);
  };

  const handleStop = () => {
    camera.stopCamera();
    webSocket.disconnect();
    setIsRunning(false);
    setLipROI(null);
    setProcessedLipROI(null);
    frameBufferRef.current.clear();
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'recognize', label: '实时识别', icon: '🎯' },
    { id: 'multiview', label: '多视角融合', icon: '📷' },
    { id: 'calibration', label: '个性化校准', icon: '⚙️' },
    { id: 'log', label: '识别日志', icon: '📋' },
    { id: 'train', label: '训练数据', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">唇语识别系统</h1>
                <p className="text-xs text-gray-400">Lip Reading Recognition</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${webSocket.isConnected ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">
                  {webSocket.isConnected ? '服务已连接' : '未连接'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${mediaPipe.isInitialized ? 'bg-cyan-400' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">
                  {mediaPipe.isInitialized ? 'MediaPipe就绪' : '初始化中...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'recognize' && (
          <>
            <div className="flex justify-center mb-6">
              <button
                onClick={isRunning ? handleStop : handleStart}
                className={`flex items-center gap-3 px-8 py-3 rounded-xl font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                }`}
              >
                {isRunning ? (
                  <>
                    <span className="w-3 h-3 rounded-full bg-white animate-pulse"></span>
                    停止识别
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    开始识别
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CameraPreview
                  videoRef={camera.videoRef}
                  canvasRef={camera.canvasRef}
                  isStreaming={camera.isStreaming}
                  lipLandmarks={lipLandmarks}
                  orientation={faceOrientation}
                />
                
                {camera.error && (
                  <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                    <p className="text-red-400 text-sm">{camera.error}</p>
                  </div>
                )}

                <div className="mt-6">
                  <SentenceBuilder results={recognitionResults} />
                </div>
              </div>

              <div className="space-y-6">
                <LipROI
                  imageData={lipROI}
                  processedImageData={processedLipROI}
                  isProcessing={isProcessing}
                  brightness={brightness}
                  noiseLevel={noiseLevel}
                />

                <RecognitionResult
                  result={latestResult}
                  history={recognitionResults}
                />

                <div className="bg-gray-800 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                    使用提示
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      保持脸部正对摄像头
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      确保光线充足均匀
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      清晰发出辅音（b/p/m/f等）
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-400">✓</span>
                      每个发音之间稍作停顿
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'multiview' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  多视角融合设置
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMultiView}
                    onChange={(e) => setUseMultiView(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-gray-300 text-sm">启用多视角融合</span>
                </label>
              </div>
              <p className="text-gray-400 text-sm">
                启用多个摄像头同时采集，系统会自动融合多视角数据，提高识别准确率。
                正面视角权重最高，侧面视角作为补充。
              </p>
            </div>

            <MultiViewCamera
              onFusedResult={handleMultiViewResult}
              enabled={useMultiView && isRunning}
            />

            {useMultiView && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LipROI
                  imageData={lipROI}
                  processedImageData={processedLipROI}
                  isProcessing={isProcessing}
                  brightness={brightness}
                  noiseLevel={noiseLevel}
                />
                <RecognitionResult
                  result={latestResult}
                  history={recognitionResults}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'calibration' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PersonalCalibration
              lipLandmarks={lipLandmarks}
              isDetecting={mediaPipe.isDetecting}
            />
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  实时预览
                </h3>
                <CameraPreview
                  videoRef={camera.videoRef}
                  canvasRef={camera.canvasRef}
                  isStreaming={camera.isStreaming}
                  lipLandmarks={lipLandmarks}
                  orientation={faceOrientation}
                />
                {!camera.isStreaming && (
                  <button
                    onClick={handleStart}
                    className="w-full mt-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
                  >
                    启动摄像头进行校准
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'log' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecognitionLog
              isRecognizing={isRunning}
              latestResult={latestResult}
              orientation={faceOrientation}
              imageQuality={{ brightness: brightness || 0, noiseLevel: noiseLevel || 0 }}
            />
            <div className="space-y-6">
              <RecognitionResult
                result={latestResult}
                history={recognitionResults}
              />
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                  导出说明
                </h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><strong className="text-gray-300">JSON:</strong> 完整结构化数据，包含所有元数据</li>
                  <li><strong className="text-gray-300">CSV:</strong> 表格格式，适合Excel分析</li>
                  <li><strong className="text-gray-300">TXT:</strong> 纯文本格式，便于阅读</li>
                </ul>
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-500">
                    导出文件包含：时间戳、识别辅音、置信度、人脸朝向、图像质量指标等信息
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'train' && (
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">训练数据管理</h3>
            <p className="text-gray-400 mb-4">
              录制不同辅音的视频片段用于模型训练
            </p>
            <p className="text-gray-500 text-sm">
              训练数据管理功能开发中...
            </p>
          </div>
        )}
      </main>

      <footer className="mt-auto py-6 text-center text-gray-500 text-sm">
        <p>唇语识别系统 v0.2.0 | 支持多视角融合、个性化校准、日志导出</p>
      </footer>
    </div>
  );
}

export default App;
