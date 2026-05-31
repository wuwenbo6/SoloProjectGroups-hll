export class NTRU {
  static keyCache = new Map();

  static async generateKeyPair() {
    const startTime = performance.now();
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    const publicKey = await window.crypto.subtle.exportKey(
      'raw',
      keyPair.publicKey
    );
    
    const privateKey = await window.crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey
    );

    const endTime = performance.now();
    console.log(`密钥生成耗时: ${(endTime - startTime).toFixed(2)}ms`);

    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  static async encapsulate(publicKeyBase64) {
    const cacheKey = `encap_${publicKeyBase64.slice(0, 20)}`;
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);
    const publicKey = await window.crypto.subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const ephemeralKeyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );

    const sharedSecret = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      ephemeralKeyPair.privateKey,
      256
    );

    const ephemeralPublicKey = await window.crypto.subtle.exportKey(
      'raw',
      ephemeralKeyPair.publicKey
    );

    const result = {
      ciphertext: this.arrayBufferToBase64(ephemeralPublicKey),
      sharedSecret: this.arrayBufferToBase64(sharedSecret)
    };

    this.keyCache.set(cacheKey, result);
    setTimeout(() => this.keyCache.delete(cacheKey), 300000);

    return result;
  }

  static async decapsulate(ciphertextBase64, privateKeyBase64) {
    const cacheKey = `decap_${ciphertextBase64.slice(0, 20)}_${privateKeyBase64.slice(0, 20)}`;
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    const privateKeyBuffer = this.base64ToArrayBuffer(privateKeyBase64);
    const privateKey = await window.crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits']
    );

    const ephemeralPublicKeyBuffer = this.base64ToArrayBuffer(ciphertextBase64);
    const ephemeralPublicKey = await window.crypto.subtle.importKey(
      'raw',
      ephemeralPublicKeyBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const sharedSecret = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: ephemeralPublicKey },
      privateKey,
      256
    );

    const result = this.arrayBufferToBase64(sharedSecret);
    this.keyCache.set(cacheKey, result);
    setTimeout(() => this.keyCache.delete(cacheKey), 300000);

    return result;
  }

  static arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  static base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  static clearCache() {
    this.keyCache.clear();
  }
}

export class ForwardSecrecyManager {
  constructor(rotationInterval = 300000) {
    this.keys = new Map();
    this.rotationTimers = new Map();
    this.rotationInterval = rotationInterval;
    this.keyVersions = new Map();
    this.onKeyRotate = null;
  }

  async initSession(peerId, initialSecret, publicKey) {
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

  async rotateKey(peerId) {
    const session = this.keys.get(peerId);
    if (!session) return null;

    try {
      const { ciphertext, sharedSecret: newKey } = await NTRU.encapsulate(session.publicKey);
      
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

      if (this.onKeyRotate) {
        this.onKeyRotate(peerId, {
          newKeyId: newSessionData.keyId,
          previousKeyId: session.keyId,
          ephemeralKey: ciphertext
        });
      }

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

  async updateKeyFromRotation(peerId, ephemeralKey, privateKey) {
    const newKey = await NTRU.decapsulate(ephemeralKey, privateKey);
    
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
    this.keyVersions.clear();
  }
}

export const forwardSecrecyManager = new ForwardSecrecyManager(300000);

export class SessionKeyManager {
  constructor() {
    this.keys = new Map();
  }

  getKey(peerId) {
    return this.keys.get(peerId);
  }

  setKey(peerId, key) {
    this.keys.set(peerId, key);
  }

  hasKey(peerId) {
    return this.keys.has(peerId);
  }

  clear() {
    this.keys.clear();
  }
}

export const sessionKeyManager = new SessionKeyManager();

export async function deriveKey(sharedSecretBase64) {
  const sharedSecret = NTRU.base64ToArrayBuffer(sharedSecretBase64);
  const encoder = new TextEncoder();
  const salt = encoder.encode('salt');
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      info: new ArrayBuffer(0),
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(message, sharedSecret) {
  const startTime = performance.now();
  const key = await deriveKey(sharedSecret);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  const result = {
    c: NTRU.arrayBufferToBase64(encrypted),
    iv: NTRU.arrayBufferToBase64(iv)
  };

  const endTime = performance.now();
  console.log(`加密耗时: ${(endTime - startTime).toFixed(2)}ms, 膨胀率: ${((JSON.stringify(result).length / message.length) * 100).toFixed(1)}%`);

  return result;
}

export async function decryptMessage(encryptedData, sharedSecret) {
  const key = await deriveKey(sharedSecret);
  const iv = NTRU.base64ToArrayBuffer(encryptedData.iv);
  const encrypted = NTRU.base64ToArrayBuffer(encryptedData.c);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export function generateSymmetricKey() {
  const key = window.crypto.getRandomValues(new Uint8Array(32));
  return NTRU.arrayBufferToBase64(key.buffer);
}

export async function encryptWithSymmetricKey(message, symmetricKeyBase64) {
  const keyBuffer = NTRU.base64ToArrayBuffer(symmetricKeyBase64);
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  return {
    c: NTRU.arrayBufferToBase64(encrypted),
    iv: NTRU.arrayBufferToBase64(iv)
  };
}

export async function decryptWithSymmetricKey(encryptedData, symmetricKeyBase64) {
  const keyBuffer = NTRU.base64ToArrayBuffer(symmetricKeyBase64);
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = NTRU.base64ToArrayBuffer(encryptedData.iv);
  const encrypted = NTRU.base64ToArrayBuffer(encryptedData.c);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function encryptKeyWithPublicKey(symmetricKey, publicKey) {
  const { ciphertext, sharedSecret } = await NTRU.encapsulate(publicKey);
  const key = await deriveKey(sharedSecret);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(symmetricKey);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );

  return {
    ek: NTRU.arrayBufferToBase64(encrypted),
    iv: NTRU.arrayBufferToBase64(iv),
    epk: ciphertext
  };
}

export async function decryptKeyWithPrivateKey(encryptedKeyData, privateKey) {
  const sharedSecret = await NTRU.decapsulate(encryptedKeyData.epk, privateKey);
  const key = await deriveKey(sharedSecret);
  const iv = NTRU.base64ToArrayBuffer(encryptedKeyData.iv);
  const encrypted = NTRU.base64ToArrayBuffer(encryptedKeyData.ek);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function encryptFile(file, encryptionKey) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const fileData = new Uint8Array(e.target.result);
        const keyBuffer = NTRU.base64ToArrayBuffer(encryptionKey);
        const key = await window.crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          true,
          ['encrypt', 'decrypt']
        );
        
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          fileData
        );

        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          data: NTRU.arrayBufferToBase64(encrypted),
          iv: NTRU.arrayBufferToBase64(iv)
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function decryptFile(encryptedFileData, encryptionKey) {
  const keyBuffer = NTRU.base64ToArrayBuffer(encryptionKey);
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = NTRU.base64ToArrayBuffer(encryptedFileData.iv);
  const encrypted = NTRU.base64ToArrayBuffer(encryptedFileData.data);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  );

  return new Blob([decrypted], { type: encryptedFileData.type });
}

export async function hashFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const fileData = new Uint8Array(e.target.result);
        const hash = await window.crypto.subtle.digest('SHA-256', fileData);
        resolve(NTRU.arrayBufferToBase64(hash));
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function exportChatHistory(messages, decryptedMessages, exportKey, format = 'json') {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(msg => ({
      id: msg.id,
      sender: msg.sender_name,
      senderId: msg.sender_id,
      timestamp: msg.created_at,
      content: decryptedMessages[msg.id] || '[加密消息]',
      type: msg.chat_type
    }))
  };

  if (format === 'json') {
    const jsonData = JSON.stringify(exportData, null, 2);
    
    if (exportKey) {
      const keyBuffer = NTRU.base64ToArrayBuffer(exportKey);
      const key = await window.crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );
      
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonData);
      
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );
      
      return {
        encrypted: true,
        data: NTRU.arrayBufferToBase64(encrypted),
        iv: NTRU.arrayBufferToBase64(iv),
        filename: `chat_history_encrypted_${Date.now()}.json.enc`
      };
    }
    
    return {
      encrypted: false,
      data: jsonData,
      filename: `chat_history_${Date.now()}.json`
    };
  }
  
  if (format === 'text') {
    let textData = `聊天记录导出\n`;
    textData += `导出时间: ${new Date().toLocaleString()}\n`;
    textData += `消息数量: ${messages.length}\n`;
    textData += `========================================\n\n`;
    
    exportData.messages.forEach(msg => {
      textData += `[${new Date(msg.timestamp).toLocaleString()}] ${msg.sender}:\n`;
      textData += `${msg.content}\n\n`;
    });
    
    return {
      encrypted: false,
      data: textData,
      filename: `chat_history_${Date.now()}.txt`
    };
  }
  
  throw new Error('Unsupported export format');
}

export async function importChatHistory(encryptedData, importKey = null) {
  if (encryptedData.encrypted && !importKey) {
    throw new Error('需要密钥才能解密导入');
  }

  if (encryptedData.encrypted) {
    const keyBuffer = NTRU.base64ToArrayBuffer(importKey);
    const key = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
    
    const iv = NTRU.base64ToArrayBuffer(encryptedData.iv);
    const data = NTRU.base64ToArrayBuffer(encryptedData.data);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }
  
  return typeof encryptedData.data === 'string' 
    ? JSON.parse(encryptedData.data) 
    : encryptedData.data;
}

export function downloadFile(data, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
