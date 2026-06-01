import React, { useState, useMemo } from 'react';
import { Download, FileJson, FileCode, Eye, X, CheckCircle2, FolderOpen, FileText } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { exportService } from '../services/exportService';
import { configService } from '../services/configService';

type ExportMode = 'config' | 'project';

export const ExportPanel: React.FC = () => {
  const { parsedGSDML, deviceConfig } = useAppStore();
  const [exportFormat, setExportFormat] = useState<'json' | 'xml'>('json');
  const [exportMode, setExportMode] = useState<ExportMode>('config');
  const [showPreview, setShowPreview] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState('my-profinet-project');
  const [projectDescription, setProjectDescription] = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);

  const validation = useMemo(() => {
    if (!deviceConfig) return null;
    return configService.validateConfig(deviceConfig);
  }, [deviceConfig]);

  const previewContent = useMemo(() => {
    if (!parsedGSDML || !deviceConfig) return '';
    if (exportMode === 'project') {
      return exportService.exportToProject(
        projectName,
        [{ config: deviceConfig, device: parsedGSDML.device }],
        projectDescription
      );
    }
    if (exportFormat === 'json') {
      return exportService.exportToJSON(deviceConfig, parsedGSDML.device);
    }
    return exportService.exportToXML(deviceConfig, parsedGSDML.device);
  }, [parsedGSDML, deviceConfig, exportFormat, exportMode, projectName, projectDescription]);

  const handleExport = () => {
    if (!parsedGSDML || !deviceConfig || !validation?.valid) return;

    if (exportMode === 'project') {
      setShowProjectDialog(true);
      return;
    }

    const filename = `${deviceConfig.stationName || 'profinet-device'}-config`;
    
    if (exportFormat === 'json') {
      const content = exportService.exportToJSON(deviceConfig, parsedGSDML.device);
      exportService.downloadFile(content, filename, 'json');
    } else {
      const content = exportService.exportToXML(deviceConfig, parsedGSDML.device);
      exportService.downloadFile(content, filename, 'xml');
    }

    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  };

  const handleExportProject = () => {
    if (!parsedGSDML || !deviceConfig) return;

    exportService.downloadProject(
      projectName,
      [{ config: deviceConfig, device: parsedGSDML.device }],
      projectDescription
    );

    setShowProjectDialog(false);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  };

  if (!parsedGSDML || !deviceConfig) {
    return null;
  }

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">导出模式:</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setExportMode('config')}
                className={`px-3 py-1.5 text-sm flex items-center space-x-1 transition-colors ${
                  exportMode === 'config'
                    ? 'bg-[#165DFF] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>单设备配置</span>
              </button>
              <button
                onClick={() => setExportMode('project')}
                className={`px-3 py-1.5 text-sm flex items-center space-x-1 transition-colors ${
                  exportMode === 'project'
                    ? 'bg-[#165DFF] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                <span>工程文件</span>
              </button>
            </div>
          </div>

          {exportMode === 'config' && (
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">格式:</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setExportFormat('json')}
                  className={`px-3 py-1.5 text-sm flex items-center space-x-1 transition-colors ${
                    exportFormat === 'json'
                      ? 'bg-[#165DFF] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <FileJson className="w-4 h-4" />
                  <span>JSON</span>
                </button>
                <button
                  onClick={() => setExportFormat('xml')}
                  className={`px-3 py-1.5 text-sm flex items-center space-x-1 transition-colors ${
                    exportFormat === 'xml'
                      ? 'bg-[#165DFF] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>XML</span>
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowPreview(true)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-1 transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span>预览</span>
          </button>
        </div>

        <button
          onClick={handleExport}
          disabled={!validation?.valid}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 transition-all duration-200 ${
            validation?.valid
              ? 'bg-[#165DFF] text-white hover:bg-[#0E4BD9] shadow-sm hover:shadow-md'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {exportSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>导出成功</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>{exportMode === 'project' ? '导出工程' : '导出配置'}</span>
            </>
          )}
        </button>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                {exportMode === 'project' ? '工程文件预览' : `配置预览 (${exportFormat.toUpperCase()})`}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
                {previewContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showProjectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">导出工程文件</h3>
              <button
                onClick={() => setShowProjectDialog(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工程名称</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#165DFF] focus:border-[#165DFF] outline-none"
                  placeholder="输入工程名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工程描述 (可选)</label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#165DFF] focus:border-[#165DFF] outline-none resize-none"
                  rows={3}
                  placeholder="输入工程描述"
                />
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500">
                <p className="font-medium text-gray-700 mb-1">导出内容:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>设备网络配置 (IP地址、设备名称等)</li>
                  <li>GSDML版本信息</li>
                  <li>模块与插槽配置</li>
                  <li>诊断信息配置</li>
                  <li>LLDP配置</li>
                  <li>拓扑数据</li>
                </ul>
                <p className="mt-2 text-gray-400">文件格式: .pnproj (JSON)</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setShowProjectDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleExportProject}
                disabled={!projectName.trim()}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  projectName.trim()
                    ? 'bg-[#165DFF] text-white hover:bg-[#0E4BD9]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
