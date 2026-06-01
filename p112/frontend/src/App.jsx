import React, { useState, useEffect, useCallback } from 'react';
import CodeEditor from './components/CodeEditor';
import ResourceChart from './components/ResourceChart';
import OptimizationTips from './components/OptimizationTips';
import HistoryList from './components/HistoryList';
import PipelineAnalysis from './components/PipelineAnalysis';
import ClockDomainAnalysis from './components/ClockDomainAnalysis';
import { 
  estimateResources, 
  getHistory, 
  deleteHistory,
  exportJSONReport,
  exportHTMLReport,
  downloadFile
} from './services/api';

const DEFAULT_CODE = `// HLS 资源估算示例代码
// 矩阵乘法 - 演示循环优化与资源估算

void matrix_mult(int A[64][64], int B[64][64], int C[64][64]) {
    #pragma HLS INTERFACE m_axi port=A offset=slave bundle=gmem
    #pragma HLS INTERFACE m_axi port=B offset=slave bundle=gmem
    #pragma HLS INTERFACE m_axi port=C offset=slave bundle=gmem
    #pragma HLS INTERFACE s_axilite port=return bundle=control

    int i, j, k;

    for (i = 0; i < 64; i++) {
        for (j = 0; j < 64; j++) {
            int sum = 0;
            for (k = 0; k < 64; k++) {
                #pragma HLS PIPELINE II=1
                sum += A[i][k] * B[k][j];
            }
            C[i][j] = sum;
        }
    }
}
`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [codeName, setCodeName] = useState('矩阵乘法示例');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');
  const [isExporting, setIsExporting] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await getHistory();
      if (response.success) {
        setHistory(response.data);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleEstimate = async () => {
    setIsLoading(true);
    try {
      const response = await estimateResources(code, codeName);
      if (response.success) {
        setResult(response.data);
        setSelectedHistoryId(response.data.id);
        fetchHistory();
      }
    } catch (error) {
      console.error('估算失败:', error);
      alert('估算失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistory = async (item) => {
    setSelectedHistoryId(item.id);
    setCodeName(item.code_name);
    setResult({
      id: item.id,
      lut: item.lut,
      dsp: item.dsp,
      bram: item.bram
    });
  };

  const handleDeleteHistory = async (id) => {
    if (window.confirm('确定要删除这条记录吗？')) {
      try {
        await deleteHistory(id);
        if (selectedHistoryId === id) {
          setResult(null);
          setSelectedHistoryId(null);
        }
        fetchHistory();
      } catch (error) {
        console.error('删除失败:', error);
      }
    }
  };

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const blob = await exportJSONReport(code, codeName);
      downloadFile(blob, `${codeName || 'hls_report'}.json`);
    } catch (error) {
      console.error('导出JSON失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportHTML = async () => {
    setIsExporting(true);
    try {
      const blob = await exportHTMLReport(code, codeName);
      downloadFile(blob, `${codeName || 'hls_report'}.html`);
    } catch (error) {
      console.error('导出HTML失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-dark">
      <header className="bg-dark-light border-b border-dark-lighter px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">HLS 资源估算工具</h1>
              <p className="text-sm text-gray-400">快速预估 FPGA 资源占用</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">历史记录: {history.length} 条</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportJSON}
                disabled={isExporting || !code.trim()}
                className="px-3 py-1.5 bg-dark-lighter hover:bg-gray-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-gray-300 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                JSON
              </button>
              <button
                onClick={handleExportHTML}
                disabled={isExporting || !code.trim()}
                className="px-3 py-1.5 bg-primary hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                HTML报告
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r border-dark-lighter flex flex-col">
          <CodeEditor
            code={code}
            setCode={setCode}
            codeName={codeName}
            setCodeName={setCodeName}
            onEstimate={handleEstimate}
            isLoading={isLoading}
          />
        </div>

        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex gap-2 mb-6 border-b border-dark-lighter">
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'chart'
                    ? 'text-primary border-primary'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                资源估算
              </button>
              <button
                onClick={() => setActiveTab('pipeline')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'pipeline'
                    ? 'text-primary border-primary'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                流水线分析
                {result?.pipelineInfo?.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-emerald-500 text-white rounded-full">
                    {result.pipelineInfo.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('tips')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'tips'
                    ? 'text-primary border-primary'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                优化建议
                {result?.optimizationTips?.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary text-white rounded-full">
                    {result.optimizationTips.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'chart' ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-200 mb-4">资源使用情况</h2>
                <ResourceChart data={result} />
                {result?.clockDomains && result.clockDomains.length > 0 && (
                  <div className="mt-6">
                    <ClockDomainAnalysis clockDomains={result.clockDomains} />
                  </div>
                )}
              </div>
            ) : activeTab === 'pipeline' ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-200 mb-4">流水线与性能分析</h2>
                <PipelineAnalysis 
                  pipelineInfo={result?.pipelineInfo} 
                  performance={result?.performance} 
                />
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold text-gray-200 mb-4">代码优化建议</h2>
                <OptimizationTips tips={result?.optimizationTips} />
              </div>
            )}
          </div>

          <div className="border-t border-dark-lighter p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              历史记录
            </h2>
            <HistoryList
              history={history}
              onSelect={handleSelectHistory}
              onDelete={handleDeleteHistory}
              selectedId={selectedHistoryId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
