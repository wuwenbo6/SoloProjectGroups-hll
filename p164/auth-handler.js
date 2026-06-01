const { SCRAM, PLAINMechanism } = require('./scram');
const LDAPBackend = require('./ldap-backend');
const AuthLogger = require('./auth-logger');

class AuthHandler {
  constructor() {
    this.ldap = new LDAPBackend();
    this.logger = new AuthLogger();
    this.scramSHA1 = new SCRAM('sha1');
    this.scramSHA256 = new SCRAM('sha256');
    this.plain = new PLAINMechanism();
    this.sessions = new Map();
  }

  static getMechanisms() {
    return ['PLAIN', 'SCRAM-SHA-1', 'SCRAM-SHA-256'];
  }

  _generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  _cleanupSession(sessionId) {
    setTimeout(() => {
      this.sessions.delete(sessionId);
      console.log(`[Auth] Session cleaned up: ${sessionId}`);
    }, 5 * 60 * 1000);
  }

  _getScramInstance(mechanism) {
    if (mechanism === 'SCRAM-SHA-1') {
      return this.scramSHA1;
    } else if (mechanism === 'SCRAM-SHA-256') {
      return this.scramSHA256;
    }
    return null;
  }

  _getClientIP(req) {
    const ip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : 'unknown');
    return ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
  }

  async handleMechanismNegotiate(req) {
    const ip = this._getClientIP(req);
    console.log(`[Auth] Mechanism negotiation from: ${ip}`);
    
    return {
      success: true,
      mechanisms: AuthHandler.getMechanisms(),
      defaultMechanism: 'SCRAM-SHA-256'
    };
  }

  async handlePLAINAuth(body, req) {
    const ip = this._getClientIP(req);
    const { username, password } = body;

    if (!username || !password) {
      this.logger.logFailure(ip, 'PLAIN', username, 'Missing credentials');
      return {
        success: false,
        error: 'Missing username or password',
        code: 400
      };
    }

    console.log(`[Auth] PLAIN auth attempt: username=${username}, ip=${ip}`);

    const result = this.ldap.verifyPlainCredentials(username, password);

    if (result.valid) {
      this.logger.logSuccess(ip, 'PLAIN', username, 'Authentication successful');
      return {
        success: true,
        authenticated: true,
        mechanism: 'PLAIN',
        user: {
          username: username,
          dn: result.dn
        }
      };
    } else {
      this.logger.logFailure(ip, 'PLAIN', username, result.error);
      return {
        success: false,
        error: result.error === 'user-not-found' ? 'User not found' : 'Invalid credentials',
        code: 401
      };
    }
  }

  async handleSCRAMClientFirst(body, req) {
    const ip = this._getClientIP(req);
    const { clientFirstMessage, mechanism = 'SCRAM-SHA-256' } = body;

    const scram = this._getScramInstance(mechanism);
    if (!scram) {
      this.logger.logFailure(ip, mechanism, 'unknown', 'Unsupported mechanism');
      return {
        success: false,
        error: `Unsupported mechanism: ${mechanism}`,
        code: 400
      };
    }

    if (!clientFirstMessage) {
      this.logger.logFailure(ip, mechanism, 'unknown', 'Missing clientFirstMessage');
      return {
        success: false,
        error: 'Missing clientFirstMessage',
        code: 400
      };
    }

    const clientFirst = scram.parseClientFirst(clientFirstMessage);
    const username = clientFirst.username;
    const clientNonce = clientFirst.nonce;

    console.log(`[Auth] ${mechanism} Step 1 - Client first: username=${username}, nonce_len=${clientNonce ? clientNonce.length : 0}, ip=${ip}`);

    const nonceValidation = scram.validateClientNonce(clientNonce);
    if (!nonceValidation.valid) {
      this.logger.logFailure(ip, mechanism, username, nonceValidation.error);
      return {
        success: false,
        error: 'Client nonce too short (minimum 8 characters)',
        code: 400
      };
    }

    if (!username) {
      this.logger.logFailure(ip, mechanism, 'unknown', 'Username not found');
      return {
        success: false,
        error: 'Username not found in client first message',
        code: 400
      };
    }

    const user = this.ldap.getUser(username);
    if (!user) {
      this.logger.logFailure(ip, mechanism, username, 'User not found');
      return {
        success: false,
        error: 'User not found',
        code: 404
      };
    }

    const saltInfo = this.ldap.getSCRAMSalt(username, mechanism);
    if (!saltInfo) {
      this.logger.logFailure(ip, mechanism, username, 'No credentials for mechanism');
      return {
        success: false,
        error: `No credentials available for ${mechanism}`,
        code: 404
      };
    }

    const serverFirst = scram.createServerFirst(clientNonce, saltInfo.salt);

    const sessionId = this._generateSessionId();
    this.sessions.set(sessionId, {
      username: username,
      mechanism: mechanism,
      clientFirstMessage: clientFirstMessage,
      clientNonce: clientNonce,
      serverNonce: serverFirst.serverNonce,
      serverFirstMessage: serverFirst,
      step: 1,
      createdAt: Date.now(),
      ip: ip
    });

    this._cleanupSession(sessionId);

    console.log(`[Auth] ${mechanism} Step 1 - Server first: session=${sessionId}, server_nonce=${serverFirst.serverNonce.substring(0, 8)}...`);

    return {
      success: true,
      sessionId: sessionId,
      mechanism: mechanism,
      serverFirstMessage: serverFirst.message,
      step: 1
    };
  }

  async handleSCRAMClientFinal(body, req) {
    const ip = this._getClientIP(req);
    const { sessionId, clientFinalMessage, password } = body;

    if (!sessionId || !clientFinalMessage) {
      this.logger.logFailure(ip, 'SCRAM-UNKNOWN', 'unknown', 'Missing sessionId or clientFinalMessage');
      return {
        success: false,
        error: 'Missing sessionId or clientFinalMessage',
        code: 400
      };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.logFailure(ip, 'SCRAM-UNKNOWN', 'unknown', 'Session not found');
      return {
        success: false,
        error: 'Session not found or expired',
        code: 401
      };
    }

    const mechanism = session.mechanism;
    const scram = this._getScramInstance(mechanism);

    if (session.step !== 1) {
      this.logger.logFailure(ip, mechanism, session.username, 'Invalid step sequence');
      return {
        success: false,
        error: 'Invalid step sequence',
        code: 400
      };
    }

    const clientFinal = scram.parseClientFinal(clientFinalMessage);
    const expectedNoncePrefix = session.clientNonce + session.serverNonce;

    if (!clientFinal.nonce || !clientFinal.nonce.startsWith(expectedNoncePrefix)) {
      this.sessions.delete(sessionId);
      this.logger.logFailure(ip, mechanism, session.username, 'Invalid nonce in client final');
      return {
        success: false,
        error: 'Invalid nonce in client final message',
        code: 400
      };
    }

    console.log(`[Auth] ${mechanism} Step 2 - Client final: session=${sessionId}, username=${session.username}, ip=${ip}`);

    const result = scram.verifyClientProof(
      session.username,
      password,
      session.clientFirstMessage,
      session.serverFirstMessage,
      clientFinalMessage
    );

    if (!result.valid) {
      this.sessions.delete(sessionId);
      this.logger.logFailure(ip, mechanism, session.username, 'Invalid client proof');
      return {
        success: false,
        error: 'Invalid credentials',
        code: 401
      };
    }

    const verifyResult = this.ldap.verifySCRAMCredentials(session.username, mechanism, password);
    if (!verifyResult.valid) {
      this.sessions.delete(sessionId);
      this.logger.logFailure(ip, mechanism, session.username, verifyResult.error);
      return {
        success: false,
        error: 'Invalid credentials',
        code: 401
      };
    }

    session.step = 2;
    session.authenticated = true;

    const user = this.ldap.getUser(session.username);
    const serverFinal = scram.createServerFinal(result.serverSignature);

    this.logger.logSuccess(ip, mechanism, session.username, 'Authentication successful');

    console.log(`[Auth] ${mechanism} Step 2 - Authentication successful: username=${session.username}, dn=${user.dn}`);

    this.sessions.delete(sessionId);

    return {
      success: true,
      authenticated: true,
      mechanism: mechanism,
      serverFinalMessage: serverFinal,
      user: {
        username: session.username,
        dn: user.dn
      },
      step: 2
    };
  }

  async handleAuth(body, req) {
    const { step, mechanism } = body;

    if (step === 0) {
      return this.handlePLAINAuth(body, req);
    } else if (step === 1) {
      return this.handleSCRAMClientFirst(body, req);
    } else if (step === 2) {
      return this.handleSCRAMClientFinal(body, req);
    } else {
      return {
        success: false,
        error: 'Invalid step parameter',
        code: 400
      };
    }
  }

  listUsers() {
    return this.ldap.listUsers();
  }

  getAuthLogs(limit = 100) {
    return this.logger.getLogs(limit);
  }

  getAuthStats() {
    return this.logger.getStats();
  }

  clearAuthLogs() {
    this.logger.clearLogs();
    return { success: true, message: 'Logs cleared' };
  }
}

module.exports = AuthHandler;
