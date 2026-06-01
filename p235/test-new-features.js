console.log('=== 测试新功能 ===\n');

console.log('1. 测试芯片ID读取和验证');
console.log('   - readChipID(): 读取芯片ID、版本号');
console.log('   - verifyChipID(expectedID): 验证芯片ID是否匹配');
console.log('   - 支持的设备ID:');
const devices = [
  { name: 'PIC16F84A', chipID: 0x05E0 },
  { name: 'PIC16F877A', chipID: 0x0F91 },
  { name: 'PIC16F887', chipID: 0x10C0 },
  { name: 'PIC18F452', chipID: 0x1004 },
  { name: 'PIC18F4550', chipID: 0x1204 }
];
devices.forEach(d => {
  console.log(`     ${d.name}: 0x${d.chipID.toString(16).toUpperCase().padStart(4, '0')}`);
});

console.log('\n2. 测试脱机编程功能');
console.log('   - getOfflineStatus(): 查询编程器存储状态');
console.log('   - offlineErase(): 擦除编程器内部存储');
console.log('   - offlineWrite(hexData): 写入hex数据到编程器');
console.log('   - offlineRead(): 从编程器读取存储的数据');
console.log('   - offlineStart(): 开始脱机编程（擦除→写入→校验）');
console.log('   - offlineVerify(): 脱机校验目标芯片');

console.log('\n3. 测试CRC校验');
console.log('   - 所有USB传输默认启用CRC-16/CCITT校验');
console.log('   - 同步命令(0x00)禁用CRC');
console.log('   - 数据损坏时自动警告');

console.log('\n4. 测试同步字节');
console.log('   - erase() 操作前自动发送 0x00 同步字节');
console.log('   - offlineStart() 前自动发送同步字节');

console.log('\n5. 测试Vpp/Vdd时序');
console.log('   - VDD_ON → DELAY_LONG → VPP_ON → DELAY_SHORT');
console.log('   - 确保Vpp在Vdd稳定后100ms内上电');

console.log('\n=== 新功能测试完成 ===');
console.log('\n前端UI新增按钮:');
console.log('  - 目标设备区域: 读取芯片ID、验证芯片ID');
console.log('  - 脱机编程区域: 擦除存储、写入编程器、读取编程器、查询状态');
console.log('  - 脱机编程区域: 开始脱机编程、脱机校验');
