import crypto from 'crypto';
import type { SignResult, EncryptResult, EncryptConfig } from '../types';

const AES_BLOCK_SIZE = 16;
const STM32_ALIGNMENT = 4;

export function generateRandomKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateRandomIV(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function computeSHA256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function padFirmwareToAlignment(data: Buffer, alignment: number = AES_BLOCK_SIZE): Buffer {
  const padLength = alignment - (data.length % alignment);
  if (padLength === alignment) {
    return data;
  }
  const padding = Buffer.alloc(padLength, 0xFF);
  return Buffer.concat([data, padding]);
}

export function signData(data: Buffer, privateKeyPem: string): SignResult {
  try {
    const hash = computeSHA256(data);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    const signature = sign.sign({
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    }, 'hex');
    
    return {
      success: true,
      hash,
      signature,
      algorithm: 'RSA-SHA256',
    };
  } catch (error) {
    console.error('Sign error:', error);
    return {
      success: false,
      hash: '',
      signature: '',
      algorithm: 'RSA-SHA256',
    };
  }
}

export function verifySignature(data: Buffer, signature: string, publicKeyPem: string): boolean {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    return verify.verify({
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    }, signature, 'hex');
  } catch (error) {
    console.error('Verify error:', error);
    return false;
  }
}

export function encryptData(data: Buffer, config: EncryptConfig): EncryptResult {
  try {
    const key = Buffer.from(config.aesKey, 'hex');
    const iv = Buffer.from(config.aesIv, 'hex');
    
    const paddedData = padFirmwareToAlignment(data, AES_BLOCK_SIZE);
    
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(paddedData), cipher.final()]);
    
    return {
      success: true,
      encryptedData: encrypted.toString('hex'),
      originalSize: data.length,
      paddedSize: paddedData.length,
      encryptedSize: encrypted.length,
    };
  } catch (error) {
    console.error('Encrypt error:', error);
    return {
      success: false,
      encryptedData: '',
      originalSize: data.length,
      paddedSize: 0,
      encryptedSize: 0,
    };
  }
}

export function decryptData(encryptedHex: string, config: EncryptConfig, originalSize?: number): Buffer | null {
  try {
    const key = Buffer.from(config.aesKey, 'hex');
    const iv = Buffer.from(config.aesIv, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    if (originalSize && originalSize > 0 && originalSize <= decrypted.length) {
      decrypted = decrypted.subarray(0, originalSize);
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decrypt error:', error);
    return null;
  }
}

export function isValidAESKey(key: string): boolean {
  try {
    const buf = Buffer.from(key, 'hex');
    return buf.length === 16;
  } catch (error) {
    return false;
  }
}

export function isValidAESIV(iv: string): boolean {
  try {
    const buf = Buffer.from(iv, 'hex');
    return buf.length === 16;
  } catch (error) {
    return false;
  }
}
