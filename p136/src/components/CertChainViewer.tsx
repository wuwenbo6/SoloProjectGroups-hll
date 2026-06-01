import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, ArrowRight, Award, Key, Building2 } from 'lucide-react';
import type { CertChainInfo, CertInfo } from '../types';
import { cn } from '../lib/utils';

interface CertChainViewerProps {
  certChain?: CertChainInfo;
  className?: string;
}

const CertTypeBadge: React.FC<{ type: 'root' | 'intermediate' | 'leaf'; isCA?: boolean }> = ({ type, isCA }) => {
  const styles = {
    root: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    intermediate: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    leaf: 'bg-cyber-blue/20 text-cyber-blue border-cyber-blue/30',
  };

  const labels = {
    root: '根证书',
    intermediate: '中间证书',
    leaf: '签名证书',
  };

  const Icon = type === 'root' ? Award : type === 'intermediate' ? Building2 : Key;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border',
      styles[type]
    )}>
      <Icon className="w-3 h-3" />
      {labels[type]}
      {isCA && <span className="opacity-70">CA</span>}
    </span>
  );
};

const CertCard: React.FC<{
  cert: CertInfo;
  type: 'root' | 'intermediate' | 'leaf';
  isFirst?: boolean;
  isValid?: boolean;
}> = ({ cert, type, isFirst, isValid }) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const isExpired = new Date(cert.validTo) < new Date();
  const isNotYetValid = new Date(cert.validFrom) > new Date();

  return (
    <div className="relative">
      {!isFirst && (
        <div className="flex justify-center mb-2">
          <ArrowRight className="w-5 h-5 text-gray-500 rotate-90" />
        </div>
      )}
      <div className={cn(
        'p-4 rounded-lg border transition-all duration-200',
        isValid === false
          ? 'bg-red-500/10 border-red-500/30'
          : isExpired
          ? 'bg-orange-500/10 border-orange-500/30'
          : 'bg-navy-700/30 border-navy-600 hover:border-cyber-blue/50'
      )}>
        <div className="flex items-start justify-between mb-3">
          <CertTypeBadge type={type} isCA={cert.isCA} />
          <div className="flex items-center gap-1">
            {isValid === false ? (
              <ShieldAlert className="w-4 h-4 text-red-400" />
            ) : isExpired || isNotYetValid ? (
              <ShieldAlert className="w-4 h-4 text-orange-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-gray-400">主题 (CN)</p>
            <p className="text-white font-mono">{cert.subject.CN}</p>
          </div>
          {cert.subject.O && (
            <div>
              <p className="text-xs text-gray-400">组织 (O)</p>
              <p className="text-gray-200">{cert.subject.O}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">颁发者 (CN)</p>
            <p className="text-gray-200">{cert.issuer.CN}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-400">有效期从</p>
              <p className={cn(
                isNotYetValid ? 'text-orange-400' : 'text-gray-200'
              )}>{formatDate(cert.validFrom)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">有效期至</p>
              <p className={cn(
                isExpired ? 'text-red-400' : 'text-gray-200'
              )}>{formatDate(cert.validTo)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400">序列号</p>
            <p className="text-cyber-blue font-mono text-xs">{cert.serialNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">指纹 (SHA-256)</p>
            <p className="text-gray-300 font-mono text-xs break-all">{cert.fingerprintSHA256}</p>
          </div>
        </div>

        {(isExpired || isNotYetValid) && (
          <div className="mt-3 pt-3 border-t border-navy-600">
            <p className="text-xs text-orange-400 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              {isExpired ? '证书已过期' : '证书尚未生效'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const CertChainViewer: React.FC<CertChainViewerProps> = ({ certChain, className }) => {
  if (!certChain) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Shield className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">暂无证书链信息</p>
        <p className="text-gray-600 text-xs mt-1">上传CA证书以构建完整的证书链</p>
      </div>
    );
  }

  const { rootCA, intermediateCAs, leafCert, chainValid, chainLength } = certChain;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyber-blue" />
          <span className="text-sm font-medium text-white">证书链</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">共 {chainLength} 级</span>
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md',
            chainValid
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-orange-500/20 text-orange-400'
          )}>
            {chainValid ? (
              <><ShieldCheck className="w-3 h-3" /> 链有效</>
            ) : (
              <><ShieldAlert className="w-3 h-3" /> 链不完整</>
            )}
          </span>
        </div>
      </div>

      <div className="space-y-0">
        {rootCA && (
          <CertCard
            cert={rootCA}
            type="root"
            isFirst={!intermediateCAs.length}
            isValid={chainValid}
          />
        )}

        {intermediateCAs.map((cert, index) => (
          <CertCard
            key={cert.serialNumber}
            cert={cert}
            type="intermediate"
            isFirst={!rootCA && index === 0}
            isValid={chainValid}
          />
        ))}

        <CertCard
          cert={leafCert}
          type="leaf"
          isFirst={!rootCA && intermediateCAs.length === 0}
          isValid={chainValid}
        />
      </div>
    </div>
  );
};

export default CertChainViewer;
