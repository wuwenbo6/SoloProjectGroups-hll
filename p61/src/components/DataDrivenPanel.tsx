import { useState, useRef } from 'react';
import { Play, Upload, Download, Table, Layers, Zap, FileText, Check, X, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../services/api';
import { TestDataRow } from '../../shared/types';

export function DataDrivenPanel() {
  const {
    targetUrl,
    steps,
    testData,
    setTestData,
    parallelExecution,
    setParallelExecution,
    maxConcurrency,
    setMaxConcurrency,
    dataDrivenResult,
    setDataDrivenResult,
    isDataDrivenExecuting,
    setIsDataDrivenExecuting,
    scriptLanguage,
  } = useStore();

  const [csvContent, setCsvContent] = useState('');
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvContent(text);

    try {
      const data = await api.dataDriven.parseCSV(text);
      setTestData(data);
    } catch (error) {
      console.error('Failed to parse CSV:', error);
    }
  };

  const handleParseCSV = async () => {
    try {
      const data = await api.dataDriven.parseCSV(csvContent);
      setTestData(data);
    } catch (error) {
      console.error('Failed to parse CSV:', error);
    }
  };

  const handleGenerateCSV = async () => {
    if (testData.length === 0) return;

    const headers = Object.keys(testData[0]);
    const csv = await api.dataDriven.generateCSV(headers, testData);
    setCsvContent(csv);
  };

  const handleDownloadCSV = () => {
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExecute = async () => {
    if (steps.length === 0) return;

    setIsDataDrivenExecuting(true);
    setDataDrivenResult(null);

    try {
      const result = await api.dataDriven.execute(
        targetUrl,
        steps,
        testData,
        parallelExecution,
        maxConcurrency
      );
      setDataDrivenResult(result);
    } catch (error: any) {
      console.error('Execution failed:', error);
    } finally {
      setIsDataDrivenExecuting(false);
    }
  };

  const handleDownloadJUnitReport = () => {
    if (!dataDrivenResult?.junitReport) return;

    const blob = new Blob([dataDrivenResult.junitReport], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'junit-report.xml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJUnitReport = async () => {
    if (!dataDrivenResult?.junitReport) return;

    await navigator.clipboard.writeText(dataDrivenResult.junitReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addTestDataRow = () => {
    const headers = testData.length > 0 ? Object.keys(testData[0]) : ['username', 'password'];
    const newRow: TestDataRow = {};
    headers.forEach((h) => (newRow[h] = ''));
    setTestData([...testData, newRow]);
  };

  const removeTestDataRow = (index: number) => {
    setTestData(testData.filter((_, i) => i !== index));
  };

  const updateTestDataCell = (rowIndex: number, key: string, value: string) => {
    const newData = [...testData];
    newData[rowIndex] = { ...newData[rowIndex], [key]: value };
    setTestData(newData);
  };

  const addColumn = () => {
    const columnName = prompt('输入新列名:');
    if (!columnName) return;

    setTestData(
      testData.map((row) => ({
        ...row,
        [columnName]: '',
      }))
    );
  };

  const headers = testData.length > 0 ? Object.keys(testData[0]) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Table className="w-5 h-5 text-cyan-400" />
          数据驱动测试
        </h3>
        <p className="text-slate-400 text-xs mt-1">
          使用CSV参数批量执行测试，支持并行执行
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            CSV数据
          </h4>

          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="username,password&#10;user1,pass123&#10;user2,pass456"
            className="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500 resize-none"
          />

          <div className="flex gap-2 mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 px-3 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              上传CSV
            </button>
            <button
              onClick={handleParseCSV}
              disabled={!csvContent}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm py-2 px-3 rounded-lg transition-colors"
            >
              解析
            </button>
            <button
              onClick={handleGenerateCSV}
              disabled={testData.length === 0}
              className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm py-2 px-3 rounded-lg transition-colors"
            >
              生成
            </button>
            <button
              onClick={handleDownloadCSV}
              disabled={!csvContent}
              className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm py-2 px-3 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <Layers className="w-4 h-4" />
              测试数据
              <span className="text-slate-400 font-normal">({testData.length} 行)</span>
            </h4>
            <div className="flex gap-2">
              <button
                onClick={addColumn}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white py-1 px-2 rounded transition-colors"
              >
                + 列
              </button>
              <button
                onClick={addTestDataRow}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded transition-colors"
              >
                + 行
              </button>
            </div>
          </div>

          {testData.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-8">
              暂无测试数据，上传CSV或手动添加
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 py-2 px-2">#</th>
                    {headers.map((header) => (
                      <th key={header} className="text-left text-slate-400 py-2 px-2">
                        {header}
                      </th>
                    ))}
                    <th className="text-left text-slate-400 py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {testData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-2 px-2 text-slate-500">{rowIndex + 1}</td>
                      {headers.map((header) => (
                        <td key={header} className="py-2 px-2">
                          <input
                            type="text"
                            value={row[header] || ''}
                            onChange={(e) => updateTestDataCell(rowIndex, header, e.target.value)}
                            className="w-full bg-transparent text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeTestDataRow(rowIndex)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-slate-900 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            执行配置
          </h4>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">并行执行</span>
              <button
                onClick={() => setParallelExecution(!parallelExecution)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  parallelExecution ? 'bg-green-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                    parallelExecution ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">最大并发数</span>
              <select
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
          </div>
        </div>

        {dataDrivenResult && (
          <div className="bg-slate-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              执行结果
            </h4>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{dataDrivenResult.totalTests}</p>
                <p className="text-xs text-slate-400">总用例</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{dataDrivenResult.passedTests}</p>
                <p className="text-xs text-slate-400">通过</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{dataDrivenResult.failedTests}</p>
                <p className="text-xs text-slate-400">失败</p>
              </div>
            </div>

            <p className="text-slate-400 text-xs mb-3">
              总耗时: {dataDrivenResult.duration}ms
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {dataDrivenResult.results.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded ${
                    result.success ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <X className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-white text-xs">Test {index + 1}</span>
                    <span className="text-slate-500 text-xs">
                      ({result.duration}ms)
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs">
                    {Object.entries(result.testData)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDownloadJUnitReport}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 px-3 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                下载JUnit报告
              </button>
              <button
                onClick={handleCopyJUnitReport}
                className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 px-3 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <FileText className="w-4 h-4" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-700">
        <button
          onClick={handleExecute}
          disabled={steps.length === 0 || testData.length === 0 || isDataDrivenExecuting}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Play className="w-5 h-5" />
          {isDataDrivenExecuting ? '执行中...' : `批量执行 (${testData.length} 用例)`}
        </button>
      </div>
    </div>
  );
}
