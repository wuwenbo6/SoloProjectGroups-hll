import { useState, useEffect, useCallback, useRef } from 'react';
import { FileUploader } from './components/FileUploader';
import { ConfigSelector } from './components/ConfigSelector';
import { ProgressBar } from './components/ProgressBar';
import { LogConsole } from './components/LogConsole';
import { ControlPanel } from './components/ControlPanel';
import { ConnectionStatus } from './components/ConnectionStatus';
import FuseEditor from './components/FuseEditor';
import EepromPanel from './components/EepromPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { 
  MCUConfig, 
  ProgrammerConfig, 
  LogEntry, 
  FlashStatus, 
  ServerMessage,
  UploadResponse,
  ConfigResponse,
  FuseConfig,
  FuseBytes
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

type TabType = 'flash' | 'fuses' | 'eeprom';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('flash');
  const [mcus, setMcus] = useState<MCUConfig[]>([]);
  const [programmers, setProgrammers] = useState<ProgrammerConfig[]>([]);
  const [fuseConfigs, setFuseConfigs] = useState<Record<string, FuseConfig>>({});
  const [selectedMcu, setSelectedMcu] = useState('');
  const [selectedProgrammer, setSelectedProgrammer] = useState('');
  const [port, setPort] = useState('');
  const [baudRate, setBaudRate] = useState('');
  const [bitClock, setBitClock] = useState('10');
  const [verifySignature, setVerifySignature] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<{ id: string; name: string; size: number } | null>(null);
  const [eepromFile, setEepromFile] = useState<string | null>(null);
  const [eepromFileName, setEepromFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<FlashStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [signatureWarning, setSignatureWarning] = useState<{
    show: boolean;
    expected: string;
    actual: string;
    mcuName: string;
  } | null>(null);
  const [fuseValues, setFuseValues] = useState<FuseBytes | null>(null);
  const [eepromData, setEepromData] = useState<string | null>(null);
  const [eepromSize, setEepromSize] = useState<number>(0);
  const logIdRef = useRef(0);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'log':
        setLogs(prev => [...prev, {
          id: logIdRef.current++,
          message: message.payload.message || '',
          level: message.payload.level || 'info',
          timestamp: message.payload.timestamp || Date.now(),
        }]);
        break;
      case 'progress':
        if (message.payload.progress !== undefined) {
          setProgress(message.payload.progress);
        }
        break;
      case 'status':
        if (message.payload.status) {
          setStatus(message.payload.status);
          if (message.payload.status === 'complete') {
            setProgress(100);
          }
        }
        break;
      case 'error':
        setStatus('error');
        if (message.payload.message) {
          setLogs(prev => [...prev, {
            id: logIdRef.current++,
            message: message.payload.message,
            level: 'error',
            timestamp: message.payload.timestamp || Date.now(),
          }]);
        }
        break;
      case 'complete':
        setStatus('complete');
        setProgress(100);
        if (message.payload.message) {
          setLogs(prev => [...prev, {
            id: logIdRef.current++,
            message: message.payload.message,
            level: 'success',
            timestamp: message.payload.timestamp || Date.now(),
          }]);
        }
        break;
      case 'signature_warning':
        setSignatureWarning({
          show: true,
          expected: message.payload.expectedSignature || '',
          actual: message.payload.actualSignature || '',
          mcuName: message.payload.mcuName || '',
        });
        break;
      case 'fuses_data':
        if (message.payload.fuses) {
          setFuseValues(message.payload.fuses);
        }
        break;
      case 'eeprom_data':
        if (message.payload.eepromData) {
          setEepromData(message.payload.eepromData);
          setEepromSize(message.payload.eepromSize || 0);
        }
        break;
    }
  }, []);

  const handlePing = useCallback((timestamp: number) => {
    console.debug('Received ping from server:', new Date(timestamp).toLocaleTimeString());
  }, []);

  const { connect, disconnect, send, isConnected } = useWebSocket(WS_URL, {
    onMessage: handleMessage,
    onPing: handlePing,
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then(res => res.json())
      .then((data: ConfigResponse) => {
        setMcus(data.mcus);
        setProgrammers(data.programmers);
        setFuseConfigs(data.fuseConfigs || {});
        if (data.mcus.length > 0) {
          setSelectedMcu(data.mcus[0].id);
        }
        if (data.programmers.length > 0) {
          setSelectedProgrammer(data.programmers[0].id);
        }
      })
      .catch(err => console.error('Failed to fetch config:', err));
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('hexFile', file);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await response.json();
      
      if (data.success) {
        setUploadedFile({
          id: data.fileId,
          name: data.fileName,
          size: data.fileSize,
        });
        setLogs(prev => [...prev, {
          id: logIdRef.current++,
          message: `文件上传成功: ${data.fileName}`,
          level: 'success',
          timestamp: Date.now(),
        }]);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      setLogs(prev => [...prev, {
        id: logIdRef.current++,
        message: `文件上传失败: ${(error as Error).message}`,
        level: 'error',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFlash = useCallback(() => {
    if (!uploadedFile || !selectedMcu || !selectedProgrammer) {
      return;
    }
    
    setStatus('connecting');
    setProgress(0);
    setSignatureWarning(null);
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '开始烧录...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'flash',
      payload: {
        hexFile: uploadedFile.id,
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        baudRate: baudRate ? parseInt(baudRate, 10) : undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
        verifySignature: verifySignature,
      },
    });
  }, [uploadedFile, selectedMcu, selectedProgrammer, port, baudRate, bitClock, verifySignature, send]);

  const handleErase = useCallback(() => {
    if (!selectedMcu || !selectedProgrammer) {
      return;
    }

    setStatus('connecting');
    setProgress(0);
    setSignatureWarning(null);
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '开始擦除...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'erase',
      payload: {
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
      },
    });
  }, [selectedMcu, selectedProgrammer, port, bitClock, send]);

  const handleStop = useCallback(() => {
    send({
      type: 'stop',
      payload: {
        mcu: selectedMcu,
        programmer: selectedProgrammer,
      },
    });
  }, [selectedMcu, selectedProgrammer, send]);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  const closeSignatureWarning = useCallback(() => {
    setSignatureWarning(null);
  }, []);

  const handleReadFuses = useCallback(() => {
    if (!selectedMcu || !selectedProgrammer) {
      return;
    }

    setStatus('reading_fuses');
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '读取熔丝位...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'read_fuses',
      payload: {
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        baudRate: baudRate ? parseInt(baudRate, 10) : undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
      },
    });
  }, [selectedMcu, selectedProgrammer, port, baudRate, bitClock, send]);

  const handleWriteFuses = useCallback((fuses: FuseBytes) => {
    if (!selectedMcu || !selectedProgrammer) {
      return;
    }

    setStatus('writing_fuses');
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '写入熔丝位...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'write_fuses',
      payload: {
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        baudRate: baudRate ? parseInt(baudRate, 10) : undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
        fuses,
      },
    });
  }, [selectedMcu, selectedProgrammer, port, baudRate, bitClock, send]);

  const handleReadEeprom = useCallback(() => {
    if (!selectedMcu || !selectedProgrammer) {
      return;
    }

    setStatus('reading_eeprom');
    setEepromData(null);
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '读取 EEPROM...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'read_eeprom',
      payload: {
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        baudRate: baudRate ? parseInt(baudRate, 10) : undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
      },
    });
  }, [selectedMcu, selectedProgrammer, port, baudRate, bitClock, send]);

  const handleUploadEeprom = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('hexFile', file);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await response.json();
      
      if (data.success) {
        setEepromFile(data.fileId);
        setEepromFileName(data.fileName);
        setLogs(prev => [...prev, {
          id: logIdRef.current++,
          message: `EEPROM 文件上传成功: ${data.fileName}`,
          level: 'success',
          timestamp: Date.now(),
        }]);
        return data;
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      setLogs(prev => [...prev, {
        id: logIdRef.current++,
        message: `EEPROM 文件上传失败: ${(error as Error).message}`,
        level: 'error',
        timestamp: Date.now(),
      }]);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleWriteEeprom = useCallback(() => {
    if (!eepromFile || !selectedMcu || !selectedProgrammer) {
      return;
    }

    setStatus('writing_eeprom');
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      message: '写入 EEPROM...',
      level: 'info',
      timestamp: Date.now(),
    }]);

    send({
      type: 'write_eeprom',
      payload: {
        eepromFile,
        mcu: selectedMcu,
        programmer: selectedProgrammer,
        port: port || undefined,
        baudRate: baudRate ? parseInt(baudRate, 10) : undefined,
        bitClock: bitClock ? parseInt(bitClock, 10) : undefined,
      },
    });
  }, [eepromFile, selectedMcu, selectedProgrammer, port, baudRate, bitClock, send]);

  const canFlash = !!(uploadedFile && selectedMcu && selectedProgrammer);
  const isBusy = status === 'connecting' || status === 'flashing' || status === 'verifying' || 
                 status === 'reading_fuses' || status === 'writing_fuses' ||
                 status === 'reading_eeprom' || status === 'writing_eeprom';

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <header className="border-b border-dark-border bg-dark-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-accent-blue to-accent-cyan bg-clip-text text-transparent">
                  AVR Flasher
                </h1>
                <p className="text-xs text-gray-500">Web-based avrdude GUI</p>
              </div>
            </div>
            <ConnectionStatus isConnected={isConnected} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {signatureWarning && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-dark-card border border-accent-orange/50 rounded-xl p-6 max-w-md mx-4 shadow-2xl shadow-accent-orange/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-accent-orange/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-accent-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-accent-orange">芯片签名不匹配</h3>
                  <p className="text-sm text-gray-400">烧录已终止，请确认硬件连接</p>
                </div>
              </div>
              
              <div className="bg-black/30 rounded-lg p-4 mb-4 font-mono text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">目标芯片:</span>
                  <span className="text-white">{signatureWarning.mcuName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">预期签名:</span>
                  <span className="text-accent-green">{signatureWarning.expected}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">实际签名:</span>
                  <span className="text-accent-red">{signatureWarning.actual}</span>
                </div>
              </div>
              
              <p className="text-sm text-gray-400 mb-4">
                检测到的芯片签名与选择的 {signatureWarning.mcuName} 不匹配。请检查：
              </p>
              <ul className="text-sm text-gray-400 mb-4 list-disc list-inside space-y-1">
                <li>硬件连接是否正确</li>
                <li>选择的芯片型号是否正确</li>
                <li>芯片是否正确放置在烧录座中</li>
              </ul>
              
              <button
                onClick={closeSignatureWarning}
                className="w-full py-2.5 bg-accent-orange text-white rounded-lg font-medium
                  hover:bg-accent-orange/90 transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="bg-dark-card rounded-xl border border-dark-border p-1 inline-flex gap-1">
            {[
              { id: 'flash', label: '⚡ 固件烧录' },
              { id: 'fuses', label: '🔐 熔丝位' },
              { id: 'eeprom', label: '💾 EEPROM' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-accent-blue text-white'
                    : 'text-gray-400 hover:text-white hover:bg-dark-bg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'flash' && (
              <div className="bg-dark-card rounded-xl border border-dark-border p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  烧录配置
                </h2>
                
                <div className="space-y-6">
                  <FileUploader
                    onUpload={handleUpload}
                    uploadedFile={uploadedFile ? { name: uploadedFile.name, size: uploadedFile.size } : null}
                    isUploading={isUploading}
                    disabled={isBusy}
                  />

                  <ConfigSelector
                    mcus={mcus}
                    programmers={programmers}
                    selectedMcu={selectedMcu}
                    selectedProgrammer={selectedProgrammer}
                    port={port}
                    baudRate={baudRate}
                    bitClock={bitClock}
                    verifySignature={verifySignature}
                    onMcuChange={setSelectedMcu}
                    onProgrammerChange={setSelectedProgrammer}
                    onPortChange={setPort}
                    onBaudRateChange={setBaudRate}
                    onBitClockChange={setBitClock}
                    onVerifySignatureChange={setVerifySignature}
                    disabled={isBusy}
                  />

                  <div className="pt-4 border-t border-dark-border">
                    <ProgressBar progress={progress} status={status} />
                  </div>

                  <ControlPanel
                    onFlash={handleFlash}
                    onErase={handleErase}
                    onStop={handleStop}
                    status={status}
                    canFlash={canFlash}
                  />
                </div>
              </div>
            )}

            {activeTab === 'fuses' && (
              <FuseEditor
                fuseConfig={fuseConfigs[selectedMcu] || null}
                fuseValues={fuseValues}
                onReadFuses={handleReadFuses}
                onWriteFuses={handleWriteFuses}
                status={status}
              />
            )}

            {activeTab === 'eeprom' && (
              <EepromPanel
                eepromData={eepromData}
                eepromSize={eepromSize}
                eepromFile={eepromFileName}
                onReadEeprom={handleReadEeprom}
                onWriteEeprom={handleWriteEeprom}
                onUploadEeprom={handleUploadEeprom}
                status={status}
              />
            )}

            {(activeTab === 'fuses' || activeTab === 'eeprom') && (
              <div className="bg-dark-card rounded-xl border border-dark-border p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3">硬件配置</h3>
                <ConfigSelector
                  mcus={mcus}
                  programmers={programmers}
                  selectedMcu={selectedMcu}
                  selectedProgrammer={selectedProgrammer}
                  port={port}
                  baudRate={baudRate}
                  bitClock={bitClock}
                  verifySignature={verifySignature}
                  onMcuChange={setSelectedMcu}
                  onProgrammerChange={setSelectedProgrammer}
                  onPortChange={setPort}
                  onBaudRateChange={setBaudRate}
                  onBitClockChange={setBitClock}
                  onVerifySignatureChange={setVerifySignature}
                  disabled={isBusy}
                  compact={true}
                />
              </div>
            )}

            <div className="bg-dark-card rounded-xl border border-dark-border p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3">使用说明</h3>
              <ul className="text-sm text-gray-500 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-accent-green">1.</span>
                  选择目标芯片型号和烧录器类型
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-green">2.</span>
                  连接硬件并确认正确
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-green">3.</span>
                  选择对应功能标签页执行操作
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-green">4.</span>
                  在右侧日志窗口查看执行进度
                </li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-dark-card rounded-xl border border-dark-border p-6 h-full">
              <LogConsole
                logs={logs}
                onClear={handleClearLogs}
                autoScroll={autoScroll}
                onAutoScrollChange={setAutoScroll}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-dark-border mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-600 text-sm">
            AVR Flasher - Web-based GUI for avrdude
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
