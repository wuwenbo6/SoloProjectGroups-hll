const express = require('express');
const router = express.Router();
const ldapService = require('../services/ldapService');
const lockoutService = require('../services/lockoutService');

router.post('/login', async (req, res) => {
  const { host, port, baseDn, adminDn, password } = req.body;

  if (lockoutService.isLocked(req)) {
    const status = lockoutService.getLockoutStatus(req);
    const remainingTime = Math.ceil((status.lockUntil - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      message: `登录尝试次数过多，请在 ${remainingTime} 秒后重试`,
      locked: true,
      lockUntil: status.lockUntil,
      remainingTime
    });
  }

  if (!host || !port || !baseDn || !adminDn || !password) {
    return res.status(400).json({
      success: false,
      message: '缺少必要的连接参数'
    });
  }

  const config = {
    host,
    port: parseInt(port),
    baseDn,
    adminDn,
    adminPassword: password
  };

  try {
    const result = await ldapService.testConnection(config);
    if (result.success) {
      lockoutService.recordSuccessfulAttempt(req);
      req.session.ldapConfig = {
        ...config,
        connected: true
      };
      res.json({
        success: true,
        message: '连接成功',
        sessionId: req.sessionID
      });
    } else {
      const lockoutInfo = lockoutService.recordFailedAttempt(req);
      let message = result.error || '连接失败';
      if (lockoutInfo.locked) {
        const remainingTime = Math.ceil((lockoutInfo.lockUntil - Date.now()) / 1000);
        message = `登录失败次数过多，账号已锁定 ${remainingTime} 秒`;
      } else if (lockoutInfo.remainingAttempts > 0) {
        message = `${message}（还剩 ${lockoutInfo.remainingAttempts} 次尝试机会）`;
      }
      res.status(401).json({
        success: false,
        message,
        locked: lockoutInfo.locked,
        remainingAttempts: lockoutInfo.remainingAttempts,
        attempts: lockoutInfo.attempts
      });
    }
  } catch (err) {
    const lockoutInfo = lockoutService.recordFailedAttempt(req);
    let message = err.message || '连接时发生错误';
    if (lockoutInfo.locked) {
      const remainingTime = Math.ceil((lockoutInfo.lockUntil - Date.now()) / 1000);
      message = `登录失败次数过多，账号已锁定 ${remainingTime} 秒`;
    } else if (lockoutInfo.remainingAttempts > 0) {
      message = `${message}（还剩 ${lockoutInfo.remainingAttempts} 次尝试机会）`;
    }
    res.status(500).json({
      success: false,
      message,
      locked: lockoutInfo.locked,
      remainingAttempts: lockoutInfo.remainingAttempts,
      attempts: lockoutInfo.attempts
    });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '登出失败'
      });
    }
    res.clearCookie('connect.sid');
    res.json({
      success: true,
      message: '已登出'
    });
  });
});

router.get('/status', (req, res) => {
  if (req.session && req.session.ldapConfig && req.session.ldapConfig.connected) {
    res.json({
      success: true,
      connected: true,
      config: {
        host: req.session.ldapConfig.host,
        port: req.session.ldapConfig.port,
        baseDn: req.session.ldapConfig.baseDn,
        adminDn: req.session.ldapConfig.adminDn
      }
    });
  } else {
    res.json({
      success: true,
      connected: false
    });
  }
});

router.get('/lockout-config', (req, res) => {
  const config = lockoutService.getLockoutConfig();
  res.json({
    success: true,
    maxAttempts: config.maxAttempts,
    lockDurationSeconds: Math.floor(config.lockDuration / 1000)
  });
});

module.exports = router;
