import React from 'react';
import { Key, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { generateKey } from '../services/api';
import type { EncryptConfig as EncryptConfigType } from '../types';
import { cn } from '../lib/utils';

interface EncryptConfigProps {
  config: EncryptConfigType;
  onChange: (config: EncryptConfigType) => void;
  disabled?: boolean;
  className?: string;
}

export const EncryptConfig: React.FC<EncryptConfigProps> = ({
  config,
  onChange,
  disabled = false,
  className,
}) => {
  const [showKey, setShowKey] = React.useState(false);
  const [showIv, setShowIv] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [keyError, setKeyError] = React.useState<string | null>(null);
  const [ivError, setIvError] = React.useState<string | null>(null);

  const validateKey = (key: string): boolean => {
    const hexRegex = /^[0-9A-Fa-f]{32}$/;
    const valid = hexRegex.test(key);
    setKeyError(valid ? null : 'AES密钥必须是32个十六进制字符 (16字节)');
    return valid;
  };

  const validateIv = (iv: string): boolean => {
    const hexRegex = /^[0-9A-Fa-f]{32}$/;
    const valid = hexRegex.test(iv);
    setIvError(valid ? null : 'IV必须是32个十六进制字符 (16字节)');
    return valid;
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    validateKey(value);
    onChange({ ...config, aesKey: value });
  };

  const handleIvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    validateIv(value);
    onChange({ ...config, aesIv: value });
  };

  const handleGenerate = async () => {
    if (disabled || isGenerating) return;
    
    setIsGenerating(true);
    try {
      const result = await generateKey();
      if (result.success && result.data) {
        setKeyError(null);
        setIvError(null);
        onChange(result.data);
      }
    } catch (error) {
      console.error('Failed to generate key:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const isValid = (): boolean => {
    const keyValid = /^[0-9A-Fa-f]{32}$/.test(config.aesKey);
    const ivValid = /^[0-9A-Fa-f]{32}$/.test(config.aesIv);
    return keyValid && ivValid;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-cyber-blue" />
          <h3 className="text-sm font-medium text-white">AES-128-CBC 加密配置</h3>
        </div>
        <button
          onClick={handleGenerate}
          disabled={disabled || isGenerating}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200',
            disabled || isGenerating
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-cyber-blue/20 text-cyber-blue hover:bg-cyber-blue/30 active:scale-95'
          )}
        >
          <RefreshCw className={cn('w-4 h-4', isGenerating && 'animate-spin')} />
          随机生成
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 flex items-center justify-between">
            <span>AES 密钥 (16字节 / 32个Hex字符)</span>
            <span className={cn(
              'text-xs',
              config.aesKey && /^[0-9A-Fa-f]{32}$/.test(config.aesKey) ? 'text-cyber-green' : 'text-gray-500'
            )}>
              {config.aesKey.length}/32
            </span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.aesKey}
              onChange={handleKeyChange}
              disabled={disabled}
              placeholder="输入32个十六进制字符..."
              className={cn(
                'w-full px-3 py-2.5 bg-navy-700/50 border rounded-lg text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all',
                keyError
                  ? 'border-red-500/50 focus:ring-red-500/30 focus:border-red-500'
                  : 'border-navy-600 focus:ring-cyber-blue/30 focus:border-cyber-blue',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white transition-colors"
              disabled={disabled}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {keyError && (
            <p className="text-xs text-red-400">{keyError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 flex items-center justify-between">
            <span>初始化向量 (IV) (16字节 / 32个Hex字符)</span>
            <span className={cn(
              'text-xs',
              config.aesIv && /^[0-9A-Fa-f]{32}$/.test(config.aesIv) ? 'text-cyber-green' : 'text-gray-500'
            )}>
              {config.aesIv.length}/32
            </span>
          </label>
          <div className="relative">
            <input
              type={showIv ? 'text' : 'password'}
              value={config.aesIv}
              onChange={handleIvChange}
              disabled={disabled}
              placeholder="输入32个十六进制字符..."
              className={cn(
                'w-full px-3 py-2.5 bg-navy-700/50 border rounded-lg text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all',
                ivError
                  ? 'border-red-500/50 focus:ring-red-500/30 focus:border-red-500'
                  : 'border-navy-600 focus:ring-cyber-blue/30 focus:border-cyber-blue',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              type="button"
              onClick={() => setShowIv(!showIv)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white transition-colors"
              disabled={disabled}
            >
              {showIv ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {ivError && (
            <p className="text-xs text-red-400">{ivError}</p>
          )}
        </div>
      </div>

      <div className={cn(
        'flex items-center gap-2 text-xs',
        isValid() ? 'text-cyber-green' : 'text-gray-500'
      )}>
        <div className={cn(
          'w-2 h-2 rounded-full',
          isValid() ? 'bg-cyber-green' : 'bg-gray-500'
        )} />
        {isValid() ? '加密配置有效' : '请输入有效的密钥和IV，或点击随机生成'}
      </div>
    </div>
  );
};

export default EncryptConfig;
