const crypto = require('crypto');

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function hash(data) {
    return crypto.createHash('sha256').update(data).digest();
}

function xor(a, b) {
    const result = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}

function hi(password, salt, iterations) {
    const saltBuffer = Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from([0, 0, 0, 1])]);
    let result = hmac(password, saltBuffer);
    let prev = result;
    for (let i = 1; i < iterations; i++) {
        prev = hmac(password, prev);
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

async function testSCRAM() {
    const username = 'admin';
    const password = 'admin123';

    console.log('=== SCRAM-SHA-256 认证测试 ===\n');

    const clientNonce = generateNonce();
    const clientFirstMessageBare = `n=${username},r=${clientNonce}`;
    const clientFirstMessage = `n,,${clientFirstMessageBare}`;

    console.log('步骤 1: 客户端 -> 服务器');
    console.log('  消息:', clientFirstMessage);
    console.log('');

    const response1 = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 1,
            clientFirstMessage: clientFirstMessageBare
        })
    });

    const data1 = await response1.json();

    if (!data1.success) {
        console.log('错误:', data1.error);
        return;
    }

    console.log('步骤 1: 服务器 -> 客户端');
    console.log('  Session ID:', data1.sessionId);
    console.log('  消息:', data1.serverFirstMessage);
    console.log('');

    const serverFirst = parseServerFirst(data1.serverFirstMessage);
    const channelBinding = 'biws';
    const clientFinalWithoutProof = `c=${channelBinding},r=${serverFirst.nonce}`;
    const authMessage = `${clientFirstMessageBare},${data1.serverFirstMessage},${clientFinalWithoutProof}`;

    const passwordBytes = Buffer.from(password, 'utf8');
    const saltedPassword = hi(passwordBytes, serverFirst.salt, serverFirst.iterations);
    const clientKey = hmac(saltedPassword, Buffer.from('Client Key', 'utf8'));
    const storedKey = hash(clientKey);
    const clientSignature = hmac(storedKey, Buffer.from(authMessage, 'utf8'));
    const clientProof = xor(clientKey, clientSignature);

    const clientFinalMessage = `${clientFinalWithoutProof},p=${clientProof.toString('base64')}`;

    console.log('步骤 2: 客户端 -> 服务器');
    console.log('  消息:', clientFinalMessage);
    console.log('');

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

    if (!data2.success) {
        console.log('错误:', data2.error);
        console.log('  服务器消息:', data2.serverFinalMessage);
        return;
    }

    console.log('步骤 2: 服务器 -> 客户端');
    console.log('  消息:', data2.serverFinalMessage);
    console.log('');

    const serverKey = hmac(saltedPassword, Buffer.from('Server Key', 'utf8'));
    const expectedServerSignature = hmac(serverKey, Buffer.from(authMessage, 'utf8'));
    const expectedSignatureBase64 = expectedServerSignature.toString('base64');

    const serverSignatureMatch = data2.serverFinalMessage.includes(`v=${expectedSignatureBase64}`);

    console.log('=== 认证结果 ===');
    console.log('  成功:', data2.success);
    console.log('  用户:', data2.user.username);
    console.log('  DN:', data2.user.dn);
    console.log('  服务器签名验证:', serverSignatureMatch ? '通过' : '失败');
    console.log('');
    console.log('SCRAM-SHA-256 认证测试完成！');
}

testSCRAM().catch(console.error);
