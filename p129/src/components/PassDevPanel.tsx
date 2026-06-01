import React, { useState } from 'react';
import { generatePassTemplate } from '../services/api.service';
import { useLLVMStore } from '../store/useLLVMStore';

const PassDevPanel: React.FC = () => {
  const [passName, setPassName] = useState('my-optimization');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'cpp' | 'cmake'>('cpp');
  
  const passTemplate = useLLVMStore(state => state.passTemplate);
  const setPassTemplate = useLLVMStore(state => state.setPassTemplate);
  const setError = useLLVMStore(state => state.setError);

  const handleGenerate = async () => {
    if (!passName.trim()) return;
    
    setIsGenerating(true);
    try {
      const template = await generatePassTemplate(passName);
      setPassTemplate(template);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate template');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-xl font-bold mb-4 text-emerald-400">🔧 LLVM Pass 开发模板</h2>
        
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-64">
            <label className="block text-sm text-slate-400 mb-1">Pass 名称</label>
            <input
              type="text"
              value={passName}
              onChange={(e) => setPassName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:border-emerald-500 focus:outline-none"
              placeholder="my-pass"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !passName.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded font-medium transition-colors"
          >
            {isGenerating ? '生成中...' : '生成模板'}
          </button>
        </div>
      </div>

      {passTemplate ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('cpp')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'cpp'
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {passName}.cpp
            </button>
            <button
              onClick={() => setActiveTab('cmake')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'cmake'
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CMakeLists.txt
            </button>
            
            <div className="ml-auto flex gap-2 p-2">
              <button
                onClick={() => handleCopy(activeTab === 'cpp' ? passTemplate.cppCode : passTemplate.cmakeCode)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                📋 复制
              </button>
              <button
                onClick={() => handleDownload(
                  activeTab === 'cpp' ? passTemplate.cppCode : passTemplate.cmakeCode,
                  activeTab === 'cpp' ? `${passName}.cpp` : 'CMakeLists.txt'
                )}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                ⬇️ 下载
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <pre className="p-4 text-sm font-mono">
              <code className="text-slate-300">
                {activeTab === 'cpp' ? passTemplate.cppCode : passTemplate.cmakeCode}
              </code>
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center max-w-lg px-4">
            <p className="text-4xl mb-4">💻</p>
            <p className="text-lg mb-4">输入 Pass 名称并点击「生成模板」</p>
            <div className="text-left bg-slate-800 rounded-lg p-4 mt-6 text-sm">
              <h3 className="text-emerald-400 font-semibold mb-2">使用说明：</h3>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li>输入你的 Pass 名称（如 my-optimization）</li>
                <li>点击「生成模板」获取 C++ 源代码和 CMake 配置</li>
                <li>下载文件并放入 LLVM 项目中编译</li>
                <li>使用 opt -load-pass-plugin 加载你的 Pass</li>
              </ol>
            </div>
            
            <div className="text-left bg-slate-800 rounded-lg p-4 mt-4 text-sm">
              <h3 className="text-blue-400 font-semibold mb-2">编译命令：</h3>
              <code className="text-slate-300 block bg-slate-900 p-2 rounded">
                mkdir build && cd build
                <br />
                cmake .. -DLLVM_DIR=/path/to/llvm/lib/cmake/llvm
                <br />
                make
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassDevPanel;
