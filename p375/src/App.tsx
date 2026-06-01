import { useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSimulatorStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './utils/api';
import type { PacketInfo, SwitchStatus, Port, MacTableEntry, MirrorRule, LogEntry, MirrorMatch } from './types';

import { StatusCard } from './components/SwitchControl/StatusCard';
import { PortList } from './components/SwitchControl/PortList';
import { MacTable } from './components/SwitchControl/MacTable';
import { MirrorConfig } from './components/SwitchControl/MirrorConfig';
import { PacketList } from './components/TrafficMonitor/PacketList';
import { PacketDetail } from './components/PacketDetail';
import { Console } from './components/Console';
import { TestPacketSender } from './components/TrafficMonitor/TestPacketSender';
import { Network, Cpu, Activity } from 'lucide-react';

function App() {
  const {
    switchStatus,
    ports,
    macTable,
    mirrorRules,
    originalPackets,
    mirrorPackets,
    logs,
    selectedPacket,
    setSwitchStatus,
    setPorts,
    updatePort,
    setMacTable,
    addMacEntry,
    setMirrorRules,
    addOriginalPacket,
    addMirrorPacket,
    addLog,
    setSelectedPacket,
    calculateStats,
    clearAll,
  } = useSimulatorStore();

  const handleWebSocketMessage = useCallback(
    (type: string, data: any) => {
      switch (type) {
        case 'packet':
          if ((data as PacketInfo).type === 'original') {
            addOriginalPacket(data as PacketInfo);
          } else {
            addMirrorPacket(data as PacketInfo);
          }
          calculateStats();
          break;
        case 'log':
          addLog(data as LogEntry);
          break;
        case 'status':
          setSwitchStatus(data as SwitchStatus);
          break;
        case 'mac_update':
          addMacEntry(data as MacTableEntry);
          break;
        case 'port_update':
          updatePort(data as Port);
          break;
      }
    },
    [addOriginalPacket, addMirrorPacket, addLog, setSwitchStatus, addMacEntry, updatePort, calculateStats]
  );

  useWebSocket({
    url: 'ws://localhost:8000/ws/packets',
    onMessage: handleWebSocketMessage,
  });

  useWebSocket({
    url: 'ws://localhost:8000/ws/logs',
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [status, portsData, macTableData, mirrorRulesData, originalPacketsData, mirrorPacketsData] =
          await Promise.all([
            api.getStatus() as Promise<SwitchStatus>,
            api.getPorts() as Promise<Port[]>,
            api.getMacTable() as Promise<MacTableEntry[]>,
            api.getMirrorRules() as Promise<MirrorRule[]>,
            api.getPackets('original') as Promise<PacketInfo[]>,
            api.getPackets('mirror') as Promise<PacketInfo[]>,
          ]);

        setSwitchStatus(status);
        setPorts(portsData);
        setMacTable(macTableData);
        setMirrorRules(mirrorRulesData);
        originalPacketsData.forEach(addOriginalPacket);
        mirrorPacketsData.forEach(addMirrorPacket);
        calculateStats();
      } catch (e) {
        console.error('Failed to load initial data:', e);
      }
    };

    loadInitialData();
  }, [setSwitchStatus, setPorts, setMacTable, setMirrorRules, addOriginalPacket, addMirrorPacket, calculateStats]);

  const handleStart = async () => {
    try {
      const status = await api.startSwitch();
      setSwitchStatus(status as SwitchStatus);
    } catch (e) {
      console.error('Failed to start switch:', e);
    }
  };

  const handleStop = async () => {
    try {
      const status = await api.stopSwitch();
      setSwitchStatus(status as SwitchStatus);
    } catch (e) {
      console.error('Failed to stop switch:', e);
    }
  };

  const handleReset = async () => {
    try {
      const status = await api.resetSwitch();
      setSwitchStatus(status as SwitchStatus);
      clearAll();
    } catch (e) {
      console.error('Failed to reset switch:', e);
    }
  };

  const handleClearMacTable = async () => {
    try {
      await api.clearMacTable();
      setMacTable([]);
    } catch (e) {
      console.error('Failed to clear MAC table:', e);
    }
  };

  const handleAddMirrorRule = async (
    sourcePort: number,
    monitorPort: number,
    direction: 'ingress' | 'egress' | 'both',
    match?: MirrorMatch
  ) => {
    try {
      await api.createMirrorRule({
        sourcePort,
        monitorPort,
        direction,
        match,
      });
      const rules = await api.getMirrorRules();
      setMirrorRules(rules as MirrorRule[]);
    } catch (e) {
      console.error('Failed to add mirror rule:', e);
    }
  };

  const handleDeleteMirrorRule = async (ruleId: number) => {
    try {
      await api.deleteMirrorRule(ruleId);
      const rules = await api.getMirrorRules();
      setMirrorRules(rules as MirrorRule[]);
    } catch (e) {
      console.error('Failed to delete mirror rule:', e);
    }
  };

  const handleSendPacket = async (config: {
    srcMac: string;
    dstMac: string;
    srcIp: string;
    dstIp: string;
    srcPort: number;
    dstPort: number;
    inPort: number;
    protocol: string;
    payload: string;
  }) => {
    try {
      await api.sendTestPacket(config);
    } catch (e) {
      console.error('Failed to send packet:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <header className="relative z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Network className="w-8 h-8 text-cyan-400" />
                <Activity className="w-3 h-3 text-emerald-400 absolute -bottom-0.5 -right-0.5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  P4 模拟器
                </h1>
                <p className="text-xs text-slate-400">MAC Learning + Ingress Clone</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Cpu className="w-4 h-4" />
                <span>Python + Scapy + FastAPI</span>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  switchStatus?.running
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    switchStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {switchStatus?.running ? '运行中' : '已停止'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1800px] mx-auto px-6 py-6">
        <div className="space-y-6">
          <StatusCard status={switchStatus} onStart={handleStart} onStop={handleStop} onReset={handleReset} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-6">
              <PortList ports={ports} />
              <MacTable entries={macTable} onClear={handleClearMacTable} />
              <MirrorConfig
                rules={mirrorRules}
                ports={ports}
                onAddRule={handleAddMirrorRule}
                onDeleteRule={handleDeleteMirrorRule}
              />
            </div>

            <div className="space-y-6">
              <TestPacketSender onSend={handleSendPacket} disabled={!switchStatus?.running} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px]">
                <PacketList
                  packets={originalPackets}
                  type="original"
                  title="原始数据包"
                  onSelectPacket={setSelectedPacket}
                  selectedPacketId={selectedPacket?.id}
                />
                <PacketList
                  packets={mirrorPackets}
                  type="mirror"
                  title="镜像数据包"
                  onSelectPacket={setSelectedPacket}
                  selectedPacketId={selectedPacket?.id}
                />
              </div>
            </div>
          </div>

          <Console logs={logs} onClear={clearLogs} />
        </div>
      </main>

      <AnimatePresence>
        {selectedPacket && (
          <PacketDetail packet={selectedPacket} onClose={() => setSelectedPacket(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
