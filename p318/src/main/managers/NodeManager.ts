import { RS485Bus } from '../bus/RS485Bus';
import type { NodeConfig, BusConfig, BusMode, ExportData } from '../../shared/types';
import { createDefaultNodeConfig, DEFAULT_BUS_CONFIG } from '../../shared/types';

export class NodeManager {
  private bus: RS485Bus;
  private nodeIndex = 0;

  constructor(bus: RS485Bus) {
    this.bus = bus;
  }

  createNode(config?: Partial<NodeConfig>): NodeConfig {
    const id = `node-${Date.now()}-${this.nodeIndex}`;
    const busConfig = this.bus.getBusConfig();
    const defaults = createDefaultNodeConfig(id, this.nodeIndex);

    if (busConfig.mode === 'modbus-rtu') {
      defaults.role = this.nodeIndex === 0 ? 'master' : 'slave';
      defaults.slaveId = this.nodeIndex === 0 ? undefined : this.nodeIndex;
      defaults.modbusPollInterval = 500;
      if (defaults.role === 'master') {
        defaults.name = '主站';
      } else {
        defaults.name = `从站 ${this.nodeIndex}`;
      }
    }

    const nodeConfig: NodeConfig = {
      ...defaults,
      ...config,
    };
    this.nodeIndex++;
    this.bus.addNode(nodeConfig);
    return nodeConfig;
  }

  removeNode(nodeId: string): void {
    this.bus.removeNode(nodeId);
  }

  updateNode(nodeId: string, config: Partial<NodeConfig>): void {
    this.bus.updateNode(nodeId, config);
  }

  updateBusConfig(config: Partial<BusConfig>): void {
    this.bus.updateBusConfig(config);
  }

  setBusMode(mode: BusMode): void {
    this.bus.updateBusConfig({ mode });
  }

  startSimulation(): void {
    this.bus.start();
  }

  pauseSimulation(): void {
    this.bus.pause();
  }

  resetSimulation(): void {
    this.bus.reset();
  }

  manualSend(nodeId: string): void {
    this.bus.manualSend(nodeId);
  }

  getNodeConfigs(): Record<string, NodeConfig> {
    const configs: Record<string, NodeConfig> = {};
    this.bus.getAllNodes().forEach((node) => {
      const config = node.getConfig();
      configs[config.id] = config;
    });
    return configs;
  }

  getBusConfig(): BusConfig {
    return this.bus.getBusConfig();
  }

  getUtilizationStats() {
    return this.bus.getUtilizationStats();
  }

  exportData(): ExportData {
    const busConfig = this.bus.getBusConfig();
    const utilization = this.bus.getUtilizationStats();
    const nodes = this.bus.getAllNodes().map((node) => ({
      config: node.getConfig(),
      state: node.getState(),
    }));

    return {
      exportTime: new Date().toISOString(),
      busConfig,
      busMode: busConfig.mode,
      utilization,
      nodes,
      logs: [],
    };
  }

  initializeDefaultNodes(count: number = 4): void {
    const mode = this.bus.getBusConfig().mode;
    this.nodeIndex = 0;

    if (mode === 'modbus-rtu') {
      this.createNode({
        role: 'master',
        name: '主站',
        modbusPollInterval: 500,
        color: '#165DFF',
      });
      for (let i = 1; i < count; i++) {
        this.createNode({
          role: 'slave',
          slaveId: i,
          name: `从站 ${i}`,
          color: DEFAULT_BUS_CONFIG.mode === 'modbus-rtu'
            ? ['#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#14C9C9'][i % 5]
            : undefined,
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        this.createNode();
      }
    }
  }
}
