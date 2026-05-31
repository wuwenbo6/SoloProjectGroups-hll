import React, { useState, useEffect } from 'react';
import { Circle, Play, Square, Pause, Save, Trash2, ListVideo, ChevronRight, Clock, Dot } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Macro } from '../types';

export const MacroControl: React.FC = () => {
  const { 
    macros, 
    macroRecording, 
    macroPlayback,
    startMacroRecording, 
    stopMacroRecording, 
    saveMacro,
    deleteMacro,
  } = useStore();
  
  const [showModal, setShowModal] = useState(false);
  const [newMacroName, setNewMacroName] = useState('');
  const [newMacroDesc, setNewMacroDesc] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedMacro, setSelectedMacro] = useState<Macro | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (macroRecording.isRecording) {
      interval = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - macroRecording.startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [macroRecording.isRecording, macroRecording.startTime]);

  const handleStartRecording = () => {
    setRecordingTime(0);
    startMacroRecording();
  };

  const handleStopRecording = () => {
    const macro = stopMacroRecording();
    if (macro) {
      setShowModal(true);
    }
  };

  const handleSaveMacro = () => {
    if (newMacroName) {
      saveMacro(newMacroName, newMacroDesc);
      setShowModal(false);
      setNewMacroName('');
      setNewMacroDesc('');
    }
  };

  const handlePlayMacro = (macro: Macro) => {
    setSelectedMacro(macro);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-cyan-400 font-mono text-sm flex items-center gap-2">
          <ListVideo size={16} />
          宏控制
        </h3>
        <div className="flex items-center gap-2">
          {macroRecording.isRecording ? (
            <>
              <span className="text-xs font-mono text-red-400 flex items-center gap-1">
                <Dot size={12} className="animate-pulse" />
                录制中 {formatTime(recordingTime)}
              </span>
              <button
                onClick={handleStopRecording}
                className="p-2 bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-all"
              >
                <Square size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={handleStartRecording}
              disabled={macroPlayback.isPlaying}
              className="p-2 bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50"
            >
              <Circle size={16} className="fill-current" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {macros.length === 0 ? (
          <div className="text-center py-4 text-white/40 text-sm">
            暂无宏，点击录制按钮开始
          </div>
        ) : (
          macros.map((macro) => (
            <div
              key={macro.id}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all group"
            >
              <button
                onClick={() => handlePlayMacro(macro)}
                disabled={macroRecording.isRecording}
                className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-all disabled:opacity-50"
              >
                <Play size={14} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{macro.name}</div>
                <div className="text-xs text-white/50 flex items-center gap-2">
                  <Clock size={10} />
                  {Math.round(macro.totalDuration / 1000)}s · {macro.steps.length} 步
                </div>
              </div>
              <button
                onClick={() => deleteMacro(macro.id)}
                className="p-1.5 text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {macroPlayback.isPlaying && selectedMacro && (
        <div className="mt-4 pt-4 border-t border-cyan-500/10">
          <div className="flex items-center justify-between">
            <span className="text-sm text-cyan-400">
              正在播放: {selectedMacro.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50 font-mono">
                {macroPlayback.currentStep + 1} / {selectedMacro.steps.length}
              </span>
              <button
                onClick={() => {}}
                className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-all"
              >
                <Square size={14} />
              </button>
            </div>
          </div>
          <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-100"
              style={{ width: `${((macroPlayback.currentStep + 1) / selectedMacro.steps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-[#0a1628] rounded-lg border border-cyan-500/20 p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-cyan-400 mb-4">保存宏</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-1">宏名称</label>
                <input
                  type="text"
                  value={newMacroName}
                  onChange={(e) => setNewMacroName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="输入宏名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">描述 (可选)</label>
                <input
                  type="text"
                  value={newMacroDesc}
                  onChange={(e) => setNewMacroDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="简单描述"
                />
              </div>
              <div className="text-xs text-white/50">
                录制步数: {macroRecording.steps.length} 步
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSaveMacro}
                disabled={!newMacroName}
                className="flex-1 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={14} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
