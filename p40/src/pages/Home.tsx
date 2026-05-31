import React, { useRef, useEffect } from 'react';
import { VideoPlayer } from '../components/VideoPlayer';
import { Joystick } from '../components/Joystick';
import { StatusPanel } from '../components/StatusPanel';
import { ControlPanel } from '../components/ControlPanel';
import { RobotSelector } from '../components/RobotSelector';
import { MacroControl } from '../components/MacroControl';
import { VideoRecorder } from '../components/VideoRecorder';
import { useWebRTC } from '../hooks/useWebRTC';
import { useStore } from '../store/useStore';

export const Home: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setVideoElement } = useWebRTC();
  const { currentRobot } = useStore();

  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current);
    }
  }, [setVideoElement]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050d18] via-[#0a1628] to-[#0a1628] text-white p-4 md:p-6">
      <header className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent font-mono">
              ROBOT CONTROL CENTER
            </h1>
            <p className="text-white/60 text-sm mt-1 font-mono">
              WebRTC 实时控制系统 | 低延迟 H.264 视频流
            </p>
          </div>
          <div className="flex items-center gap-4">
            <RobotSelector />
            <div className="hidden md:block text-right">
              <div className="text-xs text-white/60 font-mono">操作员</div>
              <div className="text-cyan-400 font-mono text-sm">admin</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="lg:col-span-3">
          <div className="aspect-video md:aspect-[16/9]">
            <VideoPlayer videoRef={videoRef} />
          </div>
        </div>

        <div className="space-y-4">
          <StatusPanel />
          <ControlPanel />
          <MacroControl />
          <VideoRecorder videoRef={videoRef} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg p-6 border border-cyan-500/20">
          <h3 className="text-cyan-400 font-mono text-sm mb-4 text-center">
            移动控制 (左摇杆)
          </h3>
          <div className="flex justify-center">
            <Joystick side="left" label="移动" size={180} />
          </div>
        </div>

        <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg p-6 border border-cyan-500/20">
          <h3 className="text-cyan-400 font-mono text-sm mb-4 text-center">
            视角控制 (右摇杆)
          </h3>
          <div className="flex justify-center">
            <Joystick side="right" label="视角" size={180} />
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-[#0a1628]/40 rounded-lg border border-white/5">
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-white/50">
          <span>💡 提示: 使用鼠标拖拽操纵杆控制机器人</span>
          <span>📡 WebRTC P2P 连接</span>
          <span>🎬 H.264 硬件解码</span>
          <span>⚡ 力反馈虚拟墙</span>
          <span>🎯 多机器人切换</span>
          <span>⏺️ 宏录制</span>
          <span>📹 操作录像</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};
