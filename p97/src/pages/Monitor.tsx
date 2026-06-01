import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, Pause, Save, Home, Clock, Zap, Activity, BarChart3 } from 'lucide-react';
import { EEGWaveform } from '../components/EEGWaveform';
import { Spectrogram } from '../components/Spectrogram';
import { DataPlayback } from '../components/DataPlayback';
import { AlarmPanel } from '../components/AlarmPanel';
import { useBluetooth } from '../hooks/useBluetooth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useStore } from '../store/useStore';
import { eegCacheDB } from '../utils/indexedDB';
import { EEGData } from '../hooks/useBluetooth';

type TabType = 'live' | 'playback' | 'spectrum';

export function Monitor() {
  const navigate = useNavigate();
  const { isConnected, eegData, disconnect } = useBluetooth();
  const { 
    isConnected: wsConnected, 
    detectionResult, 
    syncStatus,
    connect: wsConnect, 
    disconnect: wsDisconnect,
    sendData 
  } = useWebSocket();
  
  const {
    eegBuffer,
    detectionHistory,
    isRecording,
    recordingStartTime,
    seizureCount,
    alarmMuted,
    alarmThreshold,
    artifactThreshold,
    addEEGData,
    addDetectionResult,
    setIsRecording,
    setRecordingStartTime,
    incrementSeizureCount,
    resetSeizureCount,
    setAlarmMuted,
    setAlarmThreshold,
    setArtifactThreshold,
    clearBuffer
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [playbackData, setPlaybackData] = useState<EEGData[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastSeizureTime, setLastSeizureTime] = useState<number | null>(null);

  useEffect(() => {
    eegCacheDB.init().catch(err => console.error('Failed to init IndexedDB:', err));
    wsConnect();
    return () => wsDisconnect();
  }, [wsConnect, wsDisconnect]);

  useEffect(() => {
    if (eegData && activeTab === 'live') {
      addEEGData(eegData);
      sendData(eegData);
    }
  }, [eegData, activeTab, addEEGData, sendData]);

  useEffect(() => {
    if (detectionResult) {
      addDetectionResult(detectionResult);
      
      if (detectionResult.isSeizure && detectionResult.confidence >= alarmThreshold) {
        const now = Date.now();
        if (!lastSeizureTime || now - lastSeizureTime > 3000) {
          incrementSeizureCount();
          setLastSeizureTime(now);
        }
      }
    }
  }, [detectionResult, addDetectionResult, alarmThreshold, incrementSeizureCount, lastSeizureTime]);

  useEffect(() => {
    let interval: number;
    if (isRecording && recordingStartTime) {
      interval = window.setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      saveRecord();
    } else {
      clearBuffer();
      resetSeizureCount();
      setRecordingStartTime(Date.now());
      setIsRecording(true);
    }
  }, [isRecording, setIsRecording, clearBuffer, resetSeizureCount, setRecordingStartTime]);

  const saveRecord = async () => {
    if (eegBuffer.length === 0 || !recordingStartTime) return;

    try {
      const response = await fetch('http://localhost:8000/api/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startTime: new Date(recordingStartTime).toISOString(),
          endTime: new Date().toISOString(),
          eegData: eegBuffer.slice(0, 1000).map(d => d.channelData),
          detectionResults: detectionHistory
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Record saved:', data.recordId);
      }
    } catch (error) {
      console.error('Failed to save record:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDisconnect = () => {
    if (isRecording) {
      saveRecord();
    }
    disconnect();
    navigate('/');
  };

  const handlePlaybackData = useCallback((data: EEGData) => {
    setPlaybackData(prev => [...prev.slice(-999), data]);
  }, []);

  const handlePlaybackSeek = useCallback((index: number) => {
    setPlaybackIndex(index);
    setPlaybackData([]);
  }, []);

  const displayData = activeTab === 'playback' ? playbackData : eegBuffer;

  const tabs = [
    { id: 'live' as TabType, label: '实时监测', icon: Activity },
    { id: 'spectrum' as TabType, label: '频谱分析', icon: BarChart3 },
    { id: 'playback' as TabType, label: '回放分析', icon: Play }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
                <Home className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold">实时监测</h1>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-slate-400">设备 {isConnected ? '已连接' : '未连接'}</span>
                  <span className="text-slate-600">|</span>
                  <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="text-slate-400">服务器 {wsConnected ? '已连接' : '重连中'}</span>
                  {syncStatus?.pendingCount && syncStatus.pendingCount > 0 && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span className="text-yellow-400 text-xs font-mono">
                        {syncStatus.pendingCount} 条待同步
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-slate-800 rounded-lg px-4 py-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-mono text-lg">{formatDuration(recordingDuration)}</span>
              </div>
              
              <button
                onClick={toggleRecording}
                disabled={!isConnected && activeTab === 'live'}
                className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {isRecording ? (
                  <>
                    <Pause className="w-4 h-4" />
                    停止记录
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    开始记录
                  </>
                )}
              </button>

              <button
                onClick={saveRecord}
                disabled={eegBuffer.length === 0}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="保存记录"
              >
                <Save className="w-5 h-5" />
              </button>

              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
              >
                断开连接
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'live' && (
              <>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-blue-400" />
                    脑电波形
                  </h2>
                  <EEGWaveform data={eegBuffer} height={400} />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  {['TP9', 'AF7', 'AF8', 'TP10'].map((channel, index) => {
                    const colors = ['text-emerald-400', 'text-blue-400', 'text-amber-400', 'text-red-400'];
                    const bgColors = ['bg-emerald-500/20', 'bg-blue-500/20', 'bg-amber-500/20', 'bg-red-500/20'];
                    const lastValue = eegBuffer.length > 0 
                      ? eegBuffer[eegBuffer.length - 1].channelData[index] 
                      : 0;

                    return (
                      <button
                        key={channel}
                        onClick={() => setSelectedChannel(index)}
                        className={`bg-slate-800/50 rounded-xl border p-4 text-left transition-all ${
                          selectedChannel === index 
                            ? 'border-slate-500 bg-slate-700/50' 
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${bgColors[index]} ${colors[index]} mb-3`}>
                          {channel}
                        </div>
                        <div className={`text-2xl font-mono font-bold ${colors[index]}`}>
                          {(lastValue * 1000).toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-400">μV</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {activeTab === 'spectrum' && (
              <>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                      频谱分析
                    </h2>
                    <div className="flex gap-1">
                      {['TP9', 'AF7', 'AF8', 'TP10'].map((channel, index) => (
                        <button
                          key={channel}
                          onClick={() => setSelectedChannel(index)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            selectedChannel === index
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {channel}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Spectrogram data={eegBuffer} channelIndex={selectedChannel} height={250} />
                </div>

                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    原始波形 ({['TP9', 'AF7', 'AF8', 'TP10'][selectedChannel]})
                  </h3>
                  <EEGWaveform 
                    data={eegBuffer.map(d => ({ 
                      ...d, 
                      channelData: [d.channelData[selectedChannel], 0, 0, 0] 
                    }))} 
                    height={150} 
                  />
                </div>
              </>
            )}

            {activeTab === 'playback' && (
              <>
                <DataPlayback
                  eegData={eegBuffer}
                  detectionResults={detectionHistory}
                  onPlaybackData={handlePlaybackData}
                  onSeek={handlePlaybackSeek}
                />

                {playbackData.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-lg font-semibold mb-4">回放波形</h3>
                    <EEGWaveform data={playbackData} height={200} />
                  </div>
                )}

                {playbackData.length > 0 && (
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-lg font-semibold mb-4">回放频谱</h3>
                    <Spectrogram data={playbackData} channelIndex={selectedChannel} height={200} />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6">
            <AlarmPanel
              detectionResult={detectionResult}
              seizureCount={seizureCount}
              alarmMuted={alarmMuted}
              onToggleMute={() => setAlarmMuted(!alarmMuted)}
              threshold={alarmThreshold}
              onThresholdChange={setAlarmThreshold}
              artifactThreshold={artifactThreshold}
              onArtifactThresholdChange={setArtifactThreshold}
              syncStatus={syncStatus}
              wsConnected={wsConnected}
            />

            <Link
              to="/history"
              className="block text-center py-3 px-6 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors font-medium"
            >
              查看历史记录 →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
