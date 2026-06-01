import { useState } from 'react';
import { Cpu, Github, HelpCircle } from 'lucide-react';
import { FileUpload } from '../components/FileUpload';
import { ModuleTree } from '../components/ModuleTree';
import { NodeDetails } from '../components/NodeDetails';
import { DeviceConfigForm } from '../components/DeviceConfigForm';
import { ExportPanel } from '../components/ExportPanel';
import { StatusBar } from '../components/StatusBar';
import { useAppStore } from '../store/appStore';

export default function Home() {
  const { parsedGSDML } = useAppStore();
  const [activeTab, setActiveTab] = useState<'config' | 'details'>('config');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-[#165DFF] flex items-center justify-center">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                PROFINET GSDML 配置工具
              </h1>
              <p className="text-xs text-gray-500">
                解析GSDML文件，配置PROFINET设备参数
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <HelpCircle className="w-5 h-5 text-gray-500" />
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Github className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </header>

      <StatusBar />

      <main className="flex-1 flex flex-col overflow-hidden">
        {!parsedGSDML ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-xl">
              <FileUpload />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
              <aside className="w-80 border-r border-gray-200 bg-white overflow-hidden flex flex-col">
                <ModuleTree />
              </aside>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-gray-200 bg-white px-4">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setActiveTab('config')}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'config'
                          ? 'border-[#165DFF] text-[#165DFF]'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      设备配置
                    </button>
                    <button
                      onClick={() => setActiveTab('details')}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'details'
                          ? 'border-[#165DFF] text-[#165DFF]'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      节点详情
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden bg-gray-50">
                  {activeTab === 'config' ? <DeviceConfigForm /> : <NodeDetails />}
                </div>
              </div>
            </div>

            <ExportPanel />
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>PROFINET GSDML Configuration Tool v1.0</span>
          <span>支持 GSDML 2.3+ 格式</span>
        </div>
      </footer>
    </div>
  );
}
