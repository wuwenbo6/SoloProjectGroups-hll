import { useState, useEffect } from 'react';
import { Server } from 'lucide-react';
import ConnectionPanel from '@/components/ConnectionPanel';
import ServiceTree from '@/components/ServiceTree';
import JsonEditor from '@/components/JsonEditor';
import ResponsePanel from '@/components/ResponsePanel';
import InvokePanel from '@/components/InvokePanel';
import MethodInfoPanel from '@/components/MethodInfoPanel';
import TestCasePanel from '@/components/TestCasePanel';
import ProtoExportModal from '@/components/ProtoExportModal';
import { useGrpcStore } from '@/store/grpcStore';

export default function Home() {
  const { loading, showTestCasePanel } = useGrpcStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div className="text-sm text-[var(--text-secondary)]">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      <ConnectionPanel />

      <div className={`flex-1 flex overflow-hidden ${showTestCasePanel ? 'mr-80' : ''} transition-all duration-300`}>
        <div className="w-80 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-secondary)]">
          <div className="px-4 py-2.5 border-b border-[var(--border-color)] flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-primary)]">服务列表</span>
            {loading && (
              <div className="w-3 h-3 rounded-full bg-teal-400 animate-pulse" />
            )}
          </div>
          <ServiceTree />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <MethodInfoPanel />

          <div className="flex-1 flex overflow-hidden">
            <div className="w-1/2 border-r border-[var(--border-color)] flex flex-col">
              <JsonEditor />
            </div>
            <div className="w-1/2 flex flex-col">
              <ResponsePanel />
            </div>
          </div>
          <InvokePanel />
        </div>
      </div>

      <TestCasePanel />
      <ProtoExportModal />
    </div>
  );
}
