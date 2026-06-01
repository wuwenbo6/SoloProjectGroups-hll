import React, { useState, useRef, useEffect } from 'react';
import { Lock, Play, AlertCircle, CheckCircle2, Loader2, Plus, X, Settings, ChevronDown, Shield } from 'lucide-react';
import { signAndEncrypt, parseCertificate } from '../services/api';
import type { CertInfo, EncryptConfig, SignEncryptResponse, ProcessState, VersionInfo } from '../types';
import { cn } from '../lib/utils';
import FileUpload from './FileUpload';

interface SignEncryptProps {
  firmware: File | null;
  privateKey: File | null;
  certificate: File | null;
  encryptConfig: EncryptConfig;
  onCertInfoParsed: (certInfo: CertInfo) => void;
  onComplete: (result: SignEncryptResponse) => void;
  disabled?: boolean;
  className?: string;
}

interface VersionFormData {
  firmwareVersion: string;
  packageVersion: string;
  hardwareVersion: string;
  changelog: string;
}

const STEPS = [
  { id: 0, name: '准备就绪', description: '等待开始' },
  { id: 1, name: '解析证书', description: '正在解析X.509证书...' },
  { id: 2, name: '计算哈希', description: '正在计算固件SHA-256哈希...' },
  { id: 3, name: '数字签名', description: '正在使用RSA私钥签名...' },
  { id: 4, name: 'AES加密', description: '正在使用AES-128-CBC加密固件...' },
  { id: 5, name: '生成加密包', description: '正在生成可烧录加密包...' },
  { id: 6, name: '完成', description: '签名加密完成！' },
];

export const SignEncrypt: React.FC<SignEncryptProps> = ({
  firmware,
  privateKey,
  certificate,
  encryptConfig,
  onCertInfoParsed,
  onComplete,
  disabled = false,
  className,
}) => {
  const [processState, setProcessState] = useState<ProcessState>({
    step: 0,
    totalSteps: 6,
    currentStep: '准备就绪',
    isProcessing: false,
    logs: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [caCertificates, setCaCertificates] = useState<File[]>([]);
  const [versionData, setVersionData] = useState<VersionFormData>({
    firmwareVersion: '',
    packageVersion: '1.0.0',
    hardwareVersion: '',
    changelog: '',
  });
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [processState.logs]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setProcessState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${timestamp}] [${type.toUpperCase()}] ${message}`],
    }));
  };

  const canStart = (): boolean => {
    const keyValid = /^[0-9A-Fa-f]{32}$/.test(encryptConfig.aesKey);
    const ivValid = /^[0-9A-Fa-f]{32}$/.test(encryptConfig.aesIv);
    return !!(firmware && privateKey && certificate && keyValid && ivValid && !disabled && !processState.isProcessing);
  };

  const handleStart = async () => {
    if (!canStart() || !firmware || !privateKey || !certificate) return;

    setProcessState({
      step: 0,
      totalSteps: 6,
      currentStep: '准备就绪',
      isProcessing: true,
      logs: [],
    });
    setError(null);
    setSuccess(false);

    try {
      addLog('开始签名加密流程');
      addLog(`固件: ${firmware.name} (${firmware.size} bytes)`);
      addLog(`私钥: ${privateKey.name}`);
      addLog(`证书: ${certificate.name}`);
      if (caCertificates.length > 0) {
        addLog(`CA证书链: ${caCertificates.length} 个证书`);
      }

      setProcessState(prev => ({ ...prev, step: 1, currentStep: STEPS[1].description }));
      addLog('正在解析证书...');
      
      const certResult = await parseCertificate(certificate);
      if (!certResult.success || !certResult.data) {
        throw new Error(certResult.error || '证书解析失败');
      }
      onCertInfoParsed(certResult.data);
      addLog(`证书解析成功: ${certResult.data.subject.CN}`, 'success');

      setProcessState(prev => ({ ...prev, step: 2, currentStep: STEPS[2].description }));
      addLog('正在计算固件哈希...');

      setProcessState(prev => ({ ...prev, step: 3, currentStep: STEPS[3].description }));
      addLog('正在执行数字签名...');

      setProcessState(prev => ({ ...prev, step: 4, currentStep: STEPS[4].description }));
      addLog('正在加密固件数据...');

      setProcessState(prev => ({ ...prev, step: 5, currentStep: STEPS[5].description }));
      addLog('正在生成最终加密包...');

      const result = await signAndEncrypt({
        firmware,
        privateKey,
        certificate,
        caCertificates: caCertificates.length > 0 ? caCertificates : undefined,
        aesKey: encryptConfig.aesKey,
        aesIv: encryptConfig.aesIv,
        firmwareVersion: versionData.firmwareVersion || undefined,
        packageVersion: versionData.packageVersion || undefined,
        hardwareVersion: versionData.hardwareVersion || undefined,
        changelog: versionData.changelog || undefined,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || '签名加密失败');
      }

      addLog(`签名算法: ${result.data.signResult.algorithm}`, 'success');
      addLog(`固件哈希: ${result.data.signResult.hash.substring(0, 32)}...`, 'success');
      addLog(`加密前大小: ${result.data.encryptResult.originalSize} bytes`, 'success');
      if (result.data.encryptResult.paddedSize) {
        addLog(`填充后大小: ${result.data.encryptResult.paddedSize} bytes`, 'success');
      }
      addLog(`加密后大小: ${result.data.encryptResult.encryptedSize} bytes`, 'success');
      addLog(`加密包: ${result.data.packageFilename} (${result.data.packageSize} bytes)`, 'success');
      if (result.data.versionInfo) {
        addLog(`固件版本: ${result.data.versionInfo.firmwareVersion}`, 'success');
        addLog(`包版本: ${result.data.versionInfo.packageVersion}`, 'success');
      }
      if (result.data.certChain) {
        addLog(`证书链: ${result.data.certChain.chainLength} 级, ${result.data.certChain.chainValid ? '有效' : '不完整'}`, 'success');
      }
      addLog('签名加密流程完成！', 'success');

      setProcessState(prev => ({
        ...prev,
        step: 6,
        currentStep: STEPS[6].description,
        isProcessing: false,
      }));
      setSuccess(true);
      onComplete(result);

    } catch (err) {
      const errorMessage = (err as Error).message;
      addLog(`错误: ${errorMessage}`, 'error');
      setError(errorMessage);
      setProcessState(prev => ({
        ...prev,
        isProcessing: false,
      }));
    }
  };

  const handleReset = () => {
    setProcessState({
      step: 0,
      totalSteps: 6,
      currentStep: '准备就绪',
      isProcessing: false,
      logs: [],
    });
    setError(null);
    setSuccess(false);
    setCaCertificates([]);
    setVersionData({
      firmwareVersion: '',
      packageVersion: '1.0.0',
      hardwareVersion: '',
      changelog: '',
    });
  };

  const handleAddCaCert = (file: File) => {
    if (!caCertificates.find(c => c.name === file.name && c.size === file.size)) {
      setCaCertificates(prev => [...prev, file]);
    }
  };

  const handleRemoveCaCert = (index: number) => {
    setCaCertificates(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-cyber-blue" />
          <h3 className="text-sm font-medium text-white">签名加密</h3>
        </div>
        {success && (
          <button
            onClick={handleReset}
            className="text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300',
                  processState.step > step.id
                    ? 'bg-cyber-green text-navy-900'
                    : processState.step === step.id
                    ? 'bg-cyber-blue text-navy-900 animate-pulse'
                    : 'bg-navy-700 text-gray-500'
                )}>
                  {processState.step > step.id ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : processState.step === step.id && processState.isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    step.id + 1
                  )}
                </div>
                <span className={cn(
                  'text-xs mt-1.5 text-center w-16 transition-colors',
                  processState.step >= step.id ? 'text-gray-300' : 'text-gray-600'
                )}>
                  {step.name}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mx-1 transition-colors duration-300',
                  processState.step > step.id ? 'bg-cyber-green' : 'bg-navy-700'
                )} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyber-blue to-cyber-green transition-all duration-500 ease-out"
          style={{ width: `${(processState.step / processState.totalSteps) * 100}%` }}
        />
      </div>

      <p className="text-sm text-gray-400">
        {processState.currentStep}
      </p>

      <div className="border border-navy-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-navy-800/50 hover:bg-navy-700/30 transition-colors"
          disabled={processState.isProcessing}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">高级选项</span>
            {(caCertificates.length > 0 || versionData.firmwareVersion || versionData.hardwareVersion) && (
              <span className="px-1.5 py-0.5 text-xs bg-cyber-blue/20 text-cyber-blue rounded">
                已配置
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform',
              showAdvanced && 'rotate-180'
            )}
          />
        </button>

        {showAdvanced && (
          <div className="p-4 space-y-5 border-t border-navy-700">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">CA 证书链 (可选)</label>
                <span className="text-xs text-gray-500">支持根证书和中间证书</span>
              </div>
              <FileUpload
                label=""
                accept=".pem,.crt,.cer"
                description=""
                onFileSelected={handleAddCaCert}
                onFileCleared={() => setCaCertificates([])}
                showPreview={false}
                disabled={processState.isProcessing}
              />
              {caCertificates.length > 0 && (
                <div className="space-y-2">
                  {caCertificates.map((cert, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-3 py-2 bg-navy-700/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-gray-200">{cert.name}</span>
                        <span className="text-xs text-gray-500">({(cert.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCaCert(index)}
                        disabled={processState.isProcessing}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-navy-700 pt-4">
              <label className="text-xs text-gray-400 mb-3 block">版本信息 (可选)</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">固件版本</label>
                  <input
                    type="text"
                    value={versionData.firmwareVersion}
                    onChange={(e) => setVersionData(prev => ({ ...prev, firmwareVersion: e.target.value }))}
                    placeholder="如: v2.3.1"
                    disabled={processState.isProcessing}
                    className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">包版本</label>
                  <input
                    type="text"
                    value={versionData.packageVersion}
                    onChange={(e) => setVersionData(prev => ({ ...prev, packageVersion: e.target.value }))}
                    placeholder="如: 1.0.0"
                    disabled={processState.isProcessing}
                    className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-gray-500">硬件版本</label>
                  <input
                    type="text"
                    value={versionData.hardwareVersion}
                    onChange={(e) => setVersionData(prev => ({ ...prev, hardwareVersion: e.target.value }))}
                    placeholder="如: STM32F407, STM32H750"
                    disabled={processState.isProcessing}
                    className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-gray-500">更新说明</label>
                  <textarea
                    value={versionData.changelog}
                    onChange={(e) => setVersionData(prev => ({ ...prev, changelog: e.target.value }))}
                    placeholder="描述本次固件更新的内容..."
                    rows={2}
                    disabled={processState.isProcessing}
                    className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart()}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2',
          canStart()
            ? 'bg-gradient-to-r from-cyber-blue to-cyber-green text-navy-900 hover:shadow-lg hover:shadow-cyber-blue/30 active:scale-[0.99]'
            : 'bg-navy-700 text-gray-500 cursor-not-allowed'
        )}
      >
        {processState.isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            处理中...
          </>
        ) : success ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            处理完成
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            开始签名加密
          </>
        )}
      </button>

      {!canStart() && !processState.isProcessing && (
        <div className="flex items-start gap-2 text-xs text-cyber-orange">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            请确保已上传固件、私钥、证书，并配置有效的AES密钥和IV。
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {processState.logs.length > 0 && (
        <div className="bg-navy-900/80 border border-navy-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-navy-800/50 border-b border-navy-700">
            <p className="text-xs text-gray-400">处理日志</p>
          </div>
          <div className="p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
            {processState.logs.map((log, index) => (
              <p
                key={index}
                className={cn(
                  'break-all',
                  log.includes('[ERROR]') ? 'text-red-400' :
                  log.includes('[SUCCESS]') ? 'text-cyber-green' :
                  'text-gray-400'
                )}
              >
                {log}
              </p>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SignEncrypt;
