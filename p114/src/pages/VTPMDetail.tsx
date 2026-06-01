import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Check, ChevronDown, ChevronUp, Key, Hash, Download, Upload, History, AlertCircle, Shield, FileText, DownloadCloud, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

export function VTPMDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pcr' | 'certs' | 'allocation' | 'attestation' | 'keys' | 'log'>('pcr');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedCert, setExpandedCert] = useState<string | null>(null);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [nonce, setNonce] = useState('');
  const [verifyQuoteId, setVerifyQuoteId] = useState('');
  const [verifyNonce, setVerifyNonce] = useState('');
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const { data: vtpm } = useQuery({
    queryKey: ['vtpm', id],
    queryFn: () => api.getVTPM(id!),
    enabled: !!id,
  });

  const { data: pcrs = [] } = useQuery({
    queryKey: ['pcrs', id],
    queryFn: () => api.getPCRs(id!),
    enabled: !!id,
  });

  const { data: certificates = [] } = useQuery({
    queryKey: ['certificates', id],
    queryFn: () => api.getCertificates(id!),
    enabled: !!id,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations', id],
    queryFn: () => api.getAllocations(id!),
    enabled: !!id,
  });

  const { data: keys = [] } = useQuery({
    queryKey: ['keys', id],
    queryFn: () => api.getKeys(id!),
    enabled: !!id,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes', id],
    queryFn: () => api.getQuotes(id!),
    enabled: !!id,
  });

  const { data: eventLog = [] } = useQuery({
    queryKey: ['eventLog', id],
    queryFn: () => api.getEventLog(id!),
    enabled: !!id,
  });

  const { data: logExport = null } = useQuery({
    queryKey: ['logExport', id],
    queryFn: () => api.exportEventLog(id!),
    enabled: !!id && activeTab === 'log',
  });

  const exportMutation = useMutation({
    mutationFn: () => api.exportState(id!),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vtpm-${id}-state.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importMutation = useMutation({
    mutationFn: (pcrs: any[]) => api.importState(id!, pcrs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pcrs', id] });
      setShowImportModal(false);
      setImportJson('');
    },
  });

  const quoteMutation = useMutation({
    mutationFn: ({ pcrSelection, nonce }: { pcrSelection?: number[]; nonce?: string }) =>
      api.generateQuote(id!, pcrSelection, nonce),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
      queryClient.invalidateQueries({ queryKey: ['eventLog', id] });
      queryClient.invalidateQueries({ queryKey: ['pcrs', id] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ quoteId, expectedNonce }: { quoteId: string; expectedNonce?: string }) =>
      api.verifyQuote(id!, quoteId, expectedNonce),
    onSuccess: (data) => {
      setVerifyResult(data);
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });

  const logExportMutation = useMutation({
    mutationFn: () => api.exportEventLog(id!, true),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vtpm-${id}-log-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleExport = () => {
    exportMutation.mutate();
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (parsed.pcrs && Array.isArray(parsed.pcrs)) {
        importMutation.mutate(parsed.pcrs);
      } else if (Array.isArray(parsed)) {
        importMutation.mutate(parsed);
      } else {
        alert('无效的JSON格式，请提供包含pcrs数组的JSON');
      }
    } catch (e) {
      alert('JSON解析失败，请检查格式');
    }
  };

  if (!vtpm) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to="/vtpm"
          className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{vtpm.name}</h1>
          <p className="text-dark-400 mt-1">vTPM 详情</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            导出状态
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            导入状态
          </button>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-dark-400 text-sm">状态</p>
            <div className="mt-1">
              <StatusBadge status={vtpm.status} />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-sm">ID</p>
            <p className="text-white font-mono text-sm mt-1">{vtpm.id}</p>
          </div>
          <div>
            <p className="text-dark-400 text-sm">Socket 路径</p>
            <p className="text-white font-mono text-sm mt-1">{vtpm.socketPath || '-'}</p>
          </div>
          <div>
            <p className="text-dark-400 text-sm">创建时间</p>
            <p className="text-white mt-1">{new Date(vtpm.createdAt).toLocaleString()}</p>
          </div>
        </div>
        {vtpm.lastMigratedAt && (
          <div className="mt-4 pt-4 border-t border-dark-700">
            <p className="text-dark-400 text-sm">上次迁移时间</p>
            <p className="text-warning-400 mt-1">{new Date(vtpm.lastMigratedAt).toLocaleString()}</p>
          </div>
        )}
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700">
        <div className="flex border-b border-dark-700 flex-wrap">
          <button
            onClick={() => setActiveTab('pcr')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'pcr'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              PCR 寄存器
            </span>
          </button>
          <button
            onClick={() => setActiveTab('certs')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'certs'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              证书链
            </span>
          </button>
          <button
            onClick={() => setActiveTab('attestation')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'attestation'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              远程证明
            </span>
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'keys'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              密钥管理
            </span>
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'log'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              TPM 日志
            </span>
          </button>
          <button
            onClick={() => setActiveTab('allocation')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'allocation'
                ? 'text-white border-b-2 border-primary-500'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <History className="w-4 h-4" />
              分配历史
            </span>
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'pcr' && (
            <div className="space-y-2">
              {pcrs.map((pcr, index) => (
                <div
                  key={pcr.index}
                  className="flex items-center gap-4 p-3 bg-dark-700/30 hover:bg-dark-700/50 rounded-lg transition-colors group"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="w-16 text-center">
                    <span className="text-primary-400 font-mono font-bold">
                      PCR {pcr.index.toString().padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-mono text-sm break-all">{pcr.value}</p>
                    <p className="text-dark-500 text-xs mt-1">{pcr.description || 'Reserved'}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(pcr.value, pcr.index)}
                    className="p-2 text-dark-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                  >
                    {copiedIndex === pcr.index ? (
                      <Check className="w-4 h-4 text-success-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'certs' && (
            <div className="space-y-4">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="bg-dark-700/30 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedCert(expandedCert === cert.id ? null : cert.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-dark-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                        <Key className="w-5 h-5 text-primary-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-medium">{cert.type} 证书</p>
                        <p className="text-dark-400 text-sm">
                          {cert.subject}
                        </p>
                      </div>
                    </div>
                    {expandedCert === cert.id ? (
                      <ChevronUp className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    )}
                  </button>
                  {expandedCert === cert.id && (
                    <div className="px-4 pb-4 border-t border-dark-600">
                      <div className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-dark-400 text-sm">颁发者</p>
                            <p className="text-white text-sm">{cert.issuer || '-'}</p>
                          </div>
                          <div>
                            <p className="text-dark-400 text-sm">有效期至</p>
                            <p className="text-white text-sm">
                              {cert.validTo ? new Date(cert.validTo).toLocaleDateString() : '-'}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-dark-400 text-sm mb-2">PEM 内容</p>
                          <div className="relative">
                            <pre className="bg-dark-900 p-4 rounded-lg text-xs font-mono text-dark-300 overflow-x-auto max-h-48 overflow-y-auto">
                              {cert.pem}
                            </pre>
                            <button
                              onClick={() => copyToClipboard(cert.pem, parseInt(cert.id))}
                              className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {certificates.length === 0 && (
                <div className="text-center py-8 text-dark-500">
                  暂无证书
                </div>
              )}
            </div>
          )}

          {activeTab === 'attestation' && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-dark-400 text-sm mb-2">Nonce (可选)</label>
                  <input
                    type="text"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    placeholder="随机挑战值"
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => quoteMutation.mutate({ nonce: nonce || undefined })}
                    disabled={quoteMutation.isPending}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    生成 Quote
                  </button>
                </div>
              </div>

              <div className="bg-dark-700/30 rounded-lg p-4">
                <h4 className="text-white font-medium mb-3">验证 Quote</h4>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-dark-400 text-sm mb-2">Quote ID</label>
                    <select
                      value={verifyQuoteId}
                      onChange={(e) => setVerifyQuoteId(e.target.value)}
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="">选择 Quote</option>
                      {quotes.map((q: any) => (
                        <option key={q.id} value={q.id}>
                          {new Date(q.createdAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-dark-400 text-sm mb-2">期望 Nonce</label>
                    <input
                      type="text"
                      value={verifyNonce}
                      onChange={(e) => setVerifyNonce(e.target.value)}
                      placeholder="可选的 nonce 验证"
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => verifyMutation.mutate({ quoteId: verifyQuoteId, expectedNonce: verifyNonce || undefined })}
                      disabled={!verifyQuoteId || verifyMutation.isPending}
                      className="px-4 py-2 bg-success-600 hover:bg-success-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      验证
                    </button>
                  </div>
                </div>
                {verifyResult && (
                  <div className={`mt-4 p-3 rounded-lg ${verifyResult.valid ? 'bg-success-600/20 text-success-400' : 'bg-red-600/20 text-red-400'}`}>
                    {verifyResult.details}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-white font-medium">Quote 历史 ({quotes.length})</h4>
                {quotes.map((quote: any, idx: number) => (
                  <div key={quote.id} className="bg-dark-700/30 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedQuote(expandedQuote === quote.id ? null : quote.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-dark-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${quote.verified ? 'bg-success-600/20' : 'bg-warning-600/20'}`}>
                          <Shield className={`w-5 h-5 ${quote.verified ? 'text-success-400' : 'text-warning-400'}`} />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-medium">
                            Quote #{idx + 1}
                            {quote.verified && <span className="ml-2 text-success-400 text-xs">(已验证)</span>}
                            {!quote.verified && <span className="ml-2 text-warning-400 text-xs">(待验证)</span>}
                          </p>
                          <p className="text-dark-400 text-sm">{new Date(quote.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      {expandedQuote === quote.id ? (
                        <ChevronUp className="w-5 h-5 text-dark-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-dark-400" />
                      )}
                    </button>
                    {expandedQuote === quote.id && (
                      <div className="px-4 pb-4 border-t border-dark-600">
                        <div className="pt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-dark-400 text-sm">签名算法</p>
                              <p className="text-white text-sm font-mono">{quote.sigAlg}</p>
                            </div>
                            <div>
                              <p className="text-dark-400 text-sm">哈希算法</p>
                              <p className="text-white text-sm font-mono">{quote.hashAlg}</p>
                            </div>
                            <div>
                              <p className="text-dark-400 text-sm">PCR 选择</p>
                              <p className="text-white text-sm">{JSON.parse(quote.pcrSelection).join(', ')}</p>
                            </div>
                            <div>
                              <p className="text-dark-400 text-sm">Nonce</p>
                              <p className="text-white text-sm font-mono text-xs">{quote.nonce}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-dark-400 text-sm mb-2">签名</p>
                            <div className="relative">
                              <pre className="bg-dark-900 p-3 rounded-lg text-xs font-mono text-dark-300 overflow-x-auto max-h-32 overflow-y-auto break-all">
                                {quote.signature}
                              </pre>
                            </div>
                          </div>
                          <div>
                            <p className="text-dark-400 text-sm mb-2">Quote 数据</p>
                            <div className="relative">
                              <pre className="bg-dark-900 p-3 rounded-lg text-xs font-mono text-dark-300 overflow-x-auto max-h-64 overflow-y-auto">
                                {quote.quote}
                              </pre>
                              <button
                                onClick={() => copyToClipboard(quote.quote, idx + 1000)}
                                className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                              >
                                {copiedIndex === idx + 1000 ? (
                                  <Check className="w-4 h-4 text-success-400" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {quotes.length === 0 && (
                  <div className="text-center py-8 text-dark-500">
                    暂无 Quote 记录
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'keys' && (
            <div className="space-y-4">
              {keys.map((key: any) => (
                <div key={key.id} className="bg-dark-700/30 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-dark-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                        <KeyRound className="w-5 h-5 text-primary-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-medium">{key.type} 密钥</p>
                        <p className="text-dark-400 text-sm">{key.algorithm}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs ${key.isPersistent ? 'bg-success-600/20 text-success-400' : 'bg-dark-600 text-dark-400'}`}>
                        {key.isPersistent ? '持久化' : '临时'}
                      </span>
                      {expandedKey === key.id ? (
                        <ChevronUp className="w-5 h-5 text-dark-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-dark-400" />
                      )}
                    </div>
                  </button>
                  {expandedKey === key.id && (
                    <div className="px-4 pb-4 border-t border-dark-600">
                      <div className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-dark-400 text-sm">密钥句柄</p>
                            <p className="text-white text-sm font-mono">{key.keyHandle || '-'}</p>
                          </div>
                          <div>
                            <p className="text-dark-400 text-sm">创建时间</p>
                            <p className="text-white text-sm">{new Date(key.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-dark-400 text-sm mb-2">公钥 (PEM)</p>
                          <div className="relative">
                            <pre className="bg-dark-900 p-3 rounded-lg text-xs font-mono text-dark-300 overflow-x-auto max-h-48 overflow-y-auto">
                              {key.publicKeyPem}
                            </pre>
                            <button
                              onClick={() => copyToClipboard(key.publicKeyPem, parseInt(key.id))}
                              className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {key.privateKeyPem && (
                          <div>
                            <p className="text-dark-400 text-sm mb-2">私钥 (PEM)</p>
                            <div className="relative">
                              <pre className="bg-dark-900 p-3 rounded-lg text-xs font-mono text-dark-300 overflow-x-auto max-h-48 overflow-y-auto">
                                {key.privateKeyPem}
                              </pre>
                              <button
                                onClick={() => copyToClipboard(key.privateKeyPem, parseInt(key.id) + 1)}
                                className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {keys.length === 0 && (
                <div className="text-center py-8 text-dark-500">
                  暂无持久化密钥，生成 Quote 时会自动创建 AK 密钥
                </div>
              )}
            </div>
          )}

          {activeTab === 'log' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-dark-400 text-sm">共 {eventLog.length} 条事件</p>
                  {logExport?.summary && (
                    <p className="text-dark-500 text-xs mt-1">
                      PCR 0 事件: {logExport.summary.pcr0Events} |
                      证明事件: {logExport.summary.attestationEvents}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => logExportMutation.mutate()}
                  disabled={logExportMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <DownloadCloud className="w-4 h-4" />
                  导出日志
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                      <th className="pb-3 pr-4">#</th>
                      <th className="pb-3 pr-4">时间</th>
                      <th className="pb-3 pr-4">事件类型</th>
                      <th className="pb-3 pr-4">PCR</th>
                      <th className="pb-3 pr-4">事件名称</th>
                      <th className="pb-3">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventLog.map((event: any, idx: number) => (
                      <tr key={event.id} className="border-b border-dark-700/50 text-sm">
                        <td className="py-3 pr-4 text-dark-400 font-mono">{event.sequence}</td>
                        <td className="py-3 pr-4 text-dark-300 whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            event.eventType === 'ATTESTATION'
                              ? 'bg-primary-600/20 text-primary-400'
                              : 'bg-dark-600 text-dark-300'
                          }`}>
                            {event.eventType}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-primary-400 font-mono">
                          {event.pcrIndex !== undefined ? `PCR ${event.pcrIndex}` : '-'}
                        </td>
                        <td className="py-3 pr-4 text-white">{event.eventName}</td>
                        <td className="py-3 text-dark-400 font-mono text-xs max-w-[200px] truncate">
                          {event.digest || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {eventLog.length === 0 && (
                <div className="text-center py-8 text-dark-500">
                  暂无事件日志
                </div>
              )}
            </div>
          )}

          {activeTab === 'allocation' && (
            <div className="space-y-4">
              {allocations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                        <th className="pb-3 pr-4">VM ID</th>
                        <th className="pb-3 pr-4">状态</th>
                        <th className="pb-3 pr-4">分配时间</th>
                        <th className="pb-3 pr-4">释放时间</th>
                        <th className="pb-3">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((alloc: any) => (
                        <tr key={alloc.id} className="border-b border-dark-700/50 text-sm">
                          <td className="py-3 pr-4 text-white font-mono">{alloc.vmId}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              alloc.status === 'allocated' 
                                ? 'bg-success-500/20 text-success-400' 
                                : 'bg-dark-600 text-dark-400'
                            }`}>
                              {alloc.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-dark-300">
                            {alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleString() : '-'}
                          </td>
                          <td className="py-3 pr-4 text-dark-300">
                            {alloc.releasedAt ? new Date(alloc.releasedAt).toLocaleString() : '-'}
                          </td>
                          <td className="py-3 text-dark-300">{alloc.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-dark-500">
                  暂无分配记录
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-lg border border-dark-700">
            <h3 className="text-xl font-bold text-white mb-4">导入 vTPM 状态</h3>
            <div className="mb-4">
              <label className="block text-dark-400 text-sm mb-2">粘贴导出的 JSON 数据</label>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"pcrs": [{"index": 0, "value": "...", "algorithm": "SHA256"}, ...]}'
                className="w-full h-48 bg-dark-900 border border-dark-600 rounded-lg p-3 text-white font-mono text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportJson('');
                }}
                className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={!importJson.trim() || importMutation.isPending}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
