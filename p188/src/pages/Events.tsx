import { useState, useEffect } from 'react';
import { Search, Filter, Cpu, Download, Trash2 } from 'lucide-react';
import { useCameraStore } from '../store/cameraStore.js';
import { api } from '../utils/api.js';
import { EventList } from '../components/EventList.js';
import { formatDateTime, formatFileSize } from '../utils/format.js';
import type { Event, ExportTask } from '../../shared/types.js';

export function Events() {
  const { events, setEvents } = useCameraStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportTasks, setExportTasks] = useState<ExportTask[]>([]);

  useEffect(() => {
    loadEvents();
    loadExports();
  }, [filterType]);

  async function loadEvents() {
    try {
      const type = filterType === 'all' ? undefined : filterType;
      const data = await api.getEvents(undefined, type) as Event[];
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  async function loadExports() {
    try {
      const data = await api.getAllExports() as ExportTask[];
      setExportTasks(data);
    } catch (error) {
      console.error('Failed to load exports:', error);
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      await api.deleteEvent(id);
      loadEvents();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  }

  async function handleDeleteExport(taskId: string) {
    try {
      await api.deleteExport(taskId);
      loadExports();
    } catch (error) {
      console.error('Failed to delete export:', error);
    }
  }

  async function handleSmartSearch() {
    try {
      const result = await api.smartSearch({
        eventType: filterType !== 'all' ? filterType : undefined,
        query: searchQuery || undefined,
      }) as any;
      setEvents(result.events);
    } catch (error) {
      console.error('Smart search failed:', error);
    }
  }

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (event.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">事件管理</h1>
          <p className="text-slate-400 mt-1">管理所有事件标记和导出任务</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSmartSearch()}
            placeholder="搜索事件..."
            className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="all">全部类型</option>
            <option value="motion">移动侦测</option>
            <option value="alert">告警事件</option>
            <option value="custom">自定义标记</option>
          </select>
        </div>

        <button
          onClick={handleSmartSearch}
          className="flex items-center gap-2 px-4 py-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl hover:bg-cyan-500/30 transition-colors"
        >
          <Cpu size={16} />
          <span className="text-sm font-medium">智能检索</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="text-3xl font-bold text-white">{events.length}</div>
          <div className="text-sm text-slate-400 mt-1">事件总数</div>
        </div>
        <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30">
          <div className="text-3xl font-bold text-yellow-400">
            {events.filter(e => e.type === 'motion').length}
          </div>
          <div className="text-sm text-yellow-400 mt-1">移动侦测</div>
        </div>
        <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/30">
          <div className="text-3xl font-bold text-red-400">
            {events.filter(e => e.type === 'alert').length}
          </div>
          <div className="text-sm text-red-400 mt-1">告警事件</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30">
          <div className="text-3xl font-bold text-blue-400">
            {events.filter(e => e.type === 'custom').length}
          </div>
          <div className="text-sm text-blue-400 mt-1">自定义标记</div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h3 className="text-lg font-semibold text-white mb-4">事件列表</h3>
        <EventList
          events={filteredEvents}
          onDelete={handleDeleteEvent}
        />
      </div>

      {exportTasks.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Download size={18} className="text-green-400" />
              导出历史
            </h3>
          </div>
          <div className="space-y-3">
            {exportTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  task.status === 'completed' ? 'bg-green-500/20' :
                  task.status === 'processing' ? 'bg-cyan-500/20' :
                  task.status === 'failed' ? 'bg-red-500/20' :
                  'bg-slate-700'
                }`}>
                  <Download size={18} className={
                    task.status === 'completed' ? 'text-green-400' :
                    task.status === 'processing' ? 'text-cyan-400' :
                    task.status === 'failed' ? 'text-red-400' :
                    'text-slate-500'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">
                    {task.format.toUpperCase()} 导出 - {task.recordingId}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatDateTime(task.startTime)}
                    {task.fileSize && ` · ${formatFileSize(task.fileSize)}`}
                    {task.status === 'processing' && ` · ${task.progress}%`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    task.status === 'processing' ? 'bg-cyan-500/20 text-cyan-400' :
                    task.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {task.status === 'completed' ? '完成' :
                     task.status === 'processing' ? '处理中' :
                     task.status === 'failed' ? '失败' : '等待'}
                  </span>
                  {task.status === 'completed' && (
                    <a
                      href={api.getExportDownloadUrl(task.id)}
                      className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition-colors"
                    >
                      下载
                    </a>
                  )}
                  <button
                    onClick={() => handleDeleteExport(task.id)}
                    className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
