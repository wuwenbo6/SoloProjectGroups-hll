import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, Award, Calendar, Hash, Key, Fingerprint, User, Building } from 'lucide-react';
import type { CertInfo as CertInfoType } from '../types';
import { cn } from '../lib/utils';

interface CertInfoProps {
  certInfo: CertInfoType | null;
  className?: string;
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isCertValid = (certInfo: CertInfoType): boolean => {
  const now = Date.now();
  const from = new Date(certInfo.validFrom).getTime();
  const to = new Date(certInfo.validTo).getTime();
  return now >= from && now <= to;
};

export const CertInfo: React.FC<CertInfoProps> = ({ certInfo, className }) => {
  const [expanded, setExpanded] = useState(false);

  if (!certInfo) {
    return (
      <div className={cn('p-6 border-2 border-dashed border-gray-600 rounded-lg text-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <Shield className="w-12 h-12 text-gray-500" />
          <p className="text-gray-400 text-sm">上传证书文件以查看详细信息</p>
        </div>
      </div>
    );
  }

  const isValid = isCertValid(certInfo);

  return (
    <div className={cn('bg-navy-800/50 border border-navy-600 rounded-lg overflow-hidden backdrop-blur-sm', className)}>
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-navy-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            isValid ? 'bg-cyber-green/20' : 'bg-cyber-orange/20'
          )}>
            <Award className={cn('w-5 h-5', isValid ? 'text-cyber-green' : 'text-cyber-orange')} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">
              {certInfo.subject.CN || 'Unknown Certificate'}
            </h3>
            <p className={cn(
              'text-xs',
              isValid ? 'text-cyber-green' : 'text-cyber-orange'
            )}>
              {isValid ? '证书有效' : '证书已过期或未生效'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-navy-600 p-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">证书主题 (Subject)</p>
                <div className="text-sm text-white space-y-1">
                  {certInfo.subject.CN && <p>CN: {certInfo.subject.CN}</p>}
                  {certInfo.subject.O && <p>O: {certInfo.subject.O}</p>}
                  {certInfo.subject.OU && <p>OU: {certInfo.subject.OU}</p>}
                  {certInfo.subject.C && <p>C: {certInfo.subject.C}</p>}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">颁发者 (Issuer)</p>
                <div className="text-sm text-white space-y-1">
                  {certInfo.issuer.CN && <p>CN: {certInfo.issuer.CN}</p>}
                  {certInfo.issuer.O && <p>O: {certInfo.issuer.O}</p>}
                  {certInfo.issuer.OU && <p>OU: {certInfo.issuer.OU}</p>}
                  {certInfo.issuer.C && <p>C: {certInfo.issuer.C}</p>}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">有效期</p>
                <div className="text-sm text-white space-y-1">
                  <p>生效: {formatDate(certInfo.validFrom)}</p>
                  <p>到期: {formatDate(certInfo.validTo)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Hash className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">序列号</p>
                <p className="text-sm text-white font-mono break-all">{certInfo.serialNumber}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Key className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">公钥信息</p>
                <div className="text-sm text-white space-y-1">
                  <p>算法: {certInfo.publicKeyAlgorithm}</p>
                  <p>密钥长度: {certInfo.keySize} bits</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">签名算法</p>
                <p className="text-sm text-white">{certInfo.signatureAlgorithm}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Fingerprint className="w-4 h-4 text-cyber-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">指纹信息</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">SHA-1</p>
                    <p className="text-xs text-white font-mono break-all bg-navy-900/50 p-2 rounded">
                      {certInfo.fingerprintSHA1}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">SHA-256</p>
                    <p className="text-xs text-white font-mono break-all bg-navy-900/50 p-2 rounded">
                      {certInfo.fingerprintSHA256}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertInfo;
