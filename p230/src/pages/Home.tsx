import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Globe, Settings } from 'lucide-react';
import QueryInput from '../components/QueryInput';
import StatusBadge from '../components/StatusBadge';
import ChainVisualizer from '../components/ChainVisualizer';
import RecordDetails from '../components/RecordDetails';
import VerificationSteps from '../components/VerificationSteps';
import VerificationTimeline from '../components/VerificationTimeline';
import TrustAnchorManager from '../components/TrustAnchorManager';
import { dnssecAPI } from '../utils/api';
import type { RecordType, VerifyResponse, VerificationStatus } from '../types';
import { formatTimestamp } from '../utils/format';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnchorManager, setShowAnchorManager] = useState(false);

  const handleVerify = async (domain: string, recordType: RecordType) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await dnssecAPI.verify({ domain, recordType });
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证请求失败');
    } finally {
      setIsLoading(false);
    }
  };

  const showPending = isLoading && !result;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <header className="py-8 px-6">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-6xl mx-auto flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  DNSSEC 验证器
                </h1>
                <p className="text-xs text-slate-500">DNS Security Extensions Validator</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAnchorManager(!showAnchorManager)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  showAnchorManager
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">信任锚</span>
              </button>
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                <Globe className="w-4 h-4" />
                <span>DNSSEC 签名验证工具</span>
              </div>
            </div>
          </motion.div>
        </header>

        <main className="px-6 pb-16">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="text-center mb-10"
            >
              <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                验证 DNS 响应的真实性
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                通过解析 RRSIG 记录并使用 DNSKEY 验证签名，确保您的 DNS 查询结果未被篡改
              </p>
            </motion.div>

            <div className="mb-8">
              <QueryInput onSubmit={handleVerify} isLoading={isLoading} />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-3xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center"
              >
                {error}
              </motion.div>
            )}

            {showPending && (
              <div className="space-y-8">
                <StatusBadge
                  status="pending"
                  domain="正在查询..."
                  recordType="..."
                />
              </div>
            )}

            {result && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="space-y-10"
              >
                <StatusBadge
                  status={result.overallStatus as VerificationStatus}
                  domain={result.domain}
                  recordType={result.recordType}
                  duration={result.duration}
                />

                <div className="text-center text-sm text-slate-500">
                  验证时间: {formatTimestamp(result.timestamp)}
                </div>

                <ChainVisualizer chain={result.chain} />

                <VerificationSteps steps={result.steps} />

                {result.timeline && result.timeline.length > 0 && (
                  <VerificationTimeline timeline={result.timeline} totalDuration={result.duration} />
                )}

                <RecordDetails
                  chain={result.chain}
                  targetRecords={result.targetRecords}
                />
              </motion.div>
            )}

            {showAnchorManager && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="mt-10"
              >
                <TrustAnchorManager />
              </motion.div>
            )}

            {!result && !isLoading && !error && !showAnchorManager && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="w-full max-w-3xl mx-auto mt-12 p-8 bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50"
              >
                <h3 className="text-lg font-semibold text-white mb-4 text-center">DNSSEC 验证流程</h3>
                <div className="grid sm:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🔍</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">查询 DS 记录</h4>
                    <p className="text-xs text-slate-400">从父域获取委托签名记录</p>
                  </div>
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🔑</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">验证 DNSKEY</h4>
                    <p className="text-xs text-slate-400">使用 KSK 验证区域公钥签名</p>
                  </div>
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">验证 RRSIG</h4>
                    <p className="text-xs text-slate-400">使用 ZSK 验证目标记录签名</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </main>

        <footer className="py-6 px-6 border-t border-slate-800/50">
          <div className="max-w-6xl mx-auto text-center text-sm text-slate-500">
            <p>DNSSEC 验证工具 - 保护您的 DNS 查询安全</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
