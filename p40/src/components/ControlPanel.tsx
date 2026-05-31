import React from 'react';
import { useStore } from '../store/useStore';
import { useWebRTC } from '../hooks/useWebRTC';
import { Power, PowerOff, Settings, ListVideo, Link2, Link2Off } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ControlPanel: React.FC = () => {
  const { webRTC } = useStore();
  const { connect, disconnect } = useWebRTC();
  const navigate = useNavigate();

  return (
    <div className="bg-[#0a1628]/80 backdrop-blur rounded-lg p-4 border border-cyan-500/20">
      <h3 className="text-cyan-400 font-mono text-sm mb-4">控制面板</h3>
      
      <div className="space-y-3">
        <button
          onClick={() => webRTC.isConnected ? disconnect() : connect()}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-mono text-sm transition-all duration-300 ${
            webRTC.isConnected
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
          }`}
        >
          {webRTC.isConnected ? (
            <>
              <Link2Off size={16} />
              断开连接
            </>
          ) : (
            <>
              <Link2 size={16} />
              连接机器人
            </>
          )}
        </button>

        <button
          onClick={() => navigate('/logs')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-mono text-sm bg-[#1a3a5c]/50 text-white/80 border border-white/10 hover:bg-[#1a3a5c]/70 transition-all duration-300"
        >
          <ListVideo size={16} />
          操作日志
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-mono text-sm bg-[#1a3a5c]/50 text-white/80 border border-white/10 hover:bg-[#1a3a5c]/70 transition-all duration-300"
        >
          <Settings size={16} />
          系统设置
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-cyan-500/10">
        <div className="text-xs text-white/60 mb-2">快捷指令</div>
        <div className="grid grid-cols-2 gap-2">
          <button className="py-2 px-3 rounded bg-[#1a3a5c]/50 text-cyan-400 text-xs font-mono border border-cyan-500/20 hover:bg-[#1a3a5c]/70 transition-all">
            前进
          </button>
          <button className="py-2 px-3 rounded bg-[#1a3a5c]/50 text-cyan-400 text-xs font-mono border border-cyan-500/20 hover:bg-[#1a3a5c]/70 transition-all">
            后退
          </button>
          <button className="py-2 px-3 rounded bg-[#1a3a5c]/50 text-cyan-400 text-xs font-mono border border-cyan-500/20 hover:bg-[#1a3a5c]/70 transition-all">
            左转
          </button>
          <button className="py-2 px-3 rounded bg-[#1a3a5c]/50 text-cyan-400 text-xs font-mono border border-cyan-500/20 hover:bg-[#1a3a5c]/70 transition-all">
            右转
          </button>
        </div>
      </div>
    </div>
  );
};
