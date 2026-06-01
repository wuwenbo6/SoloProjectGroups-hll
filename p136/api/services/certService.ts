import forge from 'node-forge';
import type { CertInfo } from '../types';

export function parseCertificate(certPem: string): CertInfo {
  const cert = forge.pki.certificateFromPem(certPem);
  
  const subject = cert.subject.attributes.reduce((acc, attr) => {
    const key = attr.shortName || attr.name;
    acc[key as keyof CertInfo['subject']] = attr.value as string;
    return acc;
  }, {} as CertInfo['subject']);
  
  const issuer = cert.issuer.attributes.reduce((acc, attr) => {
    const key = attr.shortName || attr.name;
    acc[key as keyof CertInfo['issuer']] = attr.value as string;
    return acc;
  }, {} as CertInfo['issuer']);
  
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const keySize = publicKey.n.bitLength();
  
  const fingerprintSHA1 = forge.md.sha1.create()
    .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
    .digest()
    .toHex()
    .match(/.{2}/g)?.join(':') || '';
  
  const fingerprintSHA256 = forge.md.sha256.create()
    .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
    .digest()
    .toHex()
    .match(/.{2}/g)?.join(':') || '';
  
  return {
    subject: {
      CN: subject.CN || '',
      O: subject.O || '',
      OU: subject.OU || '',
      C: subject.C || '',
    },
    issuer: {
      CN: issuer.CN || '',
      O: issuer.O || '',
      OU: issuer.OU || '',
      C: issuer.C || '',
    },
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    serialNumber: cert.serialNumber,
    signatureAlgorithm: cert.siginfo.algorithmOid,
    publicKeyAlgorithm: 'RSA',
    keySize,
    fingerprintSHA1,
    fingerprintSHA256,
  };
}

export function getPublicKeyFromCert(certPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  return forge.pki.publicKeyToPem(cert.publicKey);
}

export function verifyCertificateChain(certPem: string, caCertPem?: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const caStore = forge.pki.createCaStore();
    
    if (caCertPem) {
      const caCert = forge.pki.certificateFromPem(caCertPem);
      caStore.addCertificate(caCert);
    }
    
    return forge.pki.verifyCertificateChain(caStore, [cert]);
  } catch (error) {
    return false;
  }
}
