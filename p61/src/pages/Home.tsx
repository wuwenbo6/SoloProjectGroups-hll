import { Header } from '../components/Header';
import { LeftPanel } from '../components/LeftPanel';
import { RightPanel } from '../components/RightPanel';

export default function Home() {
  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel />
        <div className="flex-1 bg-slate-900 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <div className="w-20 h-20 mx-auto mb-4 opacity-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            </div>
            <h2 className="text-lg font-medium text-slate-400 mb-2">操作录制提示</h2>
            <p className="text-sm">
              在左侧面板输入目标网址，点击"开始录制"<br/>
              然后在下方预览区进行操作
            </p>
          </div>
        </div>
        <RightPanel />
      </div>
    </div>
  );
}
