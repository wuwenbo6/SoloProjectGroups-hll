const crypto = require('crypto');
const { SCRAM } = require('./scram');

class LDAPBackend {
  constructor() {
    this.users = new Map();
    this.scramSHA1 = new SCRAM('sha1');
    this.scramSHA256 = new SCRAM('sha256');
    this._initializeDefaultUsers();
  }

  _initializeDefaultUsers() {
    this.addUser('admin', 'admin123');
    this.addUser('user', 'user123');
    this.addUser('test', 'test123');
  }

  _generateSalt() {
    return crypto.randomBytes(16).toString('base64');
  }

  _computeSCRAMCredentials(scram, password, salt, iterations) {
    const saltedPassword = scram.hi(
      Buffer.from(password, 'utf8'),
      salt,
      iterations
    );

    const clientKey = scram.hmac(saltedPassword, Buffer.from('Client Key', 'utf8'));
    const storedKey = scram.hash(clientKey);
    const serverKey = scram.hmac(saltedPassword, Buffer.from('Server Key', 'utf8'));

    return {
      salt: salt,
      iterations: iterations,
      storedKey: storedKey.toString('base64'),
      serverKey: serverKey.toString('base64')
    };
  }

  addUser(username, password) {
    const saltSHA1 = this._generateSalt();
    const saltSHA256 = this._generateSalt();
    const iterations = 4096;

    const sha1Creds = this._computeSCRAMCredentials(this.scramSHA1, password, saltSHA1, iterations);
    const sha256Creds = this._computeSCRAMCredentials(this.scramSHA256, password, saltSHA256, iterations);

    this.users.set(username, {
      username: username,
      password: password,
      dn: `uid=${username},ou=users,dc=example,dc=com`,
      credentials: {
        'SCRAM-SHA-1': sha1Creds,
        'SCRAM-SHA-256': sha256Creds
      }
    });

    console.log(`[LDAP] Added user: ${username}`);
  }

  getUser(username) {
    const user = this.users.get(username);
    if (!user) {
      console.log(`[LDAP] User not found: ${username}`);
      return null;
    }
    console.log(`[LDAP] Found user: ${username}, DN: ${user.dn}`);
    return {
      username: user.username,
      dn: user.dn
    };
  }

  getSCRAMCredentials(username, mechanism) {
    const user = this.users.get(username);
    if (!user) {
      return null;
    }

    const creds = user.credentials[mechanism];
    if (!creds) {
      return null;
    }

    return {
      salt: creds.salt,
      iterations: creds.iterations,
      storedKey: Buffer.from(creds.storedKey, 'base64'),
      serverKey: Buffer.from(creds.serverKey, 'base64')
    };
  }

  getSCRAMSalt(username, mechanism) {
    const user = this.users.get(username);
    if (!user) {
      return null;
    }

    const creds = user.credentials[mechanism];
    if (!creds) {
      return null;
    }

    return {
      salt: creds.salt,
      iterations: creds.iterations
    };
  }

  verifyPlainCredentials(username, password) {
    const user = this.users.get(username);
    if (!user) {
      return { valid: false, error: 'user-not-found' };
    }

    if (user.password === password) {
      console.log(`[LDAP] PLAIN auth successful for user: ${username}`);
      return { valid: true, dn: user.dn };
    } else {
      console.log(`[LDAP] PLAIN auth failed for user: ${username}`);
      return { valid: false, error: 'invalid-credentials' };
    }
  }

  verifySCRAMCredentials(username, mechanism, password) {
    const user = this.users.get(username);
    if (!user) {
      return { valid: false, error: 'user-not-found' };
    }

    const creds = user.credentials[mechanism];
    if (!creds) {
      return { valid: false, error: 'unsupported-mechanism' };
    }

    const scram = mechanism === 'SCRAM-SHA-1' ? this.scramSHA1 : this.scramSHA256;

    const saltedPassword = scram.hi(
      Buffer.from(password, 'utf8'),
      creds.salt,
      creds.iterations
    );

    const clientKey = scram.hmac(saltedPassword, Buffer.from('Client Key', 'utf8'));
    const storedKey = scram.hash(clientKey);

    const valid = storedKey.equals(Buffer.from(creds.storedKey, 'base64'));

    if (valid) {
      console.log(`[LDAP] ${mechanism} auth successful for user: ${username}`);
      return { valid: true, dn: user.dn };
    } else {
      console.log(`[LDAP] ${mechanism} auth failed for user: ${username}`);
      return { valid: false, error: 'invalid-credentials' };
    }
  }

  listUsers() {
    return Array.from(this.users.values()).map(u => ({
      username: u.username,
      dn: u.dn
    }));
  }
}

module.exports = LDAPBackend;
