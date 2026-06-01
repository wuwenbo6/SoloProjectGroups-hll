const lockoutStore = new Map();

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_DURATION = 15 * 60 * 1000;

function getLockoutConfig() {
  return {
    maxAttempts: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS,
    lockDuration: parseInt(process.env.LOCKOUT_DURATION) || DEFAULT_LOCK_DURATION
  };
}

function getClientKey(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const adminDn = req.body.adminDn || '';
  return `${ip}:${adminDn}`;
}

function getLockoutInfo(key) {
  const now = Date.now();
  const info = lockoutStore.get(key);
  
  if (!info) {
    return {
      attempts: 0,
      locked: false,
      lockUntil: null,
      remainingAttempts: getLockoutConfig().maxAttempts
    };
  }
  
  if (info.locked && info.lockUntil && now > info.lockUntil) {
    lockoutStore.delete(key);
    return {
      attempts: 0,
      locked: false,
      lockUntil: null,
      remainingAttempts: getLockoutConfig().maxAttempts
    };
  }
  
  const config = getLockoutConfig();
  return {
    attempts: info.attempts,
    locked: info.locked,
    lockUntil: info.lockUntil,
    remainingAttempts: Math.max(0, config.maxAttempts - info.attempts)
  };
}

function isLocked(req) {
  const key = getClientKey(req);
  const info = getLockoutInfo(key);
  return info.locked;
}

function recordFailedAttempt(req) {
  const key = getClientKey(req);
  const config = getLockoutConfig();
  const info = lockoutStore.get(key) || { attempts: 0, locked: false, lockUntil: null };
  
  info.attempts += 1;
  
  if (info.attempts >= config.maxAttempts) {
    info.locked = true;
    info.lockUntil = Date.now() + config.lockDuration;
  }
  
  lockoutStore.set(key, info);
  
  return {
    attempts: info.attempts,
    locked: info.locked,
    lockUntil: info.lockUntil,
    remainingAttempts: Math.max(0, config.maxAttempts - info.attempts)
  };
}

function recordSuccessfulAttempt(req) {
  const key = getClientKey(req);
  lockoutStore.delete(key);
}

function getLockoutStatus(req) {
  const key = getClientKey(req);
  return getLockoutInfo(key);
}

function resetLockout(req) {
  const key = getClientKey(req);
  lockoutStore.delete(key);
}

module.exports = {
  isLocked,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  getLockoutStatus,
  resetLockout,
  getLockoutConfig
};
