const DeviceSimulator = require('../client/device-simulator');

const deviceCount = parseInt(process.argv[2]) || 3;
const devices = [];

console.log(`启动 ${deviceCount} 个设备模拟器进行并发升级测试...`);
console.log('=' .repeat(60));

for (let i = 0; i < deviceCount; i++) {
  const deviceId = `test_device_${String(i + 1).padStart(3, '0')}`;
  const deviceName = `测试设备 ${i + 1}`;
  
  const device = new DeviceSimulator(deviceId, deviceName);
  devices.push(device);
  
  setTimeout(async () => {
    console.log(`[${deviceId}] 启动设备模拟器`);
    await device.performUpgrade();
  }, i * 500);
}

process.on('SIGINT', () => {
  console.log('\n停止所有设备...');
  process.exit(0);
});
