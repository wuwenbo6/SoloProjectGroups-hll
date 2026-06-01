import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, RotateCcw, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { tasksApi } from '../services/api';
import { wsService } from '../services/websocket';
import { TestTask, PacketRecord, CrashRecord, RecoveryStatus } from '../types';

const TestExecution: React.FC = () => {
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TestTask | null>(null);
  const [packets, setPackets] = useState<PacketRecord[]>([]);
  const [crashes, setCrashes] = useState<CrashRecord[]>([]);
  const [status, setStatus] = useState<{ 
    packetCount: number; 
    crashCount: number;
    recoveryCount: number;
    currentStrategy?: string;
  }>({
    packetCount: 0,
    crashCount: 0,
    recoveryCount: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTasks();
    wsService.connect();

    const unsubPacket = wsService.on('test:packet', (data) => {
      if (data.taskId === selectedTask?.id) {
        setPackets((prev) => [...prev.slice(-200), data as PacketRecord]);
      }
    });

    const unsubProgress = wsService.on('test:progress', (data) => {
      if (data.taskId === selectedTask?.id) {
        setStatus({
          packetCount: data.packetCount,
          crashCount: data.crashCount,
          recoveryCount: data.recoveryCount || 0,
          currentStrategy: data.currentStrategy,
        });
      }
    });

    const unsubCrash = wsService.on('test:crash', (data) => {
      if (data.taskId === selectedTask?.id) {
        setCrashes((prev) => [...prev, data as CrashRecord]);
      }
    });

    const unsubStatus = wsService.on('test:status', (data) => {
      if (data.taskId === selectedTask?.id) {
        setIsRunning(data.status === 'running');
      }
    });

    const unsubRecovery = wsService.on('test:recovery', (data) => {
      if (data.taskId === selectedTask?.id) {
        setRecoveryStatus(data as RecoveryStatus);
        if (data.status === 'recovered') {
          setTimeout(() => setRecoveryStatus(null), 5000);
        } else if (data.status === 'timeout' || data.status === 'max_crashes') {
          setIsRunning(false);
        }
      }
    });

    return () => {
      unsubPacket();
      unsubProgress();
      unsubCrash();
      unsubStatus();
      unsubRecovery();
    };
  }, [selectedTask?.id]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [packets]);

  const loadTasks = async () => {
    try {
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const handleSelectTask = async (task: TestTask) => {
    setSelectedTask(task);
    setPackets([]);
    setCrashes([]);
    setStatus({ 
      packetCount: task.packetCount, 
      crashCount: task.crashCount,
      recoveryCount: 0,
    });
    setIsRunning(task.status === 'running');
    setRecoveryStatus(null);

    try {
      const [packetData, crashData] = await Promise.all([
        tasksApi.getPackets(task.id, 100),
        tasksApi.getCrashes(task.id),
      ]);
      setPackets(packetData.reverse());
      setCrashes(crashData);
    } catch (error) {
      console.error('Failed to load task data:', error);
    }

    wsService.subscribeTask(task.id);
  };

  const getRecoveryStatusColor = (status: string) => {
    switch (status) {
      case 'crashed':
      case 'timeout':
      case 'max_crashes':
      case 'manual_required':
        return 'bg-status-error/20 border-status-error text-status-error';
      case 'recovering':
        return 'bg-status-warning/20 border-status-warning text-status-warning';
      case 'recovered':
        return 'bg-status-success/20 border-status-success text-status-success';
      default:
        return 'bg-dark-600 border-dark-500 text-dark-300';
    }
  };

  const handleStart = async () => {
    if (!selectedTask) return;
    try {
      await tasksApi.start(selectedTask.id);
      setIsRunning(true);
    } catch (error) {
      console.error('Failed to start task:', error);
    }
  };

  const handlePause = async () => {
    if (!selectedTask) return;
    try {
      await tasksApi.pause(selectedTask.id);
      setIsRunning(false);
    } catch (error) {
      console.error('Failed to pause task:', error);
    }
  };

  const handleStop = async () => {
    if (!selectedTask) return;
    try {
      await tasksApi.stop(selectedTask.id);
      setIsRunning(false);
    } catch (error) {
      console.error('Failed to stop task:', error);
    }
  };

  const handleReset = () => {
    setPackets([]);
    setCrashes([]);
    setStatus({ packetCount: 0, crashCount: 0 });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-status-success';
      case 'paused':
        return 'bg-status-warning';
      case 'completed':
        return 'bg-primary-500';
      case 'error':
        return 'bg-status-error';
      default:
        return 'bg-dark-500';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">测试执行</h1>
        <p className="text-dark-400 mt-1">实时控制和监控模糊测试</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700 col-span-1">
          <h2 className="text-lg font-semibold text-white mb-4">测试任务</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleSelectTask(task)}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  selectedTask?.id === task.id
                    ? 'bg-primary-600/20 border border-primary-500'
                    : 'bg-dark-700/30 border border-transparent hover:border-dark-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
                  <span className="text-white font-medium truncate">{task.name}</span>
                </div>
                <div className="text-xs text-dark-400">
                  报文: {task.packetCount} | 崩溃: {task.crashCount}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="text-center text-dark-400 py-4">暂无测试任务</p>
            )}
          </div>
        </div>

        <div className="col-span-3 space-y-6">
          {selectedTask ? (
            <>
              <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                {recoveryStatus && (
                  <div className={`mb-4 p-4 rounded-lg border ${getRecoveryStatusColor(recoveryStatus.status)}`}>
                    <div className="flex items-center gap-3">
                      {recoveryStatus.status === 'recovered' ? (
                        <ShieldCheck className="w-5 h-5" />
                      ) : recoveryStatus.status === 'recovering' ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <ShieldAlert className="w-5 h-5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{recoveryStatus.message}</p>
                        {recoveryStatus.recoveryAttempts !== undefined && (
                          <p className="text-sm opacity-75">
                            恢复尝试: {recoveryStatus.recoveryAttempts} 次
                            {recoveryStatus.crashDuration !== undefined && 
                              ` | 已等待: ${recoveryStatus.crashDuration} 秒`
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selectedTask.name}</h2>
                    <p className="text-dark-400 mt-1">
                      状态: {selectedTask.status}
                      {status.currentStrategy && (
                        <span className="ml-3 text-primary-400">
                          | 当前策略: {status.currentStrategy}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white">{status.packetCount}</p>
                        <p className="text-xs text-dark-400">发送报文</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-status-error">{status.crashCount}</p>
                        <p className="text-xs text-dark-400">检测崩溃</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-status-success">{status.recoveryCount}</p>
                        <p className="text-xs text-dark-400">成功恢复</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      {!isRunning ? (
                        <button
                          onClick={handleStart}
                          className="flex items-center gap-2 px-4 py-2 bg-status-success text-white rounded-lg hover:bg-status-success/80 transition-colors"
                        >
                          <Play className="w-4 h-4" />
                          开始
                        </button>
                      ) : (
                        <button
                          onClick={handlePause}
                          className="flex items-center gap-2 px-4 py-2 bg-status-warning text-white rounded-lg hover:bg-status-warning/80 transition-colors"
                        >
                          <Pause className="w-4 h-4" />
                          暂停
                        </button>
                      )}
                      <button
                        onClick={handleStop}
                        className="flex items-center gap-2 px-4 py-2 bg-status-error text-white rounded-lg hover:bg-status-error/80 transition-colors"
                      >
                        <Square className="w-4 h-4" />
                        停止
                      </button>
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-dark-600 text-white rounded-lg hover:bg-dark-500 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        清空
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                  <h3 className="text-lg font-semibold text-white mb-4">报文监控</h3>
                  <div
                    ref={terminalRef}
                    className="bg-dark-900 rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm"
                  >
                    {packets.map((packet, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 mb-2 ${
                          packet.isError ? 'text-status-error' : 'text-dark-300'
                        }`}
                      >
                        {packet.direction === 'sent' ? (
                          <ArrowRight className="w-4 h-4 mt-0.5 text-primary-400 flex-shrink-0" />
                        ) : (
                          <ArrowLeft className="w-4 h-4 mt-0.5 text-status-success flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs truncate">
                            {new Date(packet.timestamp).toLocaleTimeString()}
                          </div>
                          <div className="font-mono text-xs text-dark-400 truncate">
                            {packet.hexData}
                          </div>
                          {packet.description && (
                            <div className="text-xs text-primary-400">{packet.description}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {packets.length === 0 && (
                      <p className="text-dark-500 text-center py-8">等待报文...</p>
                    )}
                  </div>
                </div>

                <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-status-error" />
                    崩溃检测 ({crashes.length})
                  </h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {crashes.map((crash, index) => (
                      <div
                        key={index}
                        className="p-3 bg-status-error/10 border border-status-error/30 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              crash.severity === 'critical'
                                ? 'bg-status-error/20 text-status-error'
                                : 'bg-status-warning/20 text-status-warning'
                            }`}
                          >
                            {crash.severity}
                          </span>
                          <span className="text-xs text-dark-400">
                            {new Date(crash.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-white mb-2">{crash.description}</p>
                        <p className="font-mono text-xs text-dark-400 truncate">
                          {crash.packetHex}
                        </p>
                      </div>
                    ))}
                    {crashes.length === 0 && (
                      <p className="text-dark-500 text-center py-8">暂无崩溃记录</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-dark-800 rounded-xl p-12 border border-dark-700 text-center">
              <p className="text-dark-400 text-lg">请从左侧选择一个测试任务</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestExecution;
