const crypto = require('crypto');

function hmac(key, data, algorithm) {
    return crypto.createHmac(algorithm, key).update(data).digest();
}

function hash(data, algorithm) {
    return crypto.createHash(algorithm).update(data).digest();
}

function xor(a, b) {
    const result = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}

function hi(password, salt, iterations, algorithm) {
    const saltBuffer = Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from([0, 0, 0, 1])]);
    let result = hmac(password, saltBuffer, algorithm);
    let prev = result;
    for (let i = 1; i < iterations; i++) {
        prev = hmac(password, prev, algorithm);
        result = xor(result, prev);
    }
    return result;
}

function generateNonce() {
    return crypto.randomBytes(16).toString('base64');
}

function parseServerFirst(message) {
    const parts = message.split(',');
    const result = {};
    for (const part of parts) {
        if (part.startsWith('r=')) result.nonce = part.substring(2);
        else if (part.startsWith('s=')) result.salt = part.substring(2);
        else if (part.startsWith('i=')) result.iterations = parseInt(part.substring(2));
    }
    return result;
}

async function testPLAIN() {
    console.log('=== 测试 PLAIN 机制 ===\n');

    const response = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 0,
            username: 'admin',
            password: 'admin123'
        })
    });

    const data = await response.json();

    console.log('请求: POST /auth (step=0, PLAIN)');
    console.log('响应:', JSON.stringify(data, null, 2));

    if (data.success && data.mechanism === 'PLAIN') {
        console.log('\n✓ PLAIN 机制测试通过\n');
    } else {
        console.log('\n✗ PLAIN 机制测试失败\n');
    }

    return data.success;
}

async function testSCRAM(mechanism, algorithm) {
    console.log(`=== 测试 ${mechanism} 机制 ===\n`);

    const username = 'admin';
    const password = 'admin123';

    const clientNonce = generateNonce();
    const clientFirstMessageBare = `n=${username},r=${clientNonce}`;

    console.log('步骤 1: 客户端 -> 服务器');
    console.log('  消息:', clientFirstMessageBare);

    const response1 = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 1,
            mechanism: mechanism,
            clientFirstMessage: clientFirstMessageBare
        })
    });

    const data1 = await response1.json();

    console.log('\n步骤 1: 服务器 -> 客户端');
    console.log('  Session ID:', data1.sessionId);
    console.log('  消息:', data1.serverFirstMessage);

    if (!data1.success) {
        console.log('\n✗ 第一步失败:', data1.error);
        return false;
    }

    const serverFirst = parseServerFirst(data1.serverFirstMessage);
    const channelBinding = 'biws';
    const clientFinalWithoutProof = `c=${channelBinding},r=${serverFirst.nonce}`;
    const authMessage = `${clientFirstMessageBare},${data1.serverFirstMessage},${clientFinalWithoutProof}`;

    const passwordBytes = Buffer.from(password, 'utf8');
    const saltedPassword = hi(passwordBytes, serverFirst.salt, serverFirst.iterations, algorithm);
    const clientKey = hmac(saltedPassword, Buffer.from('Client Key', 'utf8'), algorithm);
    const storedKey = hash(clientKey, algorithm);
    const clientSignature = hmac(storedKey, Buffer.from(authMessage, 'utf8'), algorithm);
    const clientProof = xor(clientKey, clientSignature);

    const clientFinalMessage = `${clientFinalWithoutProof},p=${clientProof.toString('base64')}`;

    console.log('\n步骤 2: 客户端 -> 服务器');
    console.log('  消息:', clientFinalMessage);

    const response2 = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 2,
            sessionId: data1.sessionId,
            clientFinalMessage: clientFinalMessage,
            password: password
        })
    });

    const data2 = await response2.json();

    console.log('\n步骤 2: 服务器 -> 客户端');
    console.log('  消息:', data2.serverFinalMessage);

    if (data2.success && data2.mechanism === mechanism) {
        console.log('\n✓', mechanism, '机制测试通过\n');
    } else {
        console.log('\n✗', mechanism, '机制测试失败:', data2.error);
    }

    return data2.success;
}

async function testMechanismNegotiation() {
    console.log('=== 测试机制协商 ===\n');

    const response = await fetch('http://localhost:3000/api/mechanisms');
    const data = await response.json();

    console.log('响应:', JSON.stringify(data, null, 2));

    if (data.success && data.mechanisms.includes('PLAIN') && 
        data.mechanisms.includes('SCRAM-SHA-1') && 
        data.mechanisms.includes('SCRAM-SHA-256')) {
        console.log('\n✓ 机制协商测试通过\n');
        return true;
    } else {
        console.log('\n✗ 机制协商测试失败\n');
        return false;
    }
}

async function testLogs() {
    console.log('=== 测试认证日志 ===\n');

    const response = await fetch('http://localhost:3000/api/logs');
    const data = await response.json();

    console.log('日志数量:', data.logs.length);
    if (data.logs.length > 0) {
        console.log('最新日志:', JSON.stringify(data.logs[data.logs.length - 1], null, 2));
    }

    if (data.success && data.logs.length > 0) {
        console.log('\n✓ 日志测试通过\n');
        return true;
    } else {
        console.log('\n✗ 日志测试失败\n');
        return false;
    }
}

async function testStats() {
    console.log('=== 测试认证统计 ===\n');

    const response = await fetch('http://localhost:3000/api/stats');
    const data = await response.json();

    console.log('统计:', JSON.stringify(data.stats, null, 2));

    if (data.success && data.stats.total > 0) {
        console.log('\n✓ 统计测试通过\n');
        return true;
    } else {
        console.log('\n✗ 统计测试失败\n');
        return false;
    }
}

async function runAllTests() {
    console.log('========================================');
    console.log('  SASL 多机制认证综合测试');
    console.log('========================================\n');

    const results = [];

    results.push({ name: '机制协商', result: await testMechanismNegotiation() });
    results.push({ name: 'PLAIN', result: await testPLAIN() });
    results.push({ name: 'SCRAM-SHA-1', result: await testSCRAM('SCRAM-SHA-1', 'sha1') });
    results.push({ name: 'SCRAM-SHA-256', result: await testSCRAM('SCRAM-SHA-256', 'sha256') });
    results.push({ name: '认证日志', result: await testLogs() });
    results.push({ name: '认证统计', result: await testStats() });

    console.log('========================================');
    console.log('  测试结果汇总');
    console.log('========================================');

    for (const r of results) {
        console.log(`  ${r.name}: ${r.result ? '✓ 通过' : '✗ 失败'}`);
    }

    const passed = results.filter(r => r.result).length;
    console.log(`\n总计: ${passed}/${results.length} 测试通过`);
    console.log('========================================');
}

runAllTests().catch(console.error);
