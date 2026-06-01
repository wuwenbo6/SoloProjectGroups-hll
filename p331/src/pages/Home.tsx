import { useState, useEffect, useCallback } from 'react';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import TopologyCanvas from '@/components/TopologyCanvas';
import ControlPanel from '@/components/ControlPanel';
import RouteTablePanel from '@/components/RouteTablePanel';
import EventLog from '@/components/EventLog';
import PresetSelector from '@/components/PresetSelector';
import { updateNodePosition } from '@/api/simulator';
import type { PresetType } from '@/types/simulator';

export default function Home() {
  const {
    topology,
    selectedRouterId,
    trafficEdges,
    events: storeEvents,
    isLoading,
    error,
    activePreset,
    fetchTopology,
    loadPreset,
    selectRouter,
    sendJoin,
    sendPrune,
    switchSPT,
    registerSource,
    addEvent,
  } = useSimulatorStore();

  const { events: wsEvents, connected } = useWebSocket();
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  useEffect(() => {
    for (const ev of wsEvents) {
      addEvent(ev);
    }
  }, [wsEvents, addEvent]);

  const handlePreset = useCallback(
    (preset: PresetType) => {
      loadPreset(preset);
      setSelectedReceiverId(null);
    },
    [loadPreset]
  );

  const handleRouterClick = useCallback(
    (id: string) => {
      selectRouter(id);
      const router = topology?.routers.find((r) => r.id === id);
      if (router?.type === 'receiver') {
        setSelectedReceiverId(id);
      }
    },
    [selectRouter, topology]
  );

  const handleRouterDrag = useCallback(
    (id: string, x: number, y: number) => {
      if (!topology) return;
      const updatedRouters = topology.routers.map((r) =>
        r.id === id ? { ...r, x, y } : r
      );
      useSimulatorStore.setState({
        topology: { ...topology, routers: updatedRouters },
      });
      updateNodePosition(id, x, y).catch(() => {});
    },
    [topology]
  );

  const handleJoin = useCallback(
    (group: string, sourceId: string | undefined, joinType: 'starg' | 'sg') => {
      const receiverId = selectedReceiverId;
      if (!receiverId) {
        const receivers = topology?.routers.filter((r) => r.type === 'receiver') ?? [];
        if (receivers.length === 0) return;
        sendJoin({
          router_id: receivers[0].id,
          group,
          source: sourceId,
          join_type: joinType,
        });
        return;
      }
      sendJoin({
        router_id: receiverId,
        group,
        source: sourceId,
        join_type: joinType,
      });
    },
    [topology, sendJoin, selectedReceiverId]
  );

  const handlePrune = useCallback(
    (group: string, sourceId: string | undefined, pruneType: 'starg' | 'sg') => {
      const receiverId = selectedReceiverId;
      if (!receiverId) {
        const receivers = topology?.routers.filter((r) => r.type === 'receiver') ?? [];
        if (receivers.length === 0) return;
        sendPrune({
          router_id: receivers[0].id,
          group,
          source: sourceId,
          prune_type: pruneType,
        });
        return;
      }
      sendPrune({
        router_id: receiverId,
        group,
        source: sourceId,
        prune_type: pruneType,
      });
    },
    [topology, sendPrune, selectedReceiverId]
  );

  const handleSwitchSPT = useCallback(
    (group: string, sourceId: string) => {
      const receiverId = selectedReceiverId;
      if (!receiverId) {
        const receivers = topology?.routers.filter((r) => r.type === 'receiver') ?? [];
        if (receivers.length === 0) return;
        switchSPT({
          receiver_id: receivers[0].id,
          group,
          source_id: sourceId,
        });
        return;
      }
      switchSPT({
        receiver_id: receiverId,
        group,
        source_id: sourceId,
      });
    },
    [topology, switchSPT, selectedReceiverId]
  );

  const handleRegister = useCallback(
    (sourceId: string, group: string, sourceIp?: string, packetSourceIp?: string) => {
      registerSource({
        source_id: sourceId,
        group,
        source_ip: sourceIp,
        packet_source_ip: packetSourceIp,
      });
    },
    [registerSource]
  );

  return (
    <div className="h-screen w-screen bg-[#0a0e1a] flex flex-col overflow-hidden">
      <PresetSelector activePreset={activePreset} onSelect={handlePreset} />

      <div className="flex-1 flex overflow-hidden">
        <ControlPanel
          topology={topology}
          onPreset={handlePreset}
          onJoin={handleJoin}
          onPrune={handlePrune}
          onSwitchSPT={handleSwitchSPT}
          onRegister={handleRegister}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          activePreset={activePreset}
          selectedReceiverId={selectedReceiverId}
        />

        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0e1a]/80">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-cyan-400 text-sm">加载中...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-red-900/80 border border-red-500/50 rounded px-4 py-2 text-red-300 text-sm">
              {error}
            </div>
          )}
          {!connected && (
            <div className="absolute top-2 right-2 z-20 bg-red-900/60 border border-red-500/30 rounded px-3 py-1 text-red-400 text-xs">
              WebSocket 未连接
            </div>
          )}
          <TopologyCanvas
            topology={topology}
            trafficEdges={isPlaying ? trafficEdges : []}
            selectedRouterId={selectedRouterId}
            onRouterClick={handleRouterClick}
            onRouterDrag={handleRouterDrag}
          />
        </div>

        <RouteTablePanel selectedRouterId={selectedRouterId} />
      </div>

      <EventLog events={storeEvents} />
    </div>
  );
}
