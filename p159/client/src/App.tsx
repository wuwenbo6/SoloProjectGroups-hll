import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { CommandPanel } from './components/CommandPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { WaveformPanel } from './components/WaveformPanel';
import { api } from './services/api';
import { DeviceStatus, CommandHistoryItem } from './types';

const POLL_INTERVAL = 1000;

function App() {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({
    connected: false,
    host: '',
    port: 0,
    queueLength: 0,
    isProcessing: false
  });
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5555');
  const [isLoading, setIsLoading] = useState(false);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([]);
  const [waveformData, setWaveformData] = useState<string>('');
  const [showWaveformPanel, setShowWaveformPanel] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCommandIds = useRef<Set<string>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getDeviceStatus();
      setDeviceStatus(data.status);
    } catch {
      // Ignore status fetch errors
    }
  }, []);

  const pollCommandStatus = useCallback(async () => {
    if (pendingCommandIds.current.size === 0) {
      return;
    }

    const ids = Array.from(pendingCommandIds.current);
    
    for (const id of ids) {
      try {
        const data = await api.getCommandStatus(id);
        const cmd = data.command;
        
        if (cmd.status === 'completed' || cmd.status === 'failed') {
          pendingCommandIds.current.delete(id);
          
          if (cmd.status === 'completed' && cmd.response?.response) {
            const commandLower = cmd.command.toUpperCase();
            if (commandLower.includes('WAV:DATA') || commandLower.includes('WAVEFORm:DATA')) {
              setWaveformData(cmd.response.response);
            }
          }
          
          setCommandHistory((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    success: cmd.response?.success ?? false,
                    response: cmd.response?.response,
                    error: cmd.response?.error,
                    status: cmd.status
                  }
                : item
            )
          );
        } else {
          setCommandHistory((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: cmd.status } : item
            )
          );
        }
      } catch {
        // Ignore poll errors
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 5000);
    
    pollingRef.current = setInterval(pollCommandStatus, POLL_INTERVAL);
    
    return () => {
      clearInterval(statusInterval);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchStatus, pollCommandStatus]);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const data = await api.connectDevice({
        host,
        port: parseInt(port, 10)
      });
      setDeviceStatus(data.status);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Connection failed';
      alert(`连接失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      const data = await api.disconnectDevice();
      setDeviceStatus(data.status);
      pendingCommandIds.current.clear();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Disconnection failed';
      alert(`断开失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCommand = async (command: string, isQuery: boolean) => {
    const historyItem: CommandHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      command,
      timestamp: Date.now(),
      success: false,
      status: 'pending'
    };

    setCommandHistory((prev) => [historyItem, ...prev]);

    try {
      const result = await api.enqueueCommand({ command, isQuery });
      
      if (result.success) {
        pendingCommandIds.current.add(result.commandId);
        
        setCommandHistory((prev) =>
          prev.map((item) =>
            item.id === historyItem.id
              ? { ...item, id: result.commandId, status: 'pending' }
              : item
          )
        );
      } else {
        setCommandHistory((prev) =>
          prev.map((item) =>
            item.id === historyItem.id
              ? { ...item, success: false, error: 'Failed to enqueue command', status: 'failed' }
              : item
          )
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Command failed';
      setCommandHistory((prev) =>
        prev.map((item) =>
          item.id === historyItem.id
            ? { ...item, success: false, error, status: 'failed' }
            : item
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">VISA SCPI Gateway</h1>
              <p className="text-slate-400 text-sm">示波器/仪器设备远程控制平台</p>
            </div>
            <div className="flex items-center gap-3">
              {deviceStatus.connected && (
                <>
                  <button
                    onClick={() => setShowWaveformPanel(!showWaveformPanel)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${
                      showWaveformPanel
                        ? 'bg-purple-500/30 text-purple-400 border border-purple-500/50'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    波形
                  </button>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    队列: {deviceStatus.queueLength}
                  </span>
                </>
              )}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${deviceStatus.connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${deviceStatus.connected ? 'bg-green-400' : 'bg-red-400'}`}
                />
                {deviceStatus.connected ? '设备在线' : '设备离线'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {showWaveformPanel && waveformData && (
          <div className="mb-6">
            <WaveformPanel
              data={waveformData}
              onDataChange={setWaveformData}
            />
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ConnectionPanel
              status={deviceStatus}
              host={host}
              port={port}
              onHostChange={setHost}
              onPortChange={setPort}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              isLoading={isLoading}
            />
            <CommandPanel
              isConnected={deviceStatus.connected}
              onSendCommand={handleSendCommand}
              isLoading={isLoading}
              waveformData={waveformData}
              onWaveformDataChange={setWaveformData}
            />
          </div>
          <div>
            <ResponsePanel history={commandHistory} />
          </div>
        </div>
      </main>

      <footer className="mt-12 py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          <p>VISA SCPI Gateway - 通过TCP Socket连接VISA设备，转发SCPI命令</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
