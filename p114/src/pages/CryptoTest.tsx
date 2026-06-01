import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Lock, Unlock, PenTool, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';

type TabType = 'encrypt' | 'decrypt' | 'sign';

export function CryptoTest() {
  const [activeTab, setActiveTab] = useState<TabType>('encrypt');
  const [selectedVTPM, setSelectedVTPM] = useState('');
  const [inputData, setInputData] = useState('');
  const [signature, setSignature] = useState('');
  const [result, setResult] = useState('');
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: vtpms = [] } = useQuery({
    queryKey: ['vtpms'],
    queryFn: api.getVTPMs,
  });

  const encryptMutation = useMutation({
    mutationFn: ({ vtpmId, data }: { vtpmId: string; data: string }) =>
      api.encrypt(vtpmId, data),
    onSuccess: (response) => {
      if (response.success) {
        setResult(response.result);
      }
    },
  });

  const decryptMutation = useMutation({
    mutationFn: ({ vtpmId, data }: { vtpmId: string; data: string }) =>
      api.decrypt(vtpmId, data),
    onSuccess: (response) => {
      if (response.success) {
        setResult(response.result);
      }
    },
  });

  const signMutation = useMutation({
    mutationFn: ({ vtpmId, data }: { vtpmId: string; data: string }) =>
      api.sign(vtpmId, data),
    onSuccess: (response) => {
      if (response.success) {
        setSignature(response.result);
        setVerifyResult(null);
      }
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ vtpmId, data, signature }: { vtpmId: string; data: string; signature: string }) =>
      api.verify(vtpmId, data, signature),
    onSuccess: (response) => {
      setVerifyResult(response.valid);
    },
  });

  const handleSubmit = () => {
    if (!selectedVTPM || !inputData) return;

    setResult('');
    setVerifyResult(null);

    if (activeTab === 'encrypt') {
      encryptMutation.mutate({ vtpmId: selectedVTPM, data: inputData });
    } else if (activeTab === 'decrypt') {
      decryptMutation.mutate({ vtpmId: selectedVTPM, data: inputData });
    } else if (activeTab === 'sign') {
      signMutation.mutate({ vtpmId: selectedVTPM, data: inputData });
    }
  };

  const handleVerify = () => {
    if (!selectedVTPM || !inputData || !signature) return;
    verifyMutation.mutate({ vtpmId: selectedVTPM, data: inputData, signature });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'encrypt' as TabType, label: '加密', icon: Lock },
    { id: 'decrypt' as TabType, label: '解密', icon: Unlock },
    { id: 'sign' as TabType, label: '签名/验签', icon: PenTool },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">加解密测试</h1>
        <p className="text-dark-400 mt-1">使用vTPM进行加密、解密和签名验证测试</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl border border-dark-700">
          <div className="flex border-b border-dark-700">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setResult('');
                    setVerifyResult(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-white border-b-2 border-primary-500 bg-dark-700/30'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                选择vTPM
              </label>
              <select
                value={selectedVTPM}
                onChange={(e) => setSelectedVTPM(e.target.value)}
                className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">请选择vTPM设备</option>
                {vtpms.map((vtpm) => (
                  <option key={vtpm.id} value={vtpm.id}>
                    {vtpm.name} ({vtpm.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                {activeTab === 'encrypt' && '输入明文'}
                {activeTab === 'decrypt' && '输入密文 (Base64)'}
                {activeTab === 'sign' && '输入待签名数据'}
              </label>
              <textarea
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 resize-none font-mono text-sm"
                placeholder={
                  activeTab === 'encrypt'
                    ? '输入需要加密的文本...'
                    : activeTab === 'decrypt'
                    ? '输入需要解密的Base64编码密文...'
                    : '输入需要签名的文本...'
                }
              />
            </div>

            {activeTab === 'sign' && signature && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  签名结果
                </label>
                <div className="relative">
                  <textarea
                    value={signature}
                    readOnly
                    rows={4}
                    className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg text-success-400 font-mono text-sm resize-none pr-12"
                  />
                  <button
                    onClick={() => copyToClipboard(signature)}
                    className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                  >
                    {copied ? <Check className="w-4 h-4 text-success-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={handleVerify}
                  disabled={verifyMutation.isPending}
                  className="mt-4 w-full px-4 py-2 bg-dark-600 hover:bg-dark-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  验证签名
                </button>

                {verifyResult !== null && (
                  <div
                    className={`mt-4 flex items-center gap-2 p-3 rounded-lg ${
                      verifyResult
                        ? 'bg-success-600/20 text-success-400'
                        : 'bg-red-600/20 text-red-400'
                    }`}
                  >
                    {verifyResult ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        签名验证通过
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        签名验证失败
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selectedVTPM || !inputData}
              className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {activeTab === 'encrypt' && '加密'}
              {activeTab === 'decrypt' && '解密'}
              {activeTab === 'sign' && '签名'}
            </button>
          </div>
        </div>

        <div className="bg-dark-800 rounded-xl border border-dark-700">
          <div className="p-4 border-b border-dark-700">
            <h3 className="text-white font-semibold">结果</h3>
          </div>
          <div className="p-6">
            {result ? (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(result)}
                  className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded z-10"
                >
                  {copied ? <Check className="w-4 h-4 text-success-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <pre className="bg-dark-900 p-4 rounded-lg text-success-400 font-mono text-sm overflow-x-auto break-all whitespace-pre-wrap">
                  {result}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-dark-500">
                {activeTab === 'encrypt' && <Lock className="w-12 h-12 mb-4 opacity-50" />}
                {activeTab === 'decrypt' && <Unlock className="w-12 h-12 mb-4 opacity-50" />}
                {activeTab === 'sign' && !signature && <PenTool className="w-12 h-12 mb-4 opacity-50" />}
                {activeTab === 'sign' && signature && <div className="text-success-400">签名完成，上方显示签名结果</div>}
                {activeTab !== 'sign' && <p>执行操作后结果将显示在这里</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
        <h3 className="text-white font-semibold mb-4">操作说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary-400">
              <Lock className="w-4 h-4" />
              <span className="font-medium">加密</span>
            </div>
            <p className="text-dark-400">
              使用vTPM的密钥对输入的明文进行AES加密，输出Base64编码的密文。
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-success-400">
              <Unlock className="w-4 h-4" />
              <span className="font-medium">解密</span>
            </div>
            <p className="text-dark-400">
              将Base64编码的密文解密为原始明文，确保使用相同的vTPM设备。
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <PenTool className="w-4 h-4" />
              <span className="font-medium">签名/验签</span>
            </div>
            <p className="text-dark-400">
              使用vTPM对数据进行数字签名，并可验证签名的有效性。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
