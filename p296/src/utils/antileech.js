const crypto = require('crypto');

const ANTILEECH_SECRET = process.env.ANTILEECH_SECRET || process.env.JWT_SECRET || 'antileech-secret-change-in-production';
const ANTILEECH_TTL = parseInt(process.env.ANTILEECH_TTL) || 3600;
const ANTILEECH_PARAM_TS = process.env.ANTILEECH_PARAM_TS || 'ts';
const ANTILEECH_PARAM_SIGN = process.env.ANTILEECH_PARAM_SIGN || 'sign';

function generateAntiLeechUrl(baseUrl, streamKey, options = {}) {
  const ttl = options.ttl || ANTILEECH_TTL;
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const secret = options.secret || ANTILEECH_SECRET;
  
  const signString = `${secret}${streamKey}${timestamp}`;
  const signature = crypto.createHash('md5').update(signString).digest('hex');
  
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}${ANTILEECH_PARAM_TS}=${timestamp}&${ANTILEECH_PARAM_SIGN}=${signature}`;
  
  return {
    url: url,
    timestamp: timestamp,
    signature: signature,
    expiresAt: new Date(timestamp * 1000).toISOString(),
    ttl: ttl,
  };
}

function verifyAntiLeechUrl(streamKey, timestamp, signature, options = {}) {
  const secret = options.secret || ANTILEECH_SECRET;
  const now = Math.floor(Date.now() / 1000);
  
  if (timestamp < now) {
    return { valid: false, error: 'URL已过期' };
  }
  
  const signString = `${secret}${streamKey}${timestamp}`;
  const expectedSignature = crypto.createHash('md5').update(signString).digest('hex');
  
  if (signature !== expectedSignature) {
    return { valid: false, error: '签名无效' };
  }
  
  return { valid: true, error: null };
}

function parseAndVerifyAntiLeechUrl(streamKey, args) {
  if (!args) {
    return { valid: false, error: '缺少防盗链参数' };
  }
  
  const tsPattern = ANTILEECH_PARAM_TS + '=';
  const signPattern = ANTILEECH_PARAM_SIGN + '=';
  
  let timestamp = null;
  let signature = null;
  
  const params = args.split('&');
  for (const param of params) {
    if (param.startsWith(tsPattern)) {
      timestamp = parseInt(param.substring(tsPattern.length), 10);
    } else if (param.startsWith(signPattern)) {
      signature = param.substring(signPattern.length);
    }
  }
  
  if (!timestamp || !signature) {
    return { valid: false, error: '防盗链参数不完整' };
  }
  
  return verifyAntiLeechUrl(streamKey, timestamp, signature);
}

module.exports = {
  generateAntiLeechUrl,
  verifyAntiLeechUrl,
  parseAndVerifyAntiLeechUrl,
};
