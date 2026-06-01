const crypto = require('crypto');

class SCRAM {
  constructor(algorithm = 'sha256') {
    const algos = {
      'sha1': { hashAlg: 'sha1', hashLen: 20, name: 'SCRAM-SHA-1' },
      'sha256': { hashAlg: 'sha256', hashLen: 32, name: 'SCRAM-SHA-256' }
    };

    const algo = algos[algorithm] || algos['sha256'];
    this.hashAlg = algo.hashAlg;
    this.hashLen = algo.hashLen;
    this.mechanismName = algo.name;
    this.iterations = 4096;
  }

  static getMechanisms() {
    return ['PLAIN', 'SCRAM-SHA-1', 'SCRAM-SHA-256'];
  }

  hmac(key, data) {
    return crypto.createHmac(this.hashAlg, key).update(data).digest();
  }

  hash(data) {
    return crypto.createHash(this.hashAlg).update(data).digest();
  }

  xor(a, b) {
    const result = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }

  hi(password, salt, iterations) {
    const saltBuffer = Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from([0, 0, 0, 1])]);
    let result = this.hmac(password, saltBuffer);
    let prev = result;
    for (let i = 1; i < iterations; i++) {
      prev = this.hmac(password, prev);
      result = this.xor(result, prev);
    }
    return result;
  }

  generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }

  validateClientNonce(nonce) {
    if (!nonce || nonce.length < 8) {
      return { valid: false, error: 'client-nonce-too-short' };
    }
    return { valid: true };
  }

  parseClientFirst(message) {
    const parts = message.split(',');
    const result = {};
    let gs2Header = '';
    let i = 0;

    if (parts[0] === 'n' || parts[0] === 'y' || parts[0].startsWith('p=')) {
      gs2Header = parts[0];
      i = 1;
    }

    for (; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('n=')) {
        result.username = part.substring(2);
      } else if (part.startsWith('r=')) {
        result.nonce = part.substring(2);
      } else if (part.startsWith('c=')) {
        result.channelBinding = part.substring(2);
      }
    }
    result.gs2Header = gs2Header;
    return result;
  }

  parseClientFinal(message) {
    const parts = message.split(',');
    const result = {};
    for (const part of parts) {
      if (part.startsWith('c=')) {
        result.channelBinding = part.substring(2);
      } else if (part.startsWith('r=')) {
        result.nonce = part.substring(2);
      } else if (part.startsWith('p=')) {
        result.proof = part.substring(2);
      }
    }
    return result;
  }

  createServerFirst(clientNonce, salt) {
    const serverNonce = this.generateNonce();
    const combinedNonce = clientNonce + serverNonce;
    return {
      nonce: combinedNonce,
      salt: salt,
      iterations: this.iterations,
      serverNonce: serverNonce,
      message: `r=${combinedNonce},s=${salt},i=${this.iterations}`
    };
  }

  getClientFinalWithoutProof(clientFinal) {
    const parts = clientFinal.split(',');
    const filtered = parts.filter(p => !p.startsWith('p='));
    return filtered.join(',');
  }

  verifyClientProof(username, password, clientFirstMessage, serverFirstMessage, clientFinalMessage) {
    const clientFirst = this.parseClientFirst(clientFirstMessage);
    const clientFinal = this.parseClientFinal(clientFinalMessage);
    const clientFinalWithoutProof = this.getClientFinalWithoutProof(clientFinalMessage);

    const saltedPassword = this.hi(
      Buffer.from(password, 'utf8'),
      serverFirstMessage.salt,
      serverFirstMessage.iterations
    );

    const clientKey = this.hmac(saltedPassword, Buffer.from('Client Key', 'utf8'));
    const storedKey = this.hash(clientKey);

    const authMessage = `${clientFirstMessage},${serverFirstMessage.message},${clientFinalWithoutProof}`;
    const clientSignature = this.hmac(storedKey, Buffer.from(authMessage, 'utf8'));
    const expectedClientProof = this.xor(clientKey, clientSignature);
    const providedClientProof = Buffer.from(clientFinal.proof, 'base64');

    const proofValid = expectedClientProof.equals(providedClientProof);

    const serverKey = this.hmac(saltedPassword, Buffer.from('Server Key', 'utf8'));
    const serverSignature = this.hmac(serverKey, Buffer.from(authMessage, 'utf8'));

    return {
      valid: proofValid,
      serverSignature: serverSignature.toString('base64')
    };
  }

  createServerFinal(serverSignature, error = null) {
    if (error) {
      return `e=${error}`;
    }
    return `v=${serverSignature}`;
  }
}

class PLAINMechanism {
  constructor() {
    this.mechanismName = 'PLAIN';
  }

  parseMessage(message) {
    const parts = message.split('\x00');
    if (parts.length < 3) {
      return { valid: false, error: 'invalid-plain-message' };
    }
    return {
      valid: true,
      authzid: parts[0],
      authcid: parts[1],
      password: parts[2]
    };
  }

  createResponse(success, error = null) {
    if (success) {
      return { success: true };
    }
    return { success: false, error: error || 'authentication-failed' };
  }
}

module.exports = { SCRAM, PLAINMechanism };
