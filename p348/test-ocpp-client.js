import WebSocket from 'ws';

const WEBSOCKET_URL = 'ws://localhost:3001/ocpp';
const chargePointId = 'TEST-CP-001';

function generateUniqueId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sendMessage(ws, action, payload) {
  const uniqueId = generateUniqueId();
  const message = [2, uniqueId, action, payload];
  console.log(`\n→ 发送 ${action}:`, JSON.stringify(message, null, 2));
  ws.send(JSON.stringify(message));
  return uniqueId;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testOCPP() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           OCPP WebSocket 客户端测试                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const ws = new WebSocket(`${WEBSOCKET_URL}/${chargePointId}`, {
    headers: {
      'Sec-WebSocket-Protocol': 'ocpp1.6'
    }
  });

  let transactionId = null;

  ws.on('open', async () => {
    console.log(`✓ 已连接到 ${WEBSOCKET_URL}/${chargePointId}\n`);

    try {
      console.log('═══════════════ 测试 1: BootNotification ═══════════════');
      sendMessage(ws, 'BootNotification', {
        chargePointVendor: 'TestVendor',
        chargePointModel: 'TestModel-X1',
        chargePointSerialNumber: 'SN-TEST-001',
        firmwareVersion: 'v1.0.0'
      });

      await sleep(2000);

      console.log('\n═══════════════ 测试 2: Heartbeat ═══════════════');
      sendMessage(ws, 'Heartbeat', {});

      await sleep(1000);

      console.log('\n═══════════════ 测试 3: StartTransaction (meterStart < 0，应被拒绝) ═══════════════');
      sendMessage(ws, 'StartTransaction', {
        connectorId: 1,
        idTag: 'RFID-TEST-BAD',
        timestamp: new Date().toISOString(),
        meterStart: -100
      });

      await sleep(2000);

      console.log('\n═══════════════ 测试 4: StartTransaction (正常值) ═══════════════');
      const startMeter = Math.floor(Math.random() * 10000) + 50000;
      sendMessage(ws, 'StartTransaction', {
        connectorId: 1,
        idTag: 'RFID-TEST-001',
        timestamp: new Date().toISOString(),
        meterStart: startMeter
      });

      await sleep(2000);

      console.log('\n═══════════════ 模拟充电中... (3秒) ═══════════════');
      await sleep(3000);

      console.log('\n═══════════════ 测试 5: StopTransaction ═══════════════');
      const stopMeter = startMeter + Math.floor(Math.random() * 5000) + 1000;
      if (transactionId) {
        sendMessage(ws, 'StopTransaction', {
          transactionId: transactionId,
          idTag: 'RFID-TEST-001',
          timestamp: new Date().toISOString(),
          meterStop: stopMeter,
          reason: 'EVDisconnected'
        });
      } else {
        console.log('⚠️  未获取到 transactionId，使用测试ID 1');
        sendMessage(ws, 'StopTransaction', {
          transactionId: 1,
          idTag: 'RFID-TEST-001',
          timestamp: new Date().toISOString(),
          meterStop: stopMeter,
          reason: 'EVDisconnected'
        });
      }

      await sleep(2000);

      console.log('\n═══════════════ 测试 6: 模拟离线消息队列 ═══════════════');
      console.log('发送 REST API 命令到离线充电桩 OFFLINE-CP-001...');
      try {
        const response = await fetch('http://localhost:3001/api/command/OFFLINE-CP-001', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'RemoteStartTransaction',
            payload: { connectorId: 1, idTag: 'RFID-QUEUE-TEST' }
          })
        });
        const result = await response.json();
        console.log('← REST API 响应:', JSON.stringify(result, null, 2));
        if (result.queued) {
          console.log('✓ 消息已入队，等待充电桩上线后重传');
        }
      } catch (e) {
        console.log('⚠️  REST API 请求失败（可能后端未启动）:', e.message);
      }

      console.log('\n═══════════════ 测试完成 ═══════════════');
      console.log('✓ 所有OCPP操作测试完成');
      console.log('\n提示: 可以访问 http://localhost:5173 查看前端界面');
      console.log('      或访问 REST API: http://localhost:3001/api/transactions');
      console.log('      消息队列状态: http://localhost:3001/api/queue');

      await sleep(1000);
      ws.close();
      console.log('\n✓ 连接已关闭');

    } catch (error) {
      console.error('❌ 测试出错:', error);
      ws.close();
      process.exit(1);
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const messageTypeId = message[0];
      
      if (messageTypeId === 3) {
        const [, uniqueId, payload] = message;
        console.log(`\n← 收到响应 [${uniqueId}]:`, JSON.stringify(payload, null, 2));
        
        if (payload.transactionId !== undefined) {
          transactionId = payload.transactionId;
          console.log(`✓ 获得 transactionId: ${transactionId}`);
        }

        if (payload.idTagInfo && payload.idTagInfo.status === 'Rejected' && payload.transactionId === 0) {
          console.log('✓ 交易被正确拒绝（meterStart < 0 或充电桩未注册）');
        }
      } else if (messageTypeId === 2) {
        const [, uniqueId, action, payload] = message;
        console.log(`\n← 收到服务器命令 [${uniqueId}]: ${action}`, JSON.stringify(payload, null, 2));
        
        let responsePayload = { status: 'Accepted' };
        
        if (action === 'RemoteStartTransaction') {
          console.log(`✓ 收到远程启动命令，connectorId=${payload.connectorId}, idTag=${payload.idTag}`);
          responsePayload = { status: 'Accepted' };
        } else if (action === 'RemoteStopTransaction') {
          console.log(`✓ 收到远程停止命令，transactionId=${payload.transactionId}`);
          responsePayload = { status: 'Accepted' };
        }
        
        const responseMsg = [3, uniqueId, responsePayload];
        ws.send(JSON.stringify(responseMsg));
        console.log('→ 已回复 Accepted');
      } else if (messageTypeId === 4) {
        const [, uniqueId, errorCode, errorDescription] = message;
        console.error(`\n← 收到错误 [${uniqueId}]:`, errorCode, errorDescription);
      }
    } catch (e) {
      console.log('← 收到消息:', data.toString());
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error.message);
    console.log('\n提示: 请确保后端服务已启动。运行: npm run server:dev');
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('\n连接已关闭');
  });
}

testOCPP();
