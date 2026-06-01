const http = require('http');

const BASE_URL = 'http://localhost:3000';

const devices = [
  { endpoint: 'nb-iot-device-001', name: '北京传感器节点', lat: 39.9042, lng: 116.4074 },
  { endpoint: 'nb-iot-device-002', name: '上海传感器节点', lat: 31.2304, lng: 121.4737 },
  { endpoint: 'nb-iot-device-003', name: '广州传感器节点', lat: 23.1291, lng: 113.2644 },
  { endpoint: 'nb-iot-device-004', name: '深圳传感器节点', lat: 22.5431, lng: 114.0579 },
  { endpoint: 'nb-iot-device-005', name: '成都传感器节点', lat: 30.5728, lng: 104.0668 }
];

function post(path, data) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(data);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData)
      }
    };

    const req = http.request(`${BASE_URL}${path}`, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });

    req.on('error', reject);
    req.write(jsonData);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function registerDevice(device) {
  try {
    const result = await post('/api/lwm2m/register', {
      endpoint: device.endpoint,
      name: device.name,
      lifetime: 86400
    });
    console.log(`✅ 设备注册成功: ${device.name}`);
    return result;
  } catch (error) {
    console.error(`❌ 设备注册失败 ${device.name}:`, error.message);
  }
}

async function sendSensorData(device) {
  const temperature = 15 + Math.random() * 20;
  const latOffset = (Math.random() - 0.5) * 0.1;
  const lngOffset = (Math.random() - 0.5) * 0.1;

  try {
    await post('/api/lwm2m/update', {
      endpoint: device.endpoint,
      temperature: parseFloat(temperature.toFixed(2)),
      latitude: device.lat + latOffset,
      longitude: device.lng + lngOffset
    });
    console.log(`📡 ${device.name}: 温度 ${temperature.toFixed(1)}°C`);
  } catch (error) {
    console.error(`❌ 发送数据失败 ${device.name}:`, error.message);
  }
}

async function checkCommands(device) {
  try {
    const result = await get(`/api/lwm2m/commands/${device.endpoint}`);
    if (result.commands && result.commands.length > 0) {
      result.commands.forEach(cmd => {
        console.log(`📥 ${device.name} 收到命令: ${cmd.command}`);
        if (cmd.command === 'restart') {
          console.log(`🔄 ${device.name} 正在重启...`);
        }
      });
    }
  } catch (error) {
    console.error(`❌ 获取命令失败 ${device.name}:`, error.message);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  NB-IoT 设备模拟器启动');
  console.log('========================================\n');

  console.log('正在注册设备...\n');
  for (const device of devices) {
    await registerDevice(device);
  }

  console.log('\n开始发送传感器数据 (按 Ctrl+C 停止)...\n');

  setInterval(() => {
    devices.forEach(device => {
      if (Math.random() > 0.3) {
        sendSensorData(device);
      }
      checkCommands(device);
    });
  }, 5000);
}

main().catch(console.error);
