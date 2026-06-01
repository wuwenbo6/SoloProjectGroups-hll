import { useState } from 'react';
import { Send, Loader2, Timer, AlertTriangle, Save, FileCode } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';
import { invoke, exportProto, saveTestCase } from '@/utils/api';

export default function InvokePanel() {
  const {
    address,
    tls,
    timeout,
    selectedMethod,
    requestJson,
    setTimeout,
    setResponse,
    setError,
    setLoading,
    loading,
    error,
    addTestCase,
    setProtoContent,
    setShowProtoModal,
  } = useGrpcStore();
  const [isInvoking, setIsInvoking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleInvoke = async () => {
    if (!selectedMethod) return;

    setIsInvoking(true);
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      JSON.parse(requestJson);
    } catch (e) {
      setError('请求 JSON 格式错误: ' + (e instanceof Error ? e.message : ''));
      setIsInvoking(false);
      setLoading(false);
      return;
    }

    try {
      const resp = await invoke(address, tls, selectedMethod.fullMethod, requestJson, timeout);
      setResponse(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : '调用失败');
    } finally {
      setIsInvoking(false);
      setLoading(false);
    }
  };

  const handleQuickSave = async () => {
    if (!selectedMethod) return;
    try {
      const name = `${selectedMethod.fullMethod} ${new Date().toLocaleTimeString()}`;
      const tc = await saveTestCase({
        name,
        address,
        tls,
        method: selectedMethod.fullMethod,
        requestJson,
        timeout,
      });
      addTestCase(tc);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleExportProto = async () => {
    if (!selectedMethod) return;
    setExporting(true);
    try {
      const serviceName = selectedMethod.fullMethod.split('/')[1] || '';
      const resp = await exportProto(address, tls, serviceName);
      setProtoContent(resp.files, resp.service);
      setShowProtoModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  if (!selectedMethod) {
    return null;
  }

  return (
    <div className="px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
      {error && (
        <div className="mb-3 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm text-[var(--text-secondary)]">超时</span>
          <input
            type="number"
            value={timeout}
            onChange={(e) => setTimeout(Math.max(1, parseInt(e.target.value) || 10))}
            min="1"
            max="300"
            className="w-16 px-2 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-center text-sm text-[var(--text-primary)] focus:outline-none focus:border-teal-400"
          />
          <span className="text-sm text-[var(--text-secondary)]">秒</span>
        </div>

        <div className="flex-1" />

        <div className="text-sm text-[var(--text-secondary)] font-mono">
          {selectedMethod.fullMethod}
        </div>

        <button
          onClick={handleQuickSave}
          className="px-3 py-2 text-sm text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all flex items-center gap-1.5 border border-teal-400/30"
          title="保存为测试用例"
        >
          <Save className="w-3.5 h-3.5" />
          保存
        </button>

        <button
          onClick={handleExportProto}
          disabled={exporting}
          className="px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-all flex items-center gap-1.5 border border-cyan-400/30 disabled:opacity-50"
          title="导出 Proto 文件"
        >
          <FileCode className="w-3.5 h-3.5" />
          Proto
        </button>

        <button
          onClick={handleInvoke}
          disabled={isInvoking || selectedMethod.isClientStreaming || selectedMethod.isServerStreaming}
          className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium rounded-lg hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-teal-500/20 hover:shadow-teal-400/30 flex items-center gap-2"
        >
          {isInvoking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              调用中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              发起调用
            </>
          )}
        </button>
      </div>

      {(selectedMethod.isClientStreaming || selectedMethod.isServerStreaming) && (
        <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          流式调用（{selectedMethod.isClientStreaming ? '客户端' : ''}
          {selectedMethod.isClientStreaming && selectedMethod.isServerStreaming ? ' + ' : ''}
          {selectedMethod.isServerStreaming ? '服务端' : ''}流）暂不支持
        </div>
      )}
    </div>
  );
}
