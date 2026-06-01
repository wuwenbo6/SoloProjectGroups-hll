import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home, Calendar, Clock, AlertTriangle, Trash2, Eye, Download, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Record {
  id: string;
  startTime: string;
  endTime: string;
  seizureCount: number;
  duration: number;
  createdAt: string;
}

interface SeizureEvent {
  timestamp: string;
  duration: number;
  confidence: number;
  seizureType?: string;
}

interface RecordDetail {
  id: string;
  startTime: string;
  endTime: string;
  seizureEvents: SeizureEvent[];
}

export function History() {
  const [records, setRecords] = useState<Record[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(null);

  useEffect(() => {
    fetchRecords();
  }, [page]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/records?page=${page}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        setRecords(data.records);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordDetail = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/records/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedRecord(data);
      }
    } catch (err) {
      console.error('Failed to fetch record detail:', err);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    try {
      const response = await fetch(`http://localhost:8000/api/records/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchRecords();
      }
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
              <Home className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">历史记录</h1>
              <p className="text-sm text-slate-400">共 {total} 条记录</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-400">加载中...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">暂无记录</h2>
              <p className="text-slate-400 mb-6">开始监测后，记录将自动保存到这里</p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 transition-all font-medium"
              >
                连接设备开始监测
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${
                          record.seizureCount > 0 
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {record.seizureCount > 0 ? (
                            <AlertTriangle className="w-6 h-6" />
                          ) : (
                            <Clock className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-1">
                            {formatDate(record.startTime)}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {formatDuration(record.duration)}
                            </span>
                            <span>
                              检测到 <span className={record.seizureCount > 0 ? 'text-red-400 font-medium' : ''}>
                                {record.seizureCount}
                              </span> 次异常
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchRecordDetail(record.id)}
                          className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                          title="查看详情"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                          title="导出数据"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteRecord(record.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-slate-400 hover:text-red-400"
                          title="删除"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-slate-400">
                    第 {page} / {totalPages} 页
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selectedRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold">记录详情</h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-1">开始时间</div>
                  <div className="font-mono">{formatDate(selectedRecord.startTime)}</div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-1">结束时间</div>
                  <div className="font-mono">{formatDate(selectedRecord.endTime)}</div>
                </div>
              </div>

              <h3 className="font-semibold mb-4">检测到的异常事件</h3>
              {selectedRecord.seizureEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  本次记录未检测到异常事件
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedRecord.seizureEvents.map((event, index) => (
                    <div
                      key={index}
                      className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 text-red-400" />
                          <div>
                            <div className="font-medium">异常事件 #{index + 1}</div>
                            <div className="text-sm text-slate-400">
                              {formatDate(event.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-400 font-mono font-bold">
                            {(event.confidence * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-400">置信度</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
