import { useEffect, useState } from 'react';
import { Upload, Download, FileText, Clock, HardDrive, CheckCircle, XCircle, Loader2, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { ProgramFile, DownloadStatus } from '../types';

interface ValidationInfo {
  canDownload: boolean;
  blockReasons: string[];
  fileValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    checks: {
      checksum: string | null;
    };
  };
  plcState: {
    safe: boolean;
    errors: string[];
    currentData: {
      temperature: number;
      pressure: number;
      alarm: boolean;
    };
  };
}

export default function Programs() {
  const [programs, setPrograms] = useState<ProgramFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [version, setVersion] = useState('1.0.0');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: number]: number }>({});
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [validationInfo, setValidationInfo] = useState<{ [key: number]: ValidationInfo }>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchPrograms = async () => {
    try {
      const data = await api.getPrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Failed to fetch programs:', error);
    }
  };

  useEffect(() => {
    fetchPrograms();

    const unsubscribe = wsService.onDownloadProgress((status: DownloadStatus) => {
      setDownloadProgress((prev) => ({
        ...prev,
        [status.program_id]: status.progress,
      }));

      if (status.progress >= 100) {
        setTimeout(() => {
          setDownloadingId(null);
          setDownloadProgress((prev) => {
            const newState = { ...prev };
            delete newState[status.program_id];
            return newState;
          });
        }, 1000);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadProgram(selectedFile, version);
      setSelectedFile(null);
      setVersion('1.0.0');
      fetchPrograms();
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploadError(error.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const validateProgram = async (programId: number) => {
    setValidatingId(programId);
    try {
      const response = await fetch(`http://localhost:3001/api/programs/${programId}/validate`);
      const result = await response.json();
      if (result.success) {
        setValidationInfo((prev) => ({
          ...prev,
          [programId]: result.data,
        }));
      }
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setValidatingId(null);
    }
  };

  const handleDownload = async (programId: number, force = false) => {
    const validation = validationInfo[programId];
    
    if (!validation) {
      await validateProgram(programId);
      return;
    }

    if (!validation.canDownload && !force) {
      setShowConfirmDialog(programId);
      return;
    }

    try {
      setShowConfirmDialog(null);
      setDownloadingId(programId);
      setDownloadProgress((prev) => ({ ...prev, [programId]: 0 }));
      await api.startDownload(programId, force);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getValidationIcon = (programId: number) => {
    const validation = validationInfo[programId];
    if (!validation) return null;
    
    if (validation.canDownload) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">程序管理</h1>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">上传程序</h3>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-400 mb-2">选择文件</label>
            <div className="flex items-center gap-4">
              <label className="flex-1 flex items-center justify-center px-6 py-4 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 transition-colors">
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".bin,.hex,.out,.elf,.axf"
                />
                <div className="flex items-center gap-3">
                  <Upload className="w-6 h-6 text-slate-400" />
                  <span className="text-slate-400">
                    {selectedFile ? selectedFile.name : '点击选择二进制文件 (.bin, .hex, .out)'}
                  </span>
                </div>
              </label>
            </div>
          </div>
          <div className="w-full md:w-32">
            <label className="block text-sm font-medium text-slate-400 mb-2">版本号</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              placeholder="1.0.0"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                上传中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                上传
              </>
            )}
          </button>
        </div>
        {uploadError && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            {uploadError}
          </div>
        )}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">程序列表</h3>
        {programs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无程序文件</p>
          </div>
        ) : (
          <div className="space-y-4">
            {programs.map((program) => (
              <div
                key={program.id}
                className="p-4 bg-slate-700/30 rounded-lg border border-slate-600"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/20 rounded-lg">
                      <FileText className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{program.filename}</h4>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-4 h-4" />
                          {formatFileSize(program.size)}
                        </span>
                        <span>v{program.version}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {new Date(program.upload_time).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {validationInfo[program.id] && (
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          {getValidationIcon(program.id)}
                          <span className={`text-sm ${
                            validationInfo[program.id].canDownload ? 'text-green-400' : 'text-yellow-400'
                          }`}>
                            {validationInfo[program.id].canDownload ? '校验通过' : '存在风险'}
                          </span>
                        </div>
                      </div>
                    )}
                    {downloadProgress[program.id] !== undefined && downloadProgress[program.id] < 100 && (
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-400 transition-all duration-300"
                            style={{ width: `${downloadProgress[program.id]}%` }}
                          />
                        </div>
                        <span className="text-cyan-400 text-sm font-mono">
                          {downloadProgress[program.id]}%
                        </span>
                      </div>
                    )}
                    {downloadProgress[program.id] === 100 && (
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm">下载完成</span>
                      </div>
                    )}
                    <button
                      onClick={() => validateProgram(program.id)}
                      disabled={validatingId === program.id}
                      className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {validatingId === program.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      校验
                    </button>
                    <button
                      onClick={() => handleDownload(program.id)}
                      disabled={downloadingId === program.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      {downloadingId === program.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          下载中...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          远程下载
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {validationInfo[program.id] && (
                  <div className="mt-4 pt-4 border-t border-slate-600 space-y-3">
                    {!validationInfo[program.id].fileValidation.valid && (
                      <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                        <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                          <XCircle className="w-4 h-4" />
                          文件校验失败
                        </div>
                        <ul className="text-sm text-red-300 list-disc list-inside">
                          {validationInfo[program.id].fileValidation.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {!validationInfo[program.id].plcState.safe && (
                      <div className="p-3 bg-yellow-900/30 border border-yellow-500/50 rounded-lg">
                        <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          PLC 状态异常
                        </div>
                        <ul className="text-sm text-yellow-300 list-disc list-inside">
                          {validationInfo[program.id].plcState.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationInfo[program.id].fileValidation.checks.checksum && (
                      <div className="text-sm text-slate-400">
                        <span className="text-slate-500">SHA256 校验码: </span>
                        <code className="font-mono text-xs bg-slate-700 px-2 py-1 rounded">
                          {validationInfo[program.id].fileValidation.checks.checksum.substring(0, 32)}...
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showConfirmDialog !== null && validationInfo[showConfirmDialog] && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-slate-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                下载确认
              </h3>
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-300 mb-4">
              当前下载条件未满足，继续下载可能导致 PLC 设备故障。是否强制下载？
            </p>
            
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg mb-6">
              <div className="text-red-400 font-medium mb-2">风险项:</div>
              <ul className="text-sm text-red-300 list-disc list-inside space-y-1">
                {validationInfo[showConfirmDialog].blockReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDownload(showConfirmDialog, true)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                强制下载
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">下载说明</h3>
        <ul className="space-y-2 text-slate-400">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>支持 .bin, .hex, .out, .elf, .axf 格式的二进制程序文件</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>下载前会自动校验文件完整性和 PLC 运行状态</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>远程下载会将程序发送到 PLC 设备进行更新</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span>PLC 处于告警状态或参数异常时禁止下载</span>
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <span>强制下载可能导致设备死机，请谨慎操作</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
