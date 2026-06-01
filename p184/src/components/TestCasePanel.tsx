import { useState, useEffect } from 'react';
import { Save, Play, Trash2, BookMarked, ChevronDown, ChevronRight, Clock, X } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';
import { listTestCases, saveTestCase, deleteTestCase, getSchema } from '@/utils/api';
import { TestCase } from '@/utils/api';

export default function TestCasePanel() {
  const {
    address,
    tls,
    selectedMethod,
    requestJson,
    timeout,
    testCases,
    showTestCasePanel,
    setRequestJson,
    setTimeout,
    setTestCases,
    addTestCase,
    removeTestCase,
    toggleTestCasePanel,
    selectMethod,
    setSchema,
    serviceMethods,
    setError,
  } = useGrpcStore();

  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadTestCases();
  }, []);

  const loadTestCases = async () => {
    try {
      const cases = await listTestCases();
      setTestCases(cases);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!selectedMethod) return;

    const name = saveName.trim() || `${selectedMethod.fullMethod} ${new Date().toLocaleTimeString()}`;
    setSaving(true);
    try {
      const tc = await saveTestCase({
        name,
        address,
        tls,
        method: selectedMethod.fullMethod,
        requestJson,
        timeout,
      });
      addTestCase(tc);
      setSaveName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReplay = async (tc: TestCase) => {
    try {
      const serviceName = tc.method.split('/').filter(Boolean)[0] || '';
      const methodName = tc.method.split('/').filter(Boolean)[1] || '';

      const methods = serviceMethods[serviceName];
      if (methods) {
        const method = methods.find((m) => m.name === methodName);
        if (method) {
          selectMethod(method);
        }
      }

      setRequestJson(tc.requestJson);
      setTimeout(tc.timeout);

      try {
        const schema = await getSchema(tc.address, tc.tls, tc.method);
        setSchema(schema);
      } catch {
        // schema load failed, non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重放失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTestCase(id);
      removeTestCase(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (!showTestCasePanel) {
    return (
      <button
        onClick={toggleTestCasePanel}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-10 px-1.5 py-3 bg-[var(--bg-secondary)] border border-r-0 border-[var(--border-color)] rounded-l-lg text-[var(--text-secondary)] hover:text-teal-400 hover:border-teal-400/50 transition-all"
        title="测试用例"
      >
        <BookMarked className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 z-20 bg-[var(--bg-secondary)] border-l border-[var(--border-color)] flex flex-col shadow-xl">
      <div className="px-4 py-2.5 border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-teal-400" />
          测试用例
        </span>
        <button
          onClick={toggleTestCasePanel}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {selectedMethod && (
        <div className="px-4 py-2.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="用例名称（可选）"
              className="flex-1 px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-teal-400"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg hover:bg-teal-500/30 disabled:opacity-50 transition-all flex items-center gap-1 text-sm"
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
          </div>
          <div className="mt-1.5 text-xs text-[var(--text-secondary)] font-mono truncate">
            {selectedMethod.fullMethod}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {testCases.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
            <BookMarked className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>暂无保存的用例</p>
            <p className="text-xs mt-1">选择方法后点击保存</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {testCases.map((tc) => (
              <div key={tc.id} className="group">
                <div
                  className="px-4 py-2.5 hover:bg-[var(--bg-tertiary)] cursor-pointer flex items-start gap-2"
                  onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
                >
                  {expandedId === tc.id ? (
                    <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-[var(--text-secondary)] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-[var(--text-secondary)] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--text-primary)] truncate">{tc.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] font-mono truncate mt-0.5">
                      {tc.method}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplay(tc);
                      }}
                      className="p-1 text-teal-400 hover:bg-teal-400/10 rounded"
                      title="一键重放"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(tc.id);
                      }}
                      className="p-1 text-red-400 hover:bg-red-400/10 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expandedId === tc.id && (
                  <div className="px-4 pb-3">
                    <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 text-xs font-mono text-[var(--text-secondary)] max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                      {tc.requestJson}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {tc.timeout}s
                      </span>
                      <span>{tc.address}</span>
                      <span className="ml-auto">
                        {new Date(tc.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
