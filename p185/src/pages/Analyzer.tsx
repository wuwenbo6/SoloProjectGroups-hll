import { Header } from '@/components/Header';
import { FileUpload } from '@/components/FileUpload';
import { StatsCards } from '@/components/StatsCards';
import { PieChartView } from '@/components/PieChartView';
import { DataTable } from '@/components/DataTable';
import { PolicyRecommendations } from '@/components/PolicyRecommendations';
import { useLogStore } from '@/store/useLogStore';
import { Loader2, FileWarning } from 'lucide-react';

export function Analyzer() {
  const { parseResult, isLoading, error } = useLogStore();

  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <FileUpload />
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
            <p className="text-slate-600 mt-4">正在解析日志...</p>
          </div>
        )}
        
        {!isLoading && parseResult && (
          <>
            <StatsCards />
            <PieChartView />
            <PolicyRecommendations />
            <DataTable />
          </>
        )}
        
        {!isLoading && !parseResult && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileWarning className="w-16 h-16 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">暂无数据</h3>
            <p className="text-slate-400 max-w-md">
              请上传 audit.log 文件或点击"加载示例数据"按钮查看分析结果
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
