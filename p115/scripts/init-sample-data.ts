import { initDatabase } from '../api/data/database.js';
import { mappingService } from '../api/services/MappingService.js';

const sampleData = [
  {
    deviceName: 'PLC1',
    registerType: 'HoldingRegister',
    registerAddress: 0,
    dataType: 'Int16',
    opcuaNodeId: 'ns=1;s=PLC1.HoldingRegister.0',
    opcuaBrowseName: 'PLC1_HoldingRegister_0',
    description: '温度传感器1',
  },
  {
    deviceName: 'PLC1',
    registerType: 'HoldingRegister',
    registerAddress: 1,
    dataType: 'Float',
    opcuaNodeId: 'ns=1;s=PLC1.HoldingRegister.1',
    opcuaBrowseName: 'PLC1_HoldingRegister_1',
    description: '压力传感器1',
  },
  {
    deviceName: 'PLC1',
    registerType: 'HoldingRegister',
    registerAddress: 2,
    dataType: 'Float',
    opcuaNodeId: 'ns=1;s=PLC1.HoldingRegister.2',
    opcuaBrowseName: 'PLC1_HoldingRegister_2',
    description: '流量传感器1',
  },
  {
    deviceName: 'PLC1',
    registerType: 'Coil',
    registerAddress: 0,
    dataType: 'Boolean',
    opcuaNodeId: 'ns=1;s=PLC1.Coil.0',
    opcuaBrowseName: 'PLC1_Coil_0',
    description: '电机启动信号',
  },
  {
    deviceName: 'PLC1',
    registerType: 'Coil',
    registerAddress: 1,
    dataType: 'Boolean',
    opcuaNodeId: 'ns=1;s=PLC1.Coil.1',
    opcuaBrowseName: 'PLC1_Coil_1',
    description: '阀门状态',
  },
  {
    deviceName: 'PLC2',
    registerType: 'InputRegister',
    registerAddress: 0,
    dataType: 'UInt16',
    opcuaNodeId: 'ns=1;s=PLC2.InputRegister.0',
    opcuaBrowseName: 'PLC2_InputRegister_0',
    description: '模拟量输入1',
  },
  {
    deviceName: 'PLC2',
    registerType: 'InputRegister',
    registerAddress: 1,
    dataType: 'UInt16',
    opcuaNodeId: 'ns=1;s=PLC2.InputRegister.1',
    opcuaBrowseName: 'PLC2_InputRegister_1',
    description: '模拟量输入2',
  },
  {
    deviceName: 'PLC2',
    registerType: 'DiscreteInput',
    registerAddress: 0,
    dataType: 'Boolean',
    opcuaNodeId: 'ns=1;s=PLC2.DiscreteInput.0',
    opcuaBrowseName: 'PLC2_DiscreteInput_0',
    description: '限位开关1',
  },
];

async function main() {
  console.log('Initializing database...');
  initDatabase();

  console.log('Deleting existing rules...');
  const deleted = mappingService.deleteAllRules();
  console.log(`Deleted ${deleted} existing rules`);

  console.log('Importing sample data...');
  mappingService.bulkCreateRules(sampleData);
  console.log(`Successfully imported ${sampleData.length} mapping rules`);

  const rules = mappingService.getAllRules();
  console.log(`\nTotal rules in database: ${rules.length}`);
  
  const devices = mappingService.getDistinctDevices();
  console.log(`Devices: ${devices.join(', ')}`);
  
  const stats = mappingService.getStats();
  console.log(`Stats: ${JSON.stringify(stats)}`);
}

main().catch(console.error);
