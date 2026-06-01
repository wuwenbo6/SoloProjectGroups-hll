const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH;
const JWT_PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH;

const VALID_ALGORITHMS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

let signingKey = null;
let verifyingKey = null;

function initKeys() {
  if (!VALID_ALGORITHMS.includes(JWT_ALGORITHM)) {
    throw new Error(`不支持的JWT算法: ${JWT_ALGORITHM}。支持的算法: ${VALID_ALGORITHMS.join(', ')}`);
  }

  if (['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'].includes(JWT_ALGORITHM)) {
    const privateKeyPath = JWT_PRIVATE_KEY_PATH || path.join(__dirname, '..', '..', 'keys', 'private.key');
    const publicKeyPath = JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', '..', 'keys', 'public.key');

    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`私钥文件不存在: ${privateKeyPath}。请使用 scripts/generate-keys.js 生成密钥。`);
    }
    if (!fs.existsSync(publicKeyPath)) {
      throw new Error(`公钥文件不存在: ${publicKeyPath}。请使用 scripts/generate-keys.js 生成密钥。`);
    }

    signingKey = fs.readFileSync(privateKeyPath, 'utf8');
    verifyingKey = fs.readFileSync(publicKeyPath, 'utf8');
  } else {
    signingKey = JWT_SECRET;
    verifyingKey = JWT_SECRET;
  }
}

try {
  initKeys();
} catch (err) {
  if (JWT_ALGORITHM !== 'HS256') {
    console.warn(`JWT密钥初始化警告: ${err.message}`);
    console.warn('将回退到HS256算法，使用JWT_SECRET');
  }
  signingKey = JWT_SECRET;
  verifyingKey = JWT_SECRET;
}

function generateToken(payload) {
  const options = {
    algorithm: signingKey === JWT_SECRET ? 'HS256' : JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  };
  return jwt.sign(payload, signingKey, options);
}

function verifyToken(token) {
  try {
    const options = {
      algorithms: [signingKey === JWT_SECRET ? 'HS256' : JWT_ALGORITHM],
    };
    const decoded = jwt.verify(token, verifyingKey, options);
    return { valid: true, decoded, error: null };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, decoded: null, error: 'Token已过期' };
    }
    if (err.name === 'JsonWebTokenError') {
      return { valid: false, decoded: null, error: 'Token签名无效' };
    }
    return { valid: false, decoded: null, error: err.message };
  }
}

function decodeToken(token) {
  return jwt.decode(token);
}

function getAlgorithmInfo() {
  return {
    algorithm: signingKey === JWT_SECRET ? 'HS256' : JWT_ALGORITHM,
    type: signingKey === JWT_SECRET ? 'HMAC' : 'Asymmetric',
    keyType: signingKey === JWT_SECRET ? 'Shared Secret' : 'Key Pair',
  };
}

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  getAlgorithmInfo,
};
