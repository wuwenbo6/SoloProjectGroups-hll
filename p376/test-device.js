const http = require('http');
const crc32 = require('crc/crc32');
const config = require('./config.json');

const SERVER_HOST = 'localhost';
const SERVER_PORT = config.server.port;

const DEVICES = [
  { ieeeAddress: '00124B0012345678', shortAddress: 0x1234, manufacturerId: 0x1001, imageType: 0x0001, currentVersion: 0x01000000 },
  { ieeeAddress: '00124B00AABBCCDD', shortAddress: 0x5678, manufacturerId: 0x1001, imageType: 0x0001, currentVersion: 0x01000000 },
  { ieeeAddress: '00124B00EEFF0011', shortAddress: 0x9ABC, manufacturerId: 0x1001, imageType: 0x0001, currentVersion: 0x01000000 },
  { ieeeAddress: '00124B0022334455', shortAddress: 0xDEF0, manufacturerId: 0x1001, imageType: 0x0001, currentVersion: 0x01000000 },
  { ieeeAddress: '00124B0066778899', shortAddress: 0x1111, manufacturerId: 0x1001, imageType: 0x0001, currentVersion: 0x01000000 },
];

const FAIL_DEVICES = new Set([
  '00124B00EEFF0011',
]);

const BLOCK_DELAY_MS = 20;

function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatVersion(version) {
  const major = (version >> 24) & 0xFF;
  const minor = (version >> 16) & 0xFF;
  const patch = version & 0xFFFF;
  return `${major}.${minor}.${patch}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function simulateDevice(deviceInfo) {
  const label = `[${deviceInfo.ieeeAddress.slice(-8)}]`;
  const shouldFail = FAIL_DEVICES.has(deviceInfo.ieeeAddress);
  let receivedData = Buffer.alloc(0);
  let lastConfirmedBlock = -1;
  let lastConfirmedOffset = 0;

  try {
    console.log(`${label} 查询镜像 (当前版本: ${formatVersion(deviceInfo.currentVersion)})`);

    const queryResponse = await makeRequest('/api/ota/query_next_image', {
      ieeeAddress: deviceInfo.ieeeAddress,
      shortAddress: deviceInfo.shortAddress,
      manufacturerId: deviceInfo.manufacturerId,
      imageType: deviceInfo.imageType,
      currentVersion: deviceInfo.currentVersion,
    });

    if (queryResponse.status !== 0x00) {
      console.log(`${label} 无可用更新`);
      return { ieeeAddress: deviceInfo.ieeeAddress, result: 'no-update' };
    }

    const imageSize = queryResponse.imageSize;
    const totalBlocks = Math.ceil(imageSize / config.ota.blockSize);
    const startBlock = queryResponse.isResume ? queryResponse.resumeBlockNumber : 0;

    if (queryResponse.isResume) {
      lastConfirmedBlock = queryResponse.resumeBlockNumber - 1;
      lastConfirmedOffset = queryResponse.resumeOffset;
      console.log(`${label} 从块 #${startBlock} 恢复传输`);
    } else {
      console.log(`${label} 开始升级 → ${formatVersion(queryResponse.fileVersion)} (${formatBytes(imageSize)}, ${totalBlocks}块)`);
    }

    const failAtBlock = shouldFail ? Math.floor(totalBlocks * 0.5) : -1;

    let currentBlock = startBlock;
    const startTime = Date.now();

    while (currentBlock < totalBlocks) {
      if (currentBlock === failAtBlock) {
        console.log(`${label} ⚠️ 模拟升级失败 (在块 #${currentBlock})`);
        const failResponse = await makeRequest('/api/ota/upgrade_end', {
          ieeeAddress: deviceInfo.ieeeAddress,
          status: 0x95,
          fileVersion: config.firmware.fileVersion,
          imageCrc: '00000000',
        });
        return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: 'Simulated device error' };
      }

      const offset = currentBlock * config.ota.blockSize;

      const blockResponse = await makeRequest('/api/ota/image_block', {
        ieeeAddress: deviceInfo.ieeeAddress,
        fileVersion: queryResponse.fileVersion,
        blockNumber: currentBlock,
        offset,
        maxBlockSize: config.ota.blockSize,
      });

      if (blockResponse.status !== 0x00) {
        console.log(`${label} ✗ 块请求失败`);
        return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: 'Block request failed' };
      }

      const blockData = Buffer.from(blockResponse.data, 'base64');

      if (receivedData.length < offset + blockData.length) {
        const newBuffer = Buffer.alloc(offset + blockData.length);
        receivedData.copy(newBuffer, 0, 0, receivedData.length);
        receivedData = newBuffer;
      }
      blockData.copy(receivedData, offset);

      const ackResponse = await makeRequest('/api/ota/block_ack', {
        ieeeAddress: deviceInfo.ieeeAddress,
        fileVersion: queryResponse.fileVersion,
        blockNumber: currentBlock,
        offset: offset + blockData.length,
        status: 0x00,
      });

      if (ackResponse.status !== 0x00) {
        console.log(`${label} ✗ ACK失败`);
        return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: 'ACK failed' };
      }

      lastConfirmedBlock = currentBlock;
      lastConfirmedOffset = offset + blockData.length;
      currentBlock = ackResponse.nextBlockNumber;

      if (currentBlock % 16 === 0 || currentBlock >= totalBlocks) {
        const progress = Math.round((lastConfirmedOffset / imageSize) * 100);
        process.stdout.write(`\r${label} ${progress}% (块 ${currentBlock}/${totalBlocks})`);
      }

      await sleep(BLOCK_DELAY_MS);
    }

    const receivedCrc = crc32(receivedData).toString(16).toUpperCase();
    console.log(`\n${label} 校验 CRC32: ${receivedCrc}`);

    if (receivedData.length !== imageSize) {
      console.log(`${label} ✗ 大小不匹配`);
      return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: 'Size mismatch' };
    }

    const endResponse = await makeRequest('/api/ota/upgrade_end', {
      ieeeAddress: deviceInfo.ieeeAddress,
      status: 0x00,
      fileVersion: queryResponse.fileVersion,
      imageCrc: receivedCrc,
    });

    if (endResponse.status === 0x00) {
      const duration = Date.now() - startTime;
      console.log(`${label} ✓ 升级完成 (${(duration / 1000).toFixed(2)}s)`);
      return { ieeeAddress: deviceInfo.ieeeAddress, result: 'success', duration };
    } else {
      console.log(`${label} ✗ 升级完成确认失败`);
      return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: 'End response error' };
    }

  } catch (error) {
    console.log(`${label} ✗ 异常: ${error.message}`);
    return { ieeeAddress: deviceInfo.ieeeAddress, result: 'failure', error: error.message };
  }
}

async function runMultiDeviceTest() {
  console.log('========================================================');
  console.log('  ZigBee OTA 多设备并行升级测试');
  console.log(`  设备数: ${DEVICES.length}`);
  console.log(`  模拟失败设备: ${FAIL_DEVICES.size > 0 ? Array.from(FAIL_DEVICES).map(a => '..' + a.slice(-8)).join(', ') : '无'}`);
  console.log('========================================================\n');

  const results = await Promise.all(
    DEVICES.map(device => simulateDevice(device))
  );

  console.log('\n========================================================');
  console.log('  测试结果汇总');
  console.log('========================================================');

  const successes = results.filter(r => r.result === 'success');
  const failures = results.filter(r => r.result === 'failure');
  const noUpdates = results.filter(r => r.result === 'no-update');

  console.log(`\n成功: ${successes.length} 台`);
  successes.forEach(r => {
    console.log(`  ✓ ..${r.ieeeAddress.slice(-8)} ${r.duration ? `(${(r.duration / 1000).toFixed(2)}s)` : ''}`);
  });

  console.log(`\n失败: ${failures.length} 台`);
  failures.forEach(r => {
    console.log(`  ✗ ..${r.ieeeAddress.slice(-8)} - ${r.error}`);
  });

  if (noUpdates.length > 0) {
    console.log(`\n无需更新: ${noUpdates.length} 台`);
  }

  console.log(`\n成功率: ${results.length > 0 ? ((successes.length / results.length) * 100).toFixed(1) : 0}%`);
  console.log('\n========================================================\n');

  console.log('导出统计数据:');
  console.log(`  JSON: curl http://localhost:${SERVER_PORT}/api/stats/export/json -o ota-stats.json`);
  console.log(`  CSV:  curl http://localhost:${SERVER_PORT}/api/stats/export/csv -o ota-stats.csv`);
  console.log('');
}

runMultiDeviceTest();
