import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, MapPin, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { Region, TaskStatus } from '@/types';

export default function Admin() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tasks, setTasks] = useState<Map<string, TaskStatus>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const data = await api.getRegions();
        setRegions(data);
        if (data.length > 0) {
          setSelectedRegion(data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch regions:', error);
      }
    };
    fetchRegions();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      tasks.forEach(async (task, taskId) => {
        if (task.status === 'processing') {
          try {
            const updated = await api.getTaskStatus(taskId);
            setTasks((prev) => new Map(prev).set(taskId, updated));
          } catch (error) {
            console.error('Failed to update task status:', error);
          }
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [tasks]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.pbf')) {
      setFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedRegion) return;

    try {
      const result = await api.uploadPBF(file, selectedRegion);
      setTasks((prev) => new Map(prev).set(result.taskId, result));
      setFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
      case 'processing':
        return '处理中';
      default:
        return '等待中';
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">数据管理</h1>
          <p className="text-gray-500">上传OSM PBF历史文件，解析路网数据</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">上传PBF文件</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择目标地区
            </label>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : file
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pbf"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-10 h-10 text-green-500" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-700 font-medium mb-1">
                  拖拽PBF文件到此处，或点击选择
                </p>
                <p className="text-sm text-gray-400">支持 .pbf 格式的OSM历史数据文件</p>
              </>
            )}
          </div>

          {file && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setFile(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedRegion}
                className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始解析
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">解析任务</h2>
          </div>

          {tasks.size === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">暂无解析任务</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {Array.from(tasks.entries()).map(([taskId, task]) => (
                <div key={taskId} className="p-4 flex items-center gap-4">
                  {getStatusIcon(task.status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">任务 {taskId.slice(0, 8)}</span>
                      <span
                        className={`text-sm ${
                          task.status === 'completed'
                            ? 'text-green-600'
                            : task.status === 'error'
                            ? 'text-red-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {getStatusText(task.status)}
                      </span>
                    </div>
                    {task.status === 'processing' && (
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                    {task.message && (
                      <p className="text-sm text-gray-500 mt-1">{task.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 rounded-xl p-6 border border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-2">使用说明</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• 从 OpenStreetMap 官网或 Geofabrik 下载历史 PBF 文件</li>
            <li>• 选择对应的地区，然后上传 PBF 文件</li>
            <li>• 系统会自动解析文件中的路网数据和时间戳</li>
            <li>• 解析完成后即可在地图视图中查看历史路网变化</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
