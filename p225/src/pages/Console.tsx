import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sliders, LayoutGrid, Save } from 'lucide-react';
import { useConsoleStore } from '../store/consoleStore';
import { useConsoleInit } from '../hooks/useConsoleInit';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { GroupNavigation } from '../components/GroupNavigation';
import { SceneQuickBar } from '../components/SceneQuickBar';
import { ChannelPanel } from '../components/ChannelPanel';
import { GrandMaster } from '../components/GrandMaster';
import { BlackoutButton } from '../components/BlackoutButton';
import { PreviewPanel } from '../components/PreviewPanel';
import { MidiTimecodeDisplay } from '../components/MidiTimecodeDisplay';
import { createScene } from '../lib/api';

export default function Console() {
  const { loaded, refreshScenes } = useConsoleInit();
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const channels = useConsoleStore((s) => s.channels);
  const grandMaster = useConsoleStore((s) => s.grandMaster);
  const blackout = useConsoleStore((s) => s.blackout);
  const connected = useConsoleStore((s) => s.connected);
  const artNetConfig = useConsoleStore((s) => s.artNetConfig);
  const scenes = useConsoleStore((s) => s.scenes);
  const activeGroup = useConsoleStore((s) => s.activeGroup);
  const midiTimecode = useConsoleStore((s) => s.midiTimecode);
  const midiConnected = useConsoleStore((s) => s.midiConnected);

  const setActiveGroup = useConsoleStore((s) => s.setActiveGroup);
  const updateChannel = useConsoleStore((s) => s.updateChannel);
  const updateGrandMaster = useConsoleStore((s) => s.updateGrandMaster);
  const updateBlackout = useConsoleStore((s) => s.updateBlackout);
  const updateArtNetConfig = useConsoleStore((s) => s.updateArtNetConfig);
  const loadScene = useConsoleStore((s) => s.loadScene);

  const handleSaveScene = async () => {
    if (!saveName.trim()) return;
    const newScene = await createScene(saveName.trim(), channels);
    if (newScene) {
      await refreshScenes();
      setSaveName('');
      setShowSaveDialog(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-console-bg flex items-center justify-center">
        <div className="text-console-muted text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-console-bg flex flex-col relative">
      <header className="flex items-center justify-between px-6 py-4 bg-console-panel border-b border-console-border">
        <div className="flex items-center gap-3">
          <Sliders className="text-console-accent" size={28} />
          <div>
            <h1 className="text-xl font-bold text-console-text">Art-Net 控制台</h1>
            <p className="text-xs text-console-muted">DMX512 灯光控制</p>
          </div>
        </div>

        <MidiTimecodeDisplay
          timecode={midiTimecode}
          connected={midiConnected}
        />

        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-console-accent text-black font-medium flex items-center gap-2"
          >
            <Sliders size={18} />
            控制台
          </Link>
          <Link
            to="/scenes"
            className="px-4 py-2 rounded-lg text-console-muted hover:bg-console-border hover:text-console-text transition-colors flex items-center gap-2"
          >
            <LayoutGrid size={18} />
            场景管理
          </Link>
        </nav>
      </header>

      <ConnectionStatus
        connected={connected}
        config={artNetConfig}
        onConfigChange={updateArtNetConfig}
      />

      <SceneQuickBar
        scenes={scenes}
        onLoadScene={loadScene}
        onSaveCurrent={() => setShowSaveDialog(true)}
      />

      <GroupNavigation
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
        channels={channels}
      />

      <div className="flex flex-1 overflow-hidden">
        <ChannelPanel
          channels={channels}
          activeGroup={activeGroup}
          onChannelChange={updateChannel}
          disabled={!connected}
        />

        <div className="w-48 flex flex-col bg-console-panel">
          <GrandMaster
            value={grandMaster}
            onChange={updateGrandMaster}
            disabled={!connected}
          />

          <div className="flex-1" />

          <BlackoutButton
            active={blackout}
            onChange={updateBlackout}
            disabled={!connected}
          />
        </div>
      </div>

      <PreviewPanel
        channels={channels}
        grandMaster={grandMaster}
        blackout={blackout}
      />

      {blackout && (
        <div className="fixed inset-0 pointer-events-none border-8 border-console-warning blackout-overlay z-40" />
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-console-panel border border-console-border rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-console-text mb-4 flex items-center gap-2">
              <Save size={20} className="text-console-accent" />
              保存场景
            </h3>

            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="输入场景名称..."
              autoFocus
              className="w-full px-4 py-3 bg-console-bg border border-console-border rounded-lg text-console-text placeholder:text-console-muted focus:outline-none focus:border-console-accent mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveScene()}
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveName('');
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-console-border text-console-text hover:bg-console-border/80 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveScene}
                disabled={!saveName.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-console-accent text-black font-medium hover:bg-console-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
