import { mappingService } from './MappingService';
import { configService } from './ConfigService';
import { MappingRule, OpcuaNode, ServerStatus } from '../../shared/types';

type DataTypeMap = Record<string, any>;

const REGISTER_TYPE_READONLY: Record<string, boolean> = {
  'Coil': false,
  'DiscreteInput': true,
  'InputRegister': true,
  'HoldingRegister': false,
};

const REGISTER_TYPE_DESCRIPTION: Record<string, string> = {
  'Coil': '线圈 - 可读写布尔量',
  'DiscreteInput': '离散输入 - 只读布尔量',
  'InputRegister': '输入寄存器 - 只读16位数值，用于传感器数据采集',
  'HoldingRegister': '保持寄存器 - 可读写16位数值，用于控制参数存储',
};

class OpcuaService {
  private running = false;
  private startTime: string | null = null;
  private server: any = null;
  private addressSpace: any = null;
  private nodeValues: Map<string, any> = new Map();
  private connectedClients = 0;

  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.running) {
      return { success: false, message: '服务器已在运行' };
    }

    try {
      const config = configService.getConfig();
      const rules = mappingService.getAllRules();

      if (rules.length === 0) {
        return { success: false, message: '没有映射规则，请先配置映射规则' };
      }

      await this.initializeAddressSpace(rules);
      this.running = true;
      this.startTime = new Date().toISOString();
      this.simulateDataUpdates();

      console.log(`OPC UA Server started on port ${config.opcuaPort}`);
      return { success: true, message: `OPC UA服务器已启动，端点: opc.tcp://localhost:${config.opcuaPort}${config.opcuaEndpoint}` };
    } catch (e) {
      return { success: false, message: `启动失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  public async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.running) {
      return { success: false, message: '服务器未运行' };
    }

    try {
      if (this.server) {
        await this.server.shutdown();
        this.server = null;
      }
      this.running = false;
      this.startTime = null;
      this.addressSpace = null;
      this.nodeValues.clear();
      return { success: true, message: 'OPC UA服务器已停止' };
    } catch (e) {
      return { success: false, message: `停止失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  public getStatus(): ServerStatus {
    const config = configService.getConfig();
    const totalNodes = this.running ? this.countNodes() : 0;

    return {
      running: this.running,
      endpointUrl: `opc.tcp://localhost:${config.opcuaPort}${config.opcuaEndpoint}`,
      connectedClients: this.connectedClients,
      totalNodes,
      startTime: this.startTime,
    };
  }

  public getNodeTree(): OpcuaNode {
    const rules = mappingService.getAllRules();
    return this.buildNodeTree(rules);
  }

  public getNodeDetails(nodeId: string): OpcuaNode | null {
    const tree = this.getNodeTree();
    return this.findNode(tree, nodeId);
  }

  public getNodeValue(nodeId: string): any {
    return this.nodeValues.get(nodeId);
  }

  public setNodeValue(nodeId: string, value: any): { success: boolean; message?: string } {
    if (!this.running) {
      return { success: false, message: '服务器未运行' };
    }
    
    const rule = this.findRuleByNodeId(nodeId);
    if (!rule) {
      return { success: false, message: '节点不存在' };
    }
    
    if (REGISTER_TYPE_READONLY[rule.registerType]) {
      return { success: false, message: `${rule.registerType} 是只读类型，无法写入值` };
    }
    
    this.nodeValues.set(nodeId, value);
    return { success: true };
  }

  private async initializeAddressSpace(rules: MappingRule[]): Promise<void> {
    this.addressSpace = this.buildAddressSpace(rules);
    
    for (const rule of rules) {
      const initialValue = this.getInitialValue(rule.dataType);
      this.nodeValues.set(rule.opcuaNodeId, initialValue);
    }
  }

  private buildAddressSpace(rules: MappingRule[]): any {
    const space: any = {
      Objects: {
        Devices: {},
      },
    };

    for (const rule of rules) {
      if (!space.Objects.Devices[rule.deviceName]) {
        space.Objects.Devices[rule.deviceName] = {};
      }
      if (!space.Objects.Devices[rule.deviceName][rule.registerType]) {
        space.Objects.Devices[rule.deviceName][rule.registerType] = {};
      }
      space.Objects.Devices[rule.deviceName][rule.registerType][rule.opcuaBrowseName] = {
        nodeId: rule.opcuaNodeId,
        dataType: rule.dataType,
        description: rule.description,
      };
    }

    return space;
  }

  public browse(nodeId?: string): OpcuaNode | null {
    const tree = this.getNodeTree();
    if (!nodeId) {
      return tree;
    }
    return this.findNode(tree, nodeId);
  }

  private buildNodeTree(rules: MappingRule[]): OpcuaNode {
    const root: OpcuaNode = {
      nodeId: 'ns=0;i=85',
      browseName: 'Objects',
      displayName: 'Objects',
      nodeClass: 'Object',
      children: [],
    };

    const devicesNode: OpcuaNode = {
      nodeId: 'ns=1;s=Devices',
      browseName: 'Devices',
      displayName: 'Devices',
      nodeClass: 'Object',
      children: [],
    };

    const deviceMap = new Map<string, OpcuaNode>();
    const typeMap = new Map<string, OpcuaNode>();

    for (const rule of rules) {
      let deviceNode = deviceMap.get(rule.deviceName);
      if (!deviceNode) {
        deviceNode = {
          nodeId: `ns=1;s=${rule.deviceName}`,
          browseName: rule.deviceName,
          displayName: rule.deviceName,
          nodeClass: 'Object',
          children: [],
        };
        deviceMap.set(rule.deviceName, deviceNode);
        devicesNode.children.push(deviceNode);
      }

      const typeKey = `${rule.deviceName}.${rule.registerType}`;
      let typeNode = typeMap.get(typeKey);
      if (!typeNode) {
        typeNode = {
          nodeId: `ns=1;s=${rule.deviceName}.${rule.registerType}`,
          browseName: rule.registerType,
          displayName: rule.registerType,
          nodeClass: 'Object',
          children: [],
        };
        typeMap.set(typeKey, typeNode);
        deviceNode.children.push(typeNode);
      }

      const variableNode: OpcuaNode = {
        nodeId: rule.opcuaNodeId,
        browseName: rule.opcuaBrowseName,
        displayName: rule.opcuaBrowseName,
        nodeClass: 'Variable',
        dataType: rule.dataType,
        value: this.nodeValues.get(rule.opcuaNodeId),
        readOnly: REGISTER_TYPE_READONLY[rule.registerType] ?? false,
        description: rule.description || REGISTER_TYPE_DESCRIPTION[rule.registerType],
        children: [],
      };
      typeNode.children.push(variableNode);
    }

    root.children.push(devicesNode);
    return root;
  }

  private findNode(node: OpcuaNode, nodeId: string): OpcuaNode | null {
    if (node.nodeId === nodeId) {
      return { ...node, value: this.nodeValues.get(nodeId) };
    }
    for (const child of node.children) {
      const found = this.findNode(child, nodeId);
      if (found) return found;
    }
    return null;
  }

  private countNodes(): number {
    const rules = mappingService.getAllRules();
    const devices = new Set(rules.map(r => r.deviceName)).size;
    const types = new Set(rules.map(r => `${r.deviceName}.${r.registerType}`)).size;
    return rules.length + devices + types + 2;
  }

  private getInitialValue(dataType: string): any {
    const map: DataTypeMap = {
      'Boolean': false,
      'Int16': 0,
      'UInt16': 0,
      'Int32': 0,
      'UInt32': 0,
      'Float': 0.0,
      'Double': 0.0,
    };
    return map[dataType] ?? 0;
  }

  private simulateDataUpdates(): void {
    const updateInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(updateInterval);
        return;
      }

      for (const [nodeId, value] of this.nodeValues) {
        const rule = this.findRuleByNodeId(nodeId);
        if (!rule) continue;

        let newValue = value;
        switch (rule.dataType) {
          case 'Boolean':
            newValue = Math.random() > 0.5;
            break;
          case 'Int16':
          case 'Int32':
            newValue = Math.floor((Math.random() - 0.5) * 1000);
            break;
          case 'UInt16':
          case 'UInt32':
            newValue = Math.floor(Math.random() * 1000);
            break;
          case 'Float':
          case 'Double':
            newValue = parseFloat((Math.random() * 100).toFixed(2));
            break;
        }
        this.nodeValues.set(nodeId, newValue);
      }
    }, 3000);
  }

  private findRuleByNodeId(nodeId: string): MappingRule | undefined {
    const rules = mappingService.getAllRules();
    return rules.find(r => r.opcuaNodeId === nodeId);
  }

  public async restart(): Promise<{ success: boolean; message: string }> {
    await this.stop();
    return this.start();
  }
}

export const opcuaService = new OpcuaService();
