import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Settings, MapPin, Activity, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { FieldMapping } from '../../shared/types';

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const {
    columns,
    preview,
    rowCount,
    fieldMapping,
    params,
    isUploading,
    isInterpolating,
    error,
    setFileUpload,
    setFieldMapping,
    setParams,
    setIsUploading,
    setIsInterpolating,
    setError,
    setInterpolationResult,
  } = useAppStore();

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('请上传 CSV 格式的文件');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSelectedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || '上传失败');
      }

      setFileUpload({
        fileId: data.fileId,
        columns: data.columns,
        preview: data.preview,
        rowCount: data.rowCount,
        detectedFields: data.detectedFields,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
    }
  }, [setFileUpload, setIsUploading, setError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleInterpolate = useCallback(async () => {
    if (!useAppStore.getState().fileId) {
      setError('请先上传文件');
      return;
    }

    if (!fieldMapping.latitude || !fieldMapping.longitude) {
      setError('请选择经度和纬度字段');
      return;
    }

    if (!fieldMapping.rsrp && !fieldMapping.sinr) {
      setError('请至少选择 RSRP 或 SINR 字段');
      return;
    }

    setIsInterpolating(true);
    setError(null);

    try {
      const state = useAppStore.getState();
      const response = await fetch('/api/interpolate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: state.fileId,
          fieldMapping: state.fieldMapping,
          params: state.params,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || '插值失败');
      }

      setInterpolationResult(data);
      navigate(`/map/${state.fileId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '插值失败');
    } finally {
      setIsInterpolating(false);
    }
  }, [fieldMapping, setIsInterpolating, setError, setInterpolationResult, navigate]);

  const fieldOptions = columns.map(col => ({ value: col, label: col }));

  return (
    <div className="min-h-screen bg-primary p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">路测数据热力图分析平台</h1>
          <p className="text-gray-400">上传路测 CSV 数据，生成信号覆盖热力图</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg flex items-center gap-3">
            <AlertCircle className="text-red-400 w-5 h-5" />
            <span className="text-red-300">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div
              className={`card p-8 border-2 border-dashed transition-all cursor-pointer ${
                isDragging
                  ? 'border-accent bg-accent/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="text-center">
                <Upload className="w-16 h-16 mx-auto mb-4 text-accent" />
                {isUploading ? (
                  <div className="space-y-2">
                    <p className="text-white text-lg">正在上传...</p>
                    <div className="w-48 h-2 bg-gray-700 rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-accent animate-pulse-slow" style={{ width: '60%' }} />
                    </div>
                  </div>
                ) : selectedFileName ? (
                  <div className="flex items-center justify-center gap-2 text-accent">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-lg">{selectedFileName}</span>
                  </div>
                ) : (
                  <>
                    <p className="text-white text-lg mb-2">拖拽 CSV 文件到此处</p>
                    <p className="text-gray-400">或点击选择文件</p>
                    <p className="text-sm text-gray-500 mt-2">支持 .csv 格式，最大 50MB</p>
                  </>
                )}
              </div>
            </div>

            {columns.length > 0 && (
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="text-accent w-5 h-5" />
                  <h2 className="text-xl font-semibold text-white">数据预览</h2>
                  <span className="ml-auto text-sm text-gray-400">共 {rowCount} 行数据</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left text-gray-300 font-medium"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-800 ${
                            i % 2 === 0 ? 'bg-gray-800/30' : ''
                          }`}
                        >
                          {columns.map((col) => (
                            <td key={col} className="px-3 py-2 text-gray-400">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="text-accent w-5 h-5" />
                <h2 className="text-xl font-semibold text-white">字段映射</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">纬度 (Latitude)</label>
                  <select
                    className="select-field"
                    value={fieldMapping.latitude}
                    onChange={(e) => setFieldMapping({ latitude: e.target.value })}
                    disabled={columns.length === 0}
                  >
                    <option value="">选择字段...</option>
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">经度 (Longitude)</label>
                  <select
                    className="select-field"
                    value={fieldMapping.longitude}
                    onChange={(e) => setFieldMapping({ longitude: e.target.value })}
                    disabled={columns.length === 0}
                  >
                    <option value="">选择字段...</option>
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">RSRP (dBm)</label>
                  <select
                    className="select-field"
                    value={fieldMapping.rsrp || ''}
                    onChange={(e) => setFieldMapping({ rsrp: e.target.value || undefined })}
                    disabled={columns.length === 0}
                  >
                    <option value="">不使用</option>
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SINR (dB)</label>
                  <select
                    className="select-field"
                    value={fieldMapping.sinr || ''}
                    onChange={(e) => setFieldMapping({ sinr: e.target.value || undefined })}
                    disabled={columns.length === 0}
                  >
                    <option value="">不使用</option>
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="text-accent w-5 h-5" />
                <h2 className="text-xl font-semibold text-white">插值参数</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm text-gray-400">IDW 幂参数</label>
                    <span className="text-sm text-accent font-mono">{params.power}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={params.power}
                    onChange={(e) => setParams({ power: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">值越大，局部性越强</p>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm text-gray-400">搜索半径 (米)</label>
                    <span className="text-sm text-accent font-mono">{params.searchRadius}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={params.searchRadius}
                    onChange={(e) => setParams({ searchRadius: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">仅考虑半径内的数据点</p>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm text-gray-400">网格分辨率 (米)</label>
                    <span className="text-sm text-accent font-mono">{params.gridSize}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={params.gridSize}
                    onChange={(e) => setParams({ gridSize: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">值越小，精度越高</p>
                </div>
              </div>
            </div>

            <button
              className="w-full btn-primary py-3 text-lg flex items-center justify-center gap-2"
              onClick={handleInterpolate}
              disabled={columns.length === 0 || isInterpolating}
            >
              {isInterpolating ? (
                <>
                  <Activity className="w-5 h-5 animate-spin" />
                  正在插值...
                </>
              ) : (
                <>
                  生成热力图
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
