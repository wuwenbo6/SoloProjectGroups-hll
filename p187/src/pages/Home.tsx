import { Play, Download, Loader2 } from 'lucide-react';
import { Header } from '../components/Header';
import { FileUpload } from '../components/FileUpload';
import { KalmanParams } from '../components/KalmanParams';
import { DataPreview } from '../components/DataPreview';
import { ComparisonChart } from '../components/ComparisonChart';
import { StatsCards } from '../components/StatsCards';
import { TagManager } from '../components/TagManager';
import { useDataStore } from '../store/useDataStore';
import { useKalmanFilter } from '../hooks/useKalmanFilter';
import { exportToCSV } from '../utils/fileParser';

export default function Home() {
  const { tags, activeTagId, isProcessing, clearAll } = useDataStore();
  const {
    loadSampleData,
    loadMultiTagSampleData,
    processMultiTagFilter,
    processActiveTagFilter,
  } = useKalmanFilter();

  const hasData = tags.length > 0;
  const activeTag = tags.find((t) => t.tagId === activeTagId);
  const hasFiltered = activeTag?.filteredData.length > 0;
  const allFiltered = tags.every((t) => t.filteredData.length > 0);

  const handleProcessAll = async () => {
    await processMultiTagFilter();
  };

  const handleProcessActive = async () => {
    await processActiveTagFilter();
  };

  const handleExport = () => {
    if (activeTag && activeTag.filteredData.length > 0) {
      const exportName = `${activeTag.tagName}_filtered.csv`;
      exportToCSV(activeTag.filteredData, exportName);
    }
  };

  const handleExportAll = () => {
    const filteredTags = tags.filter((t) => t.filteredData.length > 0);
    filteredTags.forEach((tag) => {
      const exportName = `${tag.tagName}_filtered.csv`;
      exportToCSV(tag.filteredData, exportName);
    });
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <Header
        onLoadSample={loadSampleData}
        onLoadMultiTagSample={loadMultiTagSampleData}
        onClear={clearAll}
        hasData={hasData}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <FileUpload />
            <TagManager />
            <KalmanParams />

            {hasData && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={handleProcessAll}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                    <span>{isProcessing ? '处理中...' : '全部滤波'}</span>
                  </button>

                  {tags.length > 1 && (
                    <button
                      onClick={handleProcessActive}
                      disabled={isProcessing}
                      className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="仅处理当前标签"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {hasFiltered && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleExport}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-xl transition-all duration-200"
                      title="导出当前标签滤波后数据"
                    >
                      <Download className="w-5 h-5" />
                      <span>导出当前</span>
                    </button>

                    {allFiltered && tags.length > 1 && (
                      <button
                        onClick={handleExportAll}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-emerald-600/20 text-slate-200 hover:text-emerald-400 font-medium rounded-xl transition-all duration-200"
                        title="导出所有滤波后数据"
                      >
                        <Download className="w-5 h-5" />
                        <span>全部导出</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <DataPreview />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <StatsCards />
            <ComparisonChart />

            {!hasData && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-20 h-20 mx-auto mb-6 bg-slate-700/50 rounded-full flex items-center justify-center">
                    <svg
                      className="w-10 h-10 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-200 mb-2">
                    开始分析您的UWB数据
                  </h3>
                  <p className="text-slate-400 mb-6">
                    上传CSV或JSON格式的测距数据文件，或点击右上角"加载示例"按钮体验平台功能
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="p-3 bg-slate-700/30 rounded-lg">
                      <div className="text-cyan-400 font-semibold mb-1">自适应滤波</div>
                      <div className="text-slate-500">R矩阵在线估计</div>
                    </div>
                    <div className="p-3 bg-slate-700/30 rounded-lg">
                      <div className="text-orange-400 font-semibold mb-1">滞后补偿</div>
                      <div className="text-slate-500">趋势外推补偿</div>
                    </div>
                    <div className="p-3 bg-slate-700/30 rounded-lg">
                      <div className="text-emerald-400 font-semibold mb-1">多标签对比</div>
                      <div className="text-slate-500">同步处理对比</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-12 py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-500">
            UWB 卡尔曼滤波分析平台 · 自适应算法 · 实时降噪 · 可视化分析
          </p>
        </div>
      </footer>
    </div>
  );
}
