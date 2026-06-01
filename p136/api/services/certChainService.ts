import forge from 'node-forge';
import { parseCertificate } from './certService';
import type { CertInfo, CertChainInfo } from '../types';

export function parseCertificateChain(certPemChain: string): CertInfo[] {
  const certs: CertInfo[] = [];
  const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const matches = certPemChain.match(certRegex);
  
  if (matches) {
    for (const certPem of matches) {
      try {
        const certInfo = parseCertificate(certPem);
        certInfo.pem = certPem;
        certInfo.isCA = checkIsCA(certPem);
        certs.push(certInfo);
      } catch (error) {
        console.error('Failed to parse certificate in chain:', error);
      }
    }
  }
  
  return certs;
}

export function checkIsCA(certPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const extensions = cert.extensions || [];
    
    for (const ext of extensions) {
      if (ext.name === 'basicConstraints' && (ext as any).cA === true) {
        return true;
      }
    }
    
    return cert.issuer.getField('CN')?.value === cert.subject.getField('CN')?.value;
  } catch (error) {
    return false;
  }
}

export function buildCertificateChain(leafCert: CertInfo, caCerts: CertInfo[]): CertChainInfo {
  const chain: CertInfo[] = [leafCert];
  let currentCert = leafCert;
  let chainValid = true;
  const usedCerts = new Set<string>();
  
  while (true) {
    const issuerCN = currentCert.issuer.CN;
    const subjectCN = currentCert.subject.CN;
    
    if (issuerCN === subjectCN) {
      break;
    }
    
    const nextCert = caCerts.find(c => 
      c.subject.CN === issuerCN && !usedCerts.has(c.serialNumber)
    );
    
    if (!nextCert) {
      chainValid = false;
      break;
    }
    
    usedCerts.add(nextCert.serialNumber);
    chain.push(nextCert);
    currentCert = nextCert;
    
    if (chain.length > 10) {
      chainValid = false;
      break;
    }
  }
  
  const rootCA = chain.find(c => c.isCA && c.subject.CN === c.issuer.CN);
  const intermediateCAs = chain.filter(c => c.isCA && c !== rootCA && c !== leafCert);
  const leafCertResult = chain[0];
  
  return {
    certificates: chain,
    chainLength: chain.length,
    chainValid,
    rootCA,
    intermediateCAs,
    leafCert: leafCertResult,
  };
}

export function verifyCertificateChain(chainInfo: CertChainInfo): boolean {
  if (!chainInfo.chainValid || chainInfo.certificates.length < 1) {
    return false;
  }
  
  try {
    const caStore = forge.pki.createCaStore();
    
    for (const cert of chainInfo.certificates) {
      if (cert.pem && cert.isCA) {
        const forgeCert = forge.pki.certificateFromPem(cert.pem);
        caStore.addCertificate(forgeCert);
      }
    }
    
    const forgeCerts = chainInfo.certificates
      .filter(c => c.pem)
      .map(c => forge.pki.certificateFromPem(c.pem!));
    
    if (forgeCerts.length < 1) {
      return false;
    }
    
    return forge.pki.verifyCertificateChain(caStore, forgeCerts);
  } catch (error) {
    console.error('Certificate chain verification failed:', error);
    return false;
  }
}

export function checkCertificatesExpiry(chainInfo: CertChainInfo): {
  allValid: boolean;
  expired: CertInfo[];
  notYetValid: CertInfo[];
} {
  const now = Date.now();
  const expired: CertInfo[] = [];
  const notYetValid: CertInfo[] = [];
  
  for (const cert of chainInfo.certificates) {
    const validFrom = new Date(cert.validFrom).getTime();
    const validTo = new Date(cert.validTo).getTime();
    
    if (now < validFrom) {
      notYetValid.push(cert);
    }
    if (now > validTo) {
      expired.push(cert);
    }
  }
  
  return {
    allValid: expired.length === 0 && notYetValid.length === 0,
    expired,
    notYetValid,
  };
}

export function mergeCertificates(...certLists: CertInfo[][]): CertInfo[] {
  const seen = new Set<string>();
  const result: CertInfo[] = [];
  
  for (const list of certLists) {
    for (const cert of list) {
      if (!seen.has(cert.serialNumber)) {
        seen.add(cert.serialNumber);
        result.push(cert);
      }
    }
  }
  
  return result;
}
