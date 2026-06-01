const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const algorithm = args[0] || 'RS256';
const keyDir = args[1] || path.join(__dirname, '..', 'keys');

if (!fs.existsSync(keyDir)) {
  fs.mkdirSync(keyDir, { recursive: true });
}

function generateRSAKeys() {
  console.log('正在生成 RSA 密钥对 (用于 RS256/RS384/RS512)...');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

function generateECKeys() {
  console.log('正在生成 EC 密钥对 (用于 ES256/ES384/ES512)...');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

let keys;
let keyType;

switch (algorithm.toUpperCase()) {
  case 'RS256':
  case 'RS384':
  case 'RS512':
    keys = generateRSAKeys();
    keyType = 'RSA';
    break;
  case 'ES256':
  case 'ES384':
  case 'ES512':
    keys = generateECKeys();
    keyType = 'EC';
    break;
  default:
    console.error(`不支持的算法: ${algorithm}`);
    console.error('支持的算法: RS256, RS384, RS512, ES256, ES384, ES512');
    process.exit(1);
}

const privateKeyPath = path.join(keyDir, 'private.key');
const publicKeyPath = path.join(keyDir, 'public.key');

fs.writeFileSync(privateKeyPath, keys.privateKey, { mode: 0o600 });
fs.writeFileSync(publicKeyPath, keys.publicKey, { mode: 0o644 });

console.log(`\n密钥生成成功！`);
console.log(`算法: ${algorithm}`);
console.log(`密钥类型: ${keyType}`);
console.log(`私钥路径: ${privateKeyPath}`);
console.log(`公钥路径: ${publicKeyPath}`);

console.log(`\n请更新 .env 文件中的配置：`);
console.log(`  JWT_ALGORITHM=${algorithm}`);
console.log(`  JWT_PRIVATE_KEY_PATH=${privateKeyPath}`);
console.log(`  JWT_PUBLIC_KEY_PATH=${publicKeyPath}`);
