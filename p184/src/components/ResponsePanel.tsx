import { useState } from 'react';
import { Copy, Check, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';

export default function ResponsePanel() {
  const { response, selectedMethod, schema } = useGrpcStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!response?.response) return;
    try {
      await navigator.clipboard.writeText(response.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const formatJson = (json: string) => {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  };

  if (!selectedMethod) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
        <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 opacity-50">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <p className="text-sm">响应将在此处显示</p>
        <p className="text-xs mt-1 opacity-70">选择方法并发起调用后查看结果</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-[var(--text-primary)]">响应结果</h3>
          {schema && (
            <span className="text-xs text-[var(--text-secondary)] font-mono bg-[var(--bg-tertiary)] px-2 py-1 rounded">
              {schema.outputType}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {response && (
            <>
              <span
                className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                  response.status === 'OK'
                    ? 'bg-teal-500/10 text-teal-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {response.status === 'OK' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {response.status}
              </span>
              <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {response.duration}
              </span>
              {response.response && (
                <button
                  onClick={handleCopy}
                  title="复制响应"
                  className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-teal-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!response && (
          <div className="text-center text-[var(--text-secondary)]">
            <p className="text-sm">点击 "发起调用" 按钮</p>
            <p className="text-xs mt-1 opacity-70">以执行 gRPC 请求</p>
          </div>
        )}

        {response?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
            <div className="flex items-center gap-2 mb-2 font-medium">
              <XCircle className="w-4 h-4" />
              调用错误
            </div>
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {response.error}
            </pre>
          </div>
        )}

        {response?.response && (
          <pre className="text-sm font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)]">
            {formatJson(response.response)}
          </pre>
        )}
      </div>
    </div>
  );
}
