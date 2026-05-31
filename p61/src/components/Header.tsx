import { Video, VideoOff, Settings } from 'lucide-react';
import { useStore } from '../store';

export function Header() {
  const { isRecording, setIsRecording, setActiveTab } = useStore();

  return (
    <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Video className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-semibold text-lg">Selenium Recorder</h1>
          <p className="text-slate-400 text-xs">自动化测试录制工具</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <span className="flex items-center gap-2 text-red-400 text-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              录制中
            </span>
          ) : (
            <span className="text-slate-400 text-sm">未录制</span>
          )}
        </div>

        <button
          onClick={() => setActiveTab('settings')}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="设置"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
