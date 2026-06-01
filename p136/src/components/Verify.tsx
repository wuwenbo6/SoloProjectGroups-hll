import React, { useState } from 'react';
import { ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle, FileKey, Eye, EyeOff } from 'lucide-react';
import { verifyPackage } from '../services/api';
import FileUpload from './FileUpload';
import CertInfo from './CertInfo';
import type { VerifyResult } from '../types';
import { cn } from '../lib/utils';

interface VerifyProps {
  className?: string;
}

export const Verify: React.FC<VerifyProps> = ({ className }) => {
  const [pkgFile, setPkgFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [aesKey, setAesKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<(VerifyResult & { success: boolean; error?: string }) | null>(null);

  const canVerify = (): boolean => {
    return !!pkgFile && !isVerifying;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleVerify = async () => {
    if (!canVerify() || !pkgFile) return;

    setIsVerifying(true);
    setResult(null);

    try {
      const verifyResult = await verifyPackage({
        package: pkgFile,
        certificate: certFile || undefined,
        aesKey: aesKey || undefined,
      });
      setResult(verifyResult);
    } catch (error) {
      setResult({
        success: false,
        valid: false,
        message: '验签失败: ' + (error as Error).message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReset = () => {
    setPkgFile(null);
    setCertFile(null);
    setAesKey('');
    setResult(null);
  };

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyber-blue" />
          <h3 className="text-sm font-medium text-white">验签验证</h3>
        </div>
        {result && (
          <button
            onClick={handleReset}
            className="text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      <div className="space-y-4">
        <FileUpload
          label="加密包文件"
          accept=".enc"
          description="支持 .enc 格式的加密包文件"
          onFileSelected={setPkgFile}
          onFileCleared={() => setPkgFile(null)}
          selectedFile={pkgFile}
          disabled={isVerifying}
        />

        <FileUpload
          label="验证证书 (可选)"
          accept=".pem,.crt,.cer"
          description="支持 .pem, .crt, .cer 格式。如不提供则使用包内证书信息。"
          onFileSelected={setCertFile}
          onFileCleared={() => setCertFile(null)}
          selectedFile={certFile}
          disabled={isVerifying}
        />

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">AES 解密密钥 (可选，32个Hex字符)</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={aesKey}
              onChange={(e) => setAesKey(e.target.value)}
              disabled={isVerifying}
              placeholder="提供AES密钥可进行完整的签名验证..."
              className={cn(
                'w-full px-3 py-2.5 bg-navy-700/50 border border-navy-600 rounded-lg text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyber-blue/30 focus:border-cyber-blue transition-all',
                isVerifying && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white transition-colors"
              disabled={isVerifying}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            提示: 提供证书和AES密钥可执行完整的固件完整性和签名验证
          </p>
        </div>
      </div>

      <button
        onClick={handleVerify}
        disabled={!canVerify()}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2',
          canVerify()
            ? 'bg-gradient-to-r from-cyber-blue to-cyber-green text-navy-900 hover:shadow-lg hover:shadow-cyber-blue/30 active:scale-[0.99]'
            : 'bg-navy-700 text-gray-500 cursor-not-allowed'
        )}
      >
        {isVerifying ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            验证中...
          </>
        ) : (
          <>
            <ShieldCheck className="w-5 h-5" />
            开始验签
          </>
        )}
      </button>

      {result && (
        <div className={cn(
          'border rounded-lg overflow-hidden',
          result.valid ? 'border-cyber-green/30 bg-cyber-green/5' : 'border-red-500/30 bg-red-500/5'
        )}>
          <div className={cn(
            'px-4 py-3 flex items-center gap-3 border-b',
            result.valid ? 'border-cyber-green/20 bg-cyber-green/10' : 'border-red-500/20 bg-red-500/10'
          )}>
            {result.valid ? (
              <CheckCircle2 className="w-6 h-6 text-cyber-green" />
            ) : result.success ? (
              <XCircle className="w-6 h-6 text-red-400" />
            ) : (
              <AlertCircle className="w-6 h-6 text-cyber-orange" />
            )}
            <div>
              <p className={cn(
                'font-medium text-sm',
                result.valid ? 'text-cyber-green' : result.success ? 'text-red-400' : 'text-cyber-orange'
              )}>
                {result.message}
              </p>
              {result.timestamp && (
                <p className="text-xs text-gray-400 mt-0.5">
                  包生成时间: {formatDate(result.timestamp)}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {result.firmwareInfo && (
              <div className="flex items-start gap-3">
                <FileKey className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">固件信息</p>
                  <div className="text-sm text-white space-y-0.5">
                    <p>文件名: {result.firmwareInfo.originalName}</p>
                    <p>大小: {formatBytes(result.firmwareInfo.originalSize)}</p>
                  </div>
                </div>
              </div>
            )}

            {result.firmwareHash && (
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">固件哈希 (SHA-256)</p>
                  <p className="text-xs text-white font-mono break-all bg-navy-900/50 p-2 rounded">
                    {result.firmwareHash}
                  </p>
                </div>
              </div>
            )}

            {result.certInfo && (
              <div>
                <p className="text-xs text-gray-400 mb-2">签名证书信息</p>
                <CertInfo certInfo={result.certInfo} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Verify;
