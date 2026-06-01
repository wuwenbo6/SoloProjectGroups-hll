import React, { useState, useEffect } from 'react';
import { FileText, Download, RefreshCw, FileJson, Eye, Trash2, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react';
import { reportsApi, tasksApi } from '../services/api';
import { ReportFile, TestTask } from '../types';

const Reports: React.FC = () => {
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TestTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reportsData, tasksData] = await Promise.all([
        reportsApi.list(),
        tasksApi.getAll(),
      ]);
      setReports(reportsData.reports);
      setTasks(tasksData);
    } catch (error) {
      console.error('加载报告列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (task: TestTask, format: string = 'html') => {
    setGenerating(task.id);
    try {
      await reportsApi.generate(task.id, format);
      await loadData();
      alert('报告生成成功！');
    } catch (error) {
      console.error('生成报告失败:', error);
      alert('生成报告失败');
    } finally {
      setGenerating(null);
    }
  };

  const handlePreview = async (task: TestTask) => {
    try {
      const data = await reportsApi.preview(task.id);
      setPreviewData(data);
      setShowPreview(true);
    } catch (error) {
      console.error('预览报告失败:', error);
      alert('预览报告失败');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 测试报告</h1>
          <p className="text-dark-400 mt-1">生成和管理测试报告</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            任务列表
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-4 bg-dark-700/50 rounded-lg border border-dark-600 hover:border-dark-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-white">{task.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    task.status === 'completed' ? 'bg-status-success/20 text-status-success' :
                    task.status === 'running' ? 'bg-primary-500/20 text-primary-400' :
                    task.status === 'error' ? 'bg-status-error/20 text-status-error' :
                    'bg-dark-600 text-dark-300'
                  }`}>
                    {task.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-dark-400 mb-3">
                  <span>📦 {task.packetCount} 报文</span>
                  <span>💥 {task.crashCount} 崩溃</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateReport(task, 'html')}
                    disabled={generating === task.id}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {generating === task.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    HTML报告
                  </button>
                  <button
                    onClick={() => handleGenerateReport(task, 'json')}
                    disabled={generating === task.id}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-dark-600 text-white rounded hover:bg-dark-500 transition-colors disabled:opacity-50 text-sm"
                  >
                    <FileJson className="w-4 h-4" />
                    JSON
                  </button>
                  <button
                    onClick={() => handlePreview(task)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-dark-600 text-white rounded hover:bg-dark-500 transition-colors text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    预览
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-400" />
            已生成报告
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-dark-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无已生成的报告</p>
              <p className="text-sm mt-1">选择任务并生成报告</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reports.map((report, index) => (
                <div
                  key={index}
                  className="p-4 bg-dark-700/50 rounded-lg border border-dark-600"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {report.format === 'html' ? (
                        <FileText className="w-5 h-5 text-primary-400" />
                      ) : (
                        <FileJson className="w-5 h-5 text-yellow-400" />
                      )}
                      <span className="text-white font-medium text-sm">
                        任务 {report.taskId}
                      </span>
                    </div>
                    <span className="text-xs text-dark-400">
                      {formatSize(report.size)}
                    </span>
                  </div>
                  <p className="text-xs text-dark-400 mb-3">
                    {report.filename}
                  </p>
                  <button
                    onClick={() => reportsApi.download(report.taskId, report.format)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600/20 text-primary-400 rounded hover:bg-primary-600/30 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    下载报告
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <h3 className="text-lg font-semibold text-white">
                报告预览 - {previewData.taskName}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-dark-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-64px)]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-dark-700/50 rounded-lg">
                  <p className="text-sm text-dark-400">发送报文</p>
                  <p className="text-2xl font-bold text-white">{previewData.totalPackets}</p>
                </div>
                <div className="p-4 bg-dark-700/50 rounded-lg">
                  <p className="text-sm text-dark-400">检测崩溃</p>
                  <p className="text-2xl font-bold text-status-error">{previewData.totalCrashes}</p>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium text-white mb-2">💡 改进建议</h4>
                <div className="space-y-2">
                  {previewData.recommendations?.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-dark-700/30 rounded">
                      <CheckCircle className="w-4 h-4 text-status-success mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-dark-300">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>

              {previewData.crashDetails?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">🚨 崩溃记录 ({previewData.crashDetails.length})</h4>
                  <div className="space-y-2">
                    {previewData.crashDetails.slice(0, 3).map((crash: any, i: number) => (
                      <div key={i} className="p-3 bg-status-error/10 border border-status-error/30 rounded">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-status-error" />
                          <span className="text-xs text-status-error">{crash.severity?.toUpperCase()}</span>
                        </div>
                        <p className="text-sm text-dark-300">{crash.description}</p>
                        <p className="text-xs text-dark-500 mt-1 font-mono truncate">
                          {crash.packet_hex}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
