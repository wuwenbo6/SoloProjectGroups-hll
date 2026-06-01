import { useCallback } from 'react';
import { Network } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { useOamStore } from './store/useOamStore';
import { ControlPanel } from './components/ControlPanel';
import { TopologyView } from './components/TopologyView';
import { EventLog } from './components/EventLog';
import { PduDetails } from './components/PduDetails';
import { ServerMessage, OAMState, OAMEvent, PDUData, NodeConfig, LoopbackMode, CriticalEventCause, DyingGaspCause, ExportFormat } from './types';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export default function App() {
  const { state, events, pdus, latestPdu, setState, addEvent, addPdu, setEvents, setPdus } = useOamStore();

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'state_update':
        setState(message.payload as OAMState);
        break;
      case 'event':
        addEvent(message.payload as OAMEvent);
        break;
      case 'pdu':
        addPdu(message.payload as PDUData);
        break;
      case 'history_events':
        setEvents(message.payload.events as OAMEvent[]);
        break;
      case 'history_pdus':
        setPdus(message.payload.pdus as PDUData[]);
        break;
      default:
        break;
    }
  }, [setState, addEvent, addPdu, setEvents, setPdus]);

  const { isConnected, send } = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
  });

  const handleStart = useCallback(() => {
    send('start_simulation');
  }, [send]);

  const handleStop = useCallback(() => {
    send('stop_simulation');
  }, [send]);

  const handleTriggerFault = useCallback(() => {
    send('trigger_fault', {
      fault_type: 'manual',
      description: 'Manual fault injection',
    });
  }, [send]);

  const handleClearFault = useCallback(() => {
    send('clear_fault');
  }, [send]);

  const handleConfigureNode = useCallback((nodeId: string, config: Partial<NodeConfig>) => {
    send('configure_node', {
      node_id: nodeId,
      ...config,
    });
  }, [send]);

  const handleSetLoopbackMode = useCallback((nodeId: string, loopbackMode: LoopbackMode) => {
    send('set_loopback_mode', {
      node_id: nodeId,
      loopback_mode: loopbackMode,
    });
  }, [send]);

  const handleSendCriticalEvent = useCallback((nodeId: string, cause: CriticalEventCause, causeText: string) => {
    send('send_critical_event', {
      node_id: nodeId,
      cause: cause,
      cause_text: causeText,
    });
  }, [send]);

  const handleSendDyingGasp = useCallback((nodeId: string, cause: DyingGaspCause, causeText: string) => {
    send('send_dying_gasp', {
      node_id: nodeId,
      cause: cause,
      cause_text: causeText,
    });
  }, [send]);

  const handleExportEvents = useCallback((format: ExportFormat) => {
    const url = `/api/events/export?format=${format}`;
    window.open(url, '_blank');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative border-b border-slate-800/50 backdrop-blur-sm bg-slate-900/50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Network className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  OAM 模拟器
                </h1>
                <p className="text-xs text-slate-500">Operation, Administration, and Maintenance Simulator</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-500">后端连接</div>
                <div className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? '已连接' : '未连接'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-[1800px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          <div className="col-span-3 h-full">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 h-full overflow-y-auto">
              <ControlPanel
                state={state}
                isConnected={isConnected}
                onStart={handleStart}
                onStop={handleStop}
                onTriggerFault={handleTriggerFault}
                onClearFault={handleClearFault}
                onConfigureNode={handleConfigureNode}
                onSetLoopbackMode={handleSetLoopbackMode}
                onSendCriticalEvent={handleSendCriticalEvent}
                onSendDyingGasp={handleSendDyingGasp}
                onExportEvents={handleExportEvents}
              />
            </div>
          </div>

          <div className="col-span-6 flex flex-col gap-6 h-full">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 flex-1">
              <TopologyView state={state} latestPdu={latestPdu} />
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 flex-1">
              <PduDetails pdus={pdus} />
            </div>
          </div>

          <div className="col-span-3 h-full">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 h-full overflow-hidden">
              <EventLog events={events} />
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-800/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>OAM Simulator v1.0.0</span>
            <span className="font-mono">
              节点: {state.nodes[0].mac_address} ↔ {state.nodes[1].mac_address}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
