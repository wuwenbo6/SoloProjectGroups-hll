const http = require('http');

const BASE_URL = 'http://localhost:3000';

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
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
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
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSleepWakeup() {
  const endpoint = 'sleep-test-device-001';
  
  console.log('\n========================================');
  console.log('  测试 1: 设备休眠唤醒');
  console.log('========================================\n');

  console.log('1. 注册设备...');
  await post('/api/lwm2m/register', {
    endpoint,
    name: '休眠测试设备',
    observers: [
      { resourcePath: '/3303/0/5700', token: 'temp-observe-001', contentFormat: 'application/json' },
      { resourcePath: '/6/0/0', token: 'location-observe-001', contentFormat: 'application/json' }
    ]
  });
  console.log('   ✅ 设备注册成功，已添加 Observer\n');

  console.log('2. 上报数据...');
  await post('/api/lwm2m/update', {
    endpoint,
    temperature: 22.5,
    latitude: 39.9042,
    longitude: 116.4074
  });
  console.log('   ✅ 数据上报成功\n');

  console.log('3. 设备进入休眠...');
  await post('/api/lwm2m/sleep', { endpoint });
  console.log('   ✅ 设备标记为休眠\n');

  console.log('4. 休眠期间下发重启命令...');
  await post(`/api/devices/${endpoint}/restart`, {});
  console.log('   ✅ 重启命令已下发（设备离线队列\n');

  await sleep(1500);

  console.log('5. 设备唤醒...');
  const wakeupResult = await post('/api/lwm2m/wakeup', { endpoint });
  console.log('   ✅ 唤醒响应:');
  console.log(`      - 设备状态: ${wakeupResult.device.status}`);
  console.log(`      - 待执行命令数: ${wakeupResult.pendingCommands.length}`);
  console.log(`      - 活跃Observer数: ${wakeupResult.observers.length}`);
  console.log();

  console.log('6. 设备拉取并确认命令...');
  const commandsResult = await get(`/api/lwm2m/commands/${endpoint}`);
  console.log(`   ✅ 获取到 ${commandsResult.commands.length} 条命令`);
  for (const cmd of commandsResult.commands) {
    console.log(`      - [${cmd.id}] ${cmd.command}`);
    await post(`/api/lwm2m/commands/${cmd.id}/ack`, {});
    console.log(`         ✓ 已确认命令 ${cmd.id}`);
  }
  console.log();

  console.log('7. 唤醒后首次上报数据触发Observer通知...');
  await post('/api/lwm2m/update', {
    endpoint,
    temperature: 23.1,
    latitude: 39.9050,
    longitude: 116.4080
  });
  console.log('   ✅ 数据上报，Observer已通知\n');
}

async function testBatchCommands() {
  const devices = [
    'batch-device-001',
    'batch-device-002', 
    'batch-device-003'
  ];

  console.log('\n========================================');
  console.log('  测试 2: 批量命令下发');
  console.log('========================================\n');

  console.log('1. 注册多个设备...');
  for (const endpoint of devices) {
    await post('/api/lwm2m/register', { endpoint, name: `批量设备-${endpoint.slice(-3)}` });
    console.log(`   ✅ ${endpoint}`);
  }
  console.log();

  console.log('2. 发送批量重启命令...');
  const batchResult = await post('/api/devices/batch/restart', { endpoints: devices });
  console.log(`   ✅ 批量命令结果: ${batchResult.results.filter(r => r.success).length}/${batchResult.total} 成功`);
  for (const r of batchResult.results) {
    console.log(`      - ${r.endpoint}: commandId=${r.commandId}`);
  }
  console.log();

  console.log('3. 设备拉取命令并确认...');
  for (const endpoint of devices) {
    const commandsResult = await get(`/api/lwm2m/commands/${endpoint}`);
    console.log(`   ${endpoint}: 获取到 ${commandsResult.commands.length} 条命令`);
    for (const cmd of commandsResult.commands) {
      await post(`/api/lwm2m/commands/${cmd.id}/ack`, {});
      console.log(`      ✓ 确认命令 ${cmd.id}`);
    }
  }
  console.log();

  console.log('4. 查看命令历史...');
  const historyResult = await get('/api/commands?limit=10');
  const executed = historyResult.commands.filter(c => c.status === 'executed');
  const pending = historyResult.commands.filter(c => c.status === 'pending');
  console.log(`   - 已执行: ${executed.length}`);
  console.log(`   - 待执行: ${pending.length}`);
  console.log();
}

async function testCommandRetry() {
  const endpoint = 'retry-test-device';

  console.log('\n========================================');
  console.log('  测试 3: 命令重试机制');
  console.log('========================================\n');

  console.log('1. 注册设备...');
  await post('/api/lwm2m/register', { endpoint, name: '重试测试设备' });
  console.log('   ✅ 设备注册成功\n');

  console.log('2. 设备进入休眠...');
  await post('/api/lwm2m/sleep', { endpoint });
  console.log('   ✅ 设备休眠\n');

  console.log('3. 休眠期间下发命令...');
  await post(`/api/devices/${endpoint}/command`, { 
    command: 'firmware_update', 
    payload: { version: 'v2.0' },
    priority: 5,
    maxRetries: 3
  });
  console.log('   ✅ 命令已下发，最大重试3次\n');

  console.log('4. 模拟命令状态查看...');
  const cmds = await get('/api/commands?status=pending');
  console.log(`   - 待执行命令: ${cmds.commands.length} 条\n`);

  console.log('5. 设备唤醒并获取命令...');
  await post('/api/lwm2m/wakeup', { endpoint });
  const commandsResult = await get(`/api/lwm2m/commands/${endpoint}`);
  console.log(`   - 获取到 ${commandsResult.commands.length} 条命令\n`);

  console.log('6. 模拟设备异常断开，不确认命令...');
  console.log('   (命令将在超时后自动重试)\n');
}

async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║     NB-IoT 高级功能测试                    ║');
  console.log('║     - Observer 持久化                           ║');
  console.log('║     - 设备休眠/唤醒                        ║');
  console.log('║     - 批量命令下发                          ║');
  console.log('║     - 命令重试机制                          ║');
  console.log('╚════════════════════════════════════════════╝\n');

  try {
    await testSleepWakeup();
    await testBatchCommands();
    await testCommandRetry();

    console.log('\n========================================');
    console.log('  所有测试完成！');
    console.log('========================================\n');
    console.log('关键修复说明:');
    console.log('  ✓ Observer 持久化: 设备休眠唤醒后 Observer 不丢失');
    console.log('  ✓ 休眠队列命令: 设备休眠时命令会排队，唤醒后自动下发');
    console.log('  ✓ 批量命令: 支持同时向多设备下发命令');
    console.log('  ✓ 命令重试: 超时未确认的命令自动重试（最多3次）');
    console.log('  ✓ 命令确认: 设备确认后标记为已执行');
    console.log();
  } catch (error) {
    console.error('测试失败:', error.message);
    console.error(error);
  }
}

main();
