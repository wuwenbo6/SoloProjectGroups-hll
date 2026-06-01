async function testShortNonce() {
    console.log('=== 测试客户端nonce长度验证 ===\n');

    const shortNonce = 'short';
    console.log(`测试短nonce (长度=${shortNonce.length}): ${shortNonce}`);

    const clientFirstMessageBare = `n=admin,r=${shortNonce}`;

    const response = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 1,
            clientFirstMessage: clientFirstMessageBare
        })
    });

    const data = await response.json();

    console.log(`\n结果:`);
    console.log(`  成功: ${data.success}`);
    console.log(`  错误: ${data.error}`);
    console.log(`  ServerFinal: ${data.serverFinalMessage}`);
    console.log(`  HTTP状态: ${response.status}`);

    if (!data.success && data.serverFinalMessage) {
        console.log(`\n✓ 短nonce已被正确拒绝`);
    } else {
        console.log(`\n✗ 短nonce验证失败`);
    }

    console.log('\n');

    const validNonce = 'thisisavalidnonce12345';
    console.log(`测试有效nonce (长度=${validNonce.length}): ${validNonce}`);

    const clientFirstMessageBare2 = `n=admin,r=${validNonce}`;

    const response2 = await fetch('http://localhost:3000/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            step: 1,
            clientFirstMessage: clientFirstMessageBare2
        })
    });

    const data2 = await response2.json();

    console.log(`\n结果:`);
    console.log(`  成功: ${data2.success}`);
    if (data2.success) {
        console.log(`  Session ID: ${data2.sessionId}`);
        console.log(`  ServerFirst: ${data2.serverFirstMessage}`);
        console.log(`\n✓ 有效nonce已被正确接受`);
    } else {
        console.log(`  错误: ${data2.error}`);
    }

    console.log('\n=== 测试完成 ===');
}

testShortNonce().catch(console.error);
