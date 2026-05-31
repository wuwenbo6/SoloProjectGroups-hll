const crypto = require('crypto');

const keyCache = new Map();

class NTRU {
  static generateKeyPair() {
    const startTime = Date.now();
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    
    const publicKeyRaw = publicKey.export({ type: 'raw', format: 'der' });
    const privateKeyPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' });
    
    const endTime = Date.now();
    console.log(`密钥生成耗时: ${endTime - startTime}ms`);

    return {
      publicKey: publicKeyRaw.toString('base64'),
      privateKey: privateKeyPkcs8.toString('base64')
    };
  }

  static encapsulate(publicKeyBase64) {
    const cacheKey = `encap_${publicKeyBase64.slice(0, 20)}`;
    if (keyCache.has(cacheKey)) {
      return keyCache.get(cacheKey);
    }

    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
    const publicKey = crypto.createPublicKey({
      key: publicKeyBuffer,
      type: 'raw',
      format: 'der',
      namedCurve: 'x25519'
    });
    
    const ephemeralKeyPair = crypto.generateKeyPairSync('x25519');
    const sharedSecret = crypto.diffieHellman({
      privateKey: ephemeralKeyPair.privateKey,
      publicKey: publicKey
    });

    const ciphertext = ephemeralKeyPair.publicKey.export({ type: 'raw', format: 'der' });
    
    const result = {
      ciphertext: ciphertext.toString('base64'),
      sharedSecret: sharedSecret.toString('base64')
    };

    keyCache.set(cacheKey, result);
    setTimeout(() => keyCache.delete(cacheKey), 300000);

    return result;
  }

  static decapsulate(ciphertextBase64, privateKeyBase64) {
    const cacheKey = `decap_${ciphertextBase64.slice(0, 20)}_${privateKeyBase64.slice(0, 20)}`;
    if (keyCache.has(cacheKey)) {
      return keyCache.get(cacheKey);
    }

    const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
    const privateKey = crypto.createPrivateKey({
      key: privateKeyBuffer,
      type: 'pkcs8',
      format: 'der'
    });
    
    const ephemeralPublicKeyBuffer = Buffer.from(ciphertextBase64, 'base64');
    const ephemeralPublicKey = crypto.createPublicKey({
      key: ephemeralPublicKeyBuffer,
      type: 'raw',
      format: 'der',
      namedCurve: 'x25519'
    });
    
    const sharedSecret = crypto.diffieHellman({
      privateKey: privateKey,
      publicKey: ephemeralPublicKey
    });

    const result = sharedSecret.toString('base64');
    keyCache.set(cacheKey, result);
    setTimeout(() => keyCache.delete(cacheKey), 300000);

    return result;
  }

  static clearCache() {
    keyCache.clear();
  }
}

class ForwardSecrecyManager {
  constructor(rotationInterval = 300000) {
    this.keys = new Map();
    this.rotationTimers = new Map();
    this.rotationInterval = rotationInterval;
  }

  initSession(peerId, initialSecret, publicKey) {
    const sessionData = {
      currentKey: initialSecret,
      publicKey: publicKey,
      keyId: this.generateKeyId(),
      createdAt: Date.now(),
      messageCount: 0
    };
    
    this.keys.set(peerId, sessionData);
    this.scheduleRotation(peerId);
    
    return sessionData;
  }

  generateKeyId() {
    return Math.random().toString(36).substring(2, 10);
  }

  scheduleRotation(peerId) {
    if (this.rotationTimers.has(peerId)) {
      clearTimeout(this.rotationTimers.get(peerId));
    }

    const timer = setTimeout(() => {
      this.rotateKey(peerId);
    }, this.rotationInterval);

    this.rotationTimers.set(peerId, timer);
  }

  rotateKey(peerId) {
    const session = this.keys.get(peerId);
    if (!session) return null;

    try {
      const { ciphertext, sharedSecret: newKey } = NTRU.encapsulate(session.publicKey);
      
      const newSessionData = {
        currentKey: newKey,
        publicKey: session.publicKey,
        keyId: this.generateKeyId(),
        createdAt: Date.now(),
        messageCount: 0,
        previousKeyId: session.keyId
      };

      this.keys.set(peerId, newSessionData);
      this.scheduleRotation(peerId);

      console.log(`密钥轮换完成: ${peerId}, 新密钥ID: ${newSessionData.keyId}`);
      return { newKey, newKeyId: newSessionData.keyId, ephemeralKey: ciphertext };
    } catch (error) {
      console.error('密钥轮换失败:', error);
      this.scheduleRotation(peerId);
      return null;
    }
  }

  getCurrentKey(peerId) {
    const session = this.keys.get(peerId);
    return session ? session.currentKey : null;
  }

  getKeyId(peerId) {
    const session = this.keys.get(peerId);
    return session ? session.keyId : null;
  }

  incrementMessageCount(peerId) {
    const session = this.keys.get(peerId);
    if (session) {
      session.messageCount++;
      if (session.messageCount >= 100) {
        this.rotateKey(peerId);
      }
    }
  }

  updateKeyFromRotation(peerId, ephemeralKey, privateKey) {
    const newKey = NTRU.decapsulate(ephemeralKey, privateKey);
    
    const newSessionData = {
      currentKey: newKey,
      publicKey: this.keys.get(peerId)?.publicKey,
      keyId: this.generateKeyId(),
      createdAt: Date.now(),
      messageCount: 0
    };

    this.keys.set(peerId, newSessionData);
    this.scheduleRotation(peerId);

    return newKey;
  }

  hasSession(peerId) {
    return this.keys.has(peerId);
  }

  removeSession(peerId) {
    if (this.rotationTimers.has(peerId)) {
      clearTimeout(this.rotationTimers.get(peerId));
      this.rotationTimers.delete(peerId);
    }
    this.keys.delete(peerId);
  }

  clear() {
    this.rotationTimers.forEach(timer => clearTimeout(timer));
    this.rotationTimers.clear();
    this.keys.clear();
  }
}

function generateKeyPair() {
  return NTRU.generateKeyPair();
}

function encapsulateSecret(publicKey) {
  return NTRU.encapsulate(publicKey);
}

function decapsulateSecret(ciphertext, privateKey) {
  return NTRU.decapsulate(ciphertext, privateKey);
}

function deriveKey(sharedSecret) {
  const sharedSecretBuffer = Buffer.from(sharedSecret, 'base64');
  return crypto.scryptSync(sharedSecretBuffer, 'salt', 32);
}

function encryptMessage(message, sharedSecret) {
  const startTime = Date.now();
  const key = deriveKey(sharedSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(message, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  const result = {
    c: encrypted,
    iv: iv.toString('base64'),
    t: authTag
  };

  const endTime = Date.now();
  const originalSize = Buffer.byteLength(message, 'utf8');
  const encryptedSize = JSON.stringify(result).length;
  console.log(`加密耗时: ${endTime - startTime}ms, 膨胀率: ${((encryptedSize / originalSize) * 100).toFixed(1)}%`);

  return result;
}

function decryptMessage(encryptedData, sharedSecret) {
  const key = deriveKey(sharedSecret);
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.t, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.c, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function generateSymmetricKey() {
  return crypto.randomBytes(32).toString('base64');
}

function encryptWithSymmetricKey(message, symmetricKey) {
  const key = Buffer.from(symmetricKey, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(message, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  return {
    c: encrypted,
    iv: iv.toString('base64'),
    t: authTag
  };
}

function decryptWithSymmetricKey(encryptedData, symmetricKey) {
  const key = Buffer.from(symmetricKey, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.t, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData.c, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function encryptKeyWithPublicKey(symmetricKey, publicKey) {
  const { ciphertext, sharedSecret } = NTRU.encapsulate(publicKey);
  const key = deriveKey(sharedSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encryptedKey = cipher.update(symmetricKey, 'utf8', 'base64');
  encryptedKey += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  return {
    ek: encryptedKey,
    iv: iv.toString('base64'),
    t: authTag,
    epk: ciphertext
  };
}

function decryptKeyWithPrivateKey(encryptedKeyData, privateKey) {
  const sharedSecret = NTRU.decapsulate(encryptedKeyData.epk, privateKey);
  const key = deriveKey(sharedSecret);
  const iv = Buffer.from(encryptedKeyData.iv, 'base64');
  const authTag = Buffer.from(encryptedKeyData.t, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decryptedKey = decipher.update(encryptedKeyData.ek, 'base64', 'utf8');
  decryptedKey += decipher.final('utf8');
  
  return decryptedKey;
}

function encryptFile(fileBuffer, encryptionKey) {
  const key = Buffer.from(encryptionKey, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return {
    data: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    t: authTag.toString('base64')
  };
}

function decryptFile(encryptedFileData, encryptionKey) {
  const key = Buffer.from(encryptionKey, 'base64');
  const iv = Buffer.from(encryptedFileData.iv, 'base64');
  const authTag = Buffer.from(encryptedFileData.t, 'base64');
  const encrypted = Buffer.from(encryptedFileData.data, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function hashFile(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('base64');
}

module.exports = {
  NTRU,
  ForwardSecrecyManager,
  generateKeyPair,
  encapsulateSecret,
  decapsulateSecret,
  encryptMessage,
  decryptMessage,
  generateSymmetricKey,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  encryptKeyWithPublicKey,
  decryptKeyWithPrivateKey,
  encryptFile,
  decryptFile,
  hashFile
};
