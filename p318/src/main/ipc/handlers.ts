import { ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import type { NodeConfig, BusConfig, NodeState, BusState, LogEntry, TimelineEvent, BusUtilizationStats, BusMode, ExportData } from '../../shared/types';
import type { NodeManager } from '../managers/NodeManager';
import type { RS485Bus } from '../bus/RS485Bus';

type StateUpdate = {
  nodes: Record<string, NodeState>;
  bus: BusState;
  utilization: BusUtilizationStats;
};

export function setupIpcHandlers(
  bus: RS485Bus,
  nodeManager: NodeManager,
  sendToRenderer: (channel: string, ...args: unknown[]) => void
): void {
  bus.setOnStateUpdate((state: StateUpdate) => {
    sendToRenderer('state:update', state);
  });

  bus.setOnLog((log: LogEntry) => {
    sendToRenderer('log:new', log);
  });

  bus.setOnTimelineEvent((event: TimelineEvent) => {
    sendToRenderer('timeline:update', event);
  });

  ipcMain.handle('sim:start', (_event, config?: BusConfig) => {
    if (config) {
      nodeManager.updateBusConfig(config);
    }
    nodeManager.startSimulation();
    return { success: true };
  });

  ipcMain.handle('sim:pause', () => {
    nodeManager.pauseSimulation();
    return { success: true };
  });

  ipcMain.handle('sim:reset', () => {
    nodeManager.resetSimulation();
    return { success: true };
  });

  ipcMain.handle('sim:getState', () => {
    return {
      nodes: nodeManager.getNodeConfigs(),
      busConfig: nodeManager.getBusConfig(),
      busState: bus.getBusState(),
      startTime: bus.getStartTime(),
      utilization: bus.getUtilizationStats(),
    };
  });

  ipcMain.handle('node:add', (_event, config?: Partial<NodeConfig>) => {
    const nodeConfig = nodeManager.createNode(config);
    return { success: true, config: nodeConfig };
  });

  ipcMain.handle('node:remove', (_event, nodeId: string) => {
    nodeManager.removeNode(nodeId);
    return { success: true };
  });

  ipcMain.handle('node:update', (_event, nodeId: string, config: Partial<NodeConfig>) => {
    nodeManager.updateNode(nodeId, config);
    return { success: true };
  });

  ipcMain.handle('node:manualSend', (_event, nodeId: string) => {
    nodeManager.manualSend(nodeId);
    return { success: true };
  });

  ipcMain.handle('bus:updateConfig', (_event, config: Partial<BusConfig>) => {
    nodeManager.updateBusConfig(config);
    return { success: true };
  });

  ipcMain.handle('bus:getConfig', () => {
    return nodeManager.getBusConfig();
  });

  ipcMain.handle('bus:setMode', (_event, mode: BusMode) => {
    nodeManager.setBusMode(mode);
    return { success: true };
  });

  ipcMain.handle('bus:getUtilization', () => {
    return bus.getUtilizationStats();
  });

  ipcMain.handle('export:data', async () => {
    try {
      const data = nodeManager.exportData();
      const result = await dialog.showSaveDialog({
        title: '导出总线统计数据',
        defaultPath: `rs485-stats-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'CSV', extensions: ['csv'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出' };
      }

      if (result.filePath.endsWith('.csv')) {
        const csv = generateCSV(data);
        fs.writeFileSync(result.filePath, csv, 'utf-8');
      } else {
        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      }

      return { success: true, path: result.filePath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message };
    }
  });
}

function generateCSV(data: ExportData): string {
  const lines: string[] = [];
  lines.push('RS-485 总线统计数据导出');
  lines.push(`导出时间,${data.exportTime}`);
  lines.push(`总线模式,${data.busMode === 'csma' ? 'CSMA/CD' : 'Modbus RTU'}`);
  lines.push('');

  lines.push('总线配置');
  lines.push(`波特率,${data.busConfig.baudRate}`);
  lines.push(`仲裁等待时间(ms),${data.busConfig.arbitrateWaitTime}`);
  lines.push(`最大重试次数,${data.busConfig.maxRetries}`);
  lines.push(`冲突检测时间(ms),${data.busConfig.collisionDetectTime}`);
  if (data.busMode === 'modbus-rtu') {
    lines.push(`从站响应延迟(ms),${data.busConfig.modbusTurnaroundDelay}`);
    lines.push(`响应超时(ms),${data.busConfig.modbusResponseTimeout}`);
  }
  lines.push('');

  lines.push('总线利用率统计');
  lines.push(`当前利用率(%),${data.utilization.currentUtilization.toFixed(2)}`);
  lines.push(`平均利用率(%),${data.utilization.avgUtilization.toFixed(2)}`);
  lines.push(`峰值利用率(%),${data.utilization.peakUtilization.toFixed(2)}`);
  lines.push(`总线忙时间(ms),${data.utilization.totalBusyTime}`);
  lines.push(`总线闲时间(ms),${data.utilization.totalIdleTime}`);
  lines.push(`总运行时间(ms),${data.utilization.totalRuntime}`);
  lines.push('');

  lines.push('节点统计');
  lines.push('节点ID,节点名称,角色,发送成功数,冲突次数,平均延时(ms),最大延时(ms),Modbus请求数,Modbus响应数,Modbus超时数,总线占用率(%)');
  for (const node of data.nodes) {
    const nodeUtil = data.utilization.perNodeStats[node.config.id];
    lines.push([
      node.config.id,
      node.config.name,
      node.config.role === 'master' ? '主站' : '从站',
      node.state.sendCount,
      node.state.conflictCount,
      node.state.avgSendDelay.toFixed(2),
      node.state.maxSendDelay.toFixed(2),
      node.state.modbusRequestCount || 0,
      node.state.modbusResponseCount || 0,
      node.state.modbusTimeoutCount || 0,
      nodeUtil ? nodeUtil.utilization.toFixed(2) : '0.00',
    ].join(','));
  }

  return lines.join('\n');
}
