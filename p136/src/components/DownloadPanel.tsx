import React from 'react';
import { Download, FileArchive, Copy, CheckCircle, Trash2 } from 'lucide-react';
import { getDownloadUrl, cleanupFiles } from '../services/api';
import type { SignEncryptResponse, EncryptConfig } from '../types';
import { cn } from '../lib/utils';

interface DownloadPanelProps {
  result: SignEncryptResponse | null;
  className?: string;
}

export const DownloadPanel: React.FC<DownloadPanelProps> = ({ result, className }) => {
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [copiedIv, setCopiedIv] = React.useState(false);
  const [copiedHash, setCopiedHash] = React.useState(false);
  const [copiedSig, setCopiedSig] = React.useState(false);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const copyToClipboard = async (text: string, type: 'key' | 'iv' | 'hash' | 'sig') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else if (type === 'iv') {
        setCopiedIv(true);
        setTimeout(() => setCopiedIv(false), 2000);
      } else if (type === 'hash') {
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
      } else {
        setCopiedSig(true);
        setTimeout(() => setCopiedSig(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCleanup = async () => {
    try {
      await cleanupFiles();
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  };

  if (!result || !result.success || !result.data) {
    return (
      <div className={cn('p-6 border-2 border-dashed border-gray-600 rounded-lg text-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <FileArchive className="w-12 h-12 text-gray-500" />
          <p className="text-gray-400 text-sm">完成签名加密后可在此下载加密包</p>
        </div>
      </div>
    );
  }

  const { packageFilename, packageSize, signResult, encryptResult, encryptConfig } = result.data;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileArchive className="w-5 h-5 text-cyber-blue" />
          <h3 className="text-sm font-medium text-white">输出结果</h3>
        </div>
        <button
          onClick={handleCleanup}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-400 transition-colors rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清理临时文件
        </button>
      </div>

      <div className="bg-navy-800/50 border border-cyber-green/30 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-cyber-green/10 border-b border-cyber-green/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyber-green/20 rounded-lg">
              <FileArchive className="w-5 h-5 text-cyber-green" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{packageFilename}</p>
              <p className="text-xs text-gray-400">{formatBytes(packageSize)}</p>
            </div>
          </div>
          <a
            href={getDownloadUrl(packageFilename)}
            download={packageFilename}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyber-green text-navy-900 text-sm font-medium rounded-lg hover:bg-cyber-green/90 transition-colors active:scale-95"
          >
            <Download className="w-4 h-4" />
            下载
          </a>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-gray-400">原始固件大小</p>
              <p className="text-sm text-white font-mono">{formatBytes(encryptResult.originalSize)}</p>
            </div>
            {encryptResult.paddedSize && (
              <div className="space-y-1">
                <p className="text-xs text-gray-400">填充后大小</p>
                <p className="text-sm text-white font-mono">{formatBytes(encryptResult.paddedSize)}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-gray-400">加密后大小</p>
              <p className="text-sm text-white font-mono">{formatBytes(encryptResult.encryptedSize)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">签名算法</p>
              <p className="text-sm text-white font-mono">{signResult.algorithm}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">加密算法</p>
              <p className="text-sm text-white font-mono">AES-128-CBC</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">填充方式</p>
              <p className="text-sm text-white font-mono">0xFF (16字节对齐)</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">AES 密钥</p>
              <button
                onClick={() => copyToClipboard(encryptConfig.aesKey, 'key')}
                className="flex items-center gap-1 text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
              >
                {copiedKey ? <CheckCircle className="w-3.5 h-3.5 text-cyber-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? '已复制' : '复制'}
              </button>
            </div>
            <div className="bg-navy-900/50 p-2 rounded font-mono text-xs text-cyber-blue break-all">
              {encryptConfig.aesKey}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">AES IV</p>
              <button
                onClick={() => copyToClipboard(encryptConfig.aesIv, 'iv')}
                className="flex items-center gap-1 text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
              >
                {copiedIv ? <CheckCircle className="w-3.5 h-3.5 text-cyber-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIv ? '已复制' : '复制'}
              </button>
            </div>
            <div className="bg-navy-900/50 p-2 rounded font-mono text-xs text-cyber-blue break-all">
              {encryptConfig.aesIv}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">固件哈希 (SHA-256)</p>
              <button
                onClick={() => copyToClipboard(signResult.hash, 'hash')}
                className="flex items-center gap-1 text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
              >
                {copiedHash ? <CheckCircle className="w-3.5 h-3.5 text-cyber-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedHash ? '已复制' : '复制'}
              </button>
            </div>
            <div className="bg-navy-900/50 p-2 rounded font-mono text-xs text-cyber-green break-all">
              {signResult.hash}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">数字签名</p>
              <button
                onClick={() => copyToClipboard(signResult.signature, 'sig')}
                className="flex items-center gap-1 text-xs text-cyber-blue hover:text-cyber-blue/80 transition-colors"
              >
                {copiedSig ? <CheckCircle className="w-3.5 h-3.5 text-cyber-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSig ? '已复制' : '复制'}
              </button>
            </div>
            <div className="bg-navy-900/50 p-2 rounded font-mono text-xs text-cyber-orange break-all max-h-24 overflow-y-auto">
              {signResult.signature}
            </div>
          </div>

          <div className="p-3 bg-cyber-orange/10 border border-cyber-orange/30 rounded-lg">
            <p className="text-xs text-cyber-orange flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <span>
                请妥善保管AES密钥和IV！这些是解密固件的关键信息，丢失将无法恢复固件数据。
                建议将密钥和加密包分开存储。
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadPanel;
