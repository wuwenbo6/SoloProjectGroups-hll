import fs from 'fs';
import path from 'path';
import {
  PACKAGE_MAGIC,
  PACKAGE_VERSION,
  type PackageMetadata,
  type CertInfo,
  type EncryptConfig,
  type VerifyResult,
  type CertChainInfo,
  type VersionInfo,
  type SignLogEntry,
} from '../types';
import { computeSHA256, verifySignature, decryptData } from './cryptoService';
import { parseCertificate, getPublicKeyFromCert } from './certService';
import { buildCertificateChain, verifyCertificateChain, checkCertificatesExpiry, mergeCertificates } from './certChainService';
import { createVersionInfo } from './versionService';
import { addLogEntry } from './signLogService';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

export function createFirmwarePackage(
  encryptedFirmware: Buffer,
  signature: Buffer,
  iv: Buffer,
  metadata: PackageMetadata
): Buffer {
  const metadataJson = JSON.stringify(metadata);
  const metadataBuffer = Buffer.from(metadataJson, 'utf8');
  
  let offset = 0;
  const totalSize = 4 + 2 + 4 + 4 + signature.length + 4 + encryptedFirmware.length + 16 + 4 + metadataBuffer.length + 32;
  const buffer = Buffer.alloc(totalSize);
  
  buffer.writeUInt32BE(PACKAGE_MAGIC, offset);
  offset += 4;
  
  buffer.writeUInt16BE(PACKAGE_VERSION, offset);
  offset += 2;
  
  const headerLength = 4 + 2 + 4 + 4 + signature.length + 4 + encryptedFirmware.length + 16 + 4 + metadataBuffer.length;
  buffer.writeUInt32BE(headerLength, offset);
  offset += 4;
  
  buffer.writeUInt32BE(signature.length, offset);
  offset += 4;
  
  signature.copy(buffer, offset);
  offset += signature.length;
  
  buffer.writeUInt32BE(encryptedFirmware.length, offset);
  offset += 4;
  
  encryptedFirmware.copy(buffer, offset);
  offset += encryptedFirmware.length;
  
  iv.copy(buffer, offset);
  offset += 16;
  
  buffer.writeUInt32BE(metadataBuffer.length, offset);
  offset += 4;
  
  metadataBuffer.copy(buffer, offset);
  offset += metadataBuffer.length;
  
  const checksum = computeSHA256(buffer.subarray(0, offset));
  Buffer.from(checksum, 'hex').copy(buffer, offset);
  
  return buffer;
}

export function parseFirmwarePackage(packageBuffer: Buffer): {
  valid: boolean;
  signature?: Buffer;
  encryptedFirmware?: Buffer;
  iv?: Buffer;
  metadata?: PackageMetadata;
  error?: string;
} {
  try {
    let offset = 0;
    
    const magic = packageBuffer.readUInt32BE(offset);
    if (magic !== PACKAGE_MAGIC) {
      return { valid: false, error: 'Invalid package magic number' };
    }
    offset += 4;
    
    const version = packageBuffer.readUInt16BE(offset);
    offset += 2;
    
    const headerLength = packageBuffer.readUInt32BE(offset);
    offset += 4;
    
    if (packageBuffer.length < headerLength + 32) {
      return { valid: false, error: 'Package too short' };
    }
    
    const checksumExpected = packageBuffer.subarray(headerLength, headerLength + 32).toString('hex');
    const checksumActual = computeSHA256(packageBuffer.subarray(0, headerLength));
    
    if (checksumExpected !== checksumActual) {
      return { valid: false, error: 'Checksum verification failed' };
    }
    
    const signatureLength = packageBuffer.readUInt32BE(offset);
    offset += 4;
    
    const signature = packageBuffer.subarray(offset, offset + signatureLength);
    offset += signatureLength;
    
    const firmwareLength = packageBuffer.readUInt32BE(offset);
    offset += 4;
    
    const encryptedFirmware = packageBuffer.subarray(offset, offset + firmwareLength);
    offset += firmwareLength;
    
    const iv = packageBuffer.subarray(offset, offset + 16);
    offset += 16;
    
    const metadataLength = packageBuffer.readUInt32BE(offset);
    offset += 4;
    
    const metadataBuffer = packageBuffer.subarray(offset, offset + metadataLength);
    const metadata = JSON.parse(metadataBuffer.toString('utf8')) as PackageMetadata;
    
    return {
      valid: true,
      signature,
      encryptedFirmware,
      iv,
      metadata,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to parse package: ${(error as Error).message}`,
    };
  }
}

export async function savePackage(packageBuffer: Buffer, originalName: string): Promise<string> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(originalName, path.extname(originalName));
  const filename = `${baseName}_${timestamp}.enc`;
  const filePath = path.join(OUTPUT_DIR, filename);
  
  await fs.promises.writeFile(filePath, packageBuffer);
  
  return filename;
}

export function getPackagePath(filename: string): string {
  return path.join(OUTPUT_DIR, filename);
}

export function verifyPackage(
  packageBuffer: Buffer,
  certPem?: string,
  aesKey?: string,
  caCertPems?: string[]
): VerifyResult {
  const parseResult = parseFirmwarePackage(packageBuffer);
  
  if (!parseResult.valid || !parseResult.metadata || !parseResult.signature || !parseResult.encryptedFirmware || !parseResult.iv) {
    return {
      success: false,
      valid: false,
      message: parseResult.error || 'Failed to parse package',
    };
  }
  
  const { metadata, signature, encryptedFirmware, iv } = parseResult;
  let certChain: CertChainInfo | undefined;
  let chainVerificationWarning = '';
  
  let publicKeyPem: string;
  let certInfo: CertInfo;
  
  if (certPem) {
    try {
      certInfo = parseCertificate(certPem);
      certInfo.pem = certPem;
      publicKeyPem = getPublicKeyFromCert(certPem);
      
      let allCerts: CertInfo[] = [certInfo];
      if (metadata.certificateChain && metadata.certificateChain.length > 0) {
        allCerts = mergeCertificates(allCerts, metadata.certificateChain);
      }
      if (caCertPems && caCertPems.length > 0) {
        for (const caPem of caCertPems) {
          const caCert = parseCertificate(caPem);
          caCert.pem = caPem;
          caCert.isCA = true;
          allCerts = mergeCertificates(allCerts, [caCert]);
        }
      }
      
      const caCerts = allCerts.filter(c => c.isCA && c !== certInfo);
      certChain = buildCertificateChain(certInfo, caCerts);
      
      if (certChain.chainLength > 1) {
        const chainValid = verifyCertificateChain(certChain);
        certChain.chainValid = chainValid;
        
        const expiryCheck = checkCertificatesExpiry(certChain);
        if (!expiryCheck.allValid) {
          chainVerificationWarning = ` Certificates in chain: ${expiryCheck.expired.length} expired, ${expiryCheck.notYetValid.length} not yet valid.`;
        }
      }
    } catch (error) {
      console.error('Cert parse error:', error);
      return {
        success: false,
        valid: false,
        message: 'Invalid certificate provided: ' + (error as Error).message,
      };
    }
  } else {
    const embeddedCert = metadata.certificate;
    if (!embeddedCert) {
      return {
        success: false,
        valid: false,
        message: 'No certificate in package and none provided',
      };
    }
    certInfo = {
      subject: { CN: embeddedCert.subject?.CN || '', O: '', OU: '', C: '' },
      issuer: { CN: embeddedCert.issuer?.CN || '', O: '', OU: '', C: '' },
      validFrom: embeddedCert.validFrom || '',
      validTo: embeddedCert.validTo || '',
      serialNumber: embeddedCert.serialNumber || '',
      signatureAlgorithm: '',
      publicKeyAlgorithm: 'RSA',
      keySize: 2048,
      fingerprintSHA1: '',
      fingerprintSHA256: embeddedCert.fingerprintSHA256 || '',
    };
    return {
      success: true,
      valid: true,
      message: 'Package parsed successfully. Full signature verification requires certificate file and AES key.',
      timestamp: metadata.timestamp,
      certInfo,
      firmwareInfo: metadata.firmwareInfo,
      versionInfo: metadata.versionInfo,
    };
  }
  
  if (!aesKey) {
    return {
      success: true,
      valid: true,
      message: 'Package structure is valid. Provide AES key to decrypt and verify firmware signature.' + chainVerificationWarning,
      timestamp: metadata.timestamp,
      certInfo,
      certChain,
      firmwareInfo: metadata.firmwareInfo,
      versionInfo: metadata.versionInfo,
    };
  }
  
  const config: EncryptConfig = {
    aesKey: aesKey,
    aesIv: iv.toString('hex'),
  };
  
  const originalSize = metadata.firmwareInfo?.originalSize || 0;
  const decryptedFirmware = decryptData(encryptedFirmware.toString('hex'), config, originalSize);
  if (!decryptedFirmware) {
    return {
      success: true,
      valid: false,
      message: 'Failed to decrypt firmware with provided AES key' + chainVerificationWarning,
      timestamp: metadata.timestamp,
      certInfo,
      certChain,
      firmwareInfo: metadata.firmwareInfo,
      versionInfo: metadata.versionInfo,
    };
  }
  
  const firmwareHash = computeSHA256(decryptedFirmware);
  const signatureValid = verifySignature(decryptedFirmware, signature.toString('hex'), publicKeyPem);
  
  if (!signatureValid) {
    return {
      success: true,
      valid: false,
      message: 'Signature verification failed - firmware may be tampered' + chainVerificationWarning,
      firmwareHash,
      timestamp: metadata.timestamp,
      certInfo,
      certChain,
      firmwareInfo: metadata.firmwareInfo,
      versionInfo: metadata.versionInfo,
    };
  }
  
  if (firmwareHash !== metadata.firmwareInfo.sha256) {
    return {
      success: true,
      valid: false,
      message: 'Firmware hash mismatch - firmware may be tampered' + chainVerificationWarning,
      firmwareHash,
      timestamp: metadata.timestamp,
      certInfo,
      certChain,
      firmwareInfo: metadata.firmwareInfo,
      versionInfo: metadata.versionInfo,
    };
  }
  
  return {
    success: true,
    valid: true,
    message: 'Verification successful - firmware is authentic and intact' + chainVerificationWarning,
    firmwareHash,
    timestamp: metadata.timestamp,
    certInfo,
    certChain,
    firmwareInfo: metadata.firmwareInfo,
    versionInfo: metadata.versionInfo,
  };
}

export function buildMetadataWithVersion(
  firmwareName: string,
  firmwareSize: number,
  firmwareHash: string,
  signAlgorithm: string,
  encryptAlgorithm: string,
  certInfo: CertInfo,
  certChain?: CertChainInfo,
  customVersion?: Partial<VersionInfo>
): { metadata: PackageMetadata; versionInfo: VersionInfo } {
  const versionInfo = createVersionInfo(firmwareName, certInfo, customVersion);
  
  const metadata: PackageMetadata = {
    version: versionInfo.packageVersion,
    timestamp: Date.now(),
    firmwareInfo: {
      originalName: firmwareName,
      originalSize: firmwareSize,
      sha256: firmwareHash,
    },
    signature: {
      algorithm: signAlgorithm,
      hash: firmwareHash,
    },
    encryption: {
      algorithm: encryptAlgorithm,
      keySize: 128,
    },
    certificate: {
      subject: { CN: certInfo.subject.CN },
      issuer: { CN: certInfo.issuer.CN },
      validFrom: certInfo.validFrom,
      validTo: certInfo.validTo,
      serialNumber: certInfo.serialNumber,
      fingerprintSHA256: certInfo.fingerprintSHA256,
    },
    versionInfo,
  };
  
  if (certChain && certChain.certificates.length > 1) {
    metadata.certificateChain = certChain.certificates.map(c => ({
      ...c,
      pem: undefined,
    }));
  }
  
  return { metadata, versionInfo };
}

export function createSignLogEntry(
  firmwareName: string,
  firmwareSize: number,
  firmwareHash: string,
  certInfo: CertInfo,
  signAlgorithm: string,
  encryptAlgorithm: string,
  status: 'success' | 'failed',
  options: {
    signature?: string;
    packageFilename?: string;
    packageSize?: number;
    errorMessage?: string;
    versionInfo?: VersionInfo;
    clientIP?: string;
    durationMs?: number;
  } = {}
): SignLogEntry {
  return addLogEntry({
    operation: 'sign',
    status,
    firmwareName,
    firmwareSize,
    firmwareHash,
    certificateCN: certInfo.subject.CN,
    certificateSerial: certInfo.serialNumber,
    signAlgorithm,
    encryptAlgorithm,
    ...options,
  });
}

export async function cleanupOldFiles(maxAgeMs: number = 3600000): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) return;
  
  const files = await fs.promises.readdir(OUTPUT_DIR);
  const now = Date.now();
  
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const stats = await fs.promises.stat(filePath);
    
    if (now - stats.mtimeMs > maxAgeMs) {
      await fs.promises.unlink(filePath);
    }
  }
}
