const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/jwt');
const { normalizeIp, verifyIpBinding } = require('../utils/ip');
const { parseAndVerifyAntiLeechUrl } = require('../utils/antileech');
const {
  recordStreamStart,
  recordStreamEnd,
  recordPlayStart,
  recordPlayEnd,
  recordAuthFailed,
} = require('../utils/audit');

const ENABLE_IP_BINDING = process.env.ENABLE_IP_BINDING !== 'false';
const ENABLE_ANTILEECH = process.env.ENABLE_ANTILEECH !== 'false';
const REQUIRE_BOTH_AUTH = process.env.REQUIRE_BOTH_AUTH === 'true';

const activeSessions = new Map();

function parseTokenFromArgs(args) {
  if (!args) return null;
  
  const tokenMatch = args.match(/token=([^&]+)/);
  if (tokenMatch) {
    try {
      return decodeURIComponent(tokenMatch[1]);
    } catch (e) {
      return tokenMatch[1];
    }
  }
  return null;
}

function authenticateRtmpRequest(req, action) {
  const { name, addr, app, args } = req.body;
  const clientIp = normalizeIp(addr);

  const logPrefix = `[${action.toUpperCase()}] [app=${app}] [stream=${name}] [ip=${clientIp}]`;
  console.log(`${logPrefix} 收到${action}请求`);

  const auditData = {
    app: app,
    streamKey: name,
    clientIp: clientIp,
  };

  let jwtValid = false;
  let antileechValid = false;
  let decoded = null;
  let authError = null;

  const token = parseTokenFromArgs(args);
  if (token) {
    const jwtResult = verifyToken(token);
    if (jwtResult.valid) {
      jwtValid = true;
      decoded = jwtResult.decoded;
      auditData.userId = decoded.sub;
    } else {
      authError = jwtResult.error;
      console.log(`${logPrefix} JWT验证失败: ${jwtResult.error}`);
    }
  } else if (!ENABLE_ANTILEECH) {
    authError = '缺少鉴权Token';
  }

  if (ENABLE_ANTILEECH) {
    const antileechResult = parseAndVerifyAntiLeechUrl(name, args);
    if (antileechResult.valid) {
      antileechValid = true;
    } else if (!authError) {
      authError = antileechResult.error;
    }
    console.log(`${logPrefix} 防盗链验证: ${antileechResult.valid ? '通过' : '失败 - ' + antileechResult.error}`);
  }

  let allowed = false;
  let status = 200;
  let message = '鉴权通过';

  if (REQUIRE_BOTH_AUTH) {
    allowed = jwtValid && antileechValid;
    if (!allowed) {
      status = 401;
      message = authError || '鉴权失败';
    }
  } else {
    allowed = jwtValid || antileechValid;
    if (!allowed) {
      status = 401;
      message = authError || '鉴权失败';
    }
  }

  if (allowed && decoded) {
    if (decoded.streamKey && decoded.streamKey !== name) {
      allowed = false;
      status = 403;
      message = 'StreamKey不匹配';
      console.log(`${logPrefix} 拒绝: StreamKey不匹配 (token=${decoded.streamKey}, request=${name})`);
    } else if (ENABLE_IP_BINDING && decoded.ip) {
      if (!verifyIpBinding(decoded.ip, clientIp)) {
        allowed = false;
        status = 403;
        message = 'IP地址不匹配';
        console.log(`${logPrefix} 拒绝: IP不匹配 (token=${decoded.ip}, request=${clientIp})`);
      }
    } else if (decoded.type && decoded.type !== 'push_pull') {
      if (action === 'publish' && !decoded.type.includes('push')) {
        allowed = false;
        status = 403;
        message = 'Token不允许推流';
        console.log(`${logPrefix} 拒绝: Token不允许推流`);
      }
      if (action === 'play' && !decoded.type.includes('pull')) {
        allowed = false;
        status = 403;
        message = 'Token不允许拉流';
        console.log(`${logPrefix} 拒绝: Token不允许拉流`);
      }
    }
  }

  if (!allowed) {
    recordAuthFailed(name, message, auditData);
    console.log(`${logPrefix} 拒绝: ${message}`);
    return { allowed: false, status, message };
  }

  console.log(`${logPrefix} 允许: 用户=${decoded?.sub || 'anonymous'}`);
  return { allowed: true, status: 200, message: '鉴权通过', decoded };
}

router.post('/on_publish', (req, res) => {
  const { name, addr, app } = req.body;
  const clientIp = normalizeIp(addr);

  const result = authenticateRtmpRequest(req, 'publish');
  
  if (result.allowed) {
    const sessionId = recordStreamStart(name, {
      app,
      clientIp,
      userId: result.decoded?.sub,
    });
    const sessionKey = `${app}-${name}-${clientIp}`;
    activeSessions.set(sessionKey, sessionId);
    res.status(200).send(result.message);
  } else {
    res.status(result.status).send(result.message);
  }
});

router.post('/on_play', (req, res) => {
  const { name, addr, app } = req.body;
  const clientIp = normalizeIp(addr);

  const result = authenticateRtmpRequest(req, 'play');
  
  if (result.allowed) {
    recordPlayStart(name, {
      app,
      clientIp,
      userId: result.decoded?.sub,
    });
    res.status(200).send(result.message);
  } else {
    res.status(result.status).send(result.message);
  }
});

router.post('/on_publish_done', (req, res) => {
  const { name, addr, app } = req.body;
  const clientIp = normalizeIp(addr);
  
  const sessionKey = `${app}-${name}-${clientIp}`;
  const sessionId = activeSessions.get(sessionKey);
  
  if (sessionId) {
    recordStreamEnd(sessionId, {
      app,
      clientIp,
    });
    activeSessions.delete(sessionKey);
  } else {
    recordStreamEnd(`unknown-${name}-${Date.now()}`, {
      app,
      clientIp,
      streamKey: name,
    });
  }

  console.log(`[PUBLISH_DONE] [app=${app}] [stream=${name}] [ip=${clientIp}] 推流结束`);
  res.status(200).send('OK');
});

router.post('/on_play_done', (req, res) => {
  const { name, addr, app } = req.body;
  const clientIp = normalizeIp(addr);

  recordPlayEnd(name, {
    app,
    clientIp,
  });

  console.log(`[PLAY_DONE] [app=${app}] [stream=${name}] [ip=${clientIp}] 拉流结束`);
  res.status(200).send('OK');
});

router.post('/on_connect', (req, res) => {
  const { addr, app } = req.body;
  const clientIp = normalizeIp(addr);
  console.log(`[CONNECT] [app=${app}] [ip=${clientIp}] 客户端连接`);
  res.status(200).send('OK');
});

router.post('/on_disconnect', (req, res) => {
  const { addr, app } = req.body;
  const clientIp = normalizeIp(addr);
  console.log(`[DISCONNECT] [app=${app}] [ip=${clientIp}] 客户端断开连接`);
  res.status(200).send('OK');
});

module.exports = router;
