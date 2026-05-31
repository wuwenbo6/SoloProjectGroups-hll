import { useEffect, useState } from 'react';
import { Code, Play, Save, Copy, Download, Check, Image, Terminal, FileText, Settings as SettingsIcon, Trash2, Table } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store';
import { api } from '../services/api';
import { generateScript } from '../utils/codeGenerator';
import { TestCase, SelectorType } from '../../shared/types';
import { DataDrivenPanel } from './DataDrivenPanel';

export function RightPanel() {
  const {
    activeTab,
    setActiveTab,
    targetUrl,
    steps,
    scriptLanguage,
    setScriptLanguage,
    generatedScript,
    setGeneratedScript,
    isExecuting,
    setIsExecuting,
    executionResult,
    setExecutionResult,
    testCases,
    setTestCases,
    selectorPriority,
    setSelectorPriority,
  } = useStore();

  const [copied, setCopied] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [caseName, setCaseName] = useState('');
  const [caseDescription, setCaseDescription] = useState('');

  useEffect(() => {
    const script = generateScript(targetUrl, steps, scriptLanguage);
    setGeneratedScript(script);
  }, [targetUrl, steps, scriptLanguage, setGeneratedScript]);

  useEffect(() => {
    loadTestCases();
    loadSettings();
  }, []);

  const loadTestCases = async () => {
    try {
      const cases = await api.cases.getAll();
      setTestCases(cases);
    } catch (error) {
      console.error('Failed to load test cases:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const strategy = await api.settings.getSelectorStrategy();
      setSelectorPriority(strategy.priority);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleExecute = async () => {
    if (steps.length === 0) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await api.execute.run(targetUrl, steps);
      setExecutionResult(result);
    } catch (error: any) {
      setExecutionResult({
        success: false,
        logs: ['[ERROR] ' + (error.response?.data?.error || error.message)],
        duration: 0,
        error: error.message,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([generatedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = scriptLanguage === 'python' ? 'test_script.py' : 'test_script.js';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveTestCase = async () => {
    if (!caseName.trim()) return;

    try {
      await api.cases.create({
        name: caseName,
        description: caseDescription,
        url: targetUrl,
        steps,
      });
      setSaveDialogOpen(false);
      setCaseName('');
      setCaseDescription('');
      loadTestCases();
    } catch (error) {
      console.error('Failed to save test case:', error);
    }
  };

  const handleDeleteTestCase = async (id: string) => {
    if (!confirm('确定要删除此测试用例吗？')) return;

    try {
      await api.cases.delete(id);
      loadTestCases();
    } catch (error) {
      console.error('Failed to delete test case:', error);
    }
  };

  const handleMovePriority = (index: number, direction: 'up' | 'down') => {
    const newPriority = [...selectorPriority];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newPriority.length) return;

    [newPriority[index], newPriority[targetIndex]] = [newPriority[targetIndex], newPriority[index]];
    setSelectorPriority(newPriority);
  };

  const handleSaveSettings = async () => {
    try {
      await api.settings.saveSelectorStrategy({ priority: selectorPriority });
      alert('设置已保存');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const tabs = [
    { id: 'script', label: '脚本', icon: Code },
    { id: 'execute', label: '执行', icon: Play },
    { id: 'data-driven', label: '数据驱动', icon: Table },
    { id: 'cases', label: '用例', icon: FileText },
    { id: 'settings', label: '设置', icon: SettingsIcon },
  ] as const;

  return (
    <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col h-full">
      <div className="flex border-b border-slate-700">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'script' && (
          <>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <select
                value={scriptLanguage}
                onChange={(e) => setScriptLanguage(e.target.value as any)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
              </select>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyScript}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? '已复制' : '复制'}
                </button>
                <button
                  onClick={handleDownloadScript}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language={scriptLanguage === 'python' ? 'python' : 'javascript'}
                value={generatedScript}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>

            <div className="p-4 border-t border-slate-700">
              <button
                onClick={handleExecute}
                disabled={steps.length === 0 || isExecuting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Play className="w-5 h-5" />
                {isExecuting ? '执行中...' : '执行脚本'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'execute' && (
          <>
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-white font-medium mb-2">执行结果</h3>
              <p className="text-slate-400 text-sm">点击下方按钮执行录制的操作</p>
            </div>

            {executionResult?.screenshot && (
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <Image className="w-4 h-4 text-blue-400" />
                  <span className="text-white text-sm font-medium">截图</span>
                </div>
                <img
                  src={executionResult.screenshot}
                  alt="Execution screenshot"
                  className="w-full rounded-lg border border-slate-600"
                />
              </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-4 flex items-center gap-2 border-b border-slate-700">
                <Terminal className="w-4 h-4 text-green-400" />
                <span className="text-white text-sm font-medium">执行日志</span>
                {executionResult && (
                  <span
                    className={`ml-auto text-xs px-2 py-1 rounded ${
                      executionResult.success
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {executionResult.success ? '成功' : '失败'} · {executionResult.duration}ms
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-slate-900">
                {executionResult?.logs ? (
                  executionResult.logs.map((log, i) => (
                    <div
                      key={i}
                      className={`${
                        log.includes('[ERROR]') ? 'text-red-400' : 'text-slate-300'
                      } py-0.5`}
                    >
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">暂无日志，点击执行按钮开始</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-700">
              <button
                onClick={handleExecute}
                disabled={steps.length === 0 || isExecuting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Play className="w-5 h-5" />
                {isExecuting ? '执行中...' : '重新执行'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'data-driven' && <DataDrivenPanel />}

        {activeTab === 'cases' && (
          <>
            <div className="p-4 border-b border-slate-700">
              <button
                onClick={() => setSaveDialogOpen(true)}
                disabled={steps.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                保存当前用例
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {testCases.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">
                  暂无保存的测试用例
                </p>
              ) : (
                testCases.map((tc) => (
                  <div
                    key={tc.id}
                    className="bg-slate-900 rounded-lg p-4 hover:bg-slate-750 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-medium truncate">{tc.name}</h4>
                        <p className="text-slate-400 text-xs mt-1 truncate">
                          {tc.description || '无描述'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span>{tc.steps.length} 步</span>
                          <span>{new Date(tc.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleDeleteTestCase.bind(null, tc.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-white font-medium mb-4">定位策略优先级</h3>
              <p className="text-slate-400 text-sm mb-4">
                拖拽调整元素定位器的优先级顺序
              </p>

              <div className="space-y-2">
                {selectorPriority.map((type, index) => (
                  <div
                    key={type}
                    className="flex items-center gap-3 bg-slate-900 rounded-lg p-3"
                  >
                    <span className="text-slate-500 text-sm w-6">{index + 1}.</span>
                    <span className="text-white font-medium flex-1">
                      {type.toUpperCase()}
                    </span>
                    <span className="text-slate-400 text-xs">
                      {type === 'id' && '元素ID'}
                      {type === 'name' && 'name属性'}
                      {type === 'css' && 'CSS选择器'}
                      {type === 'xpath' && 'XPath表达式'}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMovePriority(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMovePriority(index, 'down')}
                        disabled={index === selectorPriority.length - 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              保存设置
            </button>
          </div>
        )}
      </div>

      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-4">保存测试用例</h3>

            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm font-medium mb-2 block">
                  用例名称
                </label>
                <input
                  type="text"
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="输入用例名称"
                />
              </div>

              <div>
                <label className="text-slate-400 text-sm font-medium mb-2 block">
                  描述（可选）
                </label>
                <textarea
                  value={caseDescription}
                  onChange={(e) => setCaseDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  placeholder="用例描述..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveTestCase}
                disabled={!caseName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
