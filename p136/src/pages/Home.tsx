import React, { useState } from 'react';
import {
  Cpu,
  Shield,
  Lock,
  CheckCircle,
  Github,
  HelpCircle,
  FileText,
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import CertInfo from '@/components/CertInfo';
import EncryptConfig from '@/components/EncryptConfig';
import SignEncrypt from '@/components/SignEncrypt';
import DownloadPanel from '@/components/DownloadPanel';
import Verify from '@/components/Verify';
import CertChainViewer from '@/components/CertChainViewer';
import VersionInfoPanel from '@/components/VersionInfoPanel';
import SignLogViewer from '@/components/SignLogViewer';
import type {
  CertInfo as CertInfoType,
  EncryptConfig as EncryptConfigType,
  SignEncryptResponse,
  CertChainInfo,
  VersionInfo,
} from '@/types';
import { cn } from '@/lib/utils';

type TabType = 'sign-encrypt' | 'verify' | 'logs';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('sign-encrypt');
  
  const [firmware, setFirmware] = useState<File | null>(null);
  const [privateKey, setPrivateKey] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [encryptConfig, setEncryptConfig] = useState<EncryptConfigType>({
    aesKey: '',
    aesIv: '',
  });
  const [certInfo, setCertInfo] = useState<CertInfoType | null>(null);
  const [certChain, setCertChain] = useState<CertChainInfo | undefined>(undefined);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | undefined>(undefined);
  const [signEncryptResult, setSignEncryptResult] = useState<SignEncryptResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tabs = [
    { id: 'sign-encrypt' as TabType, label: '签名加密', icon: Lock },
    { id: 'verify' as TabType, label: '验签验证', icon: CheckCircle },
    { id: 'logs' as TabType, label: '签名日志', icon: FileText },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-navy-700 bg-navy-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyber-blue to-cyber-green rounded-lg">
                <Cpu className="w-6 h-6 text-navy-900" />
              </div>
              <div>
                <h1 className="text-lg font-display font-bold text-white glow-text">
                  STM32 Firmware Signer
                </h1>
                <p className="text-xs text-gray-400">固件签名加密工具</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <HelpCircle className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex gap-2 p-1 bg-navy-800/50 rounded-lg w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-cyber-blue text-navy-900'
                      : 'text-gray-400 hover:text-white hover:bg-navy-700/50'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'sign-encrypt' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="w-5 h-5 text-cyber-blue" />
                  <h2 className="text-base font-medium text-white">固件文件</h2>
                </div>
                <FileUpload
                  label="STM32 固件文件"
                  accept=".bin"
                  description="支持 .bin 格式的STM32固件文件"
                  onFileSelected={setFirmware}
                  onFileCleared={() => setFirmware(null)}
                  selectedFile={firmware}
                  disabled={isProcessing}
                />
              </div>

              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-cyber-blue" />
                  <h2 className="text-base font-medium text-white">密钥与证书</h2>
                </div>
                <div className="space-y-4">
                  <FileUpload
                    label="X.509 私钥"
                    accept=".pem,.key"
                    description="支持 .pem, .key 格式的RSA私钥"
                    onFileSelected={setPrivateKey}
                    onFileCleared={() => setPrivateKey(null)}
                    selectedFile={privateKey}
                    disabled={isProcessing}
                  />
                  <FileUpload
                    label="X.509 证书"
                    accept=".pem,.crt,.cer"
                    description="支持 .pem, .crt, .cer 格式的证书"
                    onFileSelected={setCertificate}
                    onFileCleared={() => {
                      setCertificate(null);
                      setCertInfo(null);
                    }}
                    selectedFile={certificate}
                    disabled={isProcessing}
                  />
                </div>
              </div>

              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <EncryptConfig
                  config={encryptConfig}
                  onChange={setEncryptConfig}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <SignEncrypt
                  firmware={firmware}
                  privateKey={privateKey}
                  certificate={certificate}
                  encryptConfig={encryptConfig}
                  onCertInfoParsed={(info) => {
                    setCertInfo(info);
                    setIsProcessing(true);
                  }}
                  onComplete={(result) => {
                    setSignEncryptResult(result);
                    setIsProcessing(false);
                    if (result.data) {
                      setCertChain(result.data.certChain);
                      setVersionInfo(result.data.versionInfo);
                    }
                  }}
                  disabled={isProcessing}
                />
              </div>

              {certChain && certChain.chainLength > 1 && (
                <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                  <CertChainViewer certChain={certChain} />
                </div>
              )}

              {versionInfo && (
                <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                  <VersionInfoPanel versionInfo={versionInfo} />
                </div>
              )}

              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-cyber-blue" />
                  <h2 className="text-base font-medium text-white">证书信息</h2>
                </div>
                <CertInfo certInfo={certInfo} />
              </div>

              <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-5 border-gradient">
                <DownloadPanel result={signEncryptResult} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'verify' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-6 border-gradient">
              <Verify />
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-navy-800/30 border border-navy-700 rounded-xl p-6 border-gradient">
              <SignLogViewer />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-navy-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              STM32 Firmware Signer &copy; {new Date().getFullYear()} - 固件安全加固工具
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>AES-128-CBC</span>
              <span className="w-1 h-1 bg-navy-600 rounded-full" />
              <span>RSA-SHA256</span>
              <span className="w-1 h-1 bg-navy-600 rounded-full" />
              <span>X.509</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
