import React, { useState, useEffect, useCallback } from 'react';
import { Radar, Play, RefreshCw, Settings, Eye, EyeOff } from 'lucide-react';
import PointCloudViewer from './components/PointCloudViewer';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import DetectionList from './components/DetectionList';
import MetricsPanel from './components/MetricsPanel';
import { UploadedFile, Detection } from './types';
import { getFiles, getPointCloud, runDetection, getDetections, deleteFile } from './services/api';

function App() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [pointCloudData, setPointCloudData] = useState<number[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetectionId, setSelectedDetectionId] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [pointSize, setPointSize] = useState(0.05);
  const [colorMode, setColorMode] = useState<'height' | 'intensity' | 'uniform'>('height');

  const loadFiles = useCallback(async () => {
    try {
      const filesData = await getFiles();
      setFiles(filesData);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUploadComplete = useCallback((file: UploadedFile) => {
    setFiles(prev => [file, ...prev]);
    handleSelectFile(file);
  }, []);

  const handleSelectFile = useCallback(async (file: UploadedFile) => {
    setSelectedFile(file);
    
    try {
      const data = await getPointCloud(file.id);
      setPointCloudData(data.points);
    } catch (error) {
      console.error('Failed to load point cloud:', error);
    }

    if (file.status === 'completed') {
      try {
        const result = await getDetections(file.id);
        setDetections(result.detections);
      } catch (error) {
        console.error('Failed to load detections:', error);
      }
    } else {
      setDetections([]);
    }
    
    setSelectedDetectionId(null);
  }, []);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    try {
      await deleteFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
        setPointCloudData([]);
        setDetections([]);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }, [selectedFile]);

  const handleDetect = useCallback(async (fileId: string) => {
    setIsProcessing(true);
    try {
      const result = await runDetection(fileId);
      setDetections(result.detections);
      
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'completed' as const } : f
      ));
      
      if (selectedFile?.id === fileId) {
        setSelectedFile(prev => prev ? { ...prev, status: 'completed' as const } : null);
      }
    } catch (error) {
      console.error('Detection failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile]);

  return (
    <div className="w-full h-screen flex flex-col bg-dark-bg">
      <header className="h-14 flex items-center justify-between px-6 border-b border-dark-border bg-dark-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-blue/20">
            <Radar className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold gradient-text">
              PointCloud Detection System
            </h1>
            <p className="text-xs text-gray-500">PointNet++ 3D 目标检测</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors bg-dark-border hover:bg-gray-700/50"
          >
            {showMetrics ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showMetrics ? '隐藏指标' : '显示指标'}</span>
          </button>
          
          <button
            onClick={loadFiles}
            className="p-2 rounded-lg bg-dark-border hover:bg-gray-700/50 transition-colors"
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            className="p-2 rounded-lg bg-dark-border hover:bg-gray-700/50 transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 flex flex-col border-r border-dark-border bg-dark-surface/30">
          <div className="p-4 border-b border-dark-border">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">上传点云</h2>
            <FileUpload onUploadComplete={handleUploadComplete} />
          </div>
          
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300">文件列表</h2>
              <span className="text-xs text-gray-500">{files.length} 个文件</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FileList
                files={files}
                selectedFileId={selectedFile?.id || null}
                onSelect={handleSelectFile}
                onDelete={handleDeleteFile}
                onDetect={handleDetect}
                isProcessing={isProcessing}
              />
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative">
          {selectedFile ? (
            <>
              <div className="absolute top-4 left-4 z-10 bg-dark-surface/90 backdrop-blur-sm rounded-lg p-3 border border-dark-border">
                <div className="text-xs text-gray-400 mb-1">当前文件</div>
                <div className="text-sm font-medium text-gray-200">{selectedFile.file_name}</div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>{selectedFile.point_count.toLocaleString()} 点</span>
                  <span>状态: {selectedFile.status}</span>
                </div>
                
                {selectedFile.status === 'uploaded' && (
                  <button
                    onClick={() => handleDetect(selectedFile.id)}
                    disabled={isProcessing}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        检测中...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        运行检测
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="absolute top-4 right-4 z-10 bg-dark-surface/90 backdrop-blur-sm rounded-lg p-3 border border-dark-border">
                <div className="text-xs text-gray-400 mb-2">显示设置</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">点大小</label>
                    <input
                      type="range"
                      min="0.01"
                      max="0.2"
                      step="0.01"
                      value={pointSize}
                      onChange={(e) => setPointSize(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">着色模式</label>
                    <select
                      value={colorMode}
                      onChange={(e) => setColorMode(e.target.value as any)}
                      className="w-full bg-dark-border rounded px-2 py-1 text-xs text-gray-300 border-none outline-none"
                    >
                      <option value="height">高度</option>
                      <option value="uniform">统一</option>
                    </select>
                  </div>
                </div>
              </div>

              <PointCloudViewer
                points={pointCloudData}
                detections={detections}
                selectedDetectionId={selectedDetectionId}
                onBoxSelect={setSelectedDetectionId}
                pointSize={pointSize}
                colorMode={colorMode}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <Radar className="w-20 h-20 mb-4 opacity-20" />
              <h2 className="text-xl font-semibold mb-2">欢迎使用点云检测系统</h2>
              <p className="text-sm">上传 PCD 或 BIN 格式的点云文件开始检测</p>
              <div className="mt-6 flex gap-4 text-xs">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-border">
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span>车辆检测</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-border">
                  <div className="w-3 h-3 rounded bg-amber-500"></div>
                  <span>行人检测</span>
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className={`${showMetrics ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden border-l border-dark-border bg-dark-surface/30`}>
          <div className="w-80 h-full flex flex-col">
            <div className="p-4 border-b border-dark-border">
              <h2 className="text-sm font-semibold text-gray-300">检测结果</h2>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              <DetectionList
                detections={detections}
                selectedId={selectedDetectionId}
                onSelect={setSelectedDetectionId}
              />
            </div>

            <div className="border-t border-dark-border p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">性能指标</h2>
              <MetricsPanel />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
