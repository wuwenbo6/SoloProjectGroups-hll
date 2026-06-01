const express = require('express');
const path = require('path');
const AuthHandler = require('./auth-handler');

const app = express();
const PORT = process.env.PORT || 3000;

const authHandler = new AuthHandler();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/mechanisms', async (req, res) => {
    const result = await authHandler.handleMechanismNegotiate(req);
    res.json(result);
});

app.post('/auth', async (req, res) => {
    const { step } = req.body;

    console.log(`[Server] Received auth request, step: ${step}`);

    try {
        const result = await authHandler.handleAuth(req.body, req);
        const statusCode = result.code || (result.success ? 200 : 401);
        res.status(statusCode).json(result);

    } catch (err) {
        console.error('[Server] Auth error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.get('/api/users', (req, res) => {
    const users = authHandler.listUsers();
    res.json({
        success: true,
        users: users
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = authHandler.getAuthLogs(limit);
    res.json({
        success: true,
        logs: logs
    });
});

app.get('/api/stats', (req, res) => {
    const stats = authHandler.getAuthStats();
    res.json({
        success: true,
        stats: stats
    });
});

app.delete('/api/logs', (req, res) => {
    const result = authHandler.clearAuthLogs();
    res.json(result);
});

app.listen(PORT, () => {
    console.log('========================================');
    console.log('  SASL 多机制代理服务器');
    console.log('========================================');
    console.log(`服务器运行在: http://localhost:${PORT}`);
    console.log('');
    console.log('支持的认证机制:');
    console.log('  PLAIN');
    console.log('  SCRAM-SHA-1');
    console.log('  SCRAM-SHA-256 (默认)');
    console.log('');
    console.log('可用测试账号:');
    console.log('  admin / admin123');
    console.log('  user  / user123');
    console.log('  test  / test123');
    console.log('');
    console.log('API 端点:');
    console.log('  GET  /api/mechanisms - 获取支持的机制');
    console.log('  POST /auth           - 认证接口');
    console.log('  GET  /api/users      - 用户列表');
    console.log('  GET  /api/health     - 健康检查');
    console.log('  GET  /api/logs       - 认证日志');
    console.log('  GET  /api/stats      - 认证统计');
    console.log('  DELETE /api/logs     - 清除日志');
    console.log('========================================');
});
