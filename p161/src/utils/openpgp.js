const openpgp = require('openpgp');
const crypto = require('crypto');

const parsePublicKey = async (publicKeyArmored) => {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    
    const fingerprint = publicKey.getFingerprint().toUpperCase();
    const keyId = publicKey.getKeyID().toHex().toUpperCase();
    
    const algorithmInfo = publicKey.getAlgorithmInfo();
    const algorithm = algorithmInfo.algorithm;
    const keySize = algorithmInfo.bits || null;
    
    const createdAt = publicKey.getCreationTime();
    
    let expiresAt = null;
    try {
      const expirationTime = await publicKey.getExpirationTime();
      if (expirationTime && expirationTime !== Infinity) {
        expiresAt = expirationTime;
      }
    } catch (e) {
      expiresAt = null;
    }
    
    const users = publicKey.users || [];
    const userIds = [];
    const signatures = [];
    
    for (const user of users) {
      try {
        const userID = user.userID;
        if (userID) {
          userIds.push({
            name: userID.name || null,
            email: userID.email || null,
            comment: userID.comment || null
          });
        }
        
        const userSignatures = user.selfCertifications || [];
        for (const sig of userSignatures) {
          try {
            const signerKeyId = sig.issuerKeyID ? sig.issuerKeyID.toHex().toUpperCase() : null;
            const signatureType = sig.signatureType;
            const signedAt = sig.created;
            
            if (signerKeyId && signerKeyId !== keyId) {
              signatures.push({
                signerKeyId,
                signerFingerprint: null,
                signatureType,
                signedAt
              });
            }
          } catch (e) {
            continue;
          }
        }
        
        const otherSignatures = user.otherCertifications || [];
        for (const sig of otherSignatures) {
          try {
            const signerKeyId = sig.issuerKeyID ? sig.issuerKeyID.toHex().toUpperCase() : null;
            const signatureType = sig.signatureType;
            const signedAt = sig.created;
            
            if (signerKeyId && signerKeyId !== keyId) {
              signatures.push({
                signerKeyId,
                signerFingerprint: null,
                signatureType,
                signedAt
              });
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    const uniqueSignatures = [];
    const seenSigners = new Set();
    for (const sig of signatures) {
      if (!seenSigners.has(sig.signerKeyId)) {
        seenSigners.add(sig.signerKeyId);
        uniqueSignatures.push(sig);
      }
    }
    
    return {
      success: true,
      keyData: {
        fingerprint,
        keyId,
        publicKey: publicKeyArmored,
        algorithm,
        keySize,
        createdAt,
        expiresAt
      },
      userIds,
      signatures: uniqueSignatures
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const formatFingerprint = (fingerprint) => {
  if (!fingerprint) return '';
  const cleaned = fingerprint.replace(/\s/g, '').toUpperCase();
  const chunks = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    chunks.push(cleaned.slice(i, i + 4));
  }
  return chunks.join(' ');
};

const formatKeyId = (keyId) => {
  if (!keyId) return '';
  return keyId.toUpperCase();
};

const getWkdHash = (email) => {
  if (!email || !email.includes('@')) {
    return null;
  }
  
  const [localPart, domain] = email.toLowerCase().split('@');
  
  const sha1 = crypto.createHash('sha1');
  sha1.update(localPart);
  const hash = sha1.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return {
    hash,
    localPart: localPart.toLowerCase(),
    domain: domain.toLowerCase(),
    advancedPath: `/.well-known/openpgpkey/${domain}/hu/${hash}`,
    directPath: `/.well-known/openpgpkey/hu/${hash}`,
    policyPath: `/.well-known/openpgpkey/${domain}/policy`
  };
};

const parseEmail = (email) => {
  if (!email || !email.includes('@')) {
    return null;
  }
  
  const [localPart, domain] = email.toLowerCase().split('@');
  
  return {
    localPart,
    domain,
    email: `${localPart}@${domain}`
  };
};

module.exports = {
  parsePublicKey,
  formatFingerprint,
  formatKeyId,
  getWkdHash,
  parseEmail
};
