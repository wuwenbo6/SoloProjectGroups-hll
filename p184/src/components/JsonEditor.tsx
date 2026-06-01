import { useState, useRef, useEffect } from 'react';
import { Copy, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';

export default function JsonEditor() {
  const { requestJson, setRequestJson, selectedMethod, schema } = useGrpcStore();
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      JSON.parse(requestJson);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'JSON 格式错误');
    }
  }, [requestJson]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(requestJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    if (schema) {
      setRequestJson(schema.template);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(requestJson);
      setRequestJson(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  if (!selectedMethod) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
        <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm">请从左侧选择一个方法</p>
        <p className="text-xs mt-1 opacity-70">选择后将显示请求 JSON 模板</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-[var(--text-primary)]">请求参数</h3>
          {schema && (
            <span className="text-xs text-[var(--text-secondary)] font-mono bg-[var(--bg-tertiary)] px-2 py-1 rounded">
              {schema.inputType}
            </span>
          )}
          {parseError && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              JSON 格式错误
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            title="重置为模板"
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleFormat}
            title="格式化 JSON"
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-xs font-mono"
          >
            {}
          </button>
          <button
            onClick={handleCopy}
            title="复制"
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] flex flex-col items-end pr-2 pt-3 select-none">
          {requestJson.split('\n').map((_, i) => (
            <div key={i} className="text-xs text-[var(--text-secondary)] font-mono leading-6 h-6">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={requestJson}
          onChange={(e) => setRequestJson(e.target.value)}
          spellCheck={false}
          className={`w-full h-full pl-12 pr-4 pt-3 pb-3 bg-[var(--bg-primary)] border-none outline-none resize-none font-mono text-sm leading-6 ${
            parseError ? 'text-red-400' : 'text-[var(--text-primary)]'
          }`}
          placeholder="// 请求 JSON 将在此处显示"
        />
      </div>
    </div>
  );
}
