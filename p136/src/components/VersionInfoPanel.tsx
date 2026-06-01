import React from 'react';
import { Tag, Hash, Cpu, GitBranch, Clock, FileText } from 'lucide-react';
import type { VersionInfo } from '../types';
import { cn } from '../lib/utils';

interface VersionInfoPanelProps {
  versionInfo?: VersionInfo;
  className?: string;
}

const InfoRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
}> = ({ icon: Icon, label, value, highlight }) => {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        'p-1.5 rounded-md mt-0.5',
        highlight ? 'bg-cyber-blue/20 text-cyber-blue' : 'bg-navy-600 text-gray-400'
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={cn(
          'text-sm font-mono',
          highlight ? 'text-cyber-blue' : 'text-white'
        )}>{value}</p>
      </div>
    </div>
  );
};

export const VersionInfoPanel: React.FC<VersionInfoPanelProps> = ({ versionInfo, className }) => {
  if (!versionInfo) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Tag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">暂无版本信息</p>
        <p className="text-gray-600 text-xs mt-1">签名时将自动生成版本信息</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-cyber-blue" />
        <span className="text-sm font-medium text-white">版本信息</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoRow
          icon={Tag}
          label="固件版本"
          value={versionInfo.firmwareVersion}
          highlight
        />
        <InfoRow
          icon={FileText}
          label="包版本"
          value={versionInfo.packageVersion}
        />
        <InfoRow
          icon={Hash}
          label="密钥版本"
          value={versionInfo.keyVersion}
        />
        {versionInfo.buildNumber && (
          <InfoRow
            icon={Clock}
            label="构建号"
            value={`#${versionInfo.buildNumber}`}
          />
        )}
        {versionInfo.hardwareVersion && (
          <InfoRow
            icon={Cpu}
            label="硬件版本"
            value={versionInfo.hardwareVersion}
          />
        )}
        {versionInfo.revision && (
          <InfoRow
            icon={GitBranch}
            label="修订号"
            value={versionInfo.revision}
          />
        )}
      </div>

      {versionInfo.changelog && (
        <div className="mt-4 p-3 bg-navy-700/30 rounded-lg border border-navy-600">
          <p className="text-xs text-gray-400 mb-2">更新说明</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{versionInfo.changelog}</p>
        </div>
      )}
    </div>
  );
};

export default VersionInfoPanel;
