import React, { useState, useEffect } from 'react';
import { FileText, AlertTriangle, Search, Download } from 'lucide-react';
import { tasksApi } from '../services/api';
import { TestTask, PacketRecord, CrashRecord } from '../types';

const ResultsAnalysis: React.FC = () => {
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TestTask | null>(null);
  const [packets, setPackets] = useState<PacketRecord[]>([]);
  const [crashes, setCrashes] = useState<CrashRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'packets' | 'crashes'>('packets');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTasks();
  }, []);

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
    try {
      const [packetData, crashData] = await Promise.all([
        tasksApi.getPackets(task.id, 500),
        tasksApi.getCrashes(task.id),
      ]);
      setPackets(packetData);
      setCrashes(crashData);
    } catch (error) {
      console.error('Failed to load task data:', error);
    }
  };

  const filteredPackets = packets.filter(
    (p) =>
      p.hexData.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.errorMessage && p.errorMessage.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredCrashes = crashes.filter(
    (c) =>
      c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.packetHex.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportResults = () => {
    if (!selectedTask) return;
    const data = {
      task: selectedTask,
      packets,
      crashes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${selectedTask.id}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">结果分析</h1>
          <p className="text-dark-400 mt-1">查看测试结果和崩溃报告</p>
        </div>
        {selectedTask && (
          <button
            onClick={exportResults}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出结果
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
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
                <p className="text-white font-medium truncate">{task.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      task.status === 'running'
                        ? 'bg-status-success animate-pulse'
                        : task.status === 'completed'
                        ? 'bg-primary-500'
                        : 'bg-dark-500'
                    }`}
                  />
                  <span className="text-xs text-dark-400">{task.status}</span>
                </div>
                <div className="text-xs text-dark-400 mt-1">
                  报文: {task.packetCount} | 崩溃: {task.crashCount}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-3 space-y-6">
          {selectedTask ? (
            <>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <p className="text-dark-400 text-sm">总报文数</p>
                  <p className="text-2xl font-bold text-white">{selectedTask.packetCount}</p>
                </div>
                <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <p className="text-dark-400 text-sm">崩溃次数</p>
                  <p className="text-2xl font-bold text-status-error">{selectedTask.crashCount}</p>
                </div>
                <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <p className="text-dark-400 text-sm">开始时间</p>
                  <p className="text-sm text-white">
                    {selectedTask.startTime
                      ? new Date(selectedTask.startTime).toLocaleString()
                      : '-'}
                  </p>
                </div>
                <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <p className="text-dark-400 text-sm">结束时间</p>
                  <p className="text-sm text-white">
                    {selectedTask.endTime
                      ? new Date(selectedTask.endTime).toLocaleString()
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setActiveTab('packets')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        activeTab === 'packets'
                          ? 'bg-primary-600 text-white'
                          : 'text-dark-300 hover:text-white'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      报文记录 ({filteredPackets.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('crashes')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        activeTab === 'crashes'
                          ? 'bg-primary-600 text-white'
                          : 'text-dark-300 hover:text-white'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      崩溃报告 ({filteredCrashes.length})
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                    <input
                      type="text"
                      placeholder="搜索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-dark-600 border border-dark-500 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  {activeTab === 'packets' ? (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-dark-800">
                        <tr className="text-left text-dark-400">
                          <th className="pb-3 font-medium">时间</th>
                          <th className="pb-3 font-medium">方向</th>
                          <th className="pb-3 font-medium">功能码</th>
                          <th className="pb-3 font-medium">报文数据</th>
                          <th className="pb-3 font-medium">响应时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPackets.map((packet, index) => (
                          <tr
                            key={index}
                            className={`border-t border-dark-700 ${
                              packet.isError ? 'text-status-error' : 'text-dark-300'
                            }`}
                          >
                            <td className="py-3">
                              {new Date(packet.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  packet.direction === 'sent'
                                    ? 'bg-primary-600/20 text-primary-400'
                                    : 'bg-status-success/20 text-status-success'
                                }`}
                              >
                                {packet.direction === 'sent' ? '发送' : '接收'}
                              </span>
                            </td>
                            <td className="py-3 font-mono">0x{packet.functionCode?.toString(16).padStart(2, '0') || '--'}</td>
                            <td className="py-3 font-mono text-xs max-w-xs truncate">
                              {packet.hexData}
                            </td>
                            <td className="py-3">{packet.responseTimeMs || '-'} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="space-y-4">
                      {filteredCrashes.map((crash, index) => (
                        <div
                          key={index}
                          className="p-4 bg-dark-700/50 rounded-lg border border-dark-600"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <AlertTriangle className="w-5 h-5 text-status-error" />
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  crash.severity === 'critical'
                                    ? 'bg-status-error/20 text-status-error'
                                    : crash.severity === 'high'
                                    ? 'bg-status-warning/20 text-status-warning'
                                    : 'bg-dark-600 text-dark-300'
                                }`}
                              >
                                {crash.severity}
                              </span>
                            </div>
                            <span className="text-sm text-dark-400">
                              {new Date(crash.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-white mb-2">{crash.description}</p>
                          <div className="bg-dark-800 p-3 rounded font-mono text-xs text-dark-300">
                            {crash.packetHex}
                          </div>
                          {crash.notes && (
                            <p className="mt-2 text-sm text-dark-400">备注: {crash.notes}</p>
                          )}
                        </div>
                      ))}
                      {filteredCrashes.length === 0 && (
                        <p className="text-center text-dark-400 py-8">暂无崩溃记录</p>
                      )}
                    </div>
                  )}
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

export default ResultsAnalysis;
