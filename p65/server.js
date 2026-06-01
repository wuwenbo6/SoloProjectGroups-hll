const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const crypto = require('crypto');
const {
  getUserByUsername,
  getUserById,
  createUser,
  getAuthenticatorsByUserId,
  getAuthenticatorByCredentialId,
  saveAuthenticator,
  updateAuthenticatorCounter,
  deleteAuthenticator,
  saveRecoveryCode,
  getRecoveryCodesByUserId,
  getRecoveryCodeByHash,
  markRecoveryCodeUsed,
  deleteRecoveryCodesByUserId,
  addAuditLog,
  getAuditLogsByUserId,
  getAllAuditLogsByUserId,
  getUserIps,
  recordUserIp
} = require('./database');

const app = express();
const PORT = 3000;

const RP_NAME = 'WebAuthn Demo';
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];

function getRPId(hostname) {
  if (hostname === '127.0.0.1') return 'localhost';
  return hostname;
}

function getOrigin(rpId) {
  if (rpId === 'localhost') {
    return ALLOWED_ORIGINS;
  }
  return [`http://${rpId}:${PORT}`, `https://${rpId}`];
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

const sessions = new Map();

app.post('/api/register/start', async (req, res) => {
  try {
    const { username } = req.body;
    const hostname = req.hostname;
    const rpID = getRPId(hostname);
    const expectedOrigin = getOrigin(rpID);
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: '用户名不能为空' });
    }

    let user = await getUserByUsername(username);
    
    if (!user) {
      const userId = uuidv4();
      user = await createUser(userId, username);
    }

    const userAuthenticators = await getAuthenticatorsByUserId(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpID,
      userID: user.id,
      userName: user.username,
      attestationType: 'none',
      excludeCredentials: userAuthenticators.map(authenticator => ({
        id: authenticator.credential_id,
        type: 'public-key',
        transports: authenticator.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const sessionId = uuidv4();
    sessions.set(sessionId, {
      challenge: options.challenge,
      userId: user.id,
      username: user.username,
      type: 'registration',
      rpID,
      expectedOrigin
    });

    res.json({
      sessionId,
      options,
      isNewUser: userAuthenticators.length === 0
    });
  } catch (error) {
    console.error('注册开始错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/register/finish', async (req, res) => {
  try {
    const { sessionId, response } = req.body;
    const session = sessions.get(sessionId);

    if (!session || session.type !== 'registration') {
      return res.status(400).json({ error: '无效的会话' });
    }

    sessions.delete(sessionId);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: session.challenge,
      expectedOrigin: session.expectedOrigin,
      expectedRPID: session.rpID,
      requireUserVerification: true,
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp
      } = registrationInfo;

      const existingAuthenticator = await getAuthenticatorByCredentialId(credentialID);
      
      if (existingAuthenticator) {
        return res.status(400).json({ error: '该设备已注册' });
      }

      await saveAuthenticator(session.userId, {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
        transports: response.response.transports
      });

      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');
      
      await recordUserIp(session.userId, ip);
      await addAuditLog(
        session.userId, 
        'device_registered', 
        { 
          credentialId: credentialID,
          deviceType: credentialDeviceType
        }, 
        ip, 
        userAgent
      );

      const authenticators = await getAuthenticatorsByUserId(session.userId);

      res.json({
        verified: true,
        user: {
          id: session.userId,
          username: session.username
        },
        deviceCount: authenticators.length
      });
    } else {
      res.json({ verified: false });
    }
  } catch (error) {
    console.error('注册完成错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/login/start', async (req, res) => {
  try {
    const { username } = req.body;
    const hostname = req.hostname;
    const rpID = getRPId(hostname);
    const expectedOrigin = getOrigin(rpID);

    if (!username || username.trim() === '') {
      return res.status(400).json({ error: '用户名不能为空' });
    }

    const user = await getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const userAuthenticators = await getAuthenticatorsByUserId(user.id);

    if (userAuthenticators.length === 0) {
      return res.status(400).json({ error: '该用户未注册任何认证设备' });
    }

    const options = await generateAuthenticationOptions({
      rpID: rpID,
      allowCredentials: userAuthenticators.map(authenticator => ({
        id: authenticator.credential_id,
        type: 'public-key',
        transports: authenticator.transports,
      })),
      userVerification: 'preferred',
    });

    const sessionId = uuidv4();
    sessions.set(sessionId, {
      challenge: options.challenge,
      userId: user.id,
      username: user.username,
      type: 'authentication',
      rpID,
      expectedOrigin
    });

    res.json({
      sessionId,
      options,
      deviceCount: userAuthenticators.length
    });
  } catch (error) {
    console.error('登录开始错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/login/finish', async (req, res) => {
  try {
    const { sessionId, response } = req.body;
    const session = sessions.get(sessionId);

    if (!session || session.type !== 'authentication') {
      return res.status(400).json({ error: '无效的会话' });
    }

    sessions.delete(sessionId);

    const authenticator = await getAuthenticatorByCredentialId(response.id);

    if (!authenticator) {
      return res.status(400).json({ error: '未找到对应的认证设备' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: session.challenge,
      expectedOrigin: session.expectedOrigin,
      expectedRPID: session.rpID,
      authenticator: {
        credentialID: authenticator.credential_id,
        credentialPublicKey: authenticator.credential_public_key,
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
      requireUserVerification: true,
    });

    const { verified, authenticationInfo } = verification;

    if (verified) {
      await updateAuthenticatorCounter(
        authenticator.credential_id,
        authenticationInfo.newCounter
      );

      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');
      
      await recordUserIp(session.userId, ip);
      
      const { riskScore, riskDetails } = await assessRisk(session.userId, ip, userAgent);
      
      await addAuditLog(
        session.userId, 
        'login_success', 
        { credentialId: authenticator.credential_id }, 
        ip, 
        userAgent,
        riskScore,
        riskDetails
      );

      const authenticators = await getAuthenticatorsByUserId(session.userId);

      res.json({
        verified: true,
        user: {
          id: session.userId,
          username: session.username
        },
        deviceCount: authenticators.length,
        riskScore,
        riskDetails
      });
    } else {
      res.json({ verified: false });
    }
  } catch (error) {
    console.error('登录完成错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/user/devices', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const authenticators = await getAuthenticatorsByUserId(userId);
    
    res.json({
      devices: authenticators.map(a => ({
        credentialId: a.credential_id,
        deviceType: a.credential_device_type,
        backedUp: a.credential_backed_up,
        createdAt: a.created_at,
        lastUsedAt: a.last_used_at
      }))
    });
  } catch (error) {
    console.error('获取设备列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.delete('/api/user/devices/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const authenticators = await getAuthenticatorsByUserId(userId);
    
    if (authenticators.length <= 1) {
      return res.status(400).json({ error: '至少需要保留一个认证设备' });
    }

    const deleted = await deleteAuthenticator(credentialId, userId);
    
    if (deleted) {
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');
      await addAuditLog(userId, 'device_removed', { credentialId }, ip, userAgent);

      const remainingAuthenticators = await getAuthenticatorsByUserId(userId);
      res.json({ 
        success: true, 
        message: '设备已解绑',
        deviceCount: remainingAuthenticators.length
      });
    } else {
      res.status(404).json({ error: '未找到该设备' });
    }
  } catch (error) {
    console.error('删除设备错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

function generateRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function hashRecoveryCode(code) {
  const cleanCode = code.replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(cleanCode).digest('hex');
}

async function assessRisk(userId, ip, userAgent) {
  let riskScore = 0;
  const riskDetails = [];

  const userIps = await getUserIps(userId);
  const knownIps = userIps.map(i => i.ip_address);
  
  if (!knownIps.includes(ip)) {
    riskScore += 50;
    riskDetails.push({
      type: 'new_ip',
      message: '从未知IP地址登录',
      severity: 'medium'
    });
  }

  const recentLogs = await getAuditLogsByUserId(userId, 10);
  const oneHourAgo = Date.now() - 3600000;
  const recentFailures = recentLogs.filter(log => 
    log.event_type === 'login_failed' && 
    new Date(log.created_at).getTime() > oneHourAgo
  ).length;

  if (recentFailures >= 3) {
    riskScore += 30;
    riskDetails.push({
      type: 'multiple_failures',
      message: '近期存在多次登录失败',
      severity: 'medium'
    });
  }

  if (riskScore >= 50) {
    riskDetails.push({
      type: 'high_risk',
      message: '检测到异常登录行为',
      severity: 'high'
    });
  }

  return { riskScore, riskDetails };
}

app.post('/api/recovery-codes/generate', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    await deleteRecoveryCodesByUserId(userId);

    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = generateRecoveryCode();
      const codeHash = hashRecoveryCode(code);
      const codePrefix = code.substring(0, 4);
      await saveRecoveryCode(userId, codeHash, codePrefix);
      codes.push(code);
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    await addAuditLog(userId, 'recovery_codes_generated', { count: 10 }, ip, userAgent);

    res.json({ 
      success: true,
      codes,
      message: '请妥善保存这些恢复码，每个只能使用一次'
    });
  } catch (error) {
    console.error('生成恢复码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/recovery-codes', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const codes = await getRecoveryCodesByUserId(userId);
    
    res.json({
      codes: codes.map(c => ({
        id: c.id,
        prefix: c.code_prefix,
        used: !!c.used,
        usedAt: c.used_at,
        createdAt: c.created_at
      }))
    });
  } catch (error) {
    console.error('获取恢复码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/recovery-codes/use', async (req, res) => {
  try {
    const { username, code } = req.body;
    
    if (!username || !code) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const user = await getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const codeHash = hashRecoveryCode(code);
    const recoveryCode = await getRecoveryCodeByHash(codeHash);

    if (!recoveryCode) {
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');
      await addAuditLog(user.id, 'recovery_code_failed', { code: code.substring(0, 4) }, ip, userAgent);
      return res.status(400).json({ error: '无效的恢复码' });
    }

    await markRecoveryCodeUsed(recoveryCode.id);

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    await recordUserIp(user.id, ip);
    await addAuditLog(user.id, 'recovery_code_used', {}, ip, userAgent);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('使用恢复码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const logs = await getAuditLogsByUserId(userId, parseInt(limit));
    
    res.json({ logs });
  } catch (error) {
    console.error('获取审计日志错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/audit-logs/export', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const logs = await getAllAuditLogsByUserId(userId);
    
    const csvContent = [
      ['时间', '事件类型', 'IP地址', '风险评分', '事件详情'].join(','),
      ...logs.map(log => [
        log.created_at,
        log.event_type,
        log.ip_address || '',
        log.risk_score || 0,
        JSON.stringify(log.event_data || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const filename = `audit-log-${user.username}-${Date.now()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent);

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    await addAuditLog(userId, 'audit_log_exported', { count: logs.length }, ip, userAgent);
  } catch (error) {
    console.error('导出审计日志错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/user/security-summary', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const [authenticators, recoveryCodes, auditLogs, userIps] = await Promise.all([
      getAuthenticatorsByUserId(userId),
      getRecoveryCodesByUserId(userId),
      getAuditLogsByUserId(userId, 20),
      getUserIps(userId)
    ]);

    const unusedRecoveryCodes = recoveryCodes.filter(c => !c.used).length;

    res.json({
      devices: authenticators.length,
      recoveryCodes: {
        total: recoveryCodes.length,
        unused: unusedRecoveryCodes
      },
      recentActivity: auditLogs,
      knownIps: userIps.length
    });
  } catch (error) {
    console.error('获取安全概览错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.listen(PORT, () => {
  console.log(`WebAuthn 服务器运行在 http://localhost:${PORT}`);
  console.log(`请使用支持 WebAuthn 的浏览器访问`);
  console.log(`支持的认证方式: Touch ID, Windows Hello, YubiKey 等`);
});
